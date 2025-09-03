import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function SplashScreen() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnim = (val: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: -10,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(300),
        ])
      ).start();
    };

    createAnim(dot1, 0);
    createAnim(dot2, 150);
    createAnim(dot3, 300);
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <View style={styles.pinCircle}>
          <Text style={styles.pump}>⛽</Text>
        </View>
        <View style={styles.pinTip} />
      </View>
      <Text style={styles.tagline}>Find the cheapest fuel near you</Text>
      <View style={styles.dots}>
        {[dot1, dot2, dot3].map((d, i) => (
          <Animated.View key={i} style={{ transform: [{ translateY: d }] }}>
            <Text style={styles.dot}>•</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#008080',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    alignItems: 'center',
  },
  pinCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
  pump: {
    fontSize: 40,
    color: '#008080',
  },
  tagline: {
    color: '#fff',
    fontSize: 18,
    marginTop: 20,
  },
  dots: {
    flexDirection: 'row',
    marginTop: 30,
  },
  dot: {
    fontSize: 32,
    color: '#fff',
    marginHorizontal: 4,
  },
});
