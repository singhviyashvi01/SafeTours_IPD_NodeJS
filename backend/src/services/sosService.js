const SOSHistory = require('../models/SOSHistory');
const Location = require('../models/Location');
const Journey = require('../models/Journey');
const EmergencyContact = require('../models/EmergencyContact');
const UserGeofenceState = require('../models/UserGeofenceState');
const notificationService = require('./notificationService');
const smsService = require('./smsService');
const cfg = require('../config/geofence.config');
const { confirmDeadline, secondsLeft } = require('./sos/sosPolicy');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

/**
 * SOS service.
 *
 * Flow
 *  - Manual SOS (POST /api/sos): active immediately, contacts notified.
 *  - Safety checks (geofence ENTER, Shadow Mode ETA passed): created as pending_confirmation with a
 *    persisted deadline (confirmBy). The user can cancel ("I'm safe") or confirm ("Send SOS now").
 *    With no answer, processDue() (run by scheduler/safetyScheduler.js every few seconds) escalates it.
 *    The deadline lives in MongoDB, so it survives a server restart: there are no in-memory timers.
 *  - One pending-or-active record per user. Idempotency keys make retried requests return the
 *    original record instead of creating another.
 *
 * Contacts are phone numbers, not app users: they are reached by SMS only (Twilio if configured, else
 * the server only logs and the app opens the on-device composer when it is open).
 */

const OPEN = ['pending_confirmation', 'active'];
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

/** Client-facing shape (adds secondsLeft for a pending check). */
function view(rec, now = new Date()) {
  if (!rec) return null;
  const o = typeof rec.toObject === 'function' ? rec.toObject() : { ...rec };
  o.id = String(o._id);
  if (o.status === 'pending_confirmation') o.secondsLeft = secondsLeft(o, now);
  return o;
}

const validCoords = (c) => c && Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude));

/** The SOS location: the one in the request, else the user's latest stored location. Never invented. */
async function resolveCoords(userId, location, now = new Date()) {
  if (validCoords(location)) {
    return {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
      timestamp: location.timestamp ? new Date(location.timestamp) : now,
      approximate: false,
    };
  }
  const last = await Location.findOne({ userId }).sort({ timestamp: -1 }).lean();
  if (last?.location?.coordinates) {
    return {
      latitude: last.location.coordinates[1],
      longitude: last.location.coordinates[0],
      accuracy: last.accuracy ?? null,
      timestamp: last.timestamp,
      approximate: true,
    };
  }
  throw new ApiError(400, 'A location is required: send location {latitude, longitude} with the SOS.');
}

async function findOpen(userId) {
  return SOSHistory.findOne({ user: userId, status: { $in: OPEN } }).sort({ createdAt: -1 });
}

async function activeJourneyId(userId, journeyId) {
  if (journeyId) {
    const j = await Journey.findOne({ _id: journeyId, userId, status: 'ACTIVE' }).select('_id').lean();
    if (j) return j._id;
  }
  const active = await Journey.findOne({ userId, status: 'ACTIVE' }).select('_id').lean();
  return active ? active._id : null;
}

/** Notifies contacts (SMS) and the user (push + in-app). Never throws. */
async function dispatchEscalation(rec) {
  try {
    const contacts = await EmergencyContact.find({ user: rec.user }).sort({ priority: 1, createdAt: -1 }).exec();
    const sms = await smsService.sendSOSToSMSContacts({
      userId: rec.user,
      contacts,
      coords: rec.coords,
      type: rec.type,
      reason: rec.reason,
      timestamp: rec.coords?.timestamp,
    });
    await SOSHistory.updateOne(
      { _id: rec._id },
      { $set: { notifiedContacts: contacts.map((c) => c._id), 'metadata.sms': sms, 'metadata.contactCount': contacts.length } }
    );
    await notificationService.notify({
      userId: rec.user,
      type: 'SOS',
      title: 'Emergency SOS sent',
      message: contacts.length
        ? `Your emergency contacts (${contacts.length}) have been alerted with your location.`
        : 'SOS recorded, but you have no emergency contacts to alert. Add contacts in the app.',
      metadata: { sosId: String(rec._id), triggerSource: rec.triggerSource },
      channelId: 'sos',
    });
  } catch (error) {
    logger.error(`[SOS] escalation dispatch failed for ${rec._id}`, error);
  }
}

