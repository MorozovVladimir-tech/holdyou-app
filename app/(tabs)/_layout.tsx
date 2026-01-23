// app/(tabs)/_layout.tsx
import React, { useEffect } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTalk } from '../context/TalkContext';
import { useSender } from '../context/SenderContext';

// ВИДЕО-ОРБ (orb_5)
const orbVideo = require('../../assets/videos/orb_5.mp4');

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading } = useTalk(); // AI отвечает

  // ✅ Sender gating
  const { isSenderComplete } = useSender();

  // Базовое дыхание орба
  const scale = useSharedValue(0.9);

  // Лёгкий пульс при тапе
  const pulse = useSharedValue(0);

  // Небольшая "нервная" вибрация дыхания при ответе AI
  const jitter = useSharedValue(0);

  // Glow от тап-пульса
  const tapGlow = useSharedValue(0);

  // Доп. glow + внутренний свет, когда AI отвечает
  const typingGlow = useSharedValue(0);

  // Дыхание: нормальное / более частое при ответе AI
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(isLoading ? 1.16 : 1.12, {
        duration: isLoading ? 1500 : 2600,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
  }, [scale, isLoading]);

  // Небольшая вибрация масштаба, когда AI "думает"
  useEffect(() => {
    if (isLoading) {
      jitter.value = withRepeat(
        withSequence(
          withTiming(0.01, {
            duration: 160,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(-0.01, {
            duration: 160,
            easing: Easing.inOut(Easing.quad),
          })
        ),
        -1,
        true
      );
    } else {
      jitter.value = withTiming(0, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [jitter, isLoading]);

  // Мягкий постоянный glow, пока AI отвечает
  useEffect(() => {
    typingGlow.value = withTiming(isLoading ? 0.25 : 0, {
      duration: 250,
      easing: Easing.inOut(Easing.quad),
    });
  }, [typingGlow, isLoading]);

  // ✅ Авто-редирект: если Sender не заполнен, Talk не должен открываться вообще
  useEffect(() => {
    if (!pathname) return;
    if (!isSenderComplete && pathname.includes('/talk')) {
      router.replace('/(tabs)/sender' as never);
    }
  }, [pathname, isSenderComplete, router]);

  // Итоговая анимация орба (масштаб + внешний glow)
  const orbAnimatedStyle = useAnimatedStyle(() => {
    const totalGlow = tapGlow.value + typingGlow.value;
    return {
      transform: [{ scale: scale.value + pulse.value + jitter.value }],
      shadowColor: '#00B8D9',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: totalGlow,
      shadowRadius: totalGlow * 18,
    };
  });

  // Внутреннее свечение (поверх видео, внутри круга)
  const innerGlowStyle = useAnimatedStyle(() => {
    const opacity = typingGlow.value * 1.4; // максимум ~0.35
    return {
      opacity,
    };
  });

  const getActiveTab = () => {
    if (pathname?.includes('/sender')) return 'sender';
    if (pathname?.includes('/about')) return 'about';
    return 'talk';
  };

  const activeTab = getActiveTab();

  const tabs = [
    { id: 'talk', label: 'Talk', icon: 'chatbubbles-outline' },
    { id: 'sender', label: 'Sender', icon: 'person-outline' },
    { id: 'about', label: 'Profile', icon: 'information-circle-outline' },
  ];

  // Тап по орбу: спрятать клавиатуру + лёгкий пульс + glow + хэптик
  const handleOrbPress = () => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    pulse.value = withSequence(
      withTiming(0.04, { duration: 130, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) })
    );

    tapGlow.value = withSequence(
      withTiming(0.55, { duration: 160 }),
      withTiming(0, { duration: 250 })
    );
  };

  const handleTabPress = async (tabId: string) => {
    if (tabId === 'talk') {
      if (!isSenderComplete) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        router.push('/(tabs)/sender' as never);
        return;
      }
      router.push('/(tabs)/talk' as never);
      return;
    }

    if (tabId === 'sender') {
      router.push('/(tabs)/sender' as never);
      return;
    }

    if (tabId === 'about') {
      router.push('/(tabs)/about' as never);
      return;
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Top Logo */}
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>
          <Text style={styles.logoBlue}>HOLD</Text>
          <Text style={styles.logoWhite}>YOU</Text>
        </Text>
      </View>

      {/* ORB */}
      <View style={styles.orbContainer}>
        <Pressable onPress={handleOrbPress} hitSlop={20}>
          <Animated.View style={[styles.orbVideoWrapper, orbAnimatedStyle]}>
            <Video
              source={orbVideo}
              style={styles.orbVideo}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted
              shouldPlay
            />
            {/* внутреннее свечение, когда AI отвечает */}
            <Animated.View style={[styles.orbInnerGlow, innerGlowStyle]} />
          </Animated.View>
        </Pressable>
      </View>

      {/* Content Area with Tabs — двигаем её относительно клавиатуры */}
      <KeyboardAvoidingView
        style={styles.contentArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Tabs
          screenOptions={{
            tabBarStyle: { display: 'none' },
            headerShown: false,
          }}
        >
          <Tabs.Screen name="talk" />
          <Tabs.Screen name="sender" />
          <Tabs.Screen name="about" />
        </Tabs>
      </KeyboardAvoidingView>

      {/* Custom Tab Bar */}
      <View style={styles.tabBar}>
        <View style={styles.tabButtons}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => handleTabPress(tab.id)}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={24}
                  color={isActive ? '#00B8D9' : 'rgba(255,255,255,0.6)'}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.tabFooterText}>Where words find you again</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  logoContainer: {
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: '600',
    textAlign: 'center',
  },
  logoBlue: {
    color: '#00B8D9',
  },
  logoWhite: {
    color: '#FFFFFF',
  },

  // ORB
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 4,   // было 6
    marginTop: -4,      // было -3
  },
  orbVideoWrapper: {
    width: 170,         // было 210
    height: 170,        // было 210
    borderRadius: 85,   // было 105
    overflow: 'hidden',
  },
  orbVideo: {
    width: '100%',
    height: '100%',
  },
  orbInnerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 85,   // под новый размер
    backgroundColor: 'rgba(0, 184, 217, 0.4)',
  },

  contentArea: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },

  tabBar: {
    paddingBottom: 20,
    paddingTop: 12,
    borderTopWidth: 0,
  },
  tabButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 184, 217, 0.3)',
    minWidth: 80,
  },
  tabButtonActive: {
    borderColor: '#00B8D9',
    backgroundColor: 'rgba(0, 184, 217, 0.1)',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  tabLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  tabLabelActive: {
    color: '#00B8D9',
  },
  tabFooterText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
  },
});
