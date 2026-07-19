const { crowdWeights } = require('../../utils/crowdWeights');
const { festivals } = require('../../utils/festivalConfig');

/**
 * Purpose of this service:
 * Analyze nearby places and compute a normalized crowd density score (0 to 100)
 * considering time of day, day of week, and active festival bonuses.
 *
 * Why this exists:
 * Scoring logic is kept isolated inside this service so it can be reused by
 * different controllers, and future risk engines.
 */

// Category mapping helper
const categoryMap = {
  'airport': 'airport',
  'public_transport.train': 'railway_station',
  'public_transport.subway': 'metro_station',
  'public_transport.bus': 'bus_station',
  'commercial.shopping_mall': 'shopping_mall',
  'commercial.marketplace': 'marketplace',
  'sport.stadium': 'stadium',
  'tourism.attraction': 'tourist_attraction',
  'beach': 'beach',
  'catering.restaurant': 'restaurant',
  'catering.cafe': 'cafe',
  'entertainment.cinema': 'cinema',
  'leisure.park': 'park',
  'entertainment.museum': 'museum',
  'education.university': 'university',
  'healthcare.hospital': 'hospital',
  'religion.place_of_worship.hinduism': 'temple',
  'religion.place_of_worship.christianity': 'church',
  'religion.place_of_worship.islam': 'mosque'
};

/**
 * Purpose of this function:
 * Determine the specific weight key for a place based on its categories array.
 *
 * Input:
 * categories (array of strings) from Geoapify place properties.
 * Output:
 * key (string) or null if no mapping fits.
 */
const findWeightKey = (categories = []) => {
  // Try exact category matches first
  for (const cat of categories) {
    if (categoryMap[cat]) {
      return categoryMap[cat];
    }
  }

  // Fallback to substring keyword matches for robustness
  for (const cat of categories) {
    const lowerCat = cat.toLowerCase();
    if (lowerCat.includes('train')) return 'railway_station';
    if (lowerCat.includes('subway') || lowerCat.includes('metro')) return 'metro_station';
    if (lowerCat.includes('bus')) return 'bus_station';
    if (lowerCat.includes('mall')) return 'shopping_mall';
    if (lowerCat.includes('market')) return 'marketplace';
    if (lowerCat.includes('stadium')) return 'stadium';
    if (lowerCat.includes('attraction')) return 'tourist_attraction';
    if (lowerCat.includes('beach')) return 'beach';
    if (lowerCat.includes('restaurant')) return 'restaurant';
    if (lowerCat.includes('cafe')) return 'cafe';
    if (lowerCat.includes('cinema')) return 'cinema';
    if (lowerCat.includes('park')) return 'park';
    if (lowerCat.includes('museum')) return 'museum';
    if (lowerCat.includes('university') || lowerCat.includes('college')) return 'university';
    if (lowerCat.includes('hospital')) return 'hospital';
    if (lowerCat.includes('temple') || lowerCat.includes('hindu')) return 'temple';
    if (lowerCat.includes('church') || lowerCat.includes('christian')) return 'church';
    if (lowerCat.includes('mosque') || lowerCat.includes('islam')) return 'mosque';
  }

  return null;
};

/**
 * Purpose of this function:
 * Map a raw list of nearby places to include weights and compute the total score.
 *
 * Input:
 * rawPlaces (array) of normalized places from geoapify.service.js.
 * Output:
 * Object containing crowdScore, crowdLevel, nearbyPlaces with mapped weights, and scoreBreakdown.
 */
const calculateCrowdScore = (rawPlaces = []) => {
  // 1. Map categories and look up weights for each place
  const nearbyPlaces = rawPlaces.map((place) => {
    const weightKey = findWeightKey(place.categories);
    const weight = weightKey ? (crowdWeights[weightKey] ?? 0) : 0;
    return {
      ...place,
      mappedCategory: weightKey || 'other',
      weight
    };
  });

  // 2. Calculate base crowd score
  let baseScore = 0;
  const validPlaces = nearbyPlaces.filter((p) => p.weight > 0);

  if (validPlaces.length > 0) {
    let totalWeight = 0;
    let maxWeight = 0;

    validPlaces.forEach((p) => {
      totalWeight += p.weight;
      if (p.weight > maxWeight) {
        maxWeight = p.weight;
      }
    });

    const avgWeight = totalWeight / validPlaces.length;

    // Blend: 60% on maximum weight, 30% on average weight, 10% on place density (up to 10 points)
    baseScore = (maxWeight * 0.6) + (avgWeight * 0.3) + Math.min(10, validPlaces.length * 1);
    baseScore = Math.min(100, Math.round(baseScore));
  }

  // 3. Time-of-day adjustment
  const now = new Date();
  const hour = now.getHours();
  let timeAdjustment = 0;
  let timeReason = '';

  if (hour >= 0 && hour < 6) {
    timeAdjustment = -20;
    timeReason = 'Late night hours reduce crowd density significantly.';
  } else if (hour >= 6 && hour < 10) {
    timeAdjustment = 5;
    timeReason = 'Morning hours see standard activity levels.';
  } else if (hour >= 10 && hour < 17) {
    timeAdjustment = 10;
    timeReason = 'Midday operational hours see increased public activity.';
  } else if (hour >= 17 && hour < 21) {
    timeAdjustment = 20;
    timeReason = 'Evening rush hours see peak crowd densities.';
  } else {
    timeAdjustment = 0;
    timeReason = 'Late evening hours see gradual dispersal of crowds.';
  }

  // 4. Weekday/weekend adjustment
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const weekendAdjustment = isWeekend ? 10 : 0;
  const weekendReason = isWeekend ? 'Weekend traffic increases crowd density at leisure points.' : 'Standard weekday activity levels.';

  // 5. Festival adjustment using festivalConfig
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;

  let festivalAdjustment = 0;
  const activeFestivals = [];

  festivals.forEach((fest) => {
    if (localDateStr >= fest.startDate && localDateStr <= fest.endDate) {
      festivalAdjustment += fest.crowdBonus;
      activeFestivals.push(fest.name);
    }
  });

  // 6. Aggregate and normalize final score
  let finalScore = baseScore + timeAdjustment + weekendAdjustment + festivalAdjustment;
  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // 7. Map final score to Crowd Level description
  let crowdLevel = 'Moderate';
  if (finalScore <= 20) {
    crowdLevel = 'Very Low';
  } else if (finalScore <= 40) {
    crowdLevel = 'Low';
  } else if (finalScore <= 60) {
    crowdLevel = 'Moderate';
  } else if (finalScore <= 80) {
    crowdLevel = 'High';
  } else {
    crowdLevel = 'Extreme';
  }

  return {
    crowdScore: finalScore,
    crowdLevel,
    nearbyPlaces,
    scoreBreakdown: {
      baseScore,
      timeOfDayAdjustment: timeAdjustment,
      weekendAdjustment,
      festivalAdjustment,
      activeFestivals,
      reasons: [
        `Base crowd density score from nearby points of interest is ${baseScore}.`,
        timeReason,
        weekendReason,
        activeFestivals.length > 0
          ? `Active festival(s) [${activeFestivals.join(', ')}] increase crowd density by +${festivalAdjustment}.`
          : 'No active major festivals detected.'
      ].filter(Boolean)
    }
  };
};

module.exports = {
  calculateCrowdScore,
};
