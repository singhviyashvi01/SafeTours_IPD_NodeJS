/**
 * locationExtractor.js — SafeTours IPD
 *
 * Extracts specific Mumbai locations from text (such as news headlines or descriptions).
 * Prioritizes local neighborhoods for more precise coordinates, falling back to
 * "Mumbai" as a last resort if no specific area is found.
 */

const MUMBAI_LOCATIONS = [
  'Andheri',
  'Bandra',
  'Kurla',
  'Dadar',
  'Sion',
  'CST',
  'Powai',
  'Chembur',
  'Borivali',
  'Mumbai'
];

/**
 * Extracts a location from the text.
 *
 * @param {string} text - The input text (e.g. title + description of an article).
 * @returns {string|null} The canonical matched location name (e.g. "Andheri"), or null if no match.
 */
function extractLocation(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  for (const location of MUMBAI_LOCATIONS) {
    // Check for exact word boundaries to avoid false matching substrings
    const regex = new RegExp(`\\b${location}\\b`, 'i');
    if (regex.test(text)) {
      // Return the canonical capitalized version
      return location;
    }
  }

  return null;
}

module.exports = {
  extractLocation,
  MUMBAI_LOCATIONS
};
