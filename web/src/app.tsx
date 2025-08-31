import { useEffect, useState } from 'react';
import { listStations } from './api';

export default function App() {
  const [stations, setStations] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [fuel, setFuel] = useState('U91');

  useEffect(() => {
    listStations({ q, fuel }).then(setStations).catch(console.error);
  }, [q, fuel]);

  return (
    <div style={{ padding: 16 }}>
      <h1>FullTank Web</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Search suburb or brand"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select value={fuel} onChange={e => setFuel(e.target.value)}>
          <option>U91</option>
          <option>P95</option>
          <option>P98</option>
          <option>Diesel</option>
        </select>
      </div>
      <ul>
        {stations.map(s => (
          <li key={s.id}>
            <strong>{s.brand}</strong> — {s.name} ({s.suburb})
            {s.price ? <> — <em>${s.price.toFixed(2)}</em></> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
