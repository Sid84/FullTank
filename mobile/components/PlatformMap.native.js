import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

const HTML = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />

  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    .leaflet-container { background: #eef3f7; }

    .badge {
      background:#0F172A; color:#E5E7EB; border-radius:14px; padding:4px 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.08);
      min-width:56px; text-align:center;
    }
    .badge .price { font-weight:800; font-size:13px; line-height:15px; }
    .badge .name  { font-weight:600; font-size:11px; line-height:13px; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>

  <script>
    // ===== Map init =====
    var MELBOURNE = [-37.8136, 144.9631];
    var map = L.map('map', { zoomControl: true, attributionControl: false }).setView(MELBOURNE, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    // ===== Cluster group (with safe fallback) =====
    var clusterAvailable = typeof L.markerClusterGroup === 'function';
    var clusterGroup = clusterAvailable
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          disableClusteringAtZoom: 15,
          maxClusterRadius: 50,
          iconCreateFunction: function (cluster) {
            var count = cluster.getChildCount();
            return L.divIcon({
              html:
                '<div style="background:#22C55E;color:#0B1117;border-radius:18px;padding:4px 10px;font-weight:900;box-shadow:0 6px 20px rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08)">' +
                count +
                '</div>',
              className: '', iconSize: null
            });
          }
        })
      : L.layerGroup();

    map.addLayer(clusterGroup);

    // ===== State =====
    var lastPts = [];
    var hasInitialFocus = false;

    function collectPoints(stations) {
      var pts = [];
      (stations || []).forEach(function(s){
        var lat = Number(s.latitude ?? s.lat);
        var lng = Number(s.longitude ?? s.lng);
        if (isFinite(lat) && isFinite(lng)) pts.push([lat, lng]);
      });
      return pts;
    }

    function getPrice(s, fuel) {
      var k = fuel, lk = fuel && fuel.toLowerCase && fuel.toLowerCase();
      var p = (s && s.prices) ? (s.prices[k] ?? s.prices[lk]) : undefined;
      return p != null ? Number(p) : (Number.isFinite(Number(s.price)) ? Number(s.price) : null);
    }

    function renderStations(stations, fuel) {
      try {
        if (clusterAvailable) clusterGroup.clearLayers(); else clusterGroup.clearLayers();
        lastPts = collectPoints(stations);

        (stations || []).forEach(function(s, i){
          var lat = Number(s.latitude ?? s.lat);
          var lng = Number(s.longitude ?? s.lng);
          if (!isFinite(lat) || !isFinite(lng)) return;

          var n = getPrice(s, fuel);
          var priceText = Number.isFinite(n) ? ('$' + n.toFixed(2)) : '—';
          var stationName = s.title || s.brand || s.name || '';

          var html =
            '<div class="badge">' +
              '<div class="price">' + priceText + '</div>' +
              (stationName ? '<div class="name">' + stationName + '</div>' : '') +
            '</div>';

          var icon = L.divIcon({ html: html, className: '', iconSize: null });
          var marker = L.marker([lat, lng], { icon: icon });

          marker.on('click', function () {
            try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type:'select', id: s.id ?? i, station: s })); } catch(e){}
          });

          if (clusterAvailable) clusterGroup.addLayer(marker); else marker.addTo(clusterGroup);
        });
      } catch (e) {
        try { window.ReactNativeWebView?.postMessage('LOG:renderStations:' + String(e && e.message || e)); } catch(_) {}
      }
    }

    function focusMap(opts) {
      opts = opts || {};
      var pad = opts.padding || [120,120];
      var c = opts.center;
      if (c && isFinite(+c.lat) && isFinite(+c.lng)) { map.flyTo([+c.lat, +c.lng], opts.zoom || 13); return; }
      if (lastPts.length > 1) { map.fitBounds(L.latLngBounds(lastPts), { padding: pad, maxZoom: 13 }); return; }
      if (lastPts.length === 1) { map.flyTo(lastPts[0], opts.zoom || 14); return; }
      map.setView(MELBOURNE, 12);
    }

    // ===== RN bridge =====
    window.__RN = {
      update: function(jsonStr){
        try {
          var msg = JSON.parse(jsonStr);
          renderStations(msg.stations || [], msg.fuel || 'U91');
          if (!hasInitialFocus && msg.stations && msg.stations.length) {
            hasInitialFocus = true;
            focusMap({});
          }
        } catch(e) { try { window.ReactNativeWebView?.postMessage('LOG:update-parse-fail'); } catch(_){} }
      },
      focus: function(jsonStr){
        try {
          var msg = JSON.parse(jsonStr);
          focusMap({ center: msg.center, zoom: msg.zoom, padding: msg.padding });
          hasInitialFocus = true;
        } catch(e) { try { window.ReactNativeWebView?.postMessage('LOG:focus-parse-fail'); } catch(_){} }
      }
    };

    // Bounce unexpected JS errors back to RN logs so you see them
    window.onerror = function(msg, src, line, col, err) {
      try { window.ReactNativeWebView?.postMessage('LOG:onerror:' + msg + ' @' + src + ':' + line + ':' + col); } catch(_){}
    };

    // READY ping
    (function pingReady(){ try { window.ReactNativeWebView?.postMessage('READY'); } catch(e){} })();
  </script>
