import React, { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  OnboardingHeader,
  OnboardingFooter,
} from './components/OnboardingCommon';

export default function OnboardingStep6() {
  const line1Opacity = useSharedValue(0);
  const line2Opacity = useSharedValue(0);
  const line3Opacity = useSharedValue(0);

  useEffect(() => {
    line1Opacity.value = withDelay(1000, withTiming(1, { duration: 600 }));
    line2Opacity.value = withDelay(2000, withTiming(1, { duration: 600 }));
    line3Opacity.value = withDelay(3000, withTiming(1, { duration: 600 }));
  }, [line1Opacity, line2Opacity, line3Opacity]);

  const line1Style = useAnimatedStyle(() => ({
    opacity: line1Opacity.value,
  }));
  const line2Style = useAnimatedStyle(() => ({
    opacity: line2Opacity.value,
  }));
  const line3Style = useAnimatedStyle(() => ({
    opacity: line3Opacity.value,
  }));

  return (
    <SafeAreaView style={styles.screen}>
      <OnboardingHeader currentStep={6} />

      <View style={styles.contentWrapper}>
        <Animated.Text style={[styles.line1, line1Style]}>
          HoldYou is ready to be with you
        </Animated.Text>
        <Animated.Text style={[styles.line2, line2Style]}>
          Messages, warmth, and presence{'\n'}whenever you need them
        </Animated.Text>
        <Animated.Text style={[styles.line3, line3Style]}>
          Welcome home
        </Animated.Text>
      </View>

      <OnboardingFooter
        label="Begin"
        onPress={() => router.push('/onboarding/Login')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  line1: {
    fontSize: 22,
    fontWeight: '500',
    color: '#00B8D9',
    textAlign: 'center',
    lineHeight: 28,
    opacity: 0.95,
  },
  line2: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.9,
  },
  line3: {
    fontSize: 24,
    fontWeight: '600',
    color: '#00B8D9',
    textAlign: 'center',
    lineHeight: 30,
    opacity: 0.98,
  },
});

