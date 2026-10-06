import { Platform } from 'react-native';
import { getDb } from './db';

/**
 * kvCache: key-value cache on the shared SQLite database with per-entry TTL.
 *
 *   await kvCache.set('nearby:cell', value, { ttlMs })
 *   const hit = await kvCache.get('nearby:cell')                           // null if missing or expired
 *   const hit = await kvCache.get('nearby:cell', { allowExpired: true })   // { value, storedAt, expiresAt, expired }
 *
 * Storage problems never break the app: every method swallows errors and reports a miss. On web (no
 * SQLite) it falls back to an in-memory map.
 */
const memory = new Map();
const useMemory = Platform.OS === 'web';

export const kvCache = {
  async set(key, value, { ttlMs } = {}) {
    const now = Date.now();
    const expiresAt = ttlMs ? now + ttlMs : null;
    const json = JSON.stringify(value);
    try {
      if (useMemory) {
        memory.set(key, { value: json, storedAt: now, expiresAt });
        return true;
      }
      const db = await getDb();
      await db.runAsync('INSERT OR REPLACE INTO kv_cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)', key, json, now, expiresAt);
      return true;
    } catch (error) {
      console.warn('[kvCache] set failed:', error.message);
      return false;
    }
  },

  async get(key, { allowExpired = false } = {}) {
    try {
      let row;
      if (useMemory) {
        row = memory.get(key);
        row = row && { value: row.value, stored_at: row.storedAt, expires_at: row.expiresAt };
      } else {
        const db = await getDb();
        row = await db.getFirstAsync('SELECT value, stored_at, expires_at FROM kv_cache WHERE key = ?', key);
      }
      if (!row) return null;
      const expired = row.expires_at !== null && row.expires_at !== undefined && row.expires_at <= Date.now();
      if (expired && !allowExpired) return null;
      return { value: JSON.parse(row.value), storedAt: row.stored_at, expiresAt: row.expires_at, expired };
    } catch (error) {
      console.warn('[kvCache] get failed:', error.message);
      return null;
    }
  },

  /** All entries whose key starts with `prefix` (newest first). Expired ones are included only with allowExpired. */
  async getByPrefix(prefix, { allowExpired = false } = {}) {
    try {
      let rows;
      if (useMemory) {
        rows = [...memory.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, r]) => ({ key, value: r.value, stored_at: r.storedAt, expires_at: r.expiresAt }));
      } else {
        const db = await getDb();
        rows = await db.getAllAsync('SELECT key, value, stored_at, expires_at FROM kv_cache WHERE key LIKE ? ORDER BY stored_at DESC', `${prefix}%`);
      }
      const now = Date.now();
      return rows
        .map((r) => ({ key: r.key, value: JSON.parse(r.value), storedAt: r.stored_at, expiresAt: r.expires_at, expired: r.expires_at !== null && r.expires_at !== undefined && r.expires_at <= now }))
        .filter((r) => allowExpired || !r.expired);
    } catch (error) {
      console.warn('[kvCache] getByPrefix failed:', error.message);
      return [];
    }
  },

  async remove(key) {
    try {
      if (useMemory) return memory.delete(key);
      const db = await getDb();
      await db.runAsync('DELETE FROM kv_cache WHERE key = ?', key);
      return true;
    } catch (error) {
      return false;
    }
  },

  async removePrefix(prefix) {
    try {
      if (useMemory) {
        [...memory.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => memory.delete(k));
        return true;
      }
      const db = await getDb();
      await db.runAsync('DELETE FROM kv_cache WHERE key LIKE ?', `${prefix}%`);
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Keeps at most maxEntries entries / maxBytes (sum of stored JSON lengths) under a key prefix by deleting
   * the OLDEST entries first. Returns how many were removed.
   */
  async enforcePrefixCap(prefix, { maxEntries, maxBytes }) {
    try {
      if (useMemory) return 0;
      const db = await getDb();
      const rows = await db.getAllAsync('SELECT key, LENGTH(value) AS bytes FROM kv_cache WHERE key LIKE ? ORDER BY stored_at DESC', `${prefix}%`);
      let count = 0;
      let bytes = 0;
      const drop = [];
      for (const r of rows) {
        count += 1;
        bytes += r.bytes;
        if (count > maxEntries || bytes > maxBytes) drop.push(r.key);
      }
      for (const key of drop) await db.runAsync('DELETE FROM kv_cache WHERE key = ?', key);
      return drop.length;
    } catch (error) {
      return 0;
    }
  },

  /** Deletes expired entries; returns how many were removed. */
  async purgeExpired() {
    try {
      if (useMemory) return 0;
      const db = await getDb();
      const res = await db.runAsync('DELETE FROM kv_cache WHERE expires_at IS NOT NULL AND expires_at <= ?', Date.now());
      return res.changes || 0;
    } catch (error) {
      return 0;
    }
  },

  /** { entries, bytes, byPrefix: { nearby: {entries, bytes}, ... } } where the prefix is the part before ":" */
  async stats() {
    try {
      if (useMemory) return { entries: memory.size, bytes: 0, byPrefix: {} };
      const db = await getDb();
      const rows = await db.getAllAsync('SELECT key, LENGTH(value) AS bytes FROM kv_cache');
      const byPrefix = {};
      let bytes = 0;
      for (const r of rows) {
        const p = r.key.split(':')[0];
        byPrefix[p] = byPrefix[p] || { entries: 0, bytes: 0 };
        byPrefix[p].entries += 1;
        byPrefix[p].bytes += r.bytes;
        bytes += r.bytes;
      }
      return { entries: rows.length, bytes, byPrefix };
    } catch (error) {
      return { entries: 0, bytes: 0, byPrefix: {} };
    }
  },

  /** Removes entries with the given key prefixes (e.g. ['nearby']). Settings and config are kept. */
  async clearPrefixes(prefixes) {
    for (const p of prefixes) await this.removePrefix(`${p}:`);
  },
};
