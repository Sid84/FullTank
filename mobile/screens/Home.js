import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { colors, radii, spacing, fonts } from '../theme';
import PlatformMap from '../components/PlatformMap';
import AddPriceModal from '../components/AddPriceModal';
import useAppState from '../hooks/useAppState';
import StationList from '../components/StationList';
import * as Location from 'expo-location';
import { getCheapest } from '../utils/getCheapest';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://192.168.1.13:4000/api';
const APPLY_FUEL_FILTER = true;

export default function Home() {
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

  // Map center (used to pass lat/lng to backend NSW /nearby)
  const [mapCenter, setMapCenter] = useState(null); // { lat, lng } | null
  const [focusKey, setFocusKey] = useState(0);

  const appState = useAppState();

  // Refetch on resume
  useEffect(() => {
    if (appState === 'active') setReloadTick(t => t + 1);
  }, [appState]);

  // ---- Client-side helpers to derive postcode + coords ----
  async function searchByLocation(currentFuel = fuel) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;

      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const postalCode = place?.postalCode;
      if (!postalCode) {
        Alert.alert('Could not determine postcode from your location');
        return;
      }

      setQ(String(postalCode));
      setMapCenter({ lat: latitude, lng: longitude });
      setFocusKey(k => k + 1);
    } catch (e) {
      Alert.alert('Location error', String(e?.message || e));
    }
  }

  async function searchBySuburb(suburb, currentFuel = fuel) {
    try {
      const hits = await Location.geocodeAsync(`${suburb}, NSW, Australia`);
      if (!hits?.length) {
        Alert.alert('Could not geocode suburb');
        return;
      }
      const { latitude, longitude } = hits[0];

      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const postalCode = place?.postalCode;
      if (!postalCode) {
        Alert.alert('No postcode found for that suburb');
        return;
      }

      setQ(String(postalCode));
      setMapCenter({ lat: latitude, lng: longitude });
      setFocusKey(k => k + 1);
    } catch (e) {
      Alert.alert('Geocode error', String(e?.message || e));
    }
  }

  // ---- Fetch stations (now includes lat/lng when mapCenter available) ----
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const url = new URL(`${API_BASE}/stations`);
        if (q) url.searchParams.set('q', q);
        if (APPLY_FUEL_FILTER && fuel) url.searchParams.set('fuel', fuel);
        if (mapCenter) {
          url.searchParams.set('lat', String(mapCenter.lat));
          url.searchParams.set('lng', String(mapCenter.lng));
          // Optional: url.searchParams.set('radius', '5');
        }
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
  }, [q, fuel, reloadTick, mapCenter]); // ← re-fetch when center changes too

  // ---- Build markers for the map/list ----
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

  // Auto-focus to the geometric center of current markers
  const coordsSigRef = useRef('');
  useEffect(() => {
    const sig = markers.map(m => `${m.latitude},${m.longitude}`).join('|');
    if (sig && sig !== coordsSigRef.current) {
      coordsSigRef.current = sig;
      const valid = markers.filter(m => Number.isFinite(m.latitude) && Number.isFinite(m.longitude));
      if (valid.length) {
        const [sx, sy] = valid.reduce((acc, m) => [acc[0] + m.latitude, acc[1] + m.longitude], [0, 0]);
        const center = { lat: sx / valid.length, lng: sy / valid.length };
        setMapCenter(center);
        setFocusKey(k => k + 1);
      }
    }
  }, [markers]);

  // ---- Handlers ----
  function handleSelectStation(item) {
    const lat = Number(item.lat ?? item.latitude);
    const lng = Number(item.lng ?? item.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setSelectedId(String(item.id));
    setMapCenter({ lat, lng });
    setFocusKey(k => k + 1);
    setViewMode('map');
  }

  const findCheapestNearby = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission denied');
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
        Alert.alert('No stations found nearby.');
      }
    } catch (e) {
      Alert.alert('Error finding cheapest', String(e?.message || e));
    }
  };

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

      // Optimistic merge
      setStations(prev =>
        prev.map(s => (String(s.id) === String(json.station.id)
          ? { ...s, prices: { ...(s.prices || {}), ...(json.update?.prices || {}) }, updatedAt: json.station.updatedAt || new Date().toISOString() }
          : s))
      );
      setShowAdd(false);
      setSelectedId(String(json.station.id));

      // Trigger refetch
      setReloadTick(t => t + 1);
    } catch (e) {
      Alert.alert('Submit failed', String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing(2), paddingTop: spacing(3), backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[fonts.h1, { color: colors.text }]}>FullTank</Text>
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

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <Pressable
            onPress={() => searchByLocation(fuel)}
            style={{ backgroundColor: '#007aff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Use my location</Text>
          </Pressable>

          <Pressable
            onPress={findCheapestNearby}
            style={{ backgroundColor: '#22c55e', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
          >
            <Text style={{ color: '#0B1117', fontWeight: '700' }}>Cheapest {fuel}</Text>
          </Pressable>
        </View>

        {/* Search + fuel chips */}
        <View style={{ marginTop: spacing(2), flexDirection: 'row', gap: 8 }}>
          <View style={{
            flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44
          }}>
            <TextInput
              placeholder="Search suburb (NSW) or brand"
              placeholderTextColor={colors.subtle}
              value={q}
              onChangeText={setQ}
              style={{ flex: 1, color: colors.text }}
            />
            {/* Search button that interprets q as suburb text and resolves to postcode+coords */}
            <Pressable onPress={() => q ? searchBySuburb(q) : null} style={{ marginLeft: 8 }}>
              <Text style={{ color: colors.subtle, fontWeight: '800' }}>Search</Text>
            </Pressable>
            {!!q && (
              <Pressable onPress={() => setQ('')} style={{ marginLeft: 12 }}>
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
            <Text style={{ color: colors.subtle }}>No stations found. Try a postcode or use your location.</Text>
          </View>
        )}
      </View>

      {/* Map/List card */}
      <View style={{ flex: 1, paddingHorizontal: spacing(2), paddingBottom: spacing(2) }}>
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
            onSubmit={submitPrice}
          />
        </View>

        {/* Stations count / debug info */}
        <Text style={{ padding: 8 }}>
          Showing {stations.length} stations
        </Text>
        {/* Optional: print last fetch URL/status while debugging */}
        {/* <Text style={{ paddingHorizontal: 8, color: colors.subtle, fontSize: 12 }}>{debug.status} — {debug.url}</Text> */}
      </View>
    </View>
  );
}
