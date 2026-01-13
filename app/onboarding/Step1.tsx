import React, { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import {
  OnboardingHeader,
  OnboardingFooter,
} from './components/OnboardingCommon';

export default function OnboardingStep1() {
  const firstBlockOpacity = useSharedValue(0);
  const secondBlockOpacity = useSharedValue(0);

  useEffect(() => {
    firstBlockOpacity.value = withTiming(1, { duration: 800 });
    secondBlockOpacity.value = withDelay(1000, withTiming(1, { duration: 800 }));
  }, [firstBlockOpacity, secondBlockOpacity]);

  const firstBlockStyle = useAnimatedStyle(() => ({
    opacity: firstBlockOpacity.value,
  }));

  const secondBlockStyle = useAnimatedStyle(() => ({
    opacity: secondBlockOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.screen}>
      <OnboardingHeader currentStep={1} />

      <View style={styles.content}>
        <Animated.View style={[styles.block, firstBlockStyle]}>
          <Text style={styles.heroLine}>Messages that matter,</Text>
          <Text style={styles.heroLine}>when they matter most</Text>
        </Animated.View>

        <Animated.View style={[styles.block, secondBlockStyle]}>
          <Text style={styles.supportLine}>
            From those who are no longer with us
          </Text>
        </Animated.View>
      </View>

      <OnboardingFooter onPress={() => router.push('/onboarding/Step2')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },
  block: {
    alignItems: 'center',
    gap: 8,
  },
  heroLine: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  supportLine: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00B8D9',
    textAlign: 'center',
  },
});
