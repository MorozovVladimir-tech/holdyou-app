// app/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

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

  // true если есть юзер в сессии (даже если он не подтвердил email)
  isAuthenticated: boolean;

  // true если email подтвержден
  isEmailConfirmed: boolean;

  loginWithEmail: (email: string, password: string) => Promise<User | null>;
  registerWithEmail: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<User | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;

  // чтобы после “I’ve confirmed” проверить актуальный статус подтверждения
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) console.warn('getSession error', error);
        if (!isMounted) return;

        setUser(session?.user ?? null);
      } catch (error) {
        console.warn('Unexpected getSession error', error);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshUser = async (): Promise<User | null> => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn('refreshUser error', error);
      throw error;
    }
    setUser(data.user ?? null);
    return data.user ?? null;
  };

  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<User | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.warn('loginWithEmail error', error);
      throw error;
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
      email,
      password,
      options: {
        data: { full_name: fullName },

        // ✅ ВАЖНО: именно это заставит письмо после подтверждения
        // редиректить на /confirmed, а не на корень сайта.
        emailRedirectTo: 'https://holdyou.app/confirmed',
      },
    });

    if (error) {
      console.warn('registerWithEmail error', error);
      throw error;
    }

    // При включенном Confirm Email user может быть null — это нормально.
    setUser(data.user ?? null);
    return data.user ?? null;
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    // Пока оставляем как есть, но потом лучше привести к /reset и добавить в Redirect URLs.
    const redirectTo = 'https://holdyou.app/auth/reset-password';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.warn('sendPasswordReset error', error);
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('logout error', error);
      throw error;
    }
    setUser(null);
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
    }),
    [user, authLoading, isEmailConfirmed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
