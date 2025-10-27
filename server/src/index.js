// FullTank/server/src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

import { readStore, writeStore } from './store.js';
import fs from 'fs';
import fetch from 'node-fetch';


// --- optional adapters (they can stay even if you don't have keys yet)
import { nswFetchNearby } from './integrations/nswFuelCheck.js';
import { waFetchLatest } from './integrations/waFuelWatch.js';
import { qldGetBrands, qldGetFuelTypes, qldGetRegions, qldFetchStations } from './integrations/qldFuel.js';
import { saFetchBySuburb } from './integrations/saSafpis.js';
import { vicFetch } from './integrations/vicServiceVic.js';
import { fuelpriceFetchBySuburb } from './integrations/fuelpriceAustralia.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));


// uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const upload = multer({ dest: UPLOAD_DIR });
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // ← ensure uploads dir exists
}
app.use('/uploads', express.static(UPLOAD_DIR));

// Simple request logger so you can see every request hit the server
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.url);
  next();
});

// Promise timeout helper so a slow adapter can't hang the route
const pTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`timeout:${label}:${ms}ms`)), ms)
    )
  ]);

// Collector that NEVER writes to res; it only pushes to the in-memory list
async function collect(label, promise, bucket) {
  try {
    const data = await promise;
    const arr = Array.isArray(data) ? data : [];
    console.log(`[${label}] +${arr.length}`);
    if (arr.length) bucket.push(...arr);
  } catch (e) {
    console.warn(`[${label}] adapter failed:`, e?.message || e);
  }
}


// health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// integrations status (← the route you’re hitting)
app.get('/api/integrations/status', (req, res) => {
  res.json({
    NSW: process.env.ENABLE_NSW === 'true',
    WA: process.env.ENABLE_WA === 'true',
    QLD: process.env.ENABLE_QLD === 'true',
    SA: process.env.ENABLE_SA === 'true',
    VIC_STUB: process.env.ENABLE_VIC_STUB === 'true',
    FUELPRICE_FALLBACK: process.env.ENABLE_FUELPRICE_FALLBACK === 'true'
  });
});


