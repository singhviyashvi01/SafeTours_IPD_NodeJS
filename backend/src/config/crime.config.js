/**
 * crime.config.js — every tunable of the crime pipeline (services/crime, scripts/buildCrime.js).
 *
 * Input CSV (header row required, names case-insensitive, aliases accepted):
 *   lat         latitude, decimal degrees            (aliases: latitude)
 *   lng         longitude, decimal degrees           (aliases: lon, long, longitude)
 *   crime_type  e.g. Theft, Assault, Robbery         (aliases: type, category, offence, crime type)
 *   date        incident date, ISO 8601 preferred    (aliases: datetime, incident_date, timestamp)
 *   severity    OPTIONAL 1-10, only used for crime types missing from severityByType
 *               (aliases: crime_severity)
 */

module.exports = {
  // Crime type (lower case, letters and spaces only) -> severity weight 1-10.
  severityByType: {
    murder: 10,
    homicide: 10,
    rape: 9,
    'sexual assault': 9,
    kidnapping: 9,
    abduction: 9,
    robbery: 8,
    'armed robbery': 8,
    dacoity: 8,
    stabbing: 8,
    assault: 7,
    arson: 7,
    molestation: 7,
    burglary: 6,
    'chain snatching': 6,
    snatching: 6,
    'domestic violence': 6,
    narcotics: 6,
    harassment: 5,
    stalking: 5,
    'eve teasing': 5,
    theft: 4,
    'vehicle theft': 4,
    extortion: 6,
    vandalism: 3,
    pickpocketing: 3,
    fraud: 3,
    cheating: 3,
    cybercrime: 2,
  },
  defaultSeverity: 4, // crime types not listed above (they are reported by the build script)

  /**
   * DBSCAN (haversine metric).
   * epsMeters 250: about one H3 res-9 cell across (edge ~174 m, width ~350 m). Incidents within a
   *   couple of street blocks are "the same hotspot"; much larger values merge neighbourhoods.
   * minSamples 4: in dense urban data two or three incidents within 250 m happen by chance (the old
   *   pair-based setting produced hundreds of two-incident "hotspots"); four is a real concentration.
   * Incidents that are not part of any cluster are NOT discarded: isolated crime still counts, at
   *   noiseFactor of its weight, so scattered crime is a weaker signal than a hotspot.
   */
  dbscan: { epsMeters: 250, minSamples: 4, noiseFactor: 0.35 },

  // Recency: weight x 0.5^(ageDays / halfLifeDays). Incidents older than maxAgeDays are ignored.
  recency: { halfLifeDays: 365, maxAgeDays: 1095 },

  // Each cell's score also spreads to the surrounding rings: ring k gets decayPerRing^k of it.
  spread: { maxRing: 2, decayPerRing: 0.5 },

  // score = 100 * min(1, ln(1 + raw) / ln(1 + p95)), where p95 is the 95th percentile of raw over
  // cells that have any crime. Log scaling keeps a few very bad cells from flattening the rest.
  // Scores are therefore RELATIVE to the city's own distribution, not absolute.
  normalization: { percentile: 95 },

  // Below this many usable incidents the result is flagged lowConfidence (too thin to trust).
  minIncidentsForConfidence: 200,
  // Below this the build script refuses to write (a near-empty file would turn most of the city into
  // "zero crime"). Override with --force.
  minIncidentsToWrite: 30,

  // Rows with a date more than this many days in the future are rejected.
  maxFutureDays: 1,
};
