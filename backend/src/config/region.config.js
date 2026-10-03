/**
 * region.config.js — the area SafeTours covers. Same box the H3 grid is generated from
 * (scripts/generateH3Grid.js). Anything outside it is never used to score Mumbai.
 */
const region = {
  name: 'Mumbai',
  minLat: 18.89,
  maxLat: 19.3,
  minLng: 72.77,
  maxLng: 73.0,
};

const inRegion = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= region.minLat &&
  lat <= region.maxLat &&
  lng >= region.minLng &&
  lng <= region.maxLng;

/** Great-circle distance in metres. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

module.exports = { region, inRegion, haversineMeters };
