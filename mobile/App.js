// App.js
import React, { useEffect } from 'react';
import { SafeAreaView, StatusBar, AppState, LogBox } from 'react-native';
import Home from './screens/Home';

LogBox.ignoreLogs(['No callback found with cbID']); // dev-only

export default function App() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', () => {});
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <Home />
    </SafeAreaView>
  );
}
