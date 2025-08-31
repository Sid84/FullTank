import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export default function AddPriceModal({ visible, station, onClose, onSubmit, submitting }) {
  const [u91, setU91] = useState('');
  const [p95, setP95] = useState('');
  const [p98, setP98] = useState('');
  const [diesel, setDiesel] = useState('');
  const [photo, setPhoto] = useState(null);

  if (!visible) return null;

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to attach a price-board photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (!res.canceled && res.assets?.[0]) setPhoto(res.assets[0]);
  };

  const submit = () => {
    const prices = {};
    if (u91) prices.U91 = Number(u91);
    if (p95) prices.P95 = Number(p95);
    if (p98) prices.P98 = Number(p98);
    if (diesel) prices.Diesel = Number(diesel);
    if (Object.keys(prices).length === 0) {
      Alert.alert('Enter a price', 'Please enter at least one fuel price.');
      return;
    }
    onSubmit({ prices, photo });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'#00000066', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:'#fff', borderTopLeftRadius:12, borderTopRightRadius:12, padding:16 }}>
          <Text style={{ fontSize:16, fontWeight:'700', marginBottom:8 }}>
            Update price — {station?.brand} {station?.suburb ? `(${station.suburb})` : ''}
          </Text>

          <TextInput keyboardType="numeric" placeholder="U91 e.g. 1.79" value={u91} onChangeText={setU91}
            style={{ borderWidth:1, borderColor:'#ddd', borderRadius:6, padding:8, marginBottom:8 }} />
          <TextInput keyboardType="numeric" placeholder="P95 e.g. 1.92" value={p95} onChangeText={setP95}
            style={{ borderWidth:1, borderColor:'#ddd', borderRadius:6, padding:8, marginBottom:8 }} />
          <TextInput keyboardType="numeric" placeholder="P98 e.g. 2.05" value={p98} onChangeText={setP98}
            style={{ borderWidth:1, borderColor:'#ddd', borderRadius:6, padding:8, marginBottom:8 }} />
          <TextInput keyboardType="numeric" placeholder="Diesel e.g. 1.98" value={diesel} onChangeText={setDiesel}
            style={{ borderWidth:1, borderColor:'#ddd', borderRadius:6, padding:8, marginBottom:8 }} />

          <View style={{ flexDirection:'row', alignItems:'center', gap:12, marginBottom:12 }}>
            <Pressable onPress={pickImage} style={{ backgroundColor:'#eee', paddingHorizontal:12, paddingVertical:8, borderRadius:6 }}>
              <Text>Attach photo</Text>
            </Pressable>
            {photo?.uri ? <Image source={{ uri: photo.uri }} style={{ width:48, height:48, borderRadius:4 }} /> : null}
          </View>

          <View style={{ flexDirection:'row', justifyContent:'flex-end', gap:12 }}>
            <Pressable onPress={onClose}><Text>Cancel</Text></Pressable>
            <Pressable disabled={submitting} onPress={submit}
              style={{ backgroundColor:'#007aff', paddingHorizontal:14, paddingVertical:8, borderRadius:6, opacity: submitting?0.6:1 }}>
              <Text style={{ color:'#fff', fontWeight:'600' }}>{submitting ? 'Saving…' : 'Submit'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