class SOSService {
  /** Manual SOS. Active immediately; an existing pending check is escalated instead of duplicated. */
  async createManual(userId, { location, journeyId, reason, idempotencyKey }, now = new Date()) {
    if (idempotencyKey) {
      const same = await SOSHistory.findOne({ user: userId, idempotencyKey });
      if (same) return { record: view(same, now), duplicate: true };
    }

    const open = await findOpen(userId);
    if (open && open.status === 'pending_confirmation') {
      const escalated = await this.escalate(open._id, { by: 'user' });
      return { record: view(escalated || open, now), duplicate: false, escalatedPending: true };
    }
    if (open && open.status === 'active') {
      return { record: view(open, now), duplicate: true, alreadyActive: true };
    }

    const coords = await resolveCoords(userId, location, now);
    const contacts = await EmergencyContact.countDocuments({ user: userId });
    if (contacts === 0) {
      throw new ApiError(400, 'No emergency contacts found. Add at least one emergency contact before sending an SOS.');
    }

    let rec;
    try {
      rec = await SOSHistory.create({
        user: userId,
        journey: await activeJourneyId(userId, journeyId),
        coords,
        type: 'manual',
        triggerSource: 'MANUAL',
        status: 'active',
        triggeredAt: now,
        escalatedAt: now,
        escalatedBy: 'user',
        reason: reason || 'Manual SOS',
        idempotencyKey: idempotencyKey || undefined,
      });
    } catch (e) {
      if (isDuplicateKey(e) && idempotencyKey) {
        const same = await SOSHistory.findOne({ user: userId, idempotencyKey });
        if (same) return { record: view(same, now), duplicate: true };
      }
      throw e;
    }

    dispatchEscalation(rec); // fire and forget: the record is already safely stored
    return { record: view(rec, now), duplicate: false };
  }

  /**
   * Creates an "Are you safe?" check that auto-escalates at confirmBy.
   * @param {Object} p { trigger:'GEOFENCE'|'SHADOW_MODE', coords, journeyId?, h3Index?, riskLevel?, zoneId?, reason, idempotencyKey }
   * @returns {Promise<Object|null>} the record, or null when one is already open / the key was used
   */
  async createSafetyCheck(userId, p, now = new Date()) {
    if (p.idempotencyKey) {
      const same = await SOSHistory.findOne({ user: userId, idempotencyKey: p.idempotencyKey });
      if (same) return view(same, now);
    }
    if (await findOpen(userId)) return null;

    const confirmBy = confirmDeadline(now, cfg.sos.confirmSeconds);
    let rec;
    try {
      rec = await SOSHistory.create({
        user: userId,
        journey: p.journeyId || null,
        coords: p.coords,
        type: 'automatic',
        triggerSource: p.trigger,
        dangerZone: p.zoneId || null,
        riskLevel: p.riskLevel || null,
        status: 'pending_confirmation',
        confirmBy,
        triggeredAt: now,
        reason: p.reason || '',
        idempotencyKey: p.idempotencyKey || undefined,
        metadata: { h3Index: p.h3Index || null, confirmSeconds: cfg.sos.confirmSeconds },
      });
    } catch (e) {
      if (isDuplicateKey(e)) return null;
      throw e;
    }

    const isEta = p.trigger === 'SHADOW_MODE';
    notificationService
      .notify({
        userId,
        type: 'SAFETY_CHECK',
        title: isEta ? 'Are you okay?' : 'Are you safe?',
        message: isEta
          ? `You have not arrived by your expected time. Respond within ${cfg.sos.confirmSeconds} seconds or your contacts will be alerted.`
          : `You are in a ${String(p.riskLevel || 'high').toLowerCase()} risk area. Respond within ${cfg.sos.confirmSeconds} seconds or your contacts will be alerted.`,
        metadata: {
          sosId: String(rec._id),
          trigger: p.trigger,
          confirmBy: confirmBy.toISOString(),
          riskLevel: p.riskLevel || null,
        },
        channelId: 'safety-check',
        ttl: cfg.sos.confirmSeconds,
      })
      .catch((e) => logger.error('[SOS] safety-check notification failed', e));

    return view(rec, now);
  }

  /**
   * pending_confirmation -> active, atomically (so a user "Send SOS now" racing the deadline
   * escalates once). Returns the updated record, or null if it was no longer pending.
   */
  async escalate(sosId, { by }, now = new Date()) {
    const rec = await SOSHistory.findOneAndUpdate(
      { _id: sosId, status: 'pending_confirmation' },
      { $set: { status: 'active', escalatedAt: now, escalatedBy: by, triggeredAt: now } },
      { returnDocument: 'after' }
    );
    if (!rec) return null;
    logger.warn(`[SOS] ${rec._id} escalated (${by}) for user ${rec.user} (${rec.triggerSource})`);
    dispatchEscalation(rec);
    return rec;
  }

  /** User confirms they need help (the "Send SOS now" button). */
  async confirm(userId, sosId, now = new Date()) {
    const rec = await SOSHistory.findOne({ _id: sosId, user: userId });
    if (!rec) throw new ApiError(404, 'SOS not found.');
    if (rec.status === 'active') return { record: view(rec, now), duplicate: true };
    if (rec.status !== 'pending_confirmation') throw new ApiError(409, `This check is already ${rec.status}.`);
    const updated = await this.escalate(rec._id, { by: 'user' }, now);
    return { record: view(updated || (await SOSHistory.findById(rec._id)), now), duplicate: !updated };
  }

