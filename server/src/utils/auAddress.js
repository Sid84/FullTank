// server/src/utils/auAddress.js
export function parseAuAddress({ address = '', postcode = '', stateHint = '', g1 = '', g2 = '' }) {
  // Normalise inputs
  const addr = String(address || '').trim();
  const state = String(stateHint || '').trim().toUpperCase(); // e.g., QLD, NSW, VIC
  const pc = String(postcode || '').trim();

  // Try to match: "number street, Suburb STATE POSTCODE"
  // Examples:
  //  - "481 Pacific Highway, Wyoming NSW 2250"
  //  - "1 Example Rd, Southport QLD 4215"
  const re = /^(.+?),\s*([A-Za-z \-']+)\s+([A-Z]{2,3})\s+(\d{4})$/;
  const m = addr.match(re);

  let street = '';
  let suburb = '';
  let outPostcode = pc;
  let outState = state;

  if (m) {
    street = m[1].trim();
    suburb = m[2].trim();
    outState = outState || m[3].trim().toUpperCase();
    outPostcode = outPostcode || m[4].trim();
  } else if (addr) {
    // If no perfect match, try a simpler split on comma
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      street = parts[0];
      // last part often holds "STATE POSTCODE" — peel postcode if present
      const last = parts[parts.length - 1];
      const lastMatch = last.match(/([A-Z]{2,3})\s+(\d{4})$/);
      if (lastMatch) {
        outState = outState || lastMatch[1].toUpperCase();
        outPostcode = outPostcode || lastMatch[2];
        // suburb is whatever sits just before "STATE POSTCODE"
        suburb = parts[parts.length - 2];
      } else {
        // Otherwise, take the final segment as suburb
        suburb = parts[parts.length - 1];
      }
    } else {
      // Address is just one chunk; treat it as street only
      street = addr;
    }
  }

  // Fall back to region fields if suburb is still unknown
  // QLD FullSiteDetails often provide G1 (suburb), G2 (city/region)
  if (!suburb) {
    if (g1) suburb = String(g1).trim();
    else if (g2) suburb = String(g2).trim();
  }

  return {
    street,
    suburb,
    state: outState || state || '',     // prefer parsed state, then hint
    postcode: outPostcode || '',        // prefer parsed postcode, then P
  };
}
