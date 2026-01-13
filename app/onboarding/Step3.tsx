import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const toneCards = [
  { title: 'LOVE', body: 'Warm messages that feel like an embrace' },
  { title: 'SUPPORT', body: 'Steady encouragement when you doubt' },
  { title: 'CALM', body: 'Breaths that slow the world around you' },
  { title: 'MOTIVATION', body: 'Gentle pushes to keep going forward' },
];

export default function OnboardingStep3() {
  const topGroupOpacity = useSharedValue(0);
  const bottomGroupOpacity = useSharedValue(0);

  useEffect(() => {
    topGroupOpacity.value = withTiming(1, { duration: 800 });
    bottomGroupOpacity.value = withDelay(1000, withTiming(1, { duration: 800 }));
  }, [topGroupOpacity, bottomGroupOpacity]);

  const topGroupStyle = useAnimatedStyle(() => ({
    opacity: topGroupOpacity.value,
  }));

  const bottomGroupStyle = useAnimatedStyle(() => ({
    opacity: bottomGroupOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.screen}>
      <OnboardingHeader currentStep={3} />

      <View style={styles.content}>
        <Animated.View style={[styles.topGroup, topGroupStyle]}>
          <Text style={styles.paragraph}>
            <Text style={styles.paragraphAccent}>You can choose</Text>
            <Text style={styles.paragraphRest}>
              {' '}
              which messages will be with you. Words of support, love, calm, and
              motivation
            </Text>
          </Text>

          <View style={styles.cardsGrid}>
            {toneCards.map((card) => (
              <View key={card.title} style={styles.card}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardBody}>{card.body}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={[styles.bottomGroup, bottomGroupStyle]}>
          <Text style={styles.paragraphSecondary}>
            <Text style={styles.paragraphAccent}>HoldYou</Text>
            <Text style={styles.paragraphRest}>
              {' '}
              sends you gentle words of support as if from someone close, just
              when you need them most
            </Text>
          </Text>

          <View style={styles.messageCard}>
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
                {`You’re not alone. I’m here with you.\nEverything will be okay.`}
              </Text>
            </View>
          </View>

          <Text style={styles.notificationLabel}>Notification example</Text>
        </Animated.View>
      </View>

      <OnboardingFooter onPress={() => router.push('/onboarding/Step4')} />
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
    paddingHorizontal: 24,
    paddingBottom: 32,
    // ВАЖНО: вместо space-between, чтобы низ не прилипал к кнопке
    justifyContent: 'flex-start',
  },
  topGroup: {
    gap: 12,
    marginTop: 8,
    marginBottom: 40, // расстояние между верхним блоком и нижним
  },
  bottomGroup: {
    gap: 16,
    // поднимаем весь нижний блок выше, чтобы был воздух над кнопкой
    marginBottom: 40,
  },
  paragraph: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 28,
  },
  paragraphAccent: {
    color: '#00B8D9',
    fontWeight: '700',
  },
  paragraphRest: {
    color: '#FFFFFF',
  },
  paragraphSecondary: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: 8,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginTop: 12,
  },
  card: {
    width: '48%',
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#050505',
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    shadowOpacity: 0.35,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
  },
  cardBody: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
  },
  notificationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  messageCard: {
    width: '86%',
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#050505',
    overflow: 'hidden',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 18,
    shadowOpacity: 0.35,
  },
  messageHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#041922',
  },
  messageHeaderText: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(238,238,238,0.8)',
  },
  messageBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#000000',
    gap: 6,
  },
  messageSender: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  messageText: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
});
