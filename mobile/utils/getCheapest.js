// utils/getCheapest.js
function haversineDistance(a, b) {
  const R = 6371e3; // meters
  const toRad = d => d * Math.PI / 180;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);
  return R * Math.acos(
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  );
}

export function getCheapest(stations, fuel, userCoords) {
  const filtered = stations
    .map(s => {
      const price = Number(s.prices?.[fuel] ?? s.price);
      if (!Number.isFinite(price)) return null;
      const lat = Number(s.lat ?? s.latitude);
      const lng = Number(s.lng ?? s.longitude);
      return { ...s, price, lat, lng };
    })
    .filter(Boolean);

  // Sort by price ascending
  filtered.sort((a, b) => a.price - b.price);

  // Only keep stations within ~20km
  const nearby = filtered.filter(
    s => haversineDistance(userCoords, { lat: s.lat, lng: s.lng }) < 20_000
  );

  return nearby[0] || null;
}