</body>
</html>
`;

export default function PlatformMap({ stations = [], fuel = 'U91', onSelect, centerHint = null,
  focusKey = 0 }) {
  const ref = useRef(null);
  const readyRef = useRef(false);     // becomes true after the HTML posts "READY"
  const pendingUpdate = useRef(null); // script string queued before READY
  const pendingFocus = useRef(null);  // script string queued before READY


  // Normalize data once (numbers for lat/lng)
// Build a minimal update payload (string once)
  const updatePayload = useMemo(() => JSON.stringify({ stations, fuel }), [stations, fuel]);

  // Send (or queue) an update
useEffect(() => {
    if (!ref.current) return;
    const js = `
      try { if (window.__RN && window.__RN.update) { window.__RN.update(${JSON.stringify(updatePayload)}); } } catch(e){}
      true;
    `;
    if (readyRef.current) ref.current.injectJavaScript(js);
    else pendingUpdate.current = js;
  }, [updatePayload]);

  // Focus effect — send (or queue) a pure focus message
  useEffect(() => {
    const center =
      centerHint &&
      Number.isFinite(Number(centerHint.lat)) &&
      Number.isFinite(Number(centerHint.lng))
        ? { lat: Number(centerHint.lat), lng: Number(centerHint.lng) }
        : null;

    const focusPayload = JSON.stringify({
      type: 'focus',
      center,
      zoom: 14,
      padding: [60, 60],
    });

    const js = `
      (function(){
        document.dispatchEvent(new MessageEvent('message', { data: '${focusPayload}' }));
      })(); true;
    `;

    if (readyRef.current && ref.current) {
      // Optional debug
      // console.log('PlatformMap focus ->', center, focusKey);
      ref.current.injectJavaScript(js);
    } else {
      pendingFocus.current = js;
    }
  }, [focusKey, centerHint]);

  // Drain queue on READY from the page
  function handleMessage(e) {
    if (e?.nativeEvent?.data === 'READY') {
      readyRef.current = true;

      // flush latest update then latest focus (order matters)
      if (pendingUpdate.current && ref.current) {
        ref.current.injectJavaScript(pendingUpdate.current);
        pendingUpdate.current = null;
      }
      if (pendingFocus.current && ref.current) {
        ref.current.injectJavaScript(pendingFocus.current);
        pendingFocus.current = null;
      }
      return;

    
    }

      if (typeof data === 'string' && data.startsWith('LOG:')) {
    console.log('[WebView]', data);
    return;
  }

    // Handle map->RN messages if you send any
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'select') onSelect?.(msg.id ?? msg.station);
    } catch {}
  }

//    // redraw markers (no camera)
// useEffect(() => {
//   if (!ref.current) return;
//   const payload = { type: 'update', stations, fuel, focus: false };
//   const js = `(function(){document.dispatchEvent(new MessageEvent('message',{data:'${JSON.stringify(payload)}'}));})();true;`;
//   ref.current.injectJavaScript(js);
// }, [stations, fuel]);

// // focus when focusKey changes
// useEffect(() => {
//   if (!ref.current) return;

//   const center =
//     centerHint && Number.isFinite(Number(centerHint.lat)) && Number.isFinite(Number(centerHint.lng))
//       ? { lat: Number(centerHint.lat), lng: Number(centerHint.lng) }
//       : null;

//   const payload = { type: 'focus', center, zoom: 14, padding: [60, 60] };

//   console.log('focus payload to WebView', centerHint, focusKey);

//   const js = `
//     (function(){
//       document.dispatchEvent(new MessageEvent('message', { data: '${JSON.stringify(payload)}' }));
//     })(); true;
//   `;
//   ref.current.injectJavaScript(js);
// }, [focusKey, centerHint]);

  return (
    <View style={{ flex: 1, overflow: 'hidden', borderRadius: 8 }}>
      <WebView
        ref={ref}
        style={{ flex: 1, backgroundColor: 'transparent' }}  // 👈 fill space
        originWhitelist={['*']}
        source={{ html: HTML }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
      />
    </View>
  );
}
