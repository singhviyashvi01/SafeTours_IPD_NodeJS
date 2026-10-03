const mongoose = require('mongoose');

/**
 * FeedStatus — heartbeat of each background data feed (weather, news, community, crime, crowd).
 *
 * `updatedAt` only moves on a SUCCESSFUL run, so the risk engine can tell "feed healthy, nothing
 * reported" (score 0 is a real observation) from "feed dead" (data goes stale, confidence drops).
 */
const feedStatusSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    updatedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    stats: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: false }
);

module.exports = mongoose.model('FeedStatus', feedStatusSchema);