app.get('/api/qld/brands', async (req, res) => {
  try { res.json(await qldGetBrands()); } catch (e) { res.status(500).json({ error: String(e) }); }
});
app.get('/api/qld/fuels', async (req, res) => {
        //console.log(res.json(await qldGetFuelTypes()));

  try { res.json(await qldGetFuelTypes()); } catch (e) { res.status(500).json({ error: String(e) }); }
});
// server/src/index.js
app.get('/api/qld/regions', async (req, res) => {
  try {
    const regs = await qldGetRegions();
    res.json(regs);     // may be array or object — that’s fine for debugging
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


// stations (pull from live adapters + merge local store updates)
// stations (pull from live adapters + merge local store updates)
app.get('/api/stations', async (req, res) => {
  const {
    q = '',
    fuel = 'U91',
    state = '',
    lat = null,
    lng = null,
    radius = ''
  } = req.query;

  // normalize requested state
  const wantState = String(state || '').trim().toUpperCase();

  const list = [];

  // Build the jobs we actually want to run (based on ?state= and env flags)
  const jobs = [];

  // VIC (stub + fallback)
  if ((wantState === '' || wantState === 'VIC')) {
    if (process.env.ENABLE_VIC_STUB === 'true') {
      jobs.push([
        'VIC',
        pTimeout(vicFetch({ q, fuel }), 8000, 'VIC')
      ]);
    } else if (process.env.ENABLE_FUELPRICE_FALLBACK === 'true') {
      jobs.push([
        'FUELPRICE_FALLBACK',
        pTimeout(fuelpriceFetchBySuburb({ q: q || 'Melbourne', fuel }), 8000, 'FUELPRICE')
      ]);
    }
  }

  // NSW nearby
  if ((wantState === '' || wantState === 'NSW') && process.env.ENABLE_NSW === 'true') {
    jobs.push([
      'NSW',
      pTimeout(
        nswFetchNearby({
          q: q || '2065',                             // q should be postcode for NSW nearby
          fuel,
          lat: lat != null ? Number(lat) : null,
          lng: lng != null ? Number(lng) : null,
          radiusKm: radius !== '' ? Number(radius) : ''
        }),
        8000,
        'NSW'
      )
    ]);
  }

  // WA (latest)
  if ((wantState === '' || wantState === 'WA') && process.env.ENABLE_WA === 'true') {
    // Use your existing safe()+mapWA path, but wrapped so we don't send res here
    jobs.push([
      'WA',
      (async () => {
        const waRaw = await safe(() => waFetchLatest({ fuel }), 'WA');
        const wa = (waRaw || []).map(mapWA);
        console.log('[WA] fetched', wa?.length, 'rows');
        return wa;
      })()
    ]);
  }

  // QLD
  if ((wantState === '' || wantState === 'QLD') && process.env.ENABLE_QLD === 'true') {
    jobs.push([
      'QLD',
      pTimeout(qldFetchStations({ q, fuel }), 8000, 'QLD')
    ]);
  }

  // SA
  if ((wantState === '' || wantState === 'SA') && process.env.ENABLE_SA === 'true') {
    jobs.push([
      'SA',
      pTimeout(saFetchBySuburb({ q: q || 'Adelaide', fuel }), 8000, 'SA')
    ]);
  }

  // Run sequentially so logs stay readable (use Promise.all if you prefer)
  for (const [label, promise] of jobs) {
    await collect(label, promise, list);
  }

  // 1) Filter by state (if requested) and by text query (brand/name/suburb)
  // ---- Smarter filter rules ----
//wantState = String(state || '').trim().toUpperCase();
const isPostcodeQuery = /^\d{4}$/.test(String(q || '').trim());

// If query is a postcode (e.g., NSW nearby) or lat/lng provided, we've already
// filtered upstream; don't apply fuzzy text filtering again.
const skipTextFilter = isPostcodeQuery || (req.query.lat && req.query.lng);

const filteredList = list
  .filter(s => !wantState || String(s.state || '').toUpperCase() === wantState)
  .filter(s => skipTextFilter ? true : matchesQuery(s, q));

  console.log('[AGG] before filter count', list.length, 'after', filteredList.length, 'skipTextFilter', skipTextFilter, 'wantState', wantState);



  // 2) Merge with local store (your existing logic, unchanged)
  const store = readStore();
  const localStations = (store.stations || [])
    .filter(s => !wantState || String(s.state || '').toUpperCase() === wantState)
    .filter(s => matchesQuery(s, q));

  const norm = v => String(v || '').trim().toLowerCase();
  const round5 = n => (Number.isFinite(n) ? Number(n).toFixed(5) : '');
  const keyOf = s => `${norm(s.state)}|${norm(s.brand)}|${norm(s.name || '')}|${round5(s.lat)}|${round5(s.lng)}`;

  const liveIndex = new Map();
  for (const s of filteredList) {
    liveIndex.set(keyOf(s), s);
  }

  for (const loc of localStations) {
    const k = keyOf(loc);
    const hit = liveIndex.get(k);
    if (hit) {
      hit.prices = { ...(hit.prices || {}), ...(loc.prices || {}) };
      const lu = new Date(hit.updatedAt || 0).getTime();
      const su = new Date(loc.updatedAt || 0).getTime();
      if (su > lu) hit.updatedAt = loc.updatedAt;
    } else {
      liveIndex.set(k, loc);
    }
  }

  const stations = Array.from(liveIndex.values());

  console.log('[LIVE] filtered count', filteredList.length);
  console.log('[LOCAL] filtered count', localStations.length);

  // Optional sorting (kept exactly like your version)
  const sort = (req.query.sort || '').toLowerCase();
  if (sort === 'price') {
    stations.sort((a, b) => {
      const pa = getLowestPrice(a);
      const pb = getLowestPrice(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });
  } else if (sort === 'updated') {
    stations.sort((a, b) => {
      const ta = new Date(a.updatedAt || 0).getTime();
      const tb = new Date(b.updatedAt || 0).getTime();
      return tb - ta;
    });
  } else if (sort === 'brand') {
    stations.sort((a, b) => (a.brand || '').localeCompare(b.brand || ''));
  }

  // Single, final send
  return res.json(stations);
});



async function safe(fn, label) {
  try {
    const arr = await fn();
    console.log(`[${label}] raw count`, Array.isArray(arr) ? arr.length : 0);
    return arr || [];
  } catch (e) {
    console.error(`[${label}] fetch failed:`, e.message);
    return [];
  }
}

// normalizers per state (map fields to common schema)
function mapWA(s) {
  return {
    id: s.id || s.siteId || s.stationId,
    state: 'WA',
    brand: s.brand || s['trading-name'] || s.brandName || '',
    name:  s.name  || s.stationName || '',
    suburb: s.suburb || s.locality || '',
    lat: Number(s.lat ?? s.latitude ?? s.Latitude),
    lng: Number(s.lng ?? s.longitude ?? s.Longitude),
    prices: s.prices || {},
    updatedAt: s.updatedAt || s.lastUpdated || null,
  };
}


function getLowestPrice(station) {
  if (!station.prices) return null;
  let min = null;
  for (const v of Object.values(station.prices)) {
    const num = Number(v);
    if (Number.isFinite(num)) {
      if (min == null || num < min) min = num;
    }
  }
  return min;
}


function matchesQuery(station, q) {
  if (!q) return true;
  const query = String(q).toLowerCase();

  // Try to match postcode if present on the station (from adapter)
  const postcode = (station.postcode || station.P || station.zip || '').toString().toLowerCase();

  return (
    (station.suburb && station.suburb.toLowerCase().includes(query)) ||
    (station.brand && station.brand.toLowerCase().includes(query)) ||
    (station.name && station.name.toLowerCase().includes(query)) ||
    (postcode && postcode.includes(query))
  );
}


// submit price (with optional photo)
app.post('/api/stations/:id/price', upload.single('photo'), (req, res) => {
  const id = String(req.params.id);
  const { prices } = req.body;
  let parsed = {};
  try { parsed = typeof prices === 'string' ? JSON.parse(prices) : (prices || {}); }
  catch { return res.status(400).json({ error: 'Invalid prices JSON' }); }

  const store = readStore();
  let station = store.stations.find(s => String(s.id) === id);
  if (!station) {
    station = {
      id,
      brand: req.body.brand || 'Unknown',
      name: req.body.name || 'Station',
      suburb: req.body.suburb || '',
      lat: Number(req.body.lat),
      lng: Number(req.body.lng),
      prices: {},
      updatedAt: new Date().toISOString(),
      state: req.body.state || 'VIC',
      source: 'USER'
    };
    store.stations.push(station);
  }

  station.prices = { ...(station.prices || {}), ...parsed };
  station.updatedAt = new Date().toISOString();

  const upd = {
    id: 'upd_' + Date.now(),
    stationId: id,
    prices: parsed,
    photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: station.updatedAt
  };
  store.updates.push(upd);
  writeStore(store);

  res.json({ ok: true, station, update: upd });
});

// ===== Alerts (MVP) =====
/**
 * Alert shape:
 * { id, userId: string|null, center:{lat,lng}|suburb, fuelType, threshold, radiusKm, enabled, createdAt }
 */
app.get('/api/alerts', (req, res) => {
  const store = readStore();
  res.json(store.alerts || []);
});

app.post('/api/alerts', (req, res) => {
  const { fuelType='U91', threshold, radiusKm=5, center=null, suburb='', enabled=true } = req.body || {};
  if (!threshold || !Number.isFinite(Number(threshold))) {
    return res.status(400).json({ error: 'threshold (price) is required' });
  }
  const store = readStore();
  const alert = {
    id: 'al_' + Date.now(),
    userId: null, // MVP anonymous
    fuelType: String(fuelType).toUpperCase(),
    threshold: Number(threshold),
    radiusKm: Number(radiusKm),
    center: center && Number.isFinite(center.lat) && Number.isFinite(center.lng) ? center : null,
    suburb: suburb || '',
    enabled: !!enabled,
    createdAt: new Date().toISOString()
  };
  store.alerts.push(alert);
  writeStore(store);
  res.json(alert);
});

app.patch('/api/alerts/:id', (req, res) => {
  const store = readStore();
  const a = (store.alerts || []).find(x => String(x.id) === String(req.params.id));
  if (!a) return res.status(404).json({ error: 'Not found' });
  const allowed = ['fuelType','threshold','radiusKm','center','suburb','enabled'];
  for (const k of allowed) if (k in req.body) a[k] = req.body[k];
  writeStore(store);
  res.json(a);
});

app.delete('/api/alerts/:id', (req, res) => {
  const store = readStore();
  const before = store.alerts.length;
  store.alerts = store.alerts.filter(x => String(x.id) !== String(req.params.id));
  writeStore(store);
  res.json({ ok: true, removed: before - store.alerts.length });
});

/**
 * On-demand check: returns alerts that would fire *now* with matching stations.
 * Query: ?state=VIC&q=Melbourne  (uses your existing /stations sources + merged local)
 */
app.get('/api/alerts/check', async (req, res) => {
  const store = readStore();
  const active = (store.alerts || []).filter(a => a.enabled);

  // fetch candidate stations using your existing /stations logic via function extraction or re-run here
  // For MVP simplicity, call our own endpoint (localhost). In prod, refactor into a shared function.
  const base = `http://localhost:${process.env.PORT || 4000}/api/stations`;
  const url = new URL(base);
  if (req.query.q) url.searchParams.set('q', req.query.q);
  if (req.query.state) url.searchParams.set('state', req.query.state);
  if (req.query.fuel) url.searchParams.set('fuel', req.query.fuel);
  const r = await fetch(url.toString());
  const stations = await r.json();

  // helpers
  const haversineKm = (a, b) => {
    const R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
    const la1=a.lat*Math.PI/180, la2=b.lat*Math.PI/180;
    const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  };

  const hits = [];
  for (const al of active) {
    const f = al.fuelType || 'U91';
    const within = stations.filter(s => {
      const p = s?.prices?.[f];
      if (!Number.isFinite(Number(p))) return false;
      if (Number(p) > Number(al.threshold)) return false;

      // location filter
      if (al.center && Number.isFinite(al.center.lat) && Number.isFinite(al.center.lng)) {
        const d = haversineKm(
          { lat: Number(al.center.lat), lng: Number(al.center.lng) },
          { lat: Number(s.lat), lng: Number(s.lng) }
        );
        if (d > Number(al.radiusKm || 5)) return false;
      } else if (al.suburb) {
        const ok = (s.suburb || '').toLowerCase().includes(String(al.suburb).toLowerCase());
        if (!ok) return false;
      }
      return true;
    });
    if (within.length) hits.push({ alert: al, stations: within });
  }

  res.json(hits);
});


const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API up on http://localhost:${port}`));
