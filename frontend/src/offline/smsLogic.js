'use strict';

/**
 * SOS text-message state machine (pure). The native layer (services/smsSender.js) does the sending; this module
 * decides what to try, turns raw results into one honest outcome, and says what the UI may claim.
 *
 * Outcomes recorded on the SOS row (payload.sms.outcome):
 *   sent             every contact was texted (direct send confirmed by the radio, or iOS composer reported 'sent')
 *   partial          some contacts were texted, others failed: the rest may be retried
 *   composer_opened  the message composer was opened but nobody can tell whether the user pressed Send
 *                    (Android never reports it): NOT counted as sent
 *   failed           nothing was sent (no signal / no SMS service / user cancelled the composer)
 *   no_permission    Android SEND_SMS was denied AND the composer could not be used either
 *   no_contacts      there is nobody to text
 */
const OUTCOMES = ['sent', 'partial', 'composer_opened', 'failed', 'no_permission', 'no_contacts'];

/**
 * What to try, given what the platform offers right now.
 * @param {{platform:'android'|'ios'|string, permission:'granted'|'denied'|'undetermined'|'unavailable', directAvailable:boolean, composerAvailable:boolean, contactCount:number}} env
 * @returns {{strategy:'direct'|'composer'|'none', reason:string|null}}
 */
function planSms({ platform, permission, directAvailable, composerAvailable, contactCount }) {
  if (!contactCount) return { strategy: 'none', reason: 'no_contacts' };
  if (platform === 'android' && directAvailable && permission === 'granted') return { strategy: 'direct', reason: null };
  if (composerAvailable) {
    // iOS has no silent send at all; on Android we only land here without permission / native module.
    const reason = platform === 'android' ? (permission === 'granted' ? 'direct_unavailable' : 'no_permission') : 'ios_composer_only';
    return { strategy: 'composer', reason };
  }
  return { strategy: 'none', reason: platform === 'android' && permission !== 'granted' ? 'no_permission' : 'unavailable' };
}

const emptySms = (total = 0) => ({ outcome: null, sentTo: [], failedTo: [], total, via: null, reason: null, attempts: 0, lastAttemptAt: null });

/** Aggregates per-contact direct results [{phone, ok}] into the row's sms state. */
function reduceDirect(prev, results, now) {
  const base = prev || emptySms(results.length);
  const sentTo = [...new Set([...(base.sentTo || []), ...results.filter((r) => r.ok).map((r) => r.phone)])];
  const failedTo = results.filter((r) => !r.ok && !sentTo.includes(r.phone)).map((r) => r.phone);
  const total = Math.max(base.total || 0, sentTo.length + failedTo.length);
  const outcome = sentTo.length >= total && total > 0 ? 'sent' : sentTo.length > 0 ? 'partial' : 'failed';
  return {
    ...base,
    outcome,
    sentTo,
    failedTo,
    total,
    via: 'direct',
    reason: outcome === 'sent' ? null : results.find((r) => !r.ok)?.error || 'send failed',
    attempts: (base.attempts || 0) + 1,
    lastAttemptAt: now,
  };
}

/**
 * Turns the composer's raw result into an outcome.
 * @param {'sent'|'cancelled'|'unknown'} raw  expo-sms result
 * @param {string[]} phones everyone in the composer
 * @param {string|null} reasonForComposer why we used the composer (e.g. 'no_permission')
 */
function reduceComposer(prev, raw, phones, now, reasonForComposer) {
  const base = prev || emptySms(phones.length);
  let outcome;
  let sentTo = base.sentTo || [];
  if (raw === 'sent') {
    outcome = 'sent'; // iOS reports it after the user taps Send
    sentTo = [...new Set([...sentTo, ...phones])];
  } else if (raw === 'cancelled') {
    // The user closed the composer. If the only reason we were here is a denied permission, say so.
    outcome = reasonForComposer === 'no_permission' ? 'no_permission' : 'failed';
  } else {
    outcome = 'composer_opened'; // Android: cannot know whether Send was pressed
  }
  return {
    ...base,
    outcome,
    sentTo,
    failedTo: outcome === 'sent' ? [] : phones.filter((p) => !sentTo.includes(p)),
    total: Math.max(base.total || 0, phones.length),
    via: 'composer',
    reason: outcome === 'failed' ? 'composer closed without sending' : outcome === 'no_permission' ? 'SMS permission denied' : reasonForComposer,
    attempts: (base.attempts || 0) + 1,
    lastAttemptAt: now,
  };
}

