import fetch from 'node-fetch';
//import { lookupNSW } from './nswPostcodes.js'; // your local suburb->postcode map

const TOKEN_URL = process.env.NSW_TOKEN_URL || '';
const API_URL   = process.env.NSW_API_URL_NEARBY || '';
const API_KEY   = process.env.NSW_API_KEY || '';
const BASIC_B64 = process.env.NSW_BASIC_B64 || '';
const CLIENT_KEY = process.env.NSW_CLIENT_KEY || '';
const CLIENT_SECRET = process.env.NSW_CLIENT_SECRET || '';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const auTimestampNow = () => {
  const p = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(new Date()).reduce((a,x)=>(a[x.type]=x.value,a),{});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
};

function basicAuth() {
  if (BASIC_B64) return `Basic ${BASIC_B64}`;
  if (CLIENT_KEY && CLIENT_SECRET) {
    return `Basic ${Buffer.from(`${CLIENT_KEY}:${CLIENT_SECRET}`).toString('base64')}`;
  }
  return null;
}

// ---- token cache ----
let tokenCache = { token: null, exp: 0 };
async function getAccessToken() {
  const auth = basicAuth();
  if (!auth || !/^https?:\/\//i.test(TOKEN_URL)) {
    console.warn('[NSW] token config missing');
    return null;
  }
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.exp - 30_000) return tokenCache.token;

  const url = `${TOKEN_URL}?grant_type=client_credentials`;
  const r = await fetch(url, { method: 'GET', headers: { accept: 'application/json', Authorization: auth } });
  if (!r.ok) { console.warn('[NSW] token HTTP', r.status); return null; }
  const j = await r.json().catch(()=> ({}));
  const token = j.access_token || j.accessToken || null;
  const expiresIn = Number(j.expires_in || 3600);
  if (!token) { console.warn('[NSW] token missing in response'); return null; }
  tokenCache = { token, exp: Date.now() + expiresIn * 1000 };
  return token;
}

const FUEL_MAP = { U91:'U91', P95:'P95', P98:'P98', Diesel:'DL' };

async function geocodeOSM(suburb) {
  if (String(process.env.NSW_ENABLE_OSM_GEOCODE||'false').toLowerCase()!=='true') return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&state=New%20South%20Wales&city=${encodeURIComponent(suburb)}`;
  const controller = new AbortController(); const id=setTimeout(()=>controller.abort(), 5000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'FullTankApp/1.0 (support@example.local)' }, signal: controller.signal });
    clearTimeout(id);
    if (!r.ok) return null;
    const arr = await r.json().catch(()=> []);
    if (!arr?.length) return null;
    const hit = arr[0];
    const lat = Number(hit.lat), lng = Number(hit.lon);
    const pc = (hit.display_name||'').match(/\b\d{4}\b/)?.[0] || null;
    return (Number.isFinite(lat)&&Number.isFinite(lng)) ? { postcode: pc, lat, lng } : null;
  } catch (e) {
    console.warn('[NSW] OSM geocode failed:', e.message || e);
    return null;
  }
}

async function callNearby({ token, namedlocation, lat, lng, fuel, brands, radiusKm, authStyle }) {
  const headers = {
    accept: 'application/json',
    'Content-Type': 'application/json',
    apikey: API_KEY,
    transactionid: uuid(),
    requesttimestamp: auTimestampNow(),
    Authorization: authStyle === 'bearer' ? `Bearer ${token}` : token
  };

  const body = {
    fueltype: (FUEL_MAP[fuel] || fuel).toUpperCase(),
    namedlocation,
    latitude: lat != null ? String(lat) : undefined,
    longitude: lng != null ? String(lng) : undefined,
    radius: (radiusKm != null && radiusKm !== '') ? String(radiusKm) : '5', // default 5km
    sortby: 'price',
    sortascending: 'true',
    brand: (Array.isArray(brands) && brands.length) ? brands : undefined
  };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  console.log('[NSW] nearby attempt', { namedlocation, lat: body.latitude, lng: body.longitude, radius: body.radius, fuel: body.fueltype, brandCount: Array.isArray(brands)?brands.length:0, authStyle });

  const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  console.log('[NSW] nearby HTTP', res.status);
  if (!res.ok) return null;

  const data = await res.json().catch(()=> ({}));
  return data;
}

export async function nswFetchNearby({ q='2065', fuel='U91', brands=[], lat=null, lng=null, radiusKm='' } = {}) {
  if (!/^https?:\/\//i.test(API_URL) || !API_KEY) { console.warn('[NSW] nearby config missing'); return []; }
  const token = await getAccessToken(); if (!token) return [];

  const rawQ = String(q).trim();
  const isPostcode = /^\d{4}$/.test(rawQ);

  // derive namedlocation + coords
  let namedlocation = rawQ;
  let refLat = Number.isFinite(Number(lat)) ? Number(lat) : null;
  let refLng = Number.isFinite(Number(lng)) ? Number(lng) : null;

  if (!isPostcode && (refLat == null || refLng == null)) {
    const dict = lookupNSW(rawQ) || await geocodeOSM(rawQ);
    if (dict?.postcode) namedlocation = dict.postcode;
    if (Number.isFinite(dict?.lat) && Number.isFinite(dict?.lng)) { refLat = dict.lat; refLng = dict.lng; }
  }

  // Try multiple variants:
  // 1) Bearer + brand
  // 2) Bearer + no brand
  // 3) Raw + brand
  // 4) Raw + no brand
  const tries = [
    { authStyle: 'bearer', brands },
    { authStyle: 'bearer', brands: [] },
    { authStyle: 'raw',    brands },
    { authStyle: 'raw',    brands: [] }
  ];

  let picked = null;
  for (const t of tries) {
    const data = await callNearby({
      token, namedlocation, lat: refLat, lng: refLng, fuel, brands: t.brands, radiusKm, authStyle: t.authStyle
    });
    if (!data) continue;

    const stations = Array.isArray(data?.stations) ? data.stations : [];
    const prices   = Array.isArray(data?.prices)   ? data.prices   : [];
    if (!stations.length) continue;

    picked = { stations, prices };
    break;
  }
  if (!picked) return [];

  // Join stations + prices
  const wantFuel = (FUEL_MAP[fuel] || fuel).toUpperCase();
  const priceByCode = new Map();
  for (const p of picked.prices || []) {
    if (String(p.fueltype||'').toUpperCase() !== wantFuel) continue;
    const cents = Number(p.price);
    const dollars = Number.isFinite(cents) ? cents / 100 : null;
    priceByCode.set(String(p.stationcode), { price: dollars, updatedAt: p.lastupdated, pstate: p.state });
  }

  const out = (picked.stations || []).map((s,i) => {
    const code = String(s.code ?? s.stationcode ?? `nsw_nb_${namedlocation}_${i}`);
    const latN = Number(s.location?.latitude);
    const lngN = Number(s.location?.longitude);
    const brand = s.brand || 'NSW';
    const name  = s.name  || brand;
    const suburb = (s.address || '').split(',').slice(-2, -1)[0]?.trim() || rawQ;
    const hit = priceByCode.get(code);
    const state = s.state || hit?.pstate || 'NSW';

    return {
      id: String(s.stationid || code),
      brand, name, suburb,
      lat: latN, lng: lngN,
      prices: (hit && Number.isFinite(hit.price)) ? { [fuel]: hit.price } : {},
      updatedAt: hit?.updatedAt || new Date().toISOString(),
      state,
      source: 'NSW_FUELCHECK_V2_NEARBY'
    };
  }).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  return out;
}
