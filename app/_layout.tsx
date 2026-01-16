// app/_layout.tsx
import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SenderProvider } from './context/SenderContext';
import { TalkProvider } from './context/TalkContext';
import { SubscriptionProvider } from './context/SubscriptionContext';

// Configure notification handler once at app startup
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as Notifications.NotificationBehavior),
});

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Компонент, который живёт ВНУТРИ AuthProvider,
 * поэтому может вызывать useAuth() и решать редиректы после deep link.
 */
function DeepLinkGate() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleIncomingUrl = async (url: string | null) => {
    if (!url) return;

    // Пример URL:
    // https://holdyou.app/confirmed?...
    // https://holdyou.app/auth/reset-password?...
    const parsed = Linking.parse(url);
    const path = (parsed.path || '').replace(/^\/+/, ''); // убираем ведущие "/"
    const lowerPath = path.toLowerCase();

    // 1) После подтверждения email на сайте: /confirmed
    if (lowerPath.startsWith('confirmed')) {
      try {
        // обновим user из Supabase (важно!)
        await refreshUser();
      } catch (e) {
        // даже если refreshUser упал — всё равно отправим на логин
      }

      // Дальше: логика “куда вести” уже решается в Login (useEffect: если confirmed -> /(tabs)/talk)
      // Поэтому просто пнём в onboarding/login
      router.replace('/onboarding/login' as any);
      return;
    }

    // 2) Reset password: /auth/reset-password
    if (lowerPath.startsWith('auth/reset-password')) {
      // Важно: у тебя должен быть экран app/auth/reset-password.tsx (или в папке auth)
      router.replace('/auth/reset-password' as any);
      return;
    }

    // Если пришло что-то другое — пока игнорим
  };

  useEffect(() => {
    // initial URL (когда приложение было закрыто и открыли по ссылке)
    Linking.getInitialURL().then((url) => {
      handleIncomingUrl(url);
    });

    // runtime URL (когда приложение открыто/в фоне и прилетает ссылка)
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      // в твоей версии expo-linking именно remove()
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <SenderProvider>
        <TalkProvider>
          <SubscriptionProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              {/* DeepLink handler живёт внутри провайдеров */}
              <DeepLinkGate />

              <Stack initialRouteName="onboarding">
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="modal"
                  options={{ presentation: 'modal', title: 'Modal' }}
                />
              </Stack>

              <StatusBar style="auto" />
            </ThemeProvider>
          </SubscriptionProvider>
        </TalkProvider>
      </SenderProvider>
    </AuthProvider>
  );
}
