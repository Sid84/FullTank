import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { readStore, writeStore } from './store.js';

import { nswFetchByLocation } from './integrations/nswFuelCheck.js';
import { waFetchBySuburb } from './integrations/waFuelWatch.js';
import { qldFetchLatest } from './integrations/qldFuel.js';
import { saFetchBySuburb } from './integrations/saSafpis.js';
import { vicFetch } from './integrations/vicServiceVic.js';
import { fuelpriceFetchBySuburb } from './integrations/fuelpriceAustralia.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// uploads
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const upload = multer({ dest: UPLOAD_DIR });
app.use('/uploads', express.static(UPLOAD_DIR));

// health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// integrations status
app.get('/api/integrations/status', (req, res) => {
  res.json({
    NSW: !!process.env.ENABLE_NSW,
    WA: !!process.env.ENABLE_WA,
    QLD: !!process.env.ENABLE_QLD,
    SA: !!process.env.ENABLE_SA,
    VIC_STUB: !!process.env.ENABLE_VIC_STUB,
    FUELPRICE_FALLBACK: !!process.env.ENABLE_FUELPRICE_FALLBACK
  });
});

// fetch stations (q, fuel, state)
app.get('/api/stations', async (req, res) => {
  const { q = '', fuel = 'U91', state = '' } = req.query;
  const list = [];

  try {
    const push = (arr) => arr && list.push(...arr);

    const want = (s) => !state || s === state.toUpperCase();

    if (want('VIC')) {
      if (process.env.ENABLE_VIC_STUB) push(await vicFetch({ q, fuel }));
      if (!list.length && process.env.ENABLE_FUELPRICE_FALLBACK) push(await fuelpriceFetchBySuburb({ q: q || 'Melbourne', fuel }));
    }

    if (want('NSW') && process.env.ENABLE_NSW === 'true') {
      push(await nswFetchByLocation({ q: q || 'Sydney', fuel }));
    }

    if (want('TAS') && process.env.ENABLE_NSW === 'true') {
      // NSW v2 also provides TAS by location name
      push(await nswFetchByLocation({ q: q || 'Hobart', fuel }));
    }

    if (want('WA') && process.env.ENABLE_WA === 'true') {
      push(await waFetchBySuburb({ q: q || 'Perth', fuel }));
    }

    if (want('QLD') && process.env.ENABLE_QLD === 'true') {
      push(await qldFetchLatest({ q: q || 'Brisbane', fuel }));
    }

    if (want('SA') && process.env.ENABLE_SA === 'true') {
      push(await saFetchBySuburb({ q: q || 'Adelaide', fuel }));
    }

    // Local persisted stations (crowd source) — show VIC by default
    const store = readStore();
    const persisted = store.stations
      .filter(s => (!state || s.state === state.toUpperCase()))
      .filter(s => !q || s.suburb?.toLowerCase().includes(String(q).toLowerCase()));
    list.push(...persisted);

    // de-dup by (lat,lng,brand,name)
    const seen = new Set();
    const dedup = list.filter(s => {
      const k = `${s.state}|${s.brand}|${s.name}|${s.lat}|${s.lng}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    res.json(dedup);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// station details (from store only for now)
app.get('/api/stations/:id', (req, res) => {
  const store = readStore();
  const st = store.stations.find(s => String(s.id) === String(req.params.id));
  if (!st) return res.status(404).json({ error: 'Not found' });
  res.json(st);
});

// submit price (with optional photo)
app.post('/api/stations/:id/price', upload.single('photo'), (req, res) => {
  const id = String(req.params.id);
  const { prices } = req.body; // JSON string or fields
  let parsed = {};
  try {
    parsed = typeof prices === 'string' ? JSON.parse(prices) : (prices || {});
  } catch {
    return res.status(400).json({ error: 'Invalid prices JSON' });
  }

  const store = readStore();
  let station = store.stations.find(s => String(s.id) === id);
  if (!station) {
    // Create a minimal station if it came from a live integration but not persisted yet:
    station = {
      id, brand: req.body.brand || 'Unknown', name: req.body.name || 'Station',
      suburb: req.body.suburb || '', lat: Number(req.body.lat), lng: Number(req.body.lng),
      prices: {}, updatedAt: new Date().toISOString(), state: req.body.state || 'VIC', source: 'USER'
    };
    store.stations.push(station);
  }

  // merge prices
  station.prices = { ...(station.prices || {}), ...parsed };
  station.updatedAt = new Date().toISOString();

  // record update
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

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('API up on http://localhost:' + port));
