import { nanoid } from 'nanoid';

const stations = [
  { id: 'demo123', brand: 'Shell', name: 'Shell Melbourne CBD', suburb: 'Docklands', lat: -37.8183, lng: 144.9537, prices: { U91: 1.79, P95: 1.93, P98: 2.05, Diesel: 1.89 } },
  { id: 'demo456', brand: 'BP',    name: 'BP Southbank',        suburb: 'Southbank', lat: -37.8239, lng: 144.9652, prices: { U91: 1.77, P95: 1.92, P98: 2.04, Diesel: 1.87 } }
];

const historyBySuburb = {
  Docklands: [
    { date: '2025-08-03', U91: 1.85 },
    { date: '2025-08-05', U91: 1.81 },
    { date: '2025-08-08', U91: 1.79 }
  ]
};

export function listStations({ q = '', fuel } = {}) {
  const qq = q.toLowerCase();
  let out = stations.filter(s =>
    s.name.toLowerCase().includes(qq) ||
    s.brand.toLowerCase().includes(qq) ||
    s.suburb.toLowerCase().includes(qq)
  );
  if (fuel) {
    out = out
      .filter(s => s.prices && s.prices[fuel] != null)
      .map(s => ({ ...s, price: s.prices[fuel] }));
  }
  return out;
}

export function getStation(id) {
  return stations.find(s => s.id === id) || null;
}

export function updatePrices(id, newPrices) {
  const s = getStation(id);
  if (!s) return null;
  s.prices = { ...s.prices, ...newPrices };
  return s;
}

export function getHistory(suburb) {
  return historyBySuburb[suburb] || [];
}

export function addStation({ brand, name, suburb, lat, lng, prices }) {
  const id = nanoid(8);
  const s = { id, brand, name, suburb, lat, lng, prices: prices || {} };
  stations.push(s);
  return s;
}
