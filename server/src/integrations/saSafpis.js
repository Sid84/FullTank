import fetch from 'node-fetch';

export async function saFetchBySuburb({ q, fuel }) {
  const token = process.env.SA_SAFPIS_TOKEN;
  if (!token) return [];
  const url = `https://api.safuelpricinginformation.com.au/fuel/prices?suburb=${encodeURIComponent(q||'Adelaide')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`SAFPIS HTTP ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data?.stations) ? data.stations : data;
  return arr.map(r => ({
    id: String(r.id), brand: r.brand, name: r.name, suburb: r.suburb,
    lat: Number(r.lat), lng: Number(r.lng),
    prices: r.prices || {}, updatedAt: r.updatedAt || new Date().toISOString(),
    state: 'SA', source: 'SA_SAFPIS'
  })).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}
