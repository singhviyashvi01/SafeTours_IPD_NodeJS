const mongoose = require('mongoose');

/**
 * GeocodeCache: results of place-name lookups (Geoapify), including "not found", so the same
 * name is never geocoded twice within the TTL (found: 90 days, not found: 7 days).
 */
const geocodeCacheSchema = new mongoose.Schema(
  {
    query: { type: String, required: true, unique: true }, // lower-case place name
    found: { type: Boolean, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    confidence: { type: Number, default: null },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: false }
);

module.exports = mongoose.model('GeocodeCache', geocodeCacheSchema);
