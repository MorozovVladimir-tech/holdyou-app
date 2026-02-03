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

type PushData = {
  screen?: 'talk' | 'sender' | 'profile';
  userId?: string;
  messageId?: string;
  source?: string;
};

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
  const { refreshUser, user } = useAuth();

  const handleIncomingUrl = async (url: string | null) => {
    if (!url) return;

    const parsed = Linking.parse(url);
    const path = (parsed.path || '').replace(/^\/+/, '');
    const lowerPath = path.toLowerCase();

    // holdyou:/// или пустой path — не показывать "Unmatched Route", сразу вести в приложение или логин
    if (!path || path === '/' || url === 'holdyou://' || url === 'holdyou:///') {
      router.replace((user ? '/(tabs)/talk' : '/onboarding/login') as any);
      return;
    }

    // confirmed (без токенов — юзер нажал "Я подтвердил" в приложении)
    if (lowerPath.startsWith('confirmed')) {
      try {
        await refreshUser();
      } catch {}

      router.replace('/onboarding/login' as any);
      return;
    }
  };

  useEffect(() => {
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) await handleIncomingUrl(initialUrl);
    })();

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}

function PushGate() {
  const router = useRouter();

  const handlePushTap = (data: PushData | null | undefined) => {
    const screen = data?.screen;

    if (screen === 'talk') {
      router.push('/(tabs)/talk' as any);
      return;
    }

    if (screen === 'sender') {
      router.push('/(tabs)/sender' as any);
      return;
    }

    // дефолт: ведём в Talk
    router.push('/(tabs)/talk' as any);
  };

  useEffect(() => {
    let isMounted = true;

    // 1) Если приложение было убито и открыто тапом по пушу
    (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        const data =
          (last?.notification?.request?.content?.data as PushData | undefined) ?? undefined;

        if (isMounted && data) handlePushTap(data);
      } catch (e) {
        console.warn('getLastNotificationResponseAsync error', e);
      }
    })();

    // 2) Если приложение было в фоне и пользователь тапнул по пушу
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response.notification.request.content.data as PushData | undefined;
        handlePushTap(data);
      } catch (e) {
        console.warn('notification response listener error', e);
      }
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function AuthenticatedLayout({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  const { user } = useAuth();
  // При смене user (например после подтверждения почты) перемонтируем дерево — данные нового пользователя
  const userKey = user?.id ?? 'anon';

  return (
    <SenderProvider key={userKey}>
      <TalkProvider>
        <SubscriptionProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <DeepLinkGate />
            <PushGate />

            <Stack initialRouteName="onboarding">
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

                {/* ✅ ВАЖНО: регистрируем РЕАЛЬНЫЙ экран reset-цепочки */}
                <Stack.Screen name="(reset)/reset-password" options={{ headerShown: false }} />

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
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <AuthenticatedLayout colorScheme={colorScheme} />
    </AuthProvider>
  );
}
