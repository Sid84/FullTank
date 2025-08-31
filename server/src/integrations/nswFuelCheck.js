import fetch from 'node-fetch';

const TOKEN_URL = 'https://api.nsw.gov.au/oauth/v2/token';
const BASE_V2 = 'https://api.onegov.nsw.gov.au/FuelPriceCheck/v2';

let cachedToken = null;
let tokenExpAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpAt - 60_000) return cachedToken;
  const clientId = process.env.NSW_CLIENT_ID;
  const clientSecret = process.env.NSW_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('NSW_CLIENT_ID/SECRET missing');

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
               'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`NSW token HTTP ${res.status}`);
  const tok = await res.json();
  cachedToken = tok.access_token;
  tokenExpAt = Date.now() + (tok.expires_in * 1000);
  return cachedToken;
}

// Map NSW/TAS record → common shape
function toStation(r) {
  return {
    id: String(r.stationcode ?? r.code ?? `${r.stationid || r.code}`),
    brand: r.brand ?? r.stationname ?? 'Unknown',
    name: r.stationname ?? r.brand ?? 'Station',
    suburb: r.suburb ?? r.location ?? '',
    lat: Number(r.latitude),
    lng: Number(r.longitude),
    prices: r.prices || buildPrices(r),
    updatedAt: r.lastupdated ?? new Date().toISOString(),
    state: r.state ?? 'NSW',
    source: 'NSW_FUELCHECK_V2'
  };
}
function buildPrices(r) {
  const m = {};
  if (r.price) m[r.fueltype || 'U91'] = Number(r.price);
  return m;
}

// q: suburb or postcode; fuel: e.g., 'U91'
export async function nswFetchByLocation({ q, fuel }) {
  const token = await getToken();
  const url = `${BASE_V2}/fuel/prices/location`;
  const payload = { FuelType: fuel || 'U91', Location: q || 'Sydney' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`NSW location HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.stations) ? data.stations : (Array.isArray(data?.prices) ? data.prices : []);
  return list.map(toStation).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}
