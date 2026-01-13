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

export default function OnboardingStep2() {
  const firstBlockOpacity = useSharedValue(0);
  const secondBlockOpacity = useSharedValue(0);

  useEffect(() => {
    firstBlockOpacity.value = withTiming(1, { duration: 800 });
    secondBlockOpacity.value = withDelay(1000, withTiming(1, { duration: 800 }));
  }, [firstBlockOpacity, secondBlockOpacity]);

  const firstStyle = useAnimatedStyle(() => ({
    opacity: firstBlockOpacity.value,
  }));

  const secondStyle = useAnimatedStyle(() => ({
    opacity: secondBlockOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.screen}>
      <OnboardingHeader currentStep={2} />

      <View style={styles.content}>
        <Animated.View style={[styles.block, firstStyle]}>
          <Text style={styles.blockLead}>Sometimes</Text>
          <Text style={styles.blockBody}>we need words we can no longer hear</Text>
        </Animated.View>

        <Animated.View style={[styles.block, secondStyle]}>
          <Text style={styles.blockLead}>HoldYou</Text>
          <Text style={styles.blockBody}>
            will be there — carrying the warmth{'\n'}of those we hold dear
          </Text>
        </Animated.View>
      </View>

      <OnboardingFooter onPress={() => router.push('/onboarding/Step3')} />
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
    gap: 36,
  },
  block: {
    alignItems: 'center',
    gap: 8,
  },
  blockLead: {
    fontSize: 28,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
  },
  blockBody: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 28,
  },
});
