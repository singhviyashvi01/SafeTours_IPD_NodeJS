/**
 * Normalizes invalid or missing numeric fields to 0,
 * and missing string fields to null.
 * 
 * Rules:
 * Numeric fields: undefined, null, empty string, invalid number, NaN -> 0
 * String fields: undefined, missing, empty string -> null
 */

/**
 * Normalizes a value expected to be numeric.
 * @param {any} value - The input value to normalize
 * @returns {number} The normalized number or 0
 */
function normalizeNumeric(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return 0;
  }
  return num;
}

/**
 * Normalizes a value expected to be a string.
 * @param {any} value - The input value to normalize
 * @returns {string|null} The normalized string or null
 */
function normalizeString(value) {
  if (value === undefined || value === null || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed;
}

module.exports = {
  normalizeNumeric,
  normalizeString,
};
