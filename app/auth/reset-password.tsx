// app/auth/reset-password.tsx
import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

type Params = {
  code?: string;
  access_token?: string;
  refresh_token?: string;
  type?: string;
};

function parseTokensFromUrl(url: string): Params {
  const out: Params = {};

  try {
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) {
      const query = url.slice(qIndex + 1).split('#')[0];
      const p = new URLSearchParams(query);
      out.code = p.get('code') ?? undefined;
      out.access_token = p.get('access_token') ?? undefined;
      out.refresh_token = p.get('refresh_token') ?? undefined;
      out.type = p.get('type') ?? undefined;
    }

    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      const hash = url.slice(hashIndex + 1);
      const p = new URLSearchParams(hash);
      out.access_token = out.access_token ?? (p.get('access_token') ?? undefined);
      out.refresh_token = out.refresh_token ?? (p.get('refresh_token') ?? undefined);
      out.type = out.type ?? (p.get('type') ?? undefined);
      out.code = out.code ?? (p.get('code') ?? undefined);
    }
  } catch {
    // ignore
  }

  return out;
}

function normalizeString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function hasAny(p: Params) {
  return !!(p.code || p.access_token || p.refresh_token || p.type);
}

export default function ResetPasswordProxyScreen() {
  const params = useLocalSearchParams<Params>();
  const redirectedRef = useRef(false);

  const go = (payload: Params) => {
    if (redirectedRef.current) return;
    if (!hasAny(payload)) return;

    redirectedRef.current = true;

    // ✅ ВАЖНО: group "(reset)" НЕ часть URL. Путь должен быть "/reset-password"
    router.replace({
      pathname: '/reset-password',
      params: {
        code: payload.code,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        type: payload.type,
      },
    } as any);
  };

  // 1) Если Expo Router уже получил query params — редиректим сразу
  useEffect(() => {
    const payload: Params = {
      code: normalizeString(params?.code),
      access_token: normalizeString(params?.access_token),
      refresh_token: normalizeString(params?.refresh_token),
      type: normalizeString(params?.type),
    };

    if (hasAny(payload)) go(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.code, params?.access_token, params?.refresh_token, params?.type]);

  // 2) Фоллбек: если прилетает через runtime event — парсим URL и редиректим
  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      const payload = parseTokensFromUrl(url);
      go(payload);
    };

    const sub = Linking.addEventListener('url', onUrl);

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    </SafeAreaView>
  );
}
