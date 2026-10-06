const mongoose = require('mongoose');

/**
 * NearbyPlace: SEED data for /api/nearby (last-resort fallback only), loaded by
 * `npm run seed:nearby` from preprocessing/infra/infra_locations.json (police stations and hospitals
 * from OpenStreetMap, locations only: no names, phones or hours). Served with source "seed".
 */
const nearbyPlaceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['hospital', 'police', 'pharmacy', 'fire_station'], required: true },
    name: { type: String, default: null },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    h3Index: { type: String, required: true, index: true }, // resolution 8
    source: { type: String, default: 'seed' },
  },
  { timestamps: false }
);

nearbyPlaceSchema.index({ type: 1, lat: 1, lng: 1 }, { unique: true });

module.exports = mongoose.model('NearbyPlace', nearbyPlaceSchema);
