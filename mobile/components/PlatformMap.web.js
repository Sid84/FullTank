import React, { useEffect, useRef } from 'react';

export default function PlatformMap({ region, markers = [], onMarkerPress }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const layerRef = useRef(null);

  // Initial map setup (once)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const leaflet = await import('leaflet');
      const L = leaflet.default ?? leaflet;
      LRef.current = L;

      // Inject CSS once
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (mapDivRef.current && !mapRef.current) {
        const map = L.map(mapDivRef.current).setView([region.latitude, region.longitude], 13);
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        layerRef.current = L.layerGroup().addTo(map);
      }

      // Initial markers
      if (isMounted) {
        updateMarkers();
        fitToMarkers();
      }
    })();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      layerRef.current = null;
      LRef.current = null;
    };
    // run once at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers whenever markers change
  useEffect(() => {
    updateMarkers();
    fitToMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

  function updateMarkers() {
    const L = LRef.current;
    if (!L || !layerRef.current) return;

    // Clear previous
    layerRef.current.clearLayers();

    markers.forEach(m => {
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const marker = L.marker([lat, lng]).addTo(layerRef.current);
      if (m.title) marker.bindPopup(m.title);
      marker.on('click', () => onMarkerPress?.(m.id));
    });
  }

  function fitToMarkers() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || markers.length === 0) return;

    const bounds = L.latLngBounds(
      markers.map(m => [Number(m.latitude), Number(m.longitude)])
    );
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }

  function onRNMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === 'update') {
      renderStations(msg.stations, msg.fuel || 'U91');
      if (msg.focus) focusMap({ center: msg.center, zoom: msg.zoom, padding: msg.padding });
    } else if (msg.type === 'focus') {
      focusMap({ center: msg.center, zoom: msg.zoom, padding: msg.padding });
    }
  } catch (e) {}
}

document.addEventListener('message', e => onRNMessage(e.data));
window.addEventListener('message', e => onRNMessage(e.data));

  return <div ref={mapDivRef} style={{ width: '100%', height: 300 }} />;
}
