import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function OnboardingStep4() {
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    contentOpacity.value = withDelay(1000, withTiming(1, { duration: 700 }));
  }, [contentOpacity]);

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.screen}>
      <OnboardingHeader currentStep={4} />

      <View style={styles.contentWrapper}>
        <Animated.View style={[styles.content, animatedContentStyle]}>
          <View style={styles.titleBlock}>
            <Text style={styles.titleAccent}>Every connection is unique</Text>

            <Text style={styles.intro}>
              We all have <Text style={styles.introAccent}>special words</Text> —{'\n'}
              the ones they used when they spoke to us,{'\n'}words that built our own
              little world
            </Text>
          </View>

          <View style={styles.triggerSection}>
            <Text style={styles.triggerLabel}>Enter your trigger words</Text>
            <View style={styles.triggerInput}>
              <TextInput
                style={styles.triggerInputText}
                placeholder="Sweetheart, angel, my heart, sunshine"
                placeholderTextColor="rgba(255,255,255,0.9)"
                editable={false}
              />
            </View>
            <Text style={styles.triggerCaption}>notification example</Text>
          </View>

          {/* Пример уведомления от Mom */}
          <View style={styles.messagePreview}>
            <View style={styles.messageHeaderBar}>
              <Text style={styles.messageHeaderText}>
                HOLD
                <Text style={styles.messageHeaderAccent}>YOU</Text>
                <Text style={styles.messageHeaderDot}> • MESSAGE</Text>
              </Text>
              <Text style={styles.messageTime}>now</Text>
            </View>

            <View style={styles.messageBody}>
              <Text style={styles.messageSender}>Mom</Text>
              <Text style={styles.messageText}>
                {"You're not alone, sweetheart.\nI'm right here, my sunshine — always.\nEverything will be okay."}
              </Text>
            </View>
          </View>

          {/* Новый пример уведомления от The Universe */}
          <View style={[styles.messagePreview, styles.universePreview]}>
            <View style={styles.messageHeaderBar}>
              <Text style={styles.messageHeaderText}>
                HOLD
                <Text style={styles.messageHeaderAccent}>YOU</Text>
                <Text style={styles.messageHeaderDot}> • MESSAGE</Text>
              </Text>
              <Text style={styles.messageTime}>now</Text>
            </View>

            <View style={styles.messageBody}>
              <Text style={styles.messageSender}>The Universe</Text>
              <Text style={styles.messageText}>
                {"You're never alone.\nEvery moment carries meaning.\nI'm here, supporting you in ways you feel — and ways you don’t yet understand."}
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>

      <OnboardingFooter onPress={() => router.push('/onboarding/Step5')} />
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
    justifyContent: 'flex-start', // поднимаем весь контент выше
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  content: {
    width: 320,
    alignItems: 'center',
    gap: 24,
  },
  titleBlock: {
    alignItems: 'center',
  },
  titleAccent: {
    fontSize: 28,
    fontWeight: '500',
    color: '#00B8D9',
    textAlign: 'center',
    opacity: 0.95,
    marginBottom: 24,
  },
  intro: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
    opacity: 0.95,
  },
  introAccent: {
    color: '#00B8D9',
  },
  triggerSection: {
    width: 290,
    alignItems: 'center',
    gap: 12,
  },
  triggerLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  triggerInput: {
    width: '100%',
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#0A0A0A',
    opacity: 0.85,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerInputText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'left',
  },
  triggerCaption: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.67)',
    letterSpacing: 0.4,
  },
  messagePreview: {
    width: 254,
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4,
    shadowOpacity: 0.25,
  },
  universePreview: {
    marginTop: 12, // расстояние между двумя окнами уведомлений
  },
  messageHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#12384C',
    opacity: 0.85,
  },
  messageHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  messageHeaderAccent: {
    color: '#00B8D9',
  },
  messageHeaderDot: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.63)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(11,11,11,0.9)',
  },
  messageBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#000000',
  },
  messageSender: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 8,
  },
  messageText: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 16,
  },
});
