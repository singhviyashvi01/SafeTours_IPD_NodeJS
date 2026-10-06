const mongoose = require('mongoose');

/**
 * NearbyCellCache: live provider results (Geoapify / Overpass) for one H3 resolution-8 cell, all types.
 * `places: []` is a VALID entry (the provider answered and the cell has none). Expired entries are kept
 * (not TTL-deleted) so they can be served as stale data when every provider fails.
 */
const nearbyCellCacheSchema = new mongoose.Schema(
  {
    cell: { type: String, required: true, unique: true },
    source: { type: String, enum: ['geoapify', 'overpass'], required: true },
    fetchedAt: { type: Date, required: true },
    places: [
      {
        _id: false,
        id: String,
        type: String,
        name: { type: String, default: null },
        lat: Number,
        lng: Number,
        phone: { type: String, default: null },
        address: { type: String, default: null },
        openingHours: { type: String, default: null },
      },
    ],
  },
  { timestamps: false }
);

module.exports = mongoose.model('NearbyCellCache', nearbyCellCacheSchema);
