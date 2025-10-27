// App.js
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, StatusBar, AppState, LogBox } from 'react-native';
import Home from './screens/Home';
import SplashScreen from './screens/SplashScreen';
import Onboarding from './screens/Onboarding';

LogBox.ignoreLogs(['No callback found with cbID']); // dev-only

export default function App() {
  const [splash, setSplash] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const homeRef = useRef(null);

  useEffect(() => {
    const handleChange = (nextState) => {
      if (nextState === 'active') {
        homeRef.current?.onAppStateChange?.(nextState);
      }
    };
    const sub = AppState.addEventListener('change', handleChange);
    const timer = setTimeout(() => setSplash(false), 2000);
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  if (splash) {
    return <SplashScreen />;
  }

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <Home ref={homeRef} />
    </SafeAreaView>
  );
}