/** Nothing could be tried at all. */
function reduceNone(prev, reason, now, total = 0) {
  const base = prev || emptySms(total);
  const outcome = reason === 'no_contacts' ? 'no_contacts' : reason === 'no_permission' ? 'no_permission' : 'failed';
  return { ...base, outcome, via: null, reason, attempts: (base.attempts || 0) + 1, lastAttemptAt: now, total: Math.max(base.total || 0, total) };
}

/**
 * Should a failed send be tried again by itself?
 * Only outcomes that mean "the radio could not do it right now" retry (failed, partial), and only inside the
 * window after the SOS was triggered. A denied permission or an opened composer needs the user, not a timer.
 */
function shouldRetrySms(sms, { now, triggeredAt, cfg }) {
  if (!sms || !['failed', 'partial'].includes(sms.outcome)) return false;
  if (sms.via === 'composer') return false; // never re-open the composer on a timer
  if (now - triggeredAt > cfg.retryWindowMs) return false;
  return sms.lastAttemptAt === null || now - sms.lastAttemptAt >= cfg.retryEveryMs;
}

/** Contacts still to text on a retry (partial: only the ones that failed; failed: everyone). */
function contactsToRetry(sms, contacts) {
  const done = new Set(sms && sms.sentTo ? sms.sentTo : []);
  return contacts.filter((c) => !done.has(c.phone));
}

/** "SMS sent to 2 of 3 contacts" */
function smsSummary(sms) {
  if (!sms || !sms.outcome) return null;
  const n = (sms.sentTo || []).length;
  const t = sms.total || n;
  switch (sms.outcome) {
    case 'sent': return `SMS sent to ${n} of ${t} contact${t === 1 ? '' : 's'}`;
    case 'partial': return `SMS sent to ${n} of ${t} contacts (the rest failed)`;
    case 'composer_opened': return 'Message opened for you to send: tap Send. We cannot tell whether it was sent';
    case 'no_permission': return 'SMS permission is off, so no text was sent';
    case 'no_contacts': return 'No emergency contacts to text';
    default: return 'No SMS was sent' + (sms.reason ? ` (${sms.reason})` : '');
  }
}

/**
 * What the screen may say about an SOS row. Three separate facts, never merged:
 *   queued   it is stored on this phone
 *   sms      the texts (outcome above)
 *   server   the server has it
 * `headline` never says the SOS was "sent" unless the server or the SMS radio confirmed it.
 *
 * @param {{status:string, lastError?:string, payload:{sms?:Object, serverId?:string, cancelled?:boolean, cancelRequested?:boolean}}} row  an outbox 'sos' row
 */
function sosView(row) {
  const sms = (row.payload && row.payload.sms) || null;
  const delivered = row.status === 'sent';
  const rejected = row.status === 'dead';
  const smsDone = sms && (sms.outcome === 'sent' || sms.outcome === 'partial');
  const smsLine = smsSummary(sms);

  const chips = [
    { key: 'queued', label: 'Queued on this phone', on: !delivered },
    { key: 'sms', label: smsDone ? `SMS sent ${(sms.sentTo || []).length}/${sms.total}` : sms && sms.outcome === 'composer_opened' ? 'SMS: waiting for you to send' : 'SMS not sent', on: Boolean(smsDone) },
    { key: 'server', label: delivered ? 'Delivered to server' : rejected ? 'Server rejected it' : 'Not delivered to server yet', on: delivered },
  ];

  let headline;
  let tone;
  if (row.payload && row.payload.cancelled) {
    headline = 'SOS cancelled';
    tone = 'ok';
  } else if (delivered) {
    headline = 'SOS delivered to the server';
    tone = 'ok';
  } else if (rejected) {
    headline = 'The server rejected this SOS';
    tone = 'error';
  } else if (smsDone) {
    headline = `${smsSummary(sms)}. Not delivered to the server yet`;
    tone = 'warn';
  } else if (sms && sms.outcome === 'composer_opened') {
    headline = 'SOS saved. Your message app is open: tap Send. Not delivered to the server yet';
    tone = 'warn';
  } else {
    headline = 'SOS saved on this phone. Nobody has been alerted yet';
    tone = 'error';
  }

  const detail = [];
  if (smsLine && !smsDone) detail.push(smsLine);
  if (!delivered && !rejected) detail.push('It will be sent to the server automatically when you have signal.');
  if (row.lastError && !delivered) detail.push(`Last error: ${row.lastError}`);

  const pendingNoSignal = !delivered && !rejected && !(row.payload && row.payload.cancelled);
  return { headline, tone, chips, detail, pendingNoSignal };
}

module.exports = { OUTCOMES, planSms, emptySms, reduceDirect, reduceComposer, reduceNone, shouldRetrySms, contactsToRetry, smsSummary, sosView };
