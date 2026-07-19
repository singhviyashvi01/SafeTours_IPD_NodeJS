/**
 * Purpose of this utility:
 * Define configurable weights for different categories of places to help calculate
 * the crowd density score. Higher weights indicate a higher likelihood of crowds.
 *
 * Why this exists:
 * Keeping configuration separated from business logic ensures that parameters
 * can be tuned without modifying the scoring service code.
 */

const crowdWeights = {
  airport: 90,
  railway_station: 85,
  metro_station: 80,
  bus_station: 70,
  shopping_mall: 75,
  marketplace: 80,
  stadium: 95,
  tourist_attraction: 70,
  beach: 60,
  restaurant: 50,
  cafe: 40,
  cinema: 65,
  park: 45,
  museum: 40,
  university: 55,
  hospital: 50,
  temple: 75,
  church: 60,
  mosque: 70
};

module.exports = {
  crowdWeights
};
