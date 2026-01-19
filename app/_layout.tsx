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
 *
 * ВАЖНО:
 * - Reset password deep link обрабатывается экраном app/auth/reset-password.tsx напрямую,
 *   чтобы не терять payload (?code=... или #access_token=...).
 */
function DeepLinkGate() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleIncomingUrl = async (url: string | null) => {
    if (!url) return;

    const parsed = Linking.parse(url);
    const path = (parsed.path || '').replace(/^\/+/, '');
    const lowerPath = path.toLowerCase();

    // 1) После подтверждения email на сайте: /confirmed
    if (lowerPath.startsWith('confirmed')) {
      try {
        await refreshUser();
      } catch {
        // ignore
      }

      router.replace('/onboarding/login' as any);
      return;
    }

    // 2) Reset password: НЕ трогаем здесь.
    // Он должен обработаться внутри app/auth/reset-password.tsx,
    // иначе теряется query/hash payload и ломается exchangeCodeForSession.
    if (lowerPath.startsWith('auth/reset-password')) {
      return;
    }

    // Остальное — игнорим
  };

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      handleIncomingUrl(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
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
