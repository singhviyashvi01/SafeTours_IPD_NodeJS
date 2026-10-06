const axios = require('axios');
const cfg = require('../../config/nearby.config');
const { haversineMeters } = require('../../config/region.config');

/**
 * Place providers. Each exposes
 *   name                'geoapify' | 'overpass'
 *   available()         false when it cannot be tried at all (no key)
 *   fetch({bbox, center}) -> { places, coverageRadiusMeters, credits? }   throws on timeout / HTTP error
 * Every HTTP call has a timeout. places: { id, type, name, lat, lng, phone, address, openingHours }.
 *
 * The response parsers are exported separately so they can be tested with fixtures.
 * NOTE: contact.phone / opening_hours are read defensively; Geoapify's public docs do not list them in the
 * response table, so they are treated as optional and missing values stay null.
 */

const typeByGeoapifyCategory = Object.fromEntries(Object.entries(cfg.types).map(([k, v]) => [v.geoapify, k]));

function parseGeoapifyFeatures(features, typeKey) {
  const out = [];
  for (const f of features || []) {
    const p = f.properties || {};
    const lat = p.lat ?? f.geometry?.coordinates?.[1];
    const lng = p.lon ?? f.geometry?.coordinates?.[0];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const raw = p.datasource?.raw || {};
    out.push({
      id: p.place_id ? `geoapify:${p.place_id}` : null,
      type: typeKey,
      name: p.name || null,
      lat,
      lng,
      phone: p.contact?.phone || p.phone || raw.phone || raw['contact:phone'] || null,
      address: p.address_line2 || p.formatted || null,
      openingHours: p.opening_hours || raw.opening_hours || null,
    });
  }
  return out;
}

function parseOverpassElements(elements) {
  const out = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const type = Object.keys(cfg.types).find((k) => cfg.types[k].osm === tags.amenity);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!type || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const addr = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city']].filter(Boolean).join(', ');
    out.push({
      id: `overpass:${el.type}/${el.id}`,
      type,
      name: tags.name || tags['name:en'] || null,
      lat,
      lng,
      phone: tags.phone || tags['contact:phone'] || null,
      address: addr || null,
      openingHours: tags.opening_hours || null,
    });
  }
  return out;
}

const geoapify = {
  name: 'geoapify',
  available: () => Boolean(process.env.GEOAPIFY_API_KEY),

  /**
   * One request per type over the bounding box, nearest first (bias=proximity). A type that returns
   * exactly its limit may be truncated: the answer then only covers the distance of its farthest place.
   * Billing (per Geoapify's Places docs): 1 credit per 20 places returned, per request.
   */
  async fetch({ bbox, center }) {
    const apiKey = process.env.GEOAPIFY_API_KEY;
    const rect = `rect:${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
    const places = [];
    let coverageRadiusMeters = Infinity;
    let credits = 0;

    for (const [typeKey, def] of Object.entries(cfg.types)) {
      const response = await axios.get(cfg.geoapify.url, {
        params: { categories: def.geoapify, filter: rect, bias: `proximity:${center.lng},${center.lat}`, limit: def.fetchLimit, apiKey },
        timeout: cfg.geoapify.timeoutMs,
      });
      const features = response?.data?.features || [];
      const parsed = parseGeoapifyFeatures(features, typeKey);
      credits += Math.max(1, Math.ceil(features.length / 20));
      places.push(...parsed);

      if (features.length >= def.fetchLimit && parsed.length) {
        const farthest = Math.max(...parsed.map((p) => haversineMeters(center.lat, center.lng, p.lat, p.lng)));
        coverageRadiusMeters = Math.min(coverageRadiusMeters, farthest);
      }
    }
    return { places, coverageRadiusMeters, credits };
  },
};

function overpassQuery(bbox) {
  const box = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  const lines = Object.values(cfg.types).map((t) => `  nwr["amenity"="${t.osm}"](${box});`);
  return `[out:json][timeout:25];\n(\n${lines.join('\n')}\n);\nout center tags;`;
}

const overpass = {
  name: 'overpass',
  available: () => true, // free public API, no key

  async fetch({ bbox }) {
    const urls = process.env.OVERPASS_URLS ? process.env.OVERPASS_URLS.split(',').map((u) => u.trim()).filter(Boolean) : cfg.overpass.urls;
    const body = new URLSearchParams({ data: overpassQuery(bbox) }).toString();
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await axios.post(url, body, {
          timeout: cfg.overpass.timeoutMs,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': cfg.overpass.userAgent, Accept: 'application/json' },
        });
        const data = response.data || {};
        // Overpass answers 200 with a "remark" when a query ran out of time/memory: treat as failure.
        if (typeof data.remark === 'string' && /error|timed out|out of memory/i.test(data.remark)) throw new Error(`Overpass remark: ${data.remark}`);
        if (!Array.isArray(data.elements)) throw new Error('Overpass returned no elements array');
        return { places: parseOverpassElements(data.elements), coverageRadiusMeters: Infinity };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('no Overpass endpoint configured');
  },
};

module.exports = { geoapify, overpass, parseGeoapifyFeatures, parseOverpassElements, overpassQuery, typeByGeoapifyCategory };
