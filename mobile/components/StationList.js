import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { colors, radii, spacing, fonts, shadow } from '../theme';


const Row = ({ item, onPress }) => (
  <Pressable onPress={onPress}
    style={{
      backgroundColor: colors.card, borderRadius: radii.md, marginHorizontal: spacing(2), marginVertical: spacing(1),
      borderWidth: 1, borderColor: colors.border, padding: spacing(2), ...shadow.card
    }}>
    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
      <View style={{ flex:1, paddingRight: 12 }}>
        <Text style={[fonts.h2, { color: colors.text }]} numberOfLines={1}>
          {item.title || item.brand || item.name || 'Station'}
        </Text>
        {!!item.suburb && (
          <Text style={{ color: colors.subtle, marginTop: 4 }} numberOfLines={1}>
            {item.suburb}
          </Text>
        )}
      </View>
      <View style={{
        backgroundColor: '#0EA5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.lg,
      }}>
        <Text style={{ color:'#001018', fontWeight:'900' }}>
          {Number.isFinite(Number(item.price)) ? `$${Number(item.price).toFixed(2)}` : '—'}
        </Text>
      </View>
    </View>
  </Pressable>
);


export default function StationList({ stations = [], fuel = 'U91', onSelect = () => {}  }) {
  const [sortKey, setSortKey] = useState('price'); // 'price' | 'updated' | 'brand'

  const rows = useMemo(() => {
    const arr = stations.map(s => {
      const price = s?.prices?.[fuel] ?? null;
      return {
        id: String(s.id),
        brand: s.brand || '',
        name: s.name || s.brand || 'Station',
        suburb: s.suburb || '',
        price: typeof price === 'number' ? price : null,
        updatedAt: s.updatedAt,
        lat: s.lat ?? s.latitude,
        lng: s.lng ?? s.longitude,
      };
    });

    const cmp = {
      price: (a, b) => {
        if (a.price == null && b.price == null) return 0;
        if (a.price == null) return 1;
        if (b.price == null) return -1;
        return a.price - b.price;
      },
      updated: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
      brand: (a, b) => (a.brand || '').localeCompare(b.brand || ''),
    }[sortKey];

    return arr.sort(cmp);
  }, [stations, fuel, sortKey]);

  const Header = () => (
    <View style={{ flexDirection:'row', gap:8, padding:8 }}>
      <Text style={{ fontWeight:'700' }}>Sort:</Text>
      {['price','updated','brand'].map(k => (
        <Pressable key={k} onPress={() => setSortKey(k)}
          style={{ backgroundColor: sortKey===k ? '#007aff' : '#eee',
                   paddingHorizontal:10, paddingVertical:6, borderRadius:6 }}>
          <Text style={{ color: sortKey===k ? '#fff' : '#000', fontWeight:'600' }}>{k}</Text>
        </Pressable>
      ))}
      <View style={{ marginLeft:'auto' }}>
        <Text style={{ opacity:0.6 }}>{rows.length} results</Text>
      </View>
    </View>
  );

const renderItem = ({ item }) => (
    <Pressable
      onPress={() => onSelect(item)}  // ✅ call the function when pressed
      style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700' }}>
          {item.title || item.brand || item.name || 'Station'}
        </Text>
        <Text style={{ fontWeight:'700' }}>
          {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
        </Text>
        {item.updatedAt ? <Text style={{ opacity:0.6, fontSize:12 }}>
          Updated {new Date(item.updatedAt).toLocaleString()}
        </Text> : null}
      </View>
      {item.suburb ? <Text style={{ opacity: 0.7 }}>{item.suburb}</Text> : null}
    </Pressable>
  );

  return (
    <View style={{ flex:1, backgroundColor: colors.bg, paddingTop: spacing(1) }}>
      <FlatList
        data={stations}
        keyExtractor={(s, i) => String(s.id ?? i)}
        renderItem={({ item }) => <Row item={item} onPress={() => onSelect(item)} />}
        contentContainerStyle={{ paddingBottom: spacing(8) }}
      />
    </View>
  );
}