  /**
   * "I'm safe" for a pending check, or cancel for an active SOS. Idempotent: cancelling something
   * already closed returns it unchanged. Side effects of a cancelled PENDING check:
   *  - GEOFENCE: starts the cooldown around the cell where it was created
   *  - SHADOW_MODE: pushes the journey ETA out by extendMinutes (default 15)
   */
  async cancel(userId, sosId, { reason, extendMinutes } = {}, now = new Date()) {
    const rec = await SOSHistory.findOne({ _id: sosId, user: userId });
    if (!rec) throw new ApiError(404, 'SOS not found.');
    if (!OPEN.includes(rec.status)) return { record: view(rec, now), alreadyClosed: true };

    const wasPending = rec.status === 'pending_confirmation';
    const updated = await SOSHistory.findOneAndUpdate(
      { _id: rec._id, status: { $in: OPEN } },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: 'user',
          cancelReason: reason || (wasPending ? 'User confirmed they are safe' : 'Cancelled by user'),
        },
      },
      { returnDocument: 'after' }
    );
    if (!updated) {
      return { record: view(await SOSHistory.findById(rec._id), now), alreadyClosed: true };
    }

    if (wasPending) {
      if (rec.triggerSource === 'GEOFENCE' && rec.metadata?.h3Index) {
        await UserGeofenceState.updateOne(
          { userId },
          { $set: { cooldownCell: rec.metadata.h3Index, cooldownUntil: new Date(now.getTime() + cfg.sos.cooldownMinutes * 60000) } }
        );
      }
      if (rec.triggerSource === 'SHADOW_MODE' && rec.journey) {
        const minutes = Math.min(Math.max(Number(extendMinutes) || cfg.eta.defaultExtendMinutes, 1), cfg.eta.maxExtendMinutes);
        await Journey.updateOne(
          { _id: rec.journey, userId, status: 'ACTIVE' },
          { $set: { expectedArrivalTime: new Date(now.getTime() + minutes * 60000) } }
        );
      }
    }
    return { record: view(updated, now), wasPending };
  }

  /** Cancels pending checks of a journey (ETA extended by the user, or journey ended / arrived). */
  async cancelPendingForJourney(journeyId, reason, now = new Date()) {
    const res = await SOSHistory.updateMany(
      { journey: journeyId, triggerSource: 'SHADOW_MODE', status: 'pending_confirmation' },
      { $set: { status: 'cancelled', cancelledAt: now, cancelledBy: 'system', cancelReason: reason } }
    );
    return res.modifiedCount || 0;
  }

  /** The user's open pending check (if any), for the in-app prompt and polling fallback. */
  async getPending(userId, now = new Date()) {
    const rec = await SOSHistory.findOne({ user: userId, status: 'pending_confirmation' }).sort({ createdAt: -1 });
    return rec ? view(rec, now) : null;
  }

  async getActive(userId, now = new Date()) {
    const rec = await SOSHistory.findOne({ user: userId, status: 'active' }).sort({ createdAt: -1 });
    return rec ? view(rec, now) : null;
  }

  async getSOSHistory(userId) {
    const rows = await SOSHistory.find({ user: userId }).sort({ triggeredAt: -1 }).limit(100).populate('notifiedContacts').lean();
    return rows.map((r) => ({ ...r, id: String(r._id) }));
  }

  /**
   * Called every few seconds by the safety scheduler. Escalates pending checks whose deadline has
   * passed and closes active SOS records older than sos.activeMaxHours (they must not block new SOS forever).
   */
  async processDue(now = new Date(), limit = 25) {
    const due = await SOSHistory.find({ status: 'pending_confirmation', confirmBy: { $lte: now } })
      .sort({ confirmBy: 1 })
      .limit(limit)
      .select('_id')
      .lean();
    let escalated = 0;
    for (const { _id } of due) {
      try {
        if (await this.escalate(_id, { by: 'timeout' }, now)) escalated += 1;
      } catch (e) {
        logger.error(`[SOS] could not escalate ${_id}`, e);
      }
    }

    const cutoff = new Date(now.getTime() - cfg.sos.activeMaxHours * 3600000);
    const closed = await SOSHistory.updateMany(
      { status: 'active', escalatedAt: { $lte: cutoff } },
      { $set: { status: 'resolved', resolvedAt: now, 'metadata.autoResolved': true } }
    );
    return { escalated, autoResolved: closed.modifiedCount || 0 };
  }
}

module.exports = new SOSService();
module.exports.OPEN = OPEN;
