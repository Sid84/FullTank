import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Pressable, Alert } from 'react-native';
import { colors, radii, spacing, fonts } from '../theme';
import PlatformMap from '../components/PlatformMap';
import AddPriceModal from '../components/AddPriceModal';
import StationList from '../components/StationList';
import * as Location from 'expo-location';
import { getCheapest } from '../utils/getCheapest';


const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:4000/api';
const APPLY_FUEL_FILTER = true;

function Home(_, ref) {
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const [q, setQ] = useState('');
  const [fuel, setFuel] = useState('U91');
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [debug, setDebug] = useState({ url: '', status: '', text: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Map focusing state
  const [mapCenter, setMapCenter] = useState(null); // { lat, lng } | null
  const [focusKey, setFocusKey] = useState(0);

  useImperativeHandle(ref, () => ({
    onAppStateChange(state) {
      if (state === 'active') {
        setReloadTick(t => t + 1);
      }
    },
  }));

  // Fetch stations (unchanged)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const url = new URL(`${API_BASE}/stations`);
        if (q) url.searchParams.set('q', q);
        if (APPLY_FUEL_FILTER && fuel) url.searchParams.set('fuel', fuel);
        setDebug({ url: url.toString(), status: 'fetching…', text: '' });

        const res = await fetch(url.toString());
        const text = await res.text();
        setDebug({ url: url.toString(), status: `HTTP ${res.status}`, text });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('Stations response is not an array');

        if (alive) setStations(data);
      } catch (e) {
        if (alive) setErr(e);
        if (alive) setStations([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [q, fuel, reloadTick]);

  // Build markers (unchanged logic, just used below)
  const markers = useMemo(() => {
    const wanted = (fuel || '').toUpperCase();
    const order = wanted ? [wanted, 'U91', 'P95', 'P98', 'Diesel'] : ['U91', 'P95', 'P98', 'Diesel'];



    return stations
      .map(s => {
        const lat = Number(s.lat ?? s.latitude);
        const lng = Number(s.lng ?? s.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const prices = s.prices || {};
        let price = null;
        for (const k of order) {
          if (prices[k] != null && Number.isFinite(Number(prices[k]))) {
            price = Number(prices[k]);
            break;
          }
        }

        focusPerth();

        return {
          id: String(s.id ?? `${s.brand}-${lat}-${lng}`),
          title: `${s.brand || ''}${s.suburb ? ` — ${s.suburb}` : ''}`,
          latitude: lat,
          longitude: lng,
          price,
        };
      })
      .filter(Boolean);
  }, [stations, fuel]);

  // auto-focus once when markers change from empty -> non-empty (or coordinates change)
  const coordsSigRef = useRef('');
  const didInitialFocusRef = useRef(false);

  useEffect(() => {
    // signature of just the coordinates to detect real changes
    console.log('Auto-focus triggering with markers:', markers.length);

    const sig = markers.map(m => `${m.latitude},${m.longitude}`).join('|');

    if (sig && sig !== coordsSigRef.current) {
      coordsSigRef.current = sig;

      // compute geometric center
      const valid = markers.filter(m => Number.isFinite(m.latitude) && Number.isFinite(m.longitude));
      if (valid.length) {
        const [sx, sy] = valid.reduce((acc, m) => [acc[0] + m.latitude, acc[1] + m.longitude], [0, 0]);
        const center = { lat: sx / valid.length, lng: sy / valid.length };

        // only auto-focus the first time (or whenever the coordinate set changes)
        setMapCenter(center);
        setFocusKey(k => k + 1);
        didInitialFocusRef.current = true;
      }
    }
  }, [markers]);


  const submitPrice = async ({ prices, photo }) => {
    try {
      if (!selectedId) {
        Alert.alert('No station selected', 'Tap a station pin first.');
        return;
      }
      setSubmitting(true);
      const st = stations.find(s => String(s.id) === String(selectedId));
      const form = new FormData();
      form.append('prices', JSON.stringify(prices));
      form.append('brand', st?.brand || '');
      form.append('name', st?.name || '');
      form.append('suburb', st?.suburb || '');
      form.append('lat', String(st?.lat ?? st?.latitude ?? ''));
      form.append('lng', String(st?.lng ?? st?.longitude ?? ''));
      form.append('state', st?.state || 'VIC');
      if (photo?.uri) {
        form.append('photo', { uri: photo.uri, name: 'price-board.jpg', type: 'image/jpeg' });
      }

      const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(selectedId)}/price`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      // success: close modal, keep selection, and force a refresh
      setStations(prev =>
        prev.map(s => {
          if (String(s.id) !== String(json.station.id)) return s;
          return {
            ...s,
            prices: { ...(s.prices || {}), ...(json.update?.prices || {}) },
            updatedAt: json.station.updatedAt || new Date().toISOString(),
          };
        })
      );

      setShowAdd(false);
      setSelectedId(String(json.station.id));
      setReloadTick(t => t + 1);
    } catch (e) {
      Alert.alert('Submit failed', String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  function focusPerth() {
    setMapCenter({ lat: -31.9523, lng: 115.8613 });
    setFocusKey(k => k + 1);
  }
  function handleSelectStation(item) {
    const lat = Number(item.lat ?? item.latitude);
    const lng = Number(item.lng ?? item.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    console.log('select->center', { lat, lng });


    setSelectedId(String(item.id));
    setMapCenter({ lat, lng });     // <-- what PlatformMap expects
    setFocusKey(k => k + 1);        // <-- triggers focus useEffect
    setViewMode('map');             // <-- show map view
  };

  const findCheapestNearby = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Location permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };

      const cheapest = getCheapest(stations, fuel, coords);
      if (cheapest) {
        setSelectedId(cheapest.id);
        setMapCenter({ lat: cheapest.lat, lng: cheapest.lng });
        setFocusKey(k => k + 1);
      } else {
        alert('No stations found nearby.');
      }
    } catch (e) {
      alert('Error finding cheapest: ' + e.message);
    }
  };


  return (



    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing(2), paddingTop: spacing(3), backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[fonts.h1, { color: colors.text }]}>FullTank</Text>
          {/* small brand chip */}
          <View style={{
            backgroundColor: colors.card, borderRadius: radii.xl, paddingHorizontal: 12, paddingVertical: 6,
            borderWidth: 1, borderColor: colors.border
          }}>
            <Text style={{ color: colors.subtle, fontWeight: '700' }}>Beta</Text>
          </View>
        </View>


        {/* Segmented control */}
        <View style={{
          marginTop: spacing(2), backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', padding: 4
        }}>
          {['map', 'list'].map(m => (
            <Pressable key={m} onPress={() => setViewMode(m)}
              style={{
                flex: 1, paddingVertical: 8, alignItems: 'center',
                backgroundColor: viewMode === m ? colors.primary : 'transparent',
                borderRadius: radii.md
              }}>
              <Text style={{ color: viewMode === m ? '#0B1117' : colors.text, fontWeight: '800', letterSpacing: 0.3 }}>
                {m.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>




        {/* Search + fuel filter
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <TextInput
          placeholder="Search suburb or brand"
          value={q}
          onChangeText={setQ}
          style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6 }}
        />
        <Pressable
          onPress={() => setFuel(prev => (prev === 'U91' ? 'P95' : prev === 'P95' ? 'P98' : prev === 'P98' ? 'Diesel' : 'U91'))}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 6 }}
        >
          <Text>{APPLY_FUEL_FILTER ? fuel : 'All'}</Text>
        </Pressable>
      </View> */}

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <Pressable
            onPress={findCheapestNearby}
            style={{
              backgroundColor: '#22c55e',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 6
            }}
          >
            <Text style={{ color: '#0B1117', fontWeight: '700' }}>
              Cheapest {fuel}
            </Text>
          </Pressable>
        </View>


        {/* Search + fuel chips */}
        <View style={{ marginTop: spacing(2), flexDirection: 'row', gap: 8 }}>
          <View style={{
            flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44
          }}>
            <TextInput
              placeholder="Search suburb or brand"
              placeholderTextColor={colors.subtle}
              value={q}
              onChangeText={setQ}
              style={{ flex: 1, color: colors.text }}
            />
            {!!q && (
              <Pressable onPress={() => setQ('')}>
                <Text style={{ color: colors.subtle, fontWeight: '800' }}>×</Text>
              </Pressable>
            )}
          </View>

          {/* Fuel filter pill */}
          <Pressable
            onPress={() => setFuel(fuel === 'U91' ? 'P95' : fuel === 'P95' ? 'P98' : fuel === 'P98' ? 'Diesel' : 'U91')}
            style={{
              height: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{fuel}</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={{ padding: spacing(2) }}>
            {[...Array(3)].map((_, i) => (
              <View key={i} style={{
                height: 70, backgroundColor: colors.card, borderRadius: radii.md,
                marginVertical: spacing(1), borderWidth: 1, borderColor: colors.border, opacity: .6
              }} />
            ))}
          </View>
        )}

        {!loading && markers.length === 0 && (
          <View style={{ alignItems: 'center', marginTop: spacing(6) }}>
            <Text style={{ color: colors.subtle }}>No stations found. Try another suburb or brand.</Text>
          </View>
        )}
      </View>
      {/* Map fills the rest of the screen, making gestures responsive */}
      <View style={{ flex: 1, paddingHorizontal: spacing(2), paddingBottom: spacing(2) }}>
        {/* Map/List card that actually provides HEIGHT */}
        <View style={{
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.lg,
          overflow: 'hidden',
          backgroundColor: colors.card
        }}>
          {viewMode === 'map' ? (
            <PlatformMap
              stations={markers}
              fuel={fuel}
              onSelect={setSelectedId}
              focusKey={focusKey}
              centerHint={mapCenter}
            />
          ) : (
            <StationList
              stations={markers}
              fuel={fuel}
              onSelect={handleSelectStation}
            />
          )}
          <AddPriceModal
            visible={showAdd}
            station={stations.find(s => String(s.id) === String(selectedId))}
            submitting={submitting}
            onClose={() => setShowAdd(false)}
            onSubmit={async ({ prices, photo }) => {
              try {
                setSubmitting(true);
                const st = stations.find(s => String(s.id) === String(selectedId));
                const form = new FormData();
                form.append('prices', JSON.stringify(prices));
                form.append('brand', st?.brand || '');
                form.append('name', st?.name || '');
                form.append('suburb', st?.suburb || '');
                form.append('lat', String(st?.lat));
                form.append('lng', String(st?.lng));
                form.append('state', st?.state || 'VIC');
                if (photo?.uri) {
                  const name = photo.fileName || 'photo.jpg';
                  form.append('photo', { uri: photo.uri, name, type: 'image/jpeg' });
                }
                const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(selectedId)}/price`, {
                  method: 'POST', body: form
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                // refresh list
                setShowAdd(false);
                setSelectedId(String(json.station.id));
                setReloadTick(t => t + 1);
                // naive refresh
                //setQ(q => q); // triggers effect
              } catch (e) {
                alert('Failed to submit: ' + String(e.message || e));
              } finally {
                setSubmitting(false);
              }
            }}
          />

        </View>





        {/* Update Price button — only if a marker is selected. Disabling this functionality for now. */}
        {/* {selectedId ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <Pressable
              onPress={() => setShowAdd(true)}
              style={{ backgroundColor: '#007aff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Update price</Text>
            </Pressable>
          </View>
        ) : null} */}

        {/* Stations count / debug info */}
        <Text style={{ padding: 8 }}>
          Showing {stations.length} stations
        </Text>

      </View>
    </View>

  );
}

export default forwardRef(Home);
