import { apiClient } from './apiClient';
import { kvCache } from '../storage/kvCache';

/**
 * Emergency contacts cached on the phone (SQLite kv_cache, no expiry), so the SOS text message can be sent with
 * no signal at all. Written whenever the list is fetched online (contactsService.list) and refreshed after every
 * add / edit / delete. It never expires: an old copy is better than none during an emergency, and the Settings
 * screen shows how old it is.
 */
const KEY = 'contacts:list';

const slim = (c) => ({
  id: String(c._id || c.id),
  name: c.name || '',
  phone: (c.phone || '').trim(),
  relationship: c.relationship || '',
  priority: c.priority ?? 1,
});

export const contactsCache = {
  async save(list) {
    await kvCache.set(KEY, { contacts: (list || []).map(slim), syncedAt: Date.now() });
  },

  /** { contacts:[{id,name,phone,relationship,priority}], syncedAt:number } or null. */
  async get() {
    const hit = await kvCache.get(KEY, { allowExpired: true });
    return hit ? hit.value : null;
  },

  /** Fetches the list now and stores it. Never throws. */
  async refresh() {
    try {
      const response = await apiClient.get('/contacts', { timeout: 10000 });
      await contactsCache.save(response.data.data || []);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  },
};
