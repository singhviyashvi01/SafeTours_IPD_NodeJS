/**
 * Purpose of this utility:
 * Define configurable weights for different categories of places to help calculate
 * the crowd density score. Higher weights indicate a higher likelihood of crowds.
 *
 * Why this exists:
 * Keeping configuration separated from business logic ensures that parameters
 * can be tuned without modifying the scoring service code.
 */

// What the code is doing: Configures place category weights including negative weights for safety/emergency services (Police = -5, Hospital = -5).
// Why it is required: Defines place category weights for Phase 3 Crowd scoring.
// Which existing Phase 1 or Phase 2 implementation is being reused: Reuses existing crowdWeights configuration module.
const crowdWeights = {
  airport: 90,
  railway_station: 12,
  metro_station: 10,
  bus_station: 8,
  shopping_mall: 8,
  marketplace: 10,
  stadium: 95,
  tourist_attraction: 70,
  beach: 12,
  police_station: -5,
  hospital: -5,
  restaurant: 50,
  cafe: 40,
  cinema: 65,
  park: 45,
  museum: 40,
  university: 55,
  temple: 75,
  church: 60,
  mosque: 70
};

module.exports = {
  crowdWeights
};
