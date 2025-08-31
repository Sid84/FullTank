import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

// FuelWatch product codes
const PRODUCT_CODE = { U91: 1, P95: 2, P98: 4, Diesel: 5 };

// suburb or region; FuelWatch RSS is finicky — suburb works best
export async function waFetchLatest({fuel}) {
  const f = (fuel || 'U91');
  const product = PRODUCT_CODE[f] ?? 1;

  //const url = `https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS?Product=${product}&Suburb=${encodeURIComponent(q || 'Perth')}`;

  const url = `https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS?Product=${product}`;


  const res = await fetch(url);
  if (!res.ok) throw new Error(`FuelWatch HTTP ${res.status}`);

  const xml = await res.text();
  const rss = await parseStringPromise(xml, { explicitArray: false });

  const items = rss?.rss?.channel?.item;
  const arr = Array.isArray(items) ? items : (items ? [items] : []);

  return arr
    .map((item, idx) => {
      // IMPORTANT: use bracket notation for keys with hyphens
      const tradingName = item?.['trading-name'] || item?.title || item?.brand || 'Station';
      const address = item?.address || '';
      const brand = item?.brand || 'WA';
      const suburb = item?.location || '';
      const lat = Number(item?.latitude);
      const lng = Number(item?.longitude);
      const priceNum = Number(item?.price);
      const priceCents = Number(item?.price);          // e.g. 155.3 (cents/L)
      const priceDollars = Number.isFinite(priceCents) // convert to dollars
        ? priceCents / 100
        : null;

      return {
        id: String(item?.site || `${tradingName}|${address}|${idx}`),
        brand,
        name: tradingName,
        suburb,
        lat,
        lng,
        prices: priceDollars != null ? { [f]: priceDollars } : {},
        updatedAt: item?.date || new Date().toISOString(),
        state: 'WA',
        source: 'WA_FUELWATCH'
      };
    })
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}
