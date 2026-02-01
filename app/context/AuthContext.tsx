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
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';

// Web Client ID — OAuth 2.0 Client ID типа "Web application". Нужен для id_token.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
// iOS Client ID — OAuth 2.0 Client ID типа "iOS". Нужен для нативного Sign In на iOS.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

WebBrowser.maybeCompleteAuthSession();

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

  // ✅ защита от двойной обработки callback (cold start + event / двойной редирект)
  const isExchangingRef = useRef(false);

  // ======================
  // INIT SESSION
  // ======================
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;
        setUser(session?.user ?? null);
      } catch (e) {
        console.warn('getSession error', e);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
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
  // OAUTH CALLBACK HANDLER
  // ======================
  const handleOAuthUrl = async (url: string) => {
    if (!url) return;

    // ВАЖНО: отсекаем всё, что не наш callback
    // holdyou://auth/callback?code=...
    const parsed = Linking.parse(url);

    const fullPath = [parsed.hostname, parsed.path]
      .filter(Boolean)
      .join('/')
      .replace(/^\/+/, '') // убираем ведущие слэши
      .toLowerCase();

    if (!fullPath.startsWith('auth/callback')) return;

    // защита от дублей
    if (isExchangingRef.current) {
      console.log('[OAuth] skip duplicate callback while exchanging');
      return;
    }

    isExchangingRef.current = true;

    try {
      console.log('[OAuth] callback url:', url);
      console.log('[OAuth] parsed:', {
        hostname: parsed.hostname,
        path: parsed.path,
        fullPath,
        queryParams: parsed.queryParams,
      });

      // Если прилетел пустой callback без code — нет смысла продолжать
      const code =
        (parsed.queryParams?.code as string | undefined) ??
        (parsed.queryParams?.authorization_code as string | undefined);
      if (!code) {
        console.warn('[OAuth] callback without code, skip');
        return;
      }

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(url);
      if (exErr) {
        console.warn('[OAuth] exchangeCodeForSession error', exErr);
        throw exErr;
      }

      await refreshUser();
      console.log('[OAuth] session exchanged + user refreshed');
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
        if (cancelled) return;
        if (initialUrl) {
          await handleOAuthUrl(initialUrl);
        }
      } catch (e) {
        console.warn('[OAuth] getInitialURL/handle error', e);
      }
    })();

    // runtime events
    const sub = Linking.addEventListener('url', async ({ url }) => {
      try {
        await handleOAuthUrl(url);
      } catch (e) {
        console.warn('[OAuth] event handle error', e);
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
      console.warn('loginWithEmail error', error.message);
      return null;
    }

    setUser(data.user ?? null);
    return data.user ?? null;
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

    setUser(data.user ?? null);
    return data.user ?? null;
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://holdyou.app/auth/reset-password',
    });

    if (error) throw error;
  };

  const logout = async (): Promise<void> => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // ======================
  // OAUTH (APPLE / GOOGLE)
  // ======================
  const completeOAuth = async (provider: 'apple' | 'google') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Веб-мост. Supabase при редиректе на кастомный URL не отдаёт state (баг/ограничение).
        redirectTo: 'https://holdyou.app/auth/callback',
      },
    });

    if (error) {
      console.warn(`${provider} OAuth error`, error);
      throw error;
    }

    if (!data?.url) return;

    console.log('[OAuth] auth url:', data.url);
    console.log('[OAuth] returnUrl(app):', appReturnUrl);

    const result = await WebBrowser.openAuthSessionAsync(data.url, appReturnUrl);

    console.log('[OAuth] browser result:', result);

    // На iOS обычно сюда прилетает уже deep link holdyou://auth/callback?...
    if (result.type === 'success' && result.url) {
      await handleOAuthUrl(result.url);
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
      setUser(data.user ?? null);
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (fullName && data.user) {
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
      setUser(data.user ?? null);
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
