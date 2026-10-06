const h3 = require('h3-js');
const cfg = require('../../config/nearby.config');
const { haversineMeters } = require('../../config/region.config');
const { isOpenNow } = require('./openingHours');

/**
 * Pure helpers of the nearby service: which cells a search covers, which bounding box to fetch for the
 * missing ones, how much of that box a (possibly truncated) provider answer really covers, and the final
 * shaping (radius filter, distance sort, openNow).
 */

/** H3 res-8 cells that intersect the circle (centre within radius + one cell circumradius). */
function cellsForRadius(lat, lng, radiusMeters, conf = cfg) {
  const origin = h3.latLngToCell(lat, lng, conf.resolution);
  const reach = radiusMeters + conf.cellCircumradiusMeters;
  const k = Math.ceil(reach / (conf.cellCenterSpacingMeters * 0.866)); // 0.866: worst-case direction
  return h3.gridDisk(origin, k).filter((cell) => {
    const [clat, clng] = h3.cellToLatLng(cell);
    return haversineMeters(lat, lng, clat, clng) <= reach;
  });
}

/** Bounding box (degrees) containing every vertex of the given cells. */
function bboxOfCells(cells) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const cell of cells) {
    for (const [la, ln] of h3.cellToBoundary(cell)) {
      minLat = Math.min(minLat, la);
      maxLat = Math.max(maxLat, la);
      minLng = Math.min(minLng, ln);
      maxLng = Math.max(maxLng, ln);
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Which of the missing cells can be cached as COMPLETE after a provider answer.
 * A provider that returned everything (coverageRadiusMeters = Infinity) completes all of them. A provider
 * that hit its result limit returns the NEAREST places first, so only cells lying entirely within the
 * distance of its farthest returned place are known to be complete; the rest stay missing.
 */
function completeCells(missingCells, center, coverageRadiusMeters) {
  if (!Number.isFinite(coverageRadiusMeters)) return [...missingCells];
  return missingCells.filter((cell) =>
    h3.cellToBoundary(cell).every(([la, ln]) => haversineMeters(center.lat, center.lng, la, ln) <= coverageRadiusMeters)
  );
}

/** Groups places by their res-8 cell, keeping only the allowed cells. Every allowed cell gets an entry (possibly empty). */
function groupByCell(places, allowedCells, conf = cfg) {
  const allowed = new Set(allowedCells);
  const out = new Map(allowedCells.map((c) => [c, []]));
  for (const p of places) {
    const cell = h3.latLngToCell(p.lat, p.lng, conf.resolution);
    if (allowed.has(cell)) out.get(cell).push(p);
  }
  return out;
}

/**
 * Final response rows: dedupe, distance from the user, radius + type filter, nearest first, limit.
 * openNow is computed from the stored opening_hours string at `now` (null when unknown).
 * @param {Array<{place:Object, source:string, fetchedAt:Date|null}>} items
 */
function shapePlaces(items, { lat, lng, radius, types, limit, now = new Date() }) {
  const seen = new Set();
  const rows = [];
  for (const { place, source, fetchedAt } of items) {
    if (!types.includes(place.type)) continue;
    const key = place.id || `${place.type}:${place.lat.toFixed(5)}:${place.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const distance = Math.round(haversineMeters(lat, lng, place.lat, place.lng));
    if (distance > radius) continue;
    rows.push({
      id: key,
      name: place.name || null,
      type: place.type,
      typeLabel: cfg.types[place.type]?.label || place.type,
      distance,
      lat: place.lat,
      lng: place.lng,
      phone: place.phone || null,
      address: place.address || null,
      openingHours: place.openingHours || null,
      openNow: place.openingHours ? isOpenNow(place.openingHours, now) : null,
      source,
      fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    });
  }
  rows.sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)));
  return rows.slice(0, limit);
}

module.exports = { cellsForRadius, bboxOfCells, completeCells, groupByCell, shapePlaces };
