const mongoose = require('mongoose');

/**
 * GridCell — one H3 resolution-9 cell (~0.1 km²) of the covered area.
 *
 * The cell stores only the raw component scores written by the data producers (jobs and
 * community events). The composite risk is NOT stored: it depends on the current time
 * (night / festival modifiers) and on data freshness, so services/risk/cellRisk.service.js
 * evaluates it on read using services/risk/riskEngine.js.
 *
 * components.<name>.score is null/absent when nothing is known — it is never defaulted to 0.
 */
const componentSchema = new mongoose.Schema(
  {
    score: { type: Number, min: 0, max: 100, default: null },
    updatedAt: { type: Date, default: null },
    // Free-form producer metadata, e.g. { lowConfidence, demo, source, reasons }.
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const gridCellSchema = new mongoose.Schema(
  {
    h3Index: { type: String, required: true, unique: true, index: true },
    geometry: {
      type: { type: String, enum: ['Polygon'], required: true },
      coordinates: { type: [[[Number]]], required: true }, // [[ [lng, lat], ... ]]
    },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    components: {
      crime: { type: componentSchema, default: undefined },
      weather: { type: componentSchema, default: undefined },
      crowd: { type: componentSchema, default: undefined },
      community: { type: componentSchema, default: undefined },
      news: { type: componentSchema, default: undefined },
    },
  },
  { timestamps: true }
);

gridCellSchema.index({ geometry: '2dsphere' });
gridCellSchema.index({ 'center.lat': 1, 'center.lng': 1 });

module.exports = mongoose.model('GridCell', gridCellSchema);
