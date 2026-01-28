// app/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabaseClient';

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
  registerWithEmail: (fullName: string, email: string, password: string) => Promise<User | null>;
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

  // ВАЖНО: фиксируем кастом-схему, чтобы редирект был holdyou://...
  const oauthRedirectUrl = useMemo(
    () => Linking.createURL('auth/callback', { scheme: 'holdyou' }),
    []
  );

  // ======================
  // INIT SESSION
  // ======================
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        setUser(session?.user ?? null);
      } catch (e) {
        console.warn('getSession error', e);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ======================
  // OAUTH CALLBACK HANDLER
  // (на случай cold start и на случай event)
  // ======================
  const handleOAuthUrl = async (url: string) => {
    try {
      const parsed = Linking.parse(url);
      const path = (parsed.path || '').replace(/^\/+/, '').toLowerCase();

      // Ловим holdyou://auth/callback?code=...
      if (!path.startsWith('auth/callback')) return;

      console.log('[OAuth] callback url:', url);

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(url);
      if (exErr) {
        console.warn('[OAuth] exchangeCodeForSession error', exErr);
        throw exErr;
      }

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        console.warn('[OAuth] getUser after exchange error', userErr);
        throw userErr;
      }

      setUser(data.user ?? null);
    } catch (e) {
      console.warn('[OAuth] handleOAuthUrl error', e);
      throw e;
    }
  };

  useEffect(() => {
    // 1) cold start
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleOAuthUrl(initialUrl);
      }
    })();

    // 2) runtime events
    const sub = Linking.addEventListener('url', async ({ url }) => {
      await handleOAuthUrl(url);
    });

    return () => sub.remove();
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
  // EMAIL AUTH
  // ======================
  const loginWithEmail = async (email: string, password: string): Promise<User | null> => {
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
        redirectTo: oauthRedirectUrl,
      },
    });

    if (error) {
      console.warn(`${provider} OAuth error`, error);
      throw error;
    }

    if (!data?.url) return;

    // КЛЮЧЕВО: смотри тут redirect_to
    console.log('[OAuth] auth url:', data.url);
    console.log('[OAuth] redirectTo:', oauthRedirectUrl);

    const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectUrl);

    console.log('[OAuth] browser result:', result);

    // Если iOS вернул success + url — обработаем сразу
    if (result.type === 'success' && result.url) {
      await handleOAuthUrl(result.url);
      await refreshUser();
    }
  };

  const signInWithApple = async () => completeOAuth('apple');
  const signInWithGoogle = async () => completeOAuth('google');

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
