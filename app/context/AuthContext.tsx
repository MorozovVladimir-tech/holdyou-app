// app/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';

const SENDER_PROFILE_STORAGE_KEY = 'holdyou_sender_profile_v2';

// Web Client ID — OAuth 2.0 Client ID типа "Web application". Нужен для id_token.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
// iOS Client ID — OAuth 2.0 Client ID типа "iOS". Нужен для нативного Sign In на iOS.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

WebBrowser.maybeCompleteAuthSession();

// ✅ Триал (дни)
const TRIAL_DAYS = 5;

function calcIsEmailConfirmed(u: User | null): boolean {
  if (!u) return false;

  const anyUser = u as unknown as {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  };

  return Boolean(anyUser.email_confirmed_at || anyUser.confirmed_at);
}

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;

  isAuthenticated: boolean;
  isEmailConfirmed: boolean;

  loginWithEmail: (email: string, password: string) => Promise<User | null>;
  registerWithEmail: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<User | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;

  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Возврат в приложение (custom scheme)
  const appReturnUrl = useMemo(
    () => Linking.createURL('auth/callback', { scheme: 'holdyou' }),
    []
  );

  // ✅ защита от двойной обработки callback
  const isExchangingRef = useRef(false);

  // ======================
  // SMALL UTILS
  // ======================
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // ✅ Ждём пока Supabase реально отдаст session (после exchange/setSession на RN бывает задержка записи)
  const waitForSession = async (
    label: string,
    attempts = 6,
    delaysMs: number[] = [0, 80, 150, 250, 400, 650]
  ) => {
    for (let i = 0; i < attempts; i++) {
      if (delaysMs[i] != null) await sleep(delaysMs[i]!);
      const { data } = await supabase.auth.getSession();
      const s = data?.session ?? null;
      if (s?.user) {
        console.log(
          `[Auth] ${label}: session ready on try #${i + 1}`,
          'userId=',
          s.user.id,
          'email=',
          (s.user as any)?.email ?? 'null'
        );
        return s;
      }
    }
    console.warn(`[Auth] ${label}: session still missing after retries`);
    return null;
  };

  // ======================
  // ENSURE sender_profiles (trial bootstrap)
  // ======================
  const ensureSenderProfile = async (u: User) => {
    try {
      const { data, error } = await supabase
        .from('sender_profiles')
        .select('trial_ends_at')
        .eq('user_id', u.id)
        .maybeSingle();

      if (error) {
        console.warn('[ensureSenderProfile] select error', error);
        return;
      }

      if (data?.trial_ends_at) return;

      const createdAt = u.created_at ? new Date(u.created_at) : new Date();
      const trialEnds = new Date(
        createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
      );

      const { error: upsertErr } = await supabase
        .from('sender_profiles')
        .upsert(
          {
            user_id: u.id,
            trial_ends_at: trialEnds.toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (upsertErr) {
        console.warn('[ensureSenderProfile] upsert error', upsertErr);
        return;
      }

      console.log('[ensureSenderProfile] trial_ends_at created');
    } catch (e) {
      console.warn('[ensureSenderProfile] unexpected error', e);
    }
  };

  // ======================
  // INIT SESSION
  // ======================
  useEffect(() => {
    let isMounted = true;

    const applySession = (session: { user: unknown } | null) => {
      if (!isMounted) return;
      const sessionUser = session?.user ?? null;
      setUser(sessionUser as User | null);
      if (sessionUser) ensureSenderProfile(sessionUser as User);
    };

    (async () => {
      try {
        // Даём AsyncStorage полностью инициализироваться (RN/Expo)
        await sleep(250);
        if (!isMounted) return;

        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        for (const delayMs of [200, 400]) {
          if (session) break;
          await sleep(delayMs);
          if (!isMounted) return;
          const next = await supabase.auth.getSession();
          session = next.data.session;
        }

        const uid = session?.user?.id ?? null;
        const uEmail = (session?.user as any)?.email ?? null;
        console.log(
          '[Auth] init getSession: hasSession=',
          !!session,
          'userId=',
          uid ?? 'null',
          'email=',
          uEmail ?? 'null'
        );
        applySession(session);
      } catch (e) {
        console.warn('[Auth] getSession error', e);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED'
      ) {
        applySession(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ======================
  // HELPERS
  // ======================
  const refreshUser = async (): Promise<User | null> => {
    // ✅ сначала пытаемся взять user из session (на RN это надёжнее, чем getUser сразу после callback)
    const s = await waitForSession('refreshUser');
    if (s?.user) {
      setUser(s.user);
      return s.user;
    }

    // fallback (если сессии реально нет)
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn('refreshUser error', error);
      return null;
    }
    setUser(data.user ?? null);
    return data.user ?? null;
  };

  // ======================
  // OAUTH / EMAIL CONFIRM CALLBACK HANDLER
  // ======================
  /** Парсинг query/hash без URLSearchParams — работает везде в RN без полифиллов. */
  const getQueryParam = (url: string, key: string, fromHash = false): string | null => {
    const part = fromHash
      ? url.split('#')[1] ?? ''
      : (url.includes('?') ? url.split('?')[1].split('#')[0] ?? '' : '');
    const query = part || '';
    for (const segment of query.split('&')) {
      if (!segment) continue;
      const eq = segment.indexOf('=');
      const k = eq === -1 ? segment : segment.slice(0, eq);
      const v = eq === -1 ? '' : segment.slice(eq + 1);
      try {
        if (decodeURIComponent(k.trim()) === key) {
          return decodeURIComponent((v ?? '').trim());
        }
      } catch (_) {}
    }
    return null;
  };

  /** Извлекает access_token и refresh_token из URL (query или hash). */
  const extractSessionFromUrl = (
    url: string
  ): { access_token: string; refresh_token: string } | null => {
    const access_token =
      getQueryParam(url, 'access_token') ?? getQueryParam(url, 'access_token', true);
    const refresh_token =
      getQueryParam(url, 'refresh_token') ?? getQueryParam(url, 'refresh_token', true);
    if (access_token && refresh_token) return { access_token, refresh_token };
    return null;
  };

  const handleAuthCallbackUrl = async (url: string) => {
    if (!url) return;

    const parsed = Linking.parse(url);

    const fullPath = [parsed.hostname, parsed.path]
      .filter(Boolean)
      .join('/')
      .replace(/^\/+/, '')
      .toLowerCase();

    // Universal Links приносят https://holdyou.app/confirmed?code=... — это callback (PKCE)
    const isHttpsConfirmed =
      url.startsWith('https://') &&
      url.includes('holdyou.app') &&
      (url.includes('/confirmed') || url.includes('/auth/callback'));

    const isDeepLinkCallback = fullPath.startsWith('auth/callback');

    if (!fullPath && !isHttpsConfirmed) return;
    if (fullPath && fullPath !== '/' && !isDeepLinkCallback && !isHttpsConfirmed) return;

    if (isExchangingRef.current) {
      console.log('[Auth] skip duplicate callback');
      return;
    }
    isExchangingRef.current = true;

    try {
      const q = parsed.queryParams || {};

      const accessToken =
        (q.access_token as string) ??
        getQueryParam(url, 'access_token') ??
        getQueryParam(url, 'access_token', true) ??
        '';

      const refreshToken =
        (q.refresh_token as string) ??
        getQueryParam(url, 'refresh_token') ??
        getQueryParam(url, 'refresh_token', true) ??
        '';

      const hasTokens = !!(accessToken && refreshToken);

      console.log('[Auth] url event:', url);
      if (isHttpsConfirmed) {
        console.log('[Auth] https callback (confirmed/auth) detected');
      }
      console.log('[Auth] callback URL path=', fullPath, 'hasTokens=', hasTokens);

      // 1) Если вдруг прилетели токены -> setSession
      const sessionFromUrl = extractSessionFromUrl(url);
      if (sessionFromUrl) {
        const { error } = await supabase.auth.setSession(sessionFromUrl);
        if (error) {
          console.warn('[Auth] setSession error', error);
          return;
        }

        // ✅ ждём пока session реально появится, и только потом ставим user
        const s = await waitForSession('after setSession');
        const su = s?.user ?? null;

        setUser(su);
        if (su) await ensureSenderProfile(su);

        console.log(
          '[Auth] setSession done: hasSession=',
          !!s,
          'userId=',
          su?.id ?? 'null',
          'email=',
          (su as any)?.email ?? 'null'
        );
        return;
      }

      // 2) Основной сценарий confirmed/OAuth: PKCE code
      const code =
        ((q.code as string) ?? (q.authorization_code as string) ?? '') ||
        getQueryParam(url, 'code') ||
        getQueryParam(url, 'authorization_code') ||
        getQueryParam(url, 'code', true) ||
        getQueryParam(url, 'authorization_code', true);

      if (!code) {
        console.warn('[Auth] callback without code or tokens, skip');
        return;
      }

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(url);
      if (exErr) {
        console.warn('[Auth] exchangeCodeForSession error', exErr);
        throw exErr;
      }

      // ✅ ключевой фикс: ждём session, не полагаемся на getUser() сразу
      const s = await waitForSession('after exchange');
      const su = s?.user ?? null;

      setUser(su);
      if (su) await ensureSenderProfile(su);

      console.log(
        '[Auth] after exchange: hasSession=',
        !!s,
        'userId=',
        su?.id ?? 'null',
        'email=',
        (su as any)?.email ?? 'null'
      );
    } finally {
      isExchangingRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    // cold start + ретрай: на iOS URL иногда приходит с задержкой
    (async () => {
      const tryProcess = async (label: string) => {
        if (cancelled) return null;
        const u = await Linking.getInitialURL();
        if (u) {
          console.log('[Auth]', label, 'url received, len=', u.length);
          await handleAuthCallbackUrl(u);
          return true;
        }
        return false;
      };

      try {
        if (await tryProcess('getInitialURL (0ms)')) return;
        console.log('[Auth] getInitialURL= null');
        await sleep(400);
        if (await tryProcess('getInitialURL (400ms)')) return;
        await sleep(600);
        if (await tryProcess('getInitialURL (1000ms)')) return;
      } catch (e) {
        console.warn('[Auth] getInitialURL/handle error', e);
      }
    })();

    // runtime event
    const sub = Linking.addEventListener('url', async ({ url }) => {
      try {
        console.log(
          '[Auth] url event:',
          url ? url.substring(0, 120) + (url.length > 120 ? '...' : '') : 'null'
        );
        if (url) await handleAuthCallbackUrl(url);
      } catch (e) {
        console.warn('[Auth] url handle error', e);
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // ======================
  // EMAIL AUTH
  // ======================
  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<User | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.warn(
        '[Auth] loginWithEmail error:',
        error.message,
        'status=',
        (error as any).status
      );
      return null;
    }

    const sessionUser = data.session?.user ?? null;
    setUser(sessionUser);

    if (sessionUser) {
      await ensureSenderProfile(sessionUser);
    }

    return sessionUser;
  };

  const registerWithEmail = async (
    fullName: string,
    email: string,
    password: string
  ): Promise<User | null> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: 'https://holdyou.app/confirmed?source=email',
      },
    });

    if (error) throw error;

    // ⚠️ при signUp session может быть null до подтверждения — это нормально
    const sessionUser = data.session?.user ?? null;
    setUser(sessionUser);

    if (sessionUser) {
      await ensureSenderProfile(sessionUser);
    }

    return data.user ?? null;
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://holdyou.app/auth/reset-password',
    });

    if (error) throw error;
  };

  const logout = async (): Promise<void> => {
    const currentUserId = user?.id;
    await supabase.auth.signOut();
    if (currentUserId) {
      try {
        await AsyncStorage.removeItem(
          `${SENDER_PROFILE_STORAGE_KEY}_${currentUserId}`
        );
      } catch {}
    }
    setUser(null);
  };

  // ======================
  // OAUTH (APPLE / GOOGLE)
  // ======================
  const completeOAuth = async (provider: 'apple' | 'google') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: 'https://holdyou.app/auth/callback',
      },
    });

    if (error) {
      console.warn(`${provider} OAuth error`, error);
      throw error;
    }

    if (!data?.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, appReturnUrl);

    if (result.type === 'success' && result.url) {
      await handleAuthCallbackUrl(result.url);
    }
  };

  const signInWithApple = async () => {
    if (Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple Sign-In failed: no identity token');
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;

      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        await ensureSenderProfile(sessionUser);
      }

      const fullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (fullName && sessionUser) {
        await supabase.auth.updateUser({ data: { full_name: fullName } });
        await refreshUser();
      }
    } else {
      await completeOAuth('apple');
    }
  };

  const signInWithGoogle = async () => {
    const isExpoGo = Constants.appOwnership === 'expo';
    const useNative =
      !isExpoGo &&
      (Platform.OS === 'ios' || Platform.OS === 'android') &&
      GOOGLE_WEB_CLIENT_ID.length > 0 &&
      (Platform.OS !== 'ios' || GOOGLE_IOS_CLIENT_ID.length > 0);

    if (!useNative) {
      await completeOAuth('google');
      return;
    }

    try {
      const mod = require('@react-native-google-signin/google-signin');
      const GoogleSignin = mod?.GoogleSignin ?? mod?.default;

      if (!GoogleSignin) {
        await completeOAuth('google');
        return;
      }

      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        ...(Platform.OS === 'ios' &&
          GOOGLE_IOS_CLIENT_ID.length > 0 && {
            iosClientId: GOOGLE_IOS_CLIENT_ID,
          }),
      });

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }

      const response = await GoogleSignin.signIn();
      if (response.type === 'cancelled') return;

      if (response.type !== 'success' || !response.data?.idToken) {
        throw new Error('Google Sign-In failed: no id token');
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });

      if (error) throw error;

      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        await ensureSenderProfile(sessionUser);
      }
    } catch (e) {
      console.warn('google sign-in error (fallback to web OAuth)', e);
      await completeOAuth('google');
    }
  };

  const isEmailConfirmed = calcIsEmailConfirmed(user);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      isAuthenticated: !!user,
      isEmailConfirmed,
      loginWithEmail,
      registerWithEmail,
      sendPasswordReset,
      logout,
      refreshUser,
      signInWithApple,
      signInWithGoogle,
    }),
    [user, authLoading, isEmailConfirmed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
