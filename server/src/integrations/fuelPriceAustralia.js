import fetch from 'node-fetch';

export async function fuelpriceFetchBySuburb({ q, fuel }) {
  const key = process.env.FUELPRICE_API_KEY;
  if (!key) return [];
  const url = `https://fuelprice.io/api/v1/prices?suburb=${encodeURIComponent(q||'Melbourne')}&fuel=${encodeURIComponent(fuel||'U91')}`;
  const res = await fetch(url, { headers: { 'x-api-key': key } });
  if (!res.ok) throw new Error(`FuelPrice.io HTTP ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data?.stations) ? data.stations : data;
  return arr.map(r => ({
    id: String(r.id || r.code || r.name),
    brand: r.brand || 'VIC',
    name: r.name || r.brand || 'Station',
    suburb: r.suburb || '',
    lat: Number(r.lat || r.latitude),
    lng: Number(r.lng || r.longitude),
    prices: r.prices || (r.price ? { [fuel || 'U91']: Number(r.price) } : {}),
    updatedAt: r.updatedAt || new Date().toISOString(),
    state: r.state || 'AU',
    source: 'FUELPRICE_AU'
  })).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}
