const mongoose = require('mongoose');

/**
 * PoiCache: crowd-magnet places fetched from Geoapify, one document per category, so the crowd
 * component can be recomputed hourly without calling the API (the API is hit about once a day).
 */
const poiCacheSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, unique: true }, // crowd.config categories[].key
    places: [
      {
        _id: false,
        name: { type: String, default: '' },
        lat: { type: Number, required: true },
        lon: { type: Number, required: true },
      },
    ],
    count: { type: Number, default: 0 },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: false }
);

module.exports = mongoose.model('PoiCache', poiCacheSchema);
