// app/_layout.tsx
import React, { useEffect, useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';

const LAST_RECOVERY_URL_KEY = 'holdyou.lastRecoveryUrl';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from './lib/supabaseClient';
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

/**
 * FIX (только по текущей проблеме):
 * iOS иногда присылает в приложение "пустой" deep link вида holdyou:/// (или holdyou://).
 * Expo Router пытается заматчить его как route -> получаем экран "Unmatched Route: holdyou:///".
 *
 * Мы НЕ ломаем остальную логику: просто перехватываем такие URL и мгновенно редиректим
 * в Talk или Login в зависимости от наличия session.
 */
function EmptyDeepLinkGuard() {
  const router = useRouter();
  const { user } = useAuth(); // только чтобы перерендер при смене user не ломал guard
  const handledOnceRef = useRef(false);

  const handleUrl = async (url: string | null) => {
    if (!url) return;

    // normalize
    const u = url.trim();

    // "пустые" варианты, которые и вызывают Unmatched Route
    const isEmptyScheme =
      u === 'holdyou://' ||
      u === 'holdyou:///' ||
      u.startsWith('holdyou:////') ||
      u === 'holdyou:'; // на всякий

    // Иногда parse даёт пустой path
    const parsed = Linking.parse(u);
    const path = (parsed.path || '').replace(/^\/+/, '');
    const isEmptyPath = !path || path === '/';

    if (!isEmptyScheme && !isEmptyPath) return;

    // Не даём циклов/дублей
    if (handledOnceRef.current) return;
    handledOnceRef.current = true;

    try {
      const { data } = await supabase.auth.getSession();
      const hasSession = !!data.session?.user;

      router.replace((hasSession ? '/(tabs)/talk' : '/onboarding/login') as any);
    } catch {
      // если сессия не читается — на логин
      router.replace('/onboarding/login' as any);
    } finally {
      // через короткое время разрешаем новые обработки (на случай странных кейсов)
      setTimeout(() => {
        handledOnceRef.current = false;
      }, 1200);
    }
  };

  useEffect(() => {
    // cold start
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        await handleUrl(initialUrl);
      } catch {}
    })();

    // runtime
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}

/**
 * Вариант A: при получении ссылки сброса пароля (https://holdyou.app/auth/reset-password?code=...)
 * сразу открываем экран "Set a new password", чтобы exchangeCodeForSession вызвался пока code_verifier в storage.
 * Не трогаем AuthContext, confirmed, сессию.
 */
function ResetPasswordLinkGuard() {
  const router = useRouter();
  const handledRef = useRef(false);

  const handleUrl = async (url: string | null) => {
    if (!url || handledRef.current) return;
    const isHttpsReset =
      url.startsWith('https://') &&
      url.includes('holdyou.app') &&
      url.includes('/auth/reset-password') &&
      (url.includes('code=') || url.includes('access_token='));
    const isDeepLinkReset =
      url.startsWith('holdyou://') && url.includes('auth/reset-password');
    if (!isHttpsReset && !isDeepLinkReset) return;
    handledRef.current = true;
    try {
      await AsyncStorage.setItem(LAST_RECOVERY_URL_KEY, url);
      router.replace('/(reset)/reset-password' as any);
    } finally {
      setTimeout(() => {
        handledRef.current = false;
      }, 2000);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        await handleUrl(initial);
      } catch {}
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    return () => sub.remove();
  }, []);

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

function AuthenticatedLayout({
  colorScheme,
}: {
  colorScheme: 'light' | 'dark' | null | undefined;
}) {
  const { user } = useAuth();

  // При смене user (например после подтверждения почты) перемонтируем дерево — данные нового пользователя
  const userKey = user?.id ?? 'anon';

  return (
    <SenderProvider key={userKey}>
      <TalkProvider>
        <SubscriptionProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            {/* ✅ только фикс текущей проблемы */}
            <EmptyDeepLinkGuard />
            <ResetPasswordLinkGuard />

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
