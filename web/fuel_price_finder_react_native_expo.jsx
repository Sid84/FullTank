// App.tsx — React Native (Expo) skeleton with navigation, mock API, and react-native-maps
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ---------------- Mock API ----------------
export type FuelType = 'U91' | 'P95' | 'P98' | 'Diesel' | 'LPG';
export type Station = {
  id: string; brand: string; name: string; suburb: string; lat: number; lng: number;
  distanceKm: number; lastUpdateMins: number; prices: Record<FuelType, number | null>;
};
const seedStations: Station[] = [
  { id: '1', brand: 'Shell', name: 'Shell Docklands', suburb: 'Docklands', lat: -37.8149, lng: 144.9429, distanceKm: 1.2, lastUpdateMins: 18, prices: { U91: 1.87, P95: 2.01, P98: 2.11, Diesel: 2.05, LPG: null } },
  { id: '2', brand: 'BP', name: 'BP West Melbourne', suburb: 'West Melbourne', lat: -37.8092, lng: 144.941, distanceKm: 2.4, lastUpdateMins: 42, prices: { U91: 1.79, P95: 1.99, P98: 2.09, Diesel: 2.03, LPG: 1.05 } },
  { id: '3', brand: '7-Eleven', name: '7-Eleven Southbank', suburb: 'Southbank', lat: -37.823, lng: 144.964, distanceKm: 1.8, lastUpdateMins: 9, prices: { U91: 1.74, P95: 1.92, P98: 2.02, Diesel: 1.98, LPG: 1.01 } },
  { id: '4', brand: 'Caltex', name: 'Caltex Carlton', suburb: 'Carlton', lat: -37.800, lng: 144.966, distanceKm: 3.3, lastUpdateMins: 56, prices: { U91: 1.81, P95: 1.97, P98: 2.07, Diesel: 2.01, LPG: 1.07 } },
];
export const mockApi = {
  async listStations(params: { q?: string; fuel?: FuelType }) {
    await new Promise(r => setTimeout(r, 300));
    const q = (params.q || '').toLowerCase();
    let out = seedStations.filter(s => !q ? true : `${s.name} ${s.suburb} ${s.brand}`.toLowerCase().includes(q));
    if (params.fuel) out = out.filter(s => s.prices[params.fuel!] != null);
    return out;
  },
  async stationById(id: string) {
    await new Promise(r => setTimeout(r, 250));
    return seedStations.find(s => s.id === id)!;
  },
};

// ---------------- UI utils ----------------
const currency = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);

// ---------------- Screens ----------------
const HomeList = ({ navigation }: any) => {
  const [q, setQ] = useState('');
  const [fuel, setFuel] = useState<FuelType>('U91');
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => { setLoading(true); mockApi.listStations({ q, fuel }).then(setStations).finally(() => setLoading(false)); }, [q, fuel]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <TextInput placeholder="Search suburb or postcode" value={q} onChangeText={setQ} style={styles.input} />
        <TouchableOpacity style={styles.filterBtn}><Text>Filter</Text></TouchableOpacity>
      </View>

      <View style={{ height: 220, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: '#eee' }}>
        <MapView style={{ flex: 1 }} initialRegion={{ latitude: -37.8136, longitude: 144.9631, latitudeDelta: 0.06, longitudeDelta: 0.06 }}>
          {stations.map(s => (
            <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lng }} title={s.name} description={`U91 ${currency(s.prices.U91)}`} />
          ))}
        </MapView>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
      <FlatList
        contentContainerStyle={{ padding: 12 }}
        data={stations}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('Station', { id: item.id })} style={styles.card}>
            <View style={styles.brand}>{item.brand[0]}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.meta}>{item.suburb} • {item.distanceKm.toFixed(1)} km • Updated {item.lastUpdateMins}m ago</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.price}>{currency(item.prices.U91)}</Text>
              <Text style={styles.meta}>U91</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};

const StationScreen = ({ route }: any) => {
  const { id } = route.params;
  const [station, setStation] = useState<Station | null>(null);
  useEffect(() => { mockApi.stationById(id).then(setStation); }, [id]);
  if (!station) return <ActivityIndicator style={{ marginTop: 24 }} />;
  const fuels: FuelType[] = ['U91', 'P95', 'P98', 'Diesel', 'LPG'];
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.cardRow}>
        <View style={styles.brandBig}>{station.brand[0]}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{station.name}</Text>
          <Text style={styles.meta}>{station.suburb}</Text>
        </View>
        <TouchableOpacity style={styles.secondaryBtn}><Text>Directions</Text></TouchableOpacity>
      </View>
      <View style={styles.table}>
        {fuels.map(f => (
          <View key={f} style={styles.row}>
            <Text style={styles.rowLabel}>{f}</Text>
            <Text style={styles.rowValue}>{currency(station.prices[f])}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
};

const TrendsScreen = () => (
  <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>Trends (hook up to charts later)</Text>
  </SafeAreaView>
);

const AlertsScreen = () => (
  <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>Alerts</Text>
  </SafeAreaView>
);

const AddPriceScreen = () => (
  <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>Add Price</Text>
  </SafeAreaView>
);

const ProfileScreen = () => (
  <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>Profile</Text>
  </SafeAreaView>
);

// ---------------- Navigation ----------------
const HomeStack = createNativeStackNavigator();
const HomeStackScreen = () => (
  <HomeStack.Navigator>
    <HomeStack.Screen name="HomeList" component={HomeList} options={{ title: 'Fuel Near You' }} />
    <HomeStack.Screen name="Station" component={StationScreen} options={{ title: 'Station Details' }} />
  </HomeStack.Navigator>
);

const Tab = createBottomTabNavigator();
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Home" component={HomeStackScreen} />
        <Tab.Screen name="Trends" component={TrendsScreen} />
        <Tab.Screen name="Add" component={AddPriceScreen} />
        <Tab.Screen name="Alerts" component={AlertsScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ---------------- Styles ----------------
const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f2f2f2', borderRadius: 10 },
  filterBtn: { paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#e6e6e6', borderRadius: 10 },
  card: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: 'white', borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  brand: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ececec', alignItems: 'center', justifyContent: 'center', fontWeight: '700' },
  brandBig: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#ececec', alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '600', fontSize: 16 },
  meta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  price: { fontWeight: '700', fontSize: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  secondaryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 10 },
  table: { margin: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowLabel: { fontWeight: '600' },
  rowValue: { fontWeight: '600' }
});
