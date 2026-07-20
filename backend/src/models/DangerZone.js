const mongoose = require('mongoose');

/**
 * DangerZone Model — SafeTours IPD
 *
 * Represents a crime hotspot identified by DBSCAN clustering of historical
 * crime data. Each document corresponds to one spatial cluster from
 * crime_hotspots.csv, enriched with a normalised Crime_Score (0-100) and
 * a categorical Risk_Level for fast app-side filtering.
 *
 * GeoJSON Point (2dsphere) enables:
 *   - $geoNear: find the closest hotspot to the user's current position.
 *   - $geoWithin: find all hotspots inside a route bounding box.
 *
 * NOTE: GeoJSON stores coordinates as [longitude, latitude] — the reverse
 * of how most APIs return them. All import/query code must follow this order.
 */

// ─── Reusable GeoJSON Point sub-schema (consistent with Journey.js) ───────────
const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude] — GeoJSON standard
      required: true,
    },
  },
  { _id: false } // Embedded sub-document; no separate _id needed
);

// ─── DangerZone Schema ─────────────────────────────────────────────────────────
const dangerZoneSchema = new mongoose.Schema(
  {
    // Unique identifier matching the DBSCAN cluster label in crime_hotspots.csv.
    // Used as the idempotency key to prevent duplicate imports.
    hotspotId: {
      type: Number,
      required: [true, 'Hotspot ID is required'],
      unique: true, // Guarantees one document per CSV row regardless of how many times the script runs
      index: true,
    },

    // GeoJSON Point for the geographic centre of the crime cluster.
    // Coordinates derived from the mean Latitude/Longitude of all crimes in the cluster.
    location: {
      type: pointSchema,
      required: [true, 'Location (GeoJSON Point) is required'],
    },

    // ─── Crime Statistics ──────────────────────────────────────────────────────

    // Total number of individual crime incidents that make up this hotspot cluster.
    crimeCount: {
      type: Number,
      required: [true, 'Crime count is required'],
      min: [1, 'A hotspot must contain at least 1 crime'],
    },

    // Mean severity score across all crimes in the cluster (scale: 1-10).
    // Weighted at 50% in the Crime_Score formula — the primary risk signal.
    averageCrimeSeverity: {
      type: Number,
      required: [true, 'Average crime severity is required'],
      min: [0, 'Severity cannot be negative'],
    },

    // Highest individual severity score in the cluster (scale: 1-10).
    // Weighted at 30% — captures worst-case events (e.g., a murder in an
    // otherwise petty-crime area still raises the overall danger rating).
    maximumCrimeSeverity: {
      type: Number,
      required: [true, 'Maximum crime severity is required'],
      min: [0, 'Severity cannot be negative'],
    },

    // Comma-separated list of unique crime types present in this cluster.
    // Stored as-is from the CSV (e.g., "Assault, Burglary, Theft").
    // Kept as a single string for simple mobile display; parse only if needed.
    crimeTypes: {
      type: String,
      required: [true, 'Crime types list is required'],
      trim: true,
    },

    // ─── Computed Risk Signals ─────────────────────────────────────────────────

    // Normalised danger score in [0, 100] computed by the preprocessing pipeline.
    // Formula: raw = 0.5·avgSev + 0.3·maxSev + 0.2·log(crimeCount)
    //          score = 100 · (raw − min) / (max − min)   [across all hotspots]
    crimeScore: {
      type: Number,
      required: [true, 'Crime score is required'],
      min: [0, 'Crime score cannot be below 0'],
      max: [100, 'Crime score cannot exceed 100'],
    },

    // Human-readable danger classification derived from crimeScore thresholds:
    //   Safe     →  0 – 19.99
    //   Low      → 20 – 39.99
    //   Moderate → 40 – 59.99
    //   High     → 60 – 79.99
    //   Extreme  → 80 – 100
    riskLevel: {
      type: String,
      required: [true, 'Risk level is required'],
      enum: {
        values: ['Safe', 'Low', 'Moderate', 'High', 'Extreme'],
        message: 'Risk level must be one of: Safe, Low, Moderate, High, Extreme',
      },
      index: true, // Frequently filtered in app queries (e.g., "show only High/Extreme zones")
    },

    // ─── Phase 3 & Phase 4 Dynamic Risk Fields ──────────────────────────────────
    // What the code is doing: Adding dynamic score fields for Crowd and Environmental modules.
    // Why it is required: Allows DangerZone documents to store dynamic crowd and environmental scores.
    // Which existing Phase 1 or Phase 2 implementation is being reused: Extends existing Phase 2 DangerZone schema.
    h3Index: {
      type: String,
      index: true,
      default: null,
    },
    crowdScore: {
      type: Number,
      default: 0,
      min: [0, 'Crowd score cannot be below 0'],
      max: [100, 'Crowd score cannot exceed 100'],
    },
    weatherScore: {
      type: Number,
      default: 0,
      min: [0, 'Weather score cannot be below 0'],
      max: [100, 'Weather score cannot exceed 100'],
    },
    environmentalScore: {
      type: Number,
      default: 0,
      min: [0, 'Environmental score cannot be below 0'],
      max: [100, 'Environmental score cannot exceed 100'],
    },
    lastWeatherUpdate: {
      type: Date,
      default: null,
    },
  },
  {
    // Mongoose automatically manages createdAt and updatedAt timestamps.
    timestamps: true,
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────────

// 2dsphere index enables all MongoDB geospatial operators on the location field.
// Required for $geoNear (proximity alerts) and $geoWithin (route danger scan).
dangerZoneSchema.index({ location: '2dsphere' });

// Compound index for the most common app query pattern:
// "Find all High/Extreme hotspots sorted by danger level for a given area."
dangerZoneSchema.index({ riskLevel: 1, crimeScore: -1 });

const DangerZone = mongoose.model('DangerZone', dangerZoneSchema);

module.exports = DangerZone;
