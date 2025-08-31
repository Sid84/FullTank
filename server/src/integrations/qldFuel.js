import fetch from 'node-fetch';

// Very simple: find the latest resource with "API" in the title, then fetch it (CSV→JSON would be nicer; the portal often exposes JSON).
export async function qldFetchLatest({ q, fuel }) {
  const dsUrl = process.env.QLD_DATASET_URL || 'https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025';
  const res = await fetch(dsUrl + '.json'); // CKAN-ish json
  if (!res.ok) throw new Error(`QLD dataset HTTP ${res.status}`);
  const ds = await res.json();
  const resources = ds?.result?.resources || ds?.resources || [];
  const apiRes = resources.find(r => /api/i.test(r?.name || r?.description || '')) || resources[0];
  if (!apiRes?.url) return [];
  const feed = await fetch(apiRes.url);
  if (!feed.ok) throw new Error(`QLD feed HTTP ${feed.status}`);
  const data = await feed.json().catch(async () => JSON.parse(await feed.text()));
  const items = Array.isArray(data?.records) ? data.records : (Array.isArray(data) ? data : []);
  const wanted = (q || '').toLowerCase();
  const f = (fuel || 'U91').toUpperCase();
  return items
    .filter(r => !wanted || String(r['Site Suburb'] || r.suburb || '').toLowerCase().includes(wanted))
    .map(r => ({
      id: String(r['Site Id'] || r['Fuel Site Id'] || r.id || r['Site Address'] || Math.random()),
      brand: r['Site Brand'] || r.brand || 'QLD',
      name: r['Site Name'] || r['Site Address'] || r.name || 'Station',
      suburb: r['Site Suburb'] || r.suburb || '',
      lat: Number(r['Site Latitude'] || r.latitude),
      lng: Number(r['Site Longitude'] || r.longitude),
      prices: buildPricesQLD(r),
      updatedAt: r['Price Updated Date Time'] || r.updated_at || new Date().toISOString(),
      state: 'QLD',
      source: 'QLD_DATA'
    }))
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map(s => ({ ...s, prices: f in (s.prices || {}) ? s.prices : s.prices })); // keep all fuels
}

function buildPricesQLD(r) {
  const map = {};
  const trySet = (key, fuel) => {
    const v = r[key];
    if (v != null && v !== '') map[fuel] = Number(v);
  };
  trySet('U91 Price', 'U91');
  trySet('P95 Price', 'P95');
  trySet('P98 Price', 'P98');
  trySet('Diesel Price', 'Diesel');
  return map;
}
