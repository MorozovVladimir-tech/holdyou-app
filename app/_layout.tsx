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

function DeepLinkGate() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleIncomingUrl = async (url: string | null) => {
    if (!url) return;

    const parsed = Linking.parse(url);
    const path = (parsed.path || '').replace(/^\/+/, '');
    const lowerPath = path.toLowerCase();

    // confirmed оставляем (но только для runtime событий)
    if (lowerPath.startsWith('confirmed')) {
      try {
        await refreshUser();
      } catch {}

      router.replace('/onboarding/login' as any);
      return;
    }

    // reset-password здесь НЕ обрабатываем вообще
    // и главное — НЕ трогаем initialURL в этом компоненте
  };

  useEffect(() => {
    // ❗️ВАЖНО: НЕ вызываем Linking.getInitialURL() здесь,
    // чтобы не "съесть" initialURL у экранов reset-password / confirmed.
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => sub.remove();
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
