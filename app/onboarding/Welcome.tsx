// app/onboarding/Welcome.tsx
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  withRepeat,
} from 'react-native-reanimated';
import { Video, ResizeMode } from 'expo-av';
import { useAuth } from '../context/AuthContext';

// видео орба
const orbVideo = require('../../assets/videos/orb_5.mp4');

export default function WelcomeScreen() {
  const { user } = useAuth();
  const pathname = usePathname();

  // ✅ Reset-flow guard (только для цепочки смены пароля)
  const isInResetFlow = useMemo(() => {
    const p = (pathname || '').toLowerCase();
    return p.includes('reset-password') || p.includes('/(reset)');
  }, [pathname]);

  // ORB
  const orbOpacity = useSharedValue(0);
  const introScale = useSharedValue(0.8); // стартовый зум
  const breathScale = useSharedValue(1); // дыхание после появления

  // TEXTS
  const titleOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  // BUTTONS
  const buttonsOpacity = useSharedValue(0);

  useEffect(() => {
    // ORB: плавное появление + входной зум
    orbOpacity.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });

    introScale.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });

    // дыхание начинается после появления
    breathScale.value = withDelay(
      1500,
      withRepeat(
        withTiming(1.06, {
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
        }),
        -1, // бесконечно
        true // реверс (1 → 1.06 → 1)
      )
    );

    // Тексты
    titleOpacity.value = withDelay(
      1500,
      withTiming(1, {
        duration: 1400,
        easing: Easing.out(Easing.cubic),
      })
    );

    subtitleOpacity.value = withDelay(
      1500,
      withTiming(1, {
        duration: 1400,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Кнопки
    buttonsOpacity.value = withDelay(
      3000,
      withTiming(1, {
        duration: 1500,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, []);

  // ORB STYLES (introScale * breathScale)
  const orbStyle = useAnimatedStyle(() => ({
    opacity: orbOpacity.value,
    transform: [{ scale: introScale.value * breathScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));
  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
  }));

  const handleStartOnboarding = () => {
    router.push('/onboarding/Step1');
  };

  const handleGoToApp = () => {
    // ✅ Если вдруг мы оказались в reset-флоу — не прыгаем внутрь приложения
    if (isInResetFlow) {
      router.replace('/(reset)/reset-password' as any);
      return;
    }

    if (user) {
      router.replace('/(tabs)/talk');
    } else {
      router.replace('/onboarding/Login' as never);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.contentWrapper}>
        {/* Верхняя надпись */}
        <Animated.View style={[styles.heroBlock, titleStyle]}>
          <Text style={styles.title}>
            Welcome to <Text style={styles.titleAccent}>HoldYou</Text>
          </Text>
        </Animated.View>

        {/* ORB */}
        <Animated.View style={[styles.orbWrapper, orbStyle]}>
          <Video
            source={orbVideo}
            style={styles.orbVideo}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted
            shouldPlay
          />
        </Animated.View>

        {/* Нижняя надпись */}
        <Animated.View style={[styles.subtitleBlock, subtitleStyle]}>
          <Text style={styles.subtitle}>Where words find you again</Text>
        </Animated.View>
      </View>

      {/* Кнопки */}
      <Animated.View style={[styles.footer, buttonsStyle]}>
        <Pressable
          style={({ pressed }) => [styles.buttonBase, pressed && styles.buttonPressed]}
          onPress={handleStartOnboarding}
        >
          <Text style={styles.buttonText}>Get to know HoldYou</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.buttonBase,
            styles.buttonSecondary,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleGoToApp}
        >
          <Text style={styles.buttonText}>Go to app</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const BUTTON_WIDTH = 240;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  // ORB — +20% размера
  orbWrapper: {
    width: 252,
    height: 252,
    borderRadius: 126,
    overflow: 'hidden',
  },
  orbVideo: {
    width: '100%',
    height: '100%',
  },
  subtitleBlock: {
    marginTop: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  titleAccent: {
    color: '#00B8D9',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 12,
    alignItems: 'center',
  },
  buttonBase: {
    width: BUTTON_WIDTH,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.45,
  },
  buttonSecondary: {},
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
