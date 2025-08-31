import { Router, json } from 'express';
import { z } from 'zod';
import { listStations, getStation, updatePrices, getHistory } from '../data/db.js';

const router = Router();

// health
router.get('/health', (req, res) => res.json({ ok: true }));

// stations list
router.get('/stations', (req, res) => {
  const q = (req.query.q || '').toString();
  const fuel = (req.query.fuel || '').toString() || undefined;
  const data = listStations({ q, fuel });
  res.json(data);
});

// station details
router.get('/stations/:id', (req, res) => {
  const s = getStation(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// update prices (singular)
router.post('/stations/:id/price', json(), (req, res) => {
  const schema = z.object({ prices: z.record(z.number()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
  const s = updatePrices(req.params.id, parsed.data.prices);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// alias: plural
router.post('/stations/:id/prices', (req, res, next) => {
  req.url = req.url.replace('/prices', '/price');
  next();
}, json(), (req, res) => {});

// history via query
router.get('/history', (req, res) => {
  const suburb = (req.query.suburb || '').toString();
  const data = getHistory(suburb);
  res.json({ suburb, data });
});

// alias: history via path
router.get('/history/:suburb', (req, res, next) => {
  req.url = `/history?suburb=${encodeURIComponent(req.params.suburb)}`;
  next();
}, (req, res) => {});

export default router;
