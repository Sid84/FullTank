import fetch from 'node-fetch';
import { parseAuAddress } from '../utils/auAddress.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HOST  = process.env.QLD_API_HOST || '';
const TOKEN = process.env.QLD_SUBSCRIBER_TOKEN || '';

const REF_TTL   = Number(process.env.QLD_REF_TTL || 86400);
const PRICE_TTL = Number(process.env.QLD_PRICE_TTL || 60);
const FALLBACK_LEVEL = Number(process.env.QLD_FALLBACK_LEVEL || 0) || null;
const FALLBACK_ID    = Number(process.env.QLD_FALLBACK_ID || 0)    || null;
const COUNTRY_ID = 21;

// ---------- Daily cache helpers (AEST/Brisbane) ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const REF_CACHE_FILE = path.join(CACHE_DIR, 'qld_refcache.json');

// ensure .cache dir exists
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Date key in Australia/Brisbane (rolls at midnight local)
function brisbaneDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { // YYYY-MM-DD
    timeZone: 'Australia/Brisbane',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function readRefCache() {
  try {
    if (fs.existsSync(REF_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(REF_CACHE_FILE, 'utf8'));
    }
  } catch {}
  return { dateKey: '', fuels: [], brands: [], regions: [] };
}

function writeRefCache(obj) {
  try { fs.writeFileSync(REF_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8'); } catch {}
}

function getDaily(refKey) {
  const store = readRefCache();
  const today = brisbaneDateKey();
  if (store.dateKey === today && Array.isArray(store[refKey]) && store[refKey].length) {
    return store[refKey]; // fresh for today
  }
  return null;
}

function setDaily(refKey, arr) {
  const store = readRefCache();
  const today = brisbaneDateKey();
  const next = {
    dateKey: today,
    fuels: store.fuels || [],
    brands: store.brands || [],
    regions: store.regions || [],
  };
  next[refKey] = Array.isArray(arr) ? arr : [];
  writeRefCache(next);
}





function authHeaders() {
  return {
    Authorization: `FPDAPI SubscriberToken=${TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}
function okHost() { return /^https?:\/\//i.test(HOST) && !!TOKEN; }
const now = () => Date.now();

async function getJSON(url) {
  try {
    const r = await fetch(url, { headers: authHeaders() });
    const text = await r.text(); // read raw first so we can log it
    if (!r.ok) {
      console.warn('[QLD] HTTP', r.status, 'for', url);
      console.warn('[QLD] Body:', text.slice(0, 500));
      throw new Error(`QLD HTTP ${r.status}`);
    }
    try {

      return JSON.parse(text);
    } catch (e) {
      console.warn('[QLD] Non-JSON body for', url, '->', text.slice(0, 200));
      throw new Error('QLD response not JSON');
    }
  } catch (e) {
    console.warn('[QLD] fetch error for', url, '->', e.message);
    throw e;
  }
}


const cache = {
  brands: { exp: 0, data: [] },
  fuels: { exp: 0, data: [] },
  regions: { exp: 0, data: [] },
  prices: { exp: 0, key: '', data: [] },
};



// Fallback list from your tenant (used only if API gives 0 items)
const FALLBACK_FUELS = [
  { FuelId: 2,   Name: 'Unleaded' },
  { FuelId: 3,   Name: 'Diesel' },
  { FuelId: 4,   Name: 'LPG' },
  { FuelId: 5,   Name: 'Premium Unleaded 95' },
  { FuelId: 6,   Name: 'ULSD' },
  { FuelId: 8,   Name: 'Premium Unleaded 98' },
  { FuelId: 11,  Name: 'LRP' },
  { FuelId: 12,  Name: 'e10' },
  { FuelId: 13,  Name: 'Premium e5' },
  { FuelId: 14,  Name: 'Premium Diesel' },
  { FuelId: 16,  Name: 'Bio-Diesel 20' },
  { FuelId: 19,  Name: 'e85' },
  { FuelId: 21,  Name: 'OPAL' },
  { FuelId: 22,  Name: 'Compressed natural gas' },
  { FuelId: 23,  Name: 'Liquefied natural gas' },
  { FuelId: 999, Name: 'e10/Unleaded' },
  { FuelId: 1000,Name: 'Diesel/Premium Diesel' },
];

export async function qldGetFuelTypes() {
  const cached = getDaily('fuels');
  if (cached) return cached;

  const url = `${HOST}/Subscriber/GetCountryFuelTypes?countryId=${COUNTRY_ID}`;
  console.log('[QLD] (miss) fuels GET', url);
  const r = await fetch(url, { headers: authHeaders() });
  const text = await r.text();
  console.log('[QLD] fuels HTTP', r.status, 'len', text.length);

  let data = null;
  try { data = JSON.parse(text.trim()); } catch {}
  let arr = Array.isArray(data?.Fuels) ? data.Fuels
          : Array.isArray(data?.Data)  ? data.Data
          : Array.isArray(data)        ? data
          : [];

  if (!arr.length) {
    console.warn('[QLD] fuels empty from upstream; preserving previous day if present');
    const prev = readRefCache().fuels;
    if (Array.isArray(prev) && prev.length) return prev;
  }

  setDaily('fuels', arr);
  return arr;
}


// ---- Reference data ----
export async function qldGetBrands() {
  const cached = getDaily('brands');
  if (cached) return cached;

  const url = `${HOST}/Subscriber/GetCountryBrands?countryId=${COUNTRY_ID}`;
  console.log('[QLD] (miss) brands GET', url);
  const r = await fetch(url, { headers: authHeaders() });
  const text = await r.text();
  console.log('[QLD] brands HTTP', r.status, 'len', text.length);

  let data = null;
  try { data = JSON.parse(text.trim()); } catch {}
  let arr = Array.isArray(data?.Brands) ? data.Brands
          : Array.isArray(data?.Data)   ? data.Data
          : Array.isArray(data)         ? data
          : [];

  if (!arr.length) {
    console.warn('[QLD] brands empty from upstream; preserving previous day if present');
    const prev = readRefCache().brands;
    if (Array.isArray(prev) && prev.length) return prev;
  }

  setDaily('brands', arr);
  return arr;
}

// Build quick lookup maps for region names by level
export async function qldRegionsIndex() {
  const regs = await qldGetRegions(); // already cached
  const L1 = new Map(); // level 1 (suburbs)
  const L2 = new Map(); // level 2 (cities/regions)
  const L3 = new Map(); // level 3 (state)
  const idAny = new Map(); // <-- NEW: any level by id

  for (const r of regs || []) {
    const id = String(r.GeoRegionId);
    const lvl = Number(r.GeoRegionLevel);
    const name = r.Name || '';
    idAny.set(id, name);
    if (lvl === 1) L1.set(id, name);
    else if (lvl === 2) L2.set(id, name);
    else if (lvl === 3) L3.set(id, name);
  }
  console.log('[QLD] regionsIndex sizes:', { L1: L1.size, L2: L2.size, L3: L3.size, any: idAny.size });
  return { L1, L2, L3, idAny };
}

export async function qldGetRegions() {
  const cached = getDaily('regions');
  if (cached) return cached;

  const url = `${HOST}/Subscriber/GetCountryGeographicRegions?countryId=${COUNTRY_ID}`;
  console.log('[QLD] (miss) regions GET', url);
  const r = await fetch(url, { headers: authHeaders() });
  const text = await r.text();
  console.log('[QLD] regions HTTP', r.status, 'len', text.length, 'head:', text.slice(0, 160));

  let data = null;
  try {
    const trimmed = text.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      data = JSON.parse(JSON.parse(trimmed));
    } else {
      data = JSON.parse(trimmed);
    }
  } catch (e) {
    console.warn('[QLD] regions parse error:', e.message);
  }

  let arr = Array.isArray(data?.GeographicRegions) ? data.GeographicRegions
          : Array.isArray(data?.Regions)           ? data.Regions
          : Array.isArray(data?.Data)              ? data.Data
          : Array.isArray(data)                    ? data
          : findRegionArray(data)                  || [];

  if (!arr.length) {
    console.warn('[QLD] regions empty from upstream; preserving previous day if present');
    const prev = readRefCache().regions;
    if (Array.isArray(prev) && prev.length) {
      setDaily('regions', prev); // re-store under today to avoid re-fetch loops
      return prev;
    }
  }

  setDaily('regions', arr);
  return arr;
}

// Depth search used by regions parser
function findRegionArray(node, depth = 0) {
  if (!node || depth > 5) return null;
  if (Array.isArray(node)) {
    const ok = node.length && typeof node[0] === 'object' &&
      ('GeoRegionLevel' in node[0] || 'GeoRegionId' in node[0] || 'Name' in node[0]);
    return ok ? node : null;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const hit = findRegionArray(node[k], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Same pickBestStateCandidate as before…
function pickQueenslandState(regs = []) {
  const ci = s => String(s || '').toLowerCase();
  const level3 = regs.filter(r => Number(r.GeoRegionLevel) === 3);
  // exclude junk
  const level3Clean = level3.filter(r => !ci(r.Name).includes('unallocated'));

  let hit = level3Clean.find(r => r.Name === 'Queensland');
  if (hit) return { level: 3, id: hit.GeoRegionId, hit };

  hit = level3Clean.find(r => (r.Abbrev || '').toUpperCase() === 'QLD');
  if (hit) return { level: 3, id: hit.GeoRegionId, hit };

  // last-chance: first clean level-3
  if (level3Clean[0]) return { level: 3, id: level3Clean[0].GeoRegionId, hit: level3Clean[0] };

  // ultimate fallback
  return { level: 3, id: 1, hit: null };
}

async function resolveQLDState() {
  const regs = await qldGetRegions();
  const picked = pickQueenslandState(regs);
  console.log('[QLD] State region picked:', { level: picked.level, id: picked.id, hit: picked.hit?.Name, abbrev: picked.hit?.Abbrev });
  return picked;
}

// keep qldResolveRegionByName but make its fallback:
export async function qldResolveRegionByName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return resolveQLDState();

  const regs = await qldGetRegions();
  const notUnallocated = regs.filter(r => !/unallocated/i.test(String(r.Name)));

  let hit = notUnallocated.find(r => r.GeoRegionLevel === 1 && String(r.Name).trim().toLowerCase() === n);
  if (hit) return { level: 1, id: hit.GeoRegionId, hit };

  hit = notUnallocated.find(r => r.GeoRegionLevel === 2 && String(r.Name).trim().toLowerCase() === n);
  if (hit) return { level: 2, id: hit.GeoRegionId, hit };

  hit = notUnallocated.find(r => String(r.Abbrev || '').trim().toLowerCase() === n);
  if (hit) return { level: hit.GeoRegionLevel, id: hit.GeoRegionId, hit };

  hit = notUnallocated.find(r => String(r.Name || '').trim().toLowerCase().includes(n));
  if (hit) return { level: hit.GeoRegionLevel, id: hit.GeoRegionId, hit };

  return resolveQLDState();
}


function findSiteArray(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.length && typeof node[0] === 'object') {
      const k = Object.keys(node[0]);
      const looksLikeSite =
        k.includes('S') || k.includes('SiteId') ||
        (k.includes('Lat') && k.includes('Lng')) ||
        (k.includes('Latitude') && k.includes('Longitude')) ||
        k.includes('Address') || k.includes('A') || k.includes('Name') || k.includes('N');
      return looksLikeSite ? node : null;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const hit = findSiteArray(node[key], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Normalize a site record to the short schema our normalizer expects
function normalizeSiteRecord(s) {
  // Prefer short keys if present; else map long keys → short
  const out = {
    S: s.S ?? s.SiteId ?? s.id ?? null,
    N: s.N ?? s.Name ?? null,
    A: s.A ?? s.Address ?? s.Address1 ?? s.AddressLine ?? null,
    P: s.P ?? s.Postcode ?? s.Zip ?? null,
    B: s.B ?? s.BrandId ?? s.brandId ?? null,
    Lat: s.Lat ?? s.Latitude ?? s.lat ?? null,
    Lng: s.Lng ?? s.Longitude ?? s.lng ?? null,
    G1: s.G1 ?? s.GeoRegion1 ?? s.GeoRegionLevel1 ?? s.GeoRegionId1 ?? null,
    G2: s.G2 ?? s.GeoRegion2 ?? s.GeoRegionLevel2 ?? s.GeoRegionId2 ?? null,
    M: s.M ?? s.LastModified ?? s.UpdatedAt ?? null,
    Suburb: s.SuburbName ?? s.Suburb ?? s.suburb ?? null,
    BrandName: s.BrandName ?? s.Brand ?? s.brandName ?? s.brand ?? null,
  };
  return out;
}

// ---- Sites & Prices ----
export async function qldGetSites({ geoRegionLevel, geoRegionId }) {
  const key = `${geoRegionLevel}:${geoRegionId}`;

  // If we have non-empty cached sites for this key, return them
  if (cache.sites?.key === key && now() < cache.sites.exp && Array.isArray(cache.sites.data) && cache.sites.data.length) {
    return cache.sites.data;
  }

  const url = `${HOST}/Subscriber/GetFullSiteDetails?countryId=${COUNTRY_ID}&geoRegionLevel=${geoRegionLevel}&geoRegionId=${geoRegionId}`;
  console.log('[QLD] GET', url);
  const r = await fetch(url, { headers: authHeaders() });
  const text = await r.text();
  console.log('[QLD] sites HTTP', r.status, 'len', text.length, 'head:', text.slice(0, 180));

  if (!r.ok) {
    console.warn('[QLD] sites non-200 head:', text.slice(0, 400));
    // Do NOT clobber a good cache with an error
    if (cache.sites?.data?.length) return cache.sites.data;
    return [];
  }

  let data = null;
  try {
    const trimmed = text.trim();
    // Some tenants return a stringified JSON; parse twice if needed
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      const inner = JSON.parse(trimmed);
      data = JSON.parse(inner);
    } else {
      data = JSON.parse(trimmed);
    }
  } catch (e) {
    console.warn('[QLD] sites parse error:', e.message);
    if (cache.sites?.data?.length) return cache.sites.data;
    return [];
  }

  // Accept common wrappers or search for the array
  let arr =
    (Array.isArray(data?.Sites) && data.Sites) ||
    (Array.isArray(data?.SiteDetails) && data.SiteDetails) ||
    (Array.isArray(data?.Data) && data.Data) ||
    (Array.isArray(data) && data) ||
    findSiteArray(data) ||
    [];

  // Normalize each site record to the expected short-form
  const normalized = arr.map(normalizeSiteRecord);

  console.log('[QLD] sites count', normalized.length, 'sample keys', normalized[0] ? Object.keys(normalized[0]) : []);
  // Only cache if we actually got data
  if (normalized.length) {
    cache.sites = { key, exp: now() + REF_TTL * 1000, data: normalized };
  } else {
    console.warn('[QLD] sites array empty after parse; preserving previous cache if any');
    if (cache.sites?.data?.length) return cache.sites.data;
  }
  return normalized;
}

export async function qldGetPrices({ geoRegionLevel, geoRegionId }) {
  const key = `${geoRegionLevel}:${geoRegionId}`;
  if (cache.prices.key === key && now() < cache.prices.exp) return cache.prices.data;

  const url = `${HOST}/Price/GetSitesPrices?countryId=${COUNTRY_ID}&geoRegionLevel=${geoRegionLevel}&geoRegionId=${geoRegionId}`;
  console.log('[QLD] GET', url);

  const r = await fetch(url, { headers: authHeaders() });
  const text = await r.text();
  console.log('[QLD] prices HTTP', r.status, 'len', text.length);
  console.log('[QLD] prices body head:', text.slice(0, 400));

  if (!r.ok) {
    console.warn('[QLD] prices body (first 400):', text.slice(0, 400));
    throw new Error(`QLD HTTP ${r.status}`);
  }

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('QLD prices response not JSON'); }

  // 🔧 Accept multiple shapes: [], {Prices:[...]}, {SitePrices:[...]}
  const arr = Array.isArray(data)             ? data
            : Array.isArray(data?.Prices)     ? data.Prices
            : Array.isArray(data?.SitePrices) ? data.SitePrices
            : [];

  cache.prices = { key, exp: now() + PRICE_TTL * 1000, data: arr };
  return arr;
}



// ---- Fuel name normaliser → app keys ----
function mapFuelNameToKey(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('premium unleaded 95') || n === 'p95' || n.includes('95')) return 'P95';
  if (n.includes('premium unleaded 98') || n === 'p98' || n.includes('98')) return 'P98';
  if (n === 'diesel' || n.includes('premium diesel') || n === 'ulsd' || n.includes('diesel/premium diesel')) return 'Diesel';
  if (n === 'unleaded' || n === 'e10' || n === 'premium e5' || n === 'e10/unleaded') return 'U91';
  return null; // ignore others for now (LPG, CNG, etc.)
}

// ---- Main aggregator ----
export async function qldFetchStations({ q = '', fuel = '' } = {}) {
  if (!okHost()) return [];

  const region = await qldResolveRegionByName(q); // { level, id }

  const fetchPair = async (lvl, id) => {
    console.log('[QLD] fetching sites/prices for', { level: lvl, id });
    const [sites, prices, fuels, brands] = await Promise.all([
      qldGetSites({ geoRegionLevel: lvl, geoRegionId: id }),
      qldGetPrices({ geoRegionLevel: lvl, geoRegionId: id }),
      qldGetFuelTypes(),
      qldGetBrands(),
    ]);
    console.log('[QLD] sites/prices fetched:', Array.isArray(sites)?sites.length:0, Array.isArray(prices)?prices.length:0);
    return { sites, prices, fuels, brands };
  };

  // 1) try the resolved region first (often state=3, id=1)
  let { sites, prices, fuels, brands } = await fetchPair(region.level, region.id);

  // 2) if prices are empty at state level, fallback to a few big level-2 regions (e.g., Brisbane, Gold Coast)
  if (!Array.isArray(prices) || prices.length === 0) {
    const regs = await qldGetRegions();
    const bigCities = ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns'];
    const candidates = regs
      .filter(r => Number(r.GeoRegionLevel) === 2 && bigCities.some(n => (r.Name||'').toLowerCase().includes(n.toLowerCase())))
      .slice(0, 5);

    for (const r of candidates) {
      const pair = await fetchPair(r.GeoRegionLevel, r.GeoRegionId);
      if (Array.isArray(pair.prices) && pair.prices.length > 0) {
        // merge: keep original sites (state-wide) and use city prices
        prices = pair.prices;
        break;
      }
    }
  }

  // if still no prices, return stations with empty prices (map still useful)
  return normalizeQLD(sites, prices, fuels, brands, fuel);
}


function fuelKeyFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'unleaded' || n === 'e10' || n === 'premium e5' || n === 'e10/unleaded') return 'U91';
  if (n === 'premium unleaded 95') return 'P95';
  if (n === 'premium unleaded 98') return 'P98';
  if (n === 'diesel' || n === 'ulsd' || n === 'premium diesel' || n === 'diesel/premium diesel') return 'Diesel';
  return null;
}


function normalizeQLD(sites, prices, fuels, brands, wantedFuelKey, regionsIndex = { L1:new Map(), L2:new Map(), idAny:new Map() }) {
  const fuelIdToName  = new Map((fuels  || []).map(f => [String(f.FuelId), f.Name]));
  const brandIdToName = new Map((brands || []).map(b => [String(b.BrandId), b.Name]));


   for (const s of (sites || [])) {
    const bid = s.B ?? s.BrandId ?? s.brandId;
    const bname = s.BrandName ?? s.Brand ?? s.brandName ?? s.brand;
    if (bid != null && bname) brandIdToName.set(String(bid), String(bname));
  }
  // Build price map…
  const priceBySite = new Map();
  for (const p of (prices || [])) {
    const siteId = String(p.SiteId ?? '');
    if (!siteId) continue;
    const fname = fuelIdToName.get(String(p.FuelId)) || '';
    const key = fuelKeyFromName(fname);
    if (!key) continue;
    const raw = Number(p.Price);
    const dollars = Number.isFinite(raw) ? raw / 1000 : NaN; // 1899.0 -> 1.899
    if (!Number.isFinite(dollars)) continue;
    const bag = priceBySite.get(siteId) || {};
    bag[key] = bag[key] == null ? dollars : Math.min(bag[key], dollars);
    priceBySite.set(siteId, bag);
  }

    console.log('[QLD] built priceBySite for', priceBySite.size, 'sites from');


  const out = [];
  const wanted = String(wantedFuelKey || '').toUpperCase();

   for (const s of (sites || [])) {
    const siteId = String(s.S ?? s.SiteId ?? s.id ?? '');
    const lat = Number(s.Lat ?? s.latitude);
    const lng = Number(s.Lng ?? s.longitude);
    if (!siteId || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // ----- BRAND (prefer explicit name on site, else lookup) -----
    const bid = s.B ?? s.BrandId ?? s.brandId;
    const brandExplicit = s.BrandName ?? s.Brand ?? s.brandName ?? s.brand;
    const brand = (brandExplicit && String(brandExplicit)) || (bid != null ? brandIdToName.get(String(bid)) : '') || '';

    // ----- SUBURB/STREET (prefer site fields; then regions; then parse address) -----
    // Many tenants already send Suburb / SuburbName
    // Prefer explicit site suburb if present
const explicitSuburb = s.SuburbName ?? s.Suburb ?? s.suburb ?? '';

// Look up names by IDs (G1/G2 can be huge IDs; use both exact L1 and the global map)
const g1Id = s.G1 != null ? String(s.G1) : '';
const g2Id = s.G2 != null ? String(s.G2) : '';
const g1NameL1  = g1Id ? (regionsIndex.L1?.get(g1Id) || '') : '';
const g1NameAny = g1Id ? (regionsIndex.idAny?.get(g1Id) || '') : '';
const g2NameL2  = g2Id ? (regionsIndex.L2?.get(g2Id) || '') : '';
const g2NameAny = g2Id ? (regionsIndex.idAny?.get(g2Id) || '') : '';

const regionSuburb = explicitSuburb
  || g1NameL1         // ideal: level-1 name
  || g1NameAny        // fallback: any-level name by that id
  || g2NameL2         // weaker fallback: level-2 name
  || g2NameAny        // last resort: any-level name for G2
  || '';

// Now feed that into the tolerant address parser
const rawAddress  = s.A || s.Address || s.Address1 || s.AddressLine || '';
const rawPostcode = s.P || s.Postcode || '';
const addrParts = parseAuAddress({
  address: rawAddress,
  postcode: rawPostcode,
  stateHint: 'QLD',
  g1: regionSuburb, // <- seed with region-derived name
  g2: ''            // optional; we already tried regionSuburb above
});

// Guard against numeric suburb
const safeSuburb = /^\d+$/.test(String(addrParts.suburb || '')) ? '' : (addrParts.suburb || regionSuburb || '');


    const pricesMap = priceBySite.get(siteId) || {};
    if (wanted && Object.keys(pricesMap).length && pricesMap[wanted] == null) continue;

    //console.log('[QLD] site sample keys:', sites[0] ? Object.keys(sites[0]) : []);


    out.push({
      id: siteId,
      state: 'QLD',
      brand,
      name: s.N || s.Name || '',
      street: addrParts.street || '',
      suburb: safeSuburb,
      postcode: addrParts.postcode || '',
      lat, lng,
      prices: pricesMap,
      updatedAt: s.M || s.LastModified || null,
      source: 'QLD_FPDAPI'
    });

    const missing = out.filter(x => !x.suburb).slice(0, 3);
if (missing.length) {
  const byId = new Map(sites.map(s => [String(s.S ?? s.SiteId ?? ''), s]));
  // console.log('[QLD] sample missing suburb:', missing.map(m => {
  //   const s = byId.get(String(m.id)) || {};
  //   return {
  //     id: m.id,
  //     A: s.A || s.Address || s.Address1 || s.AddressLine || '',
  //     G1: s.G1, G2: s.G2, P: s.P,
  //     Name: s.N || s.Name || '',
  //   };
  // }));
}

  }

  console.log('[QLD] stations out:', out.length, 'with brand missing:', out.filter(x => !x.brand).length, 'with suburb missing:', out.filter(x => !x.suburb).length);
  return out;
}