import { kvCache } from './kvCache';
import { capHistory } from '../offline/chatLogic';

/**
 * Chat history: on this phone only (SQLite kv_cache), capped by message count and size, with a Clear button.
 * The server never stores message content.
 */
const KEY = 'chat:history';

export const chatStore = {
  async load() {
    const hit = await kvCache.get(KEY, { allowExpired: true });
    return hit && Array.isArray(hit.value) ? hit.value : [];
  },
  async save(messages) {
    // Pending messages are not persisted.
    await kvCache.set(KEY, capHistory(messages.filter((m) => !m.pending)));
  },
  async clear() {
    await kvCache.remove(KEY);
  },
};
