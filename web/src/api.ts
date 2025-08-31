const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

export async function listStations(params: { q?: string; fuel?: string } = {}) {
  const url = new URL(`${API_BASE}/stations`);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.fuel) url.searchParams.set('fuel', params.fuel);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to load stations');
  return res.json();
}
