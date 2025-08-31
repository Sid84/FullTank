// server.js — Fuel Price Finder API (Node + Express)
// Quick start:
// 1) npm init -y && npm i express cors helmet morgan express-rate-limit zod dotenv swagger-ui-express
// 2) node server.js
// 3) Visit http://localhost:4000/health and http://localhost:4000/docs
//
// .env (optional):
// PORT=4000
// ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';

dotenv.config();

// ------------------------------------------------------------------------------------
// In-memory datastore (replace with a DB later)
// ------------------------------------------------------------------------------------
/** @typedef {('U91'|'P95'|'P98'|'Diesel'|'LPG')} FuelType */

/** @type {{ id: string, brand: string, name: string, suburb: string, lat: number, lng: number, distanceKm: number, lastUpdateMins: number, prices: Record<FuelType, number|null> }[]} */
const stations = [
  { id: '1', brand: 'Shell', name: 'Shell Docklands', suburb: 'Docklands', lat: -37.8149, lng: 144.9429, distanceKm: 1.2, lastUpdateMins: 18, prices: { U91: 1.87, P95: 2.01, P98: 2.11, Diesel: 2.05, LPG: null } },
  { id: '2', brand: 'BP', name: 'BP West Melbourne', suburb: 'West Melbourne', lat: -37.8092, lng: 144.941, distanceKm: 2.4, lastUpdateMins: 42, prices: { U91: 1.79, P95: 1.99, P98: 2.09, Diesel: 2.03, LPG: 1.05 } },
  { id: '3', brand: '7-Eleven', name: '7-Eleven Southbank', suburb: 'Southbank', lat: -37.823, lng: 144.964, distanceKm: 1.8, lastUpdateMins: 9, prices: { U91: 1.74, P95: 1.92, P98: 2.02, Diesel: 1.98, LPG: 1.01 } },
  { id: '4', brand: 'Caltex', name: 'Caltex Carlton', suburb: 'Carlton', lat: -37.8, lng: 144.966, distanceKm: 3.3, lastUpdateMins: 56, prices: { U91: 1.81, P95: 1.97, P98: 2.07, Diesel: 2.01, LPG: 1.07 } },
];

/** @type {{ id: string, suburb: string, fuel: FuelType, threshold: number, enabled: boolean }[]} */
const alerts = [
  { id: 'a1', suburb: 'Docklands', fuel: 'U91', threshold: 1.75, enabled: true },
  { id: 'a2', suburb: 'Southbank', fuel: 'P95', threshold: 1.95, enabled: false },
];

// ------------------------------------------------------------------------------------
// App setup
// ------------------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 4000;

// CORS
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ origin: (origin, cb) => {
  if (!origin) return cb(null, true);
  if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
  return cb(new Error('Not allowed by CORS'));
}}));

app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 300 }));

// ------------------------------------------------------------------------------------
// Validation schemas
// ------------------------------------------------------------------------------------
const fuelEnum = z.enum(['U91','P95','P98','Diesel','LPG']);
const priceUpdateSchema = z.object({
  prices: z.record(fuelEnum, z.number().positive()).partial().refine(obj => Object.keys(obj).length > 0, { message: 'Provide at least one fuel price' })
});
const alertCreateSchema = z.object({
  suburb: z.string().min(2),
  fuel: fuelEnum,
  threshold: z.number().positive(),
  enabled: z.boolean().optional().default(true)
});

// ------------------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ ok: true }));

// GET /stations?q=Docklands&fuel=U91
app.get('/stations', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const fuel = req.query.fuel && fuelEnum.safeParse(req.query.fuel).success ? req.query.fuel : undefined;
  let list = stations.filter(s => !q ? true : `${s.name} ${s.suburb} ${s.brand}`.toLowerCase().includes(q));
  if (fuel) list = list.filter(s => s.prices[fuel] != null);
  // sort by price for that fuel if provided, otherwise by distance
  if (fuel) list = list.sort((a,b) => (a.prices[fuel] ?? 9) - (b.prices[fuel] ?? 9));
  else list = list.sort((a,b) => a.distanceKm - b.distanceKm);
  res.json(list);
});

