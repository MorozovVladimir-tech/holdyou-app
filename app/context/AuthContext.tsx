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
        await new Promise(resolve => setTimeout(resolve, 250));

        if (!isMounted) return;

        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        for (const delayMs of [200, 400]) {
          if (session) break;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          if (!isMounted) return;
          const next = await supabase.auth.getSession();
          session = next.data.session;
        }

        const uid = session?.user?.id ?? null;
        const uEmail = (session?.user as any)?.email ?? null;
        console.log('[Auth] init getSession: hasSession=', !!session, 'userId=', uid ?? 'null', 'email=', uEmail ?? 'null');
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
      // INITIAL_SESSION — сессия подгружена из storage при старте клиента
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
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
  const handleAuthCallbackUrl = async (url: string) => {
    if (!url) return;

    const parsed = Linking.parse(url);

    const fullPath = [parsed.hostname, parsed.path]
      .filter(Boolean)
      .join('/')
      .replace(/^\/+/, '')
      .toLowerCase();

    // holdyou:/// или пустой path — не обрабатываем как callback (DeepLinkGate перенаправит)
    if (!fullPath || fullPath === '/') return;
    if (!fullPath.startsWith('auth/callback')) return;

    const hasTokens = !!(parsed.queryParams?.access_token && parsed.queryParams?.refresh_token);
    console.log('[Auth] callback URL path=', fullPath, 'hasTokens=', hasTokens);

    if (isExchangingRef.current) {
      console.log('[Auth] skip duplicate callback');
      return;
    }
    isExchangingRef.current = true;

    try {
      const q = parsed.queryParams || {};
      const accessToken = (q.access_token as string) ?? '';
      const refreshToken = (q.refresh_token as string) ?? '';
      const code =
        (q.code as string) ?? (q.authorization_code as string) ?? '';

      // Подтверждение почты: Supabase редиректит с access_token и refresh_token в hash → веб пробрасывает в query
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          console.warn('[Auth] setSession error', error);
          return;
        }
        setUser(data.session?.user ?? null);
        const refreshed = await refreshUser();
        if (refreshed) await ensureSenderProfile(refreshed);
        await supabase.auth.getSession();
        console.log('[Auth] email confirm done: userId=', refreshed?.id ?? 'null', 'email=', (refreshed as any)?.email ?? 'null');
        return;
      }

      // OAuth: code exchange
      if (!code) {
        console.warn('[Auth] callback without code or tokens, skip');
        return;
      }

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(url);
      if (exErr) {
        console.warn('[Auth] exchangeCodeForSession error', exErr);
        throw exErr;
      }

      const refreshed = await refreshUser();
      if (refreshed) await ensureSenderProfile(refreshed);
      console.log('[Auth] OAuth session exchanged');
    } finally {
      isExchangingRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    // cold start
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log('[Auth] getInitialURL=', initialUrl ? initialUrl.substring(0, 60) + '...' : 'null');
        if (cancelled) return;
        if (initialUrl) {
          await handleAuthCallbackUrl(initialUrl);
        }
      } catch (e) {
        console.warn('[Auth] getInitialURL/handle error', e);
      }
    })();

    // runtime events
    const sub = Linking.addEventListener('url', async ({ url }) => {
      try {
        await handleAuthCallbackUrl(url);
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
      console.warn('[Auth] loginWithEmail error:', error.message, 'status=', (error as any).status);
      return null;
    }

    // ✅ берём юзера строго из session (реальная сессия)
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

    // ⚠️ При подтверждении email session может быть null — не делаем фейковый логин
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
        await AsyncStorage.removeItem(`${SENDER_PROFILE_STORAGE_KEY}_${currentUserId}`);
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

      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
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
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
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
