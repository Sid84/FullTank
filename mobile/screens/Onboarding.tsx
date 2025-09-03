import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';

interface Props {
  onDone: () => void;
}

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState(false);
  const [notify, setNotify] = useState(false);

  const next = () => setStep(s => s + 1);

  if (step === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.illustration}>🚗⛽</Text>
        <Text style={styles.title}>Save money on every fill-up</Text>
        <TouchableOpacity style={styles.button} onPress={next}>
          <Text style={styles.buttonText}>Next</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 1) {
    return (
      <View style={styles.container}>
        <View style={styles.flowRow}>
          <Text style={styles.icon}>🔍</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.icon}>⚖️</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.icon}>💰</Text>
        </View>
        <Text style={styles.caption}>Search   Compare   Save</Text>
        <TouchableOpacity style={styles.button} onPress={next}>
          <Text style={styles.buttonText}>Next</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Location</Text>
          <Switch value={location} onValueChange={setLocation} />
        </View>
        <View style={[styles.row, { marginTop: 10 }] }>
          <Text style={styles.label}>Notifications</Text>
          <Switch value={notify} onValueChange={setNotify} />
        </View>
      </View>
      <TouchableOpacity style={[styles.button, { marginTop: 30 }]} onPress={onDone}>
        <Text style={styles.buttonText}>Allow & Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#008080',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  illustration: {
    fontSize: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginVertical: 20,
  },
  button: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#008080',
    fontSize: 16,
    fontWeight: 'bold',
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 48,
  },
  arrow: {
    fontSize: 32,
    marginHorizontal: 8,
    color: '#fff',
  },
  caption: {
    color: '#fff',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
    color: '#333',
  },
});