// GET /stations/:id
app.get('/stations/:id', (req, res) => {
  const s = stations.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Station not found' });
  res.json(s);
});

// POST /stations/:id/price { prices: { U91: 1.72 } }
app.post('/stations/:id/price', (req, res) => {
  const parsed = priceUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const s = stations.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Station not found' });
  Object.assign(s.prices, parsed.data.prices);
  s.lastUpdateMins = 0;
  res.status(200).json(s);
});

// GET /history?suburb=Docklands
app.get('/history', (req, res) => {
  const suburb = String(req.query.suburb || 'Docklands');
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const data = days.map((d, i) => ({ day: d, price: 1.7 + Math.sin(i) * 0.06 + (i > 3 ? 0.02 : 0) }));
  res.json({ suburb, data });
});

// Alerts CRUD
// GET /alerts
app.get('/alerts', (req, res) => res.json(alerts));

// POST /alerts { suburb, fuel, threshold, enabled? }
app.post('/alerts', (req, res) => {
  const parsed = alertCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = 'a' + Math.random().toString(36).slice(2, 8);
  const item = { id, ...parsed.data };
  alerts.push(item);
  res.status(201).json(item);
});

// PUT /alerts/:id { suburb?, fuel?, threshold?, enabled? }
app.put('/alerts/:id', (req, res) => {
  const idx = alerts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Alert not found' });
  const schema = alertCreateSchema.partial();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  alerts[idx] = { ...alerts[idx], ...parsed.data };
  res.json(alerts[idx]);
});

// DELETE /alerts/:id
app.delete('/alerts/:id', (req, res) => {
  const idx = alerts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Alert not found' });
  const removed = alerts.splice(idx, 1)[0];
  res.json(removed);
});

// ------------------------------------------------------------------------------------
// OpenAPI (Swagger) docs
// ------------------------------------------------------------------------------------
const openApi = {
  openapi: '3.0.0',
  info: { title: 'Fuel Price Finder API', version: '1.0.0' },
  servers: [{ url: `http://localhost:${PORT}` }],
  paths: {
    '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
    '/stations': {
      get: {
        summary: 'List stations',
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' } },
          { in: 'query', name: 'fuel', schema: { type: 'string', enum: ['U91','P95','P98','Diesel','LPG'] } },
        ],
        responses: { '200': { description: 'OK' } }
      }
    },
    '/stations/{id}': {
      get: {
        summary: 'Get station by id',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
      }
    },
    '/stations/{id}/price': {
      post: {
        summary: 'Submit/Update price(s) for a station',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { prices: { type: 'object' } } } } } },
        responses: { '200': { description: 'Updated' }, '400': { description: 'Bad request' }, '404': { description: 'Not found' } }
      }
    },
    '/history': {
      get: {
        summary: 'Get price history for a suburb',
        parameters: [{ in: 'query', name: 'suburb', schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } }
      }
    },
    '/alerts': {
      get: { summary: 'List alerts', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create alert', responses: { '201': { description: 'Created' }, '400': { description: 'Bad request' } } }
    },
    '/alerts/{id}': {
      put: { summary: 'Update alert', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      delete: { summary: 'Delete alert', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
    },
  }
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApi));

// ------------------------------------------------------------------------------------
// Start server
// ------------------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Fuel API listening on http://localhost:${PORT}`);
});

// ------------------------------------------------------------------------------------
// Example fetch calls from the frontend (pseudo):
// fetch('/stations?q=Docklands&fuel=U91').then(r=>r.json())
// fetch('/stations/1').then(r=>r.json())
// fetch('/stations/1/price', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices: { U91: 1.72 } }) })
// fetch('/history?suburb=Docklands').then(r=>r.json())
// fetch('/alerts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ suburb:'Docklands', fuel:'U91', threshold:1.75 }) })
