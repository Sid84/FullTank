// server/src/integrations/vicServiceVic.js
import fetch from 'node-fetch';

/**
 * Normalizes a VIC station entry into the common schema
 */
function normalizeVic(site, fuel) {
  // Decide divisor: many VIC sources return prices in tenths of a cent (e.g. 1899 → 189.9c/L)
  const normalizePrice = (raw) => {
    if (!Number.isFinite(Number(raw))) return null;
    const n = Number(raw);
    // heuristic: if > 1000, treat as cents *10 (1899 => 189.9); else leave
    return n > 1000 ? n / 10 : n;
  };

  return {
    id: String(site.id || site.ID || `${site.Brand}-${site.Lat}-${site.Lng}`),
    state: 'VIC',
    brand: site.Brand || site.brand || site.Name?.split(' ')[0] || '',
    name: site.Name || site.name || '',
    suburb: site.Suburb || site.suburb || site.Town || '',
    postcode: site.Postcode || site.P || '',
    lat: Number(site.Latitude ?? site.lat ?? site.Lat),
    lng: Number(site.Longitude ?? site.lng ?? site.Lng),
    prices: fuel
      ? { [fuel.toUpperCase()]: normalizePrice(site.Price) }
      : site.Prices
      ? Object.fromEntries(
          Object.entries(site.Prices).map(([k, v]) => [k.toUpperCase(), normalizePrice(v)])
        )
      : {},
    updatedAt: site.Updated || site.LastUpdated || new Date().toISOString(),
  };
}

/**
 * Fetches VIC stations (FuelPriceAustralia fallback).
 * @param {Object} opts
 * @param {string} opts.q suburb or postcode
 * @param {string} opts.fuel fuel type (U91, P95, P98, Diesel)
 */
export async function vicFetch({ q = '', fuel = '' } = {}) {
  try {
    const url = new URL('https://www.fuelpriceaustralia.com.au/fuel-vic.json');
    // (⚠️ Replace with your actual fallback endpoint if different)

    const r = await fetch(url.toString(), {
      headers: { 'User-Agent': 'FullTank/1.0 (+contact@example.com)' },
    });

    if (!r.ok) {
      console.error('[VIC] HTTP', r.status);
      return [];
    }

    const data = await r.json();
    if (!Array.isArray(data?.stations)) {
      console.error('[VIC] unexpected payload shape');
      return [];
    }

    // Filter stations by query (postcode or suburb)
    const query = String(q).trim().toLowerCase();
    const hits = data.stations.filter((s) => {
      if (!query) return true;
      return (
        String(s.Suburb || s.suburb || '').toLowerCase().includes(query) ||
        String(s.Postcode || s.P || '').toLowerCase().includes(query) ||
        String(s.Name || '').toLowerCase().includes(query)
      );
    });

    console.log(`[VIC] fetched ${hits.length} rows for query "${q}"`);

    return hits.map((s) => normalizeVic(s, fuel));
  } catch (e) {
    console.error('[VIC] fetch error', e.message);
    return [];
  }
}
