// app/(reset)/reset-password.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase, supabaseRecovery } from '../lib/supabaseClient';

const LAST_RECOVERY_URL_KEY = 'holdyou.lastRecoveryUrl';
const SESSION_OPEN_TIMEOUT_MS = 15000;

type Phase = 'boot' | 'ready' | 'saving' | 'done' | 'error';

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
  } catch {}

  return out;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<Params>();
  const openingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('boot');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const MIN_PASSWORD_LEN = 6;

  const isBoot = phase === 'boot';
  const isSaving = phase === 'saving';
  const isDone = phase === 'done';

  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const passwordTooShort =
    newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LEN;

  const canSave =
    newPassword.length >= MIN_PASSWORD_LEN && newPassword === confirmPassword;

  async function openRecoverySession(payload: Params) {
    if (openingRef.current) return;
    openingRef.current = true;
    setPhase('boot');
    setErrorMessage(null);

    const { access_token, refresh_token, code } = payload;

    console.log('=== RESET FLOW PAYLOAD ===');
    console.log({
      access_token: !!access_token,
      refresh_token: !!refresh_token,
      code: !!code,
    });
    console.log('=========================');

    try {
      // MAIN PATH — tokens: используем supabaseRecovery (persistSession: false),
      // чтобы не зависать на основном клиенте при recovery-токенах (известная проблема RN).
      if (access_token && refresh_token) {
        const setSessionPromise = supabaseRecovery.auth.setSession({
          access_token,
          refresh_token,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('SESSION_TIMEOUT')),
            SESSION_OPEN_TIMEOUT_MS
          )
        );
        const { error } = await Promise.race([setSessionPromise, timeoutPromise]);

        if (error) {
          setPhase('error');
          setErrorMessage(error.message);
          return;
        }
        setPhase('ready');
        return;
      }

      // FALLBACK — code (вторичен)
      if (code) {
        const exchangePromise = supabaseRecovery.auth.exchangeCodeForSession(code);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SESSION_TIMEOUT')), SESSION_OPEN_TIMEOUT_MS)
        );
        const { error } = await Promise.race([exchangePromise, timeoutPromise]);

        if (error) {
          setPhase('error');
          setErrorMessage(error.message);
          return;
        }
        setPhase('ready');
        return;
      }

      setPhase('error');
      setErrorMessage('Invalid recovery link');
    } catch (e) {
      const msg = e instanceof Error && e.message === 'SESSION_TIMEOUT'
        ? 'Connection timed out. Check your network and try again.'
        : (e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
      setErrorMessage(msg);
    } finally {
      openingRef.current = false;
    }
  }

  // Router params
  useEffect(() => {
    if (params?.access_token || params?.refresh_token || params?.code) {
      openRecoverySession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
        type: params.type,
        code: params.code,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.access_token, params?.refresh_token, params?.type, params?.code]);

  // AsyncStorage + Linking: сначала читаем URL, сохранённый Guard'ом, используем и чистим ключ
  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      const parsed = parseTokensFromUrl(url);
      openRecoverySession(parsed);
    };

    const sub = Linking.addEventListener('url', onUrl);

    (async () => {
      const stored = await AsyncStorage.getItem(LAST_RECOVERY_URL_KEY);
      if (stored) {
        await AsyncStorage.removeItem(LAST_RECOVERY_URL_KEY);
        onUrl({ url: stored });
        return;
      }
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) onUrl({ url: initialUrl });
    })();

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setErrorMessage(null);

    if (newPassword.length < MIN_PASSWORD_LEN) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setPhase('saving');

    // Сессия восстановления живёт в supabaseRecovery; обновляем пароль там.
    const { data, error } = await supabaseRecovery.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPhase('error');
      setErrorMessage(error.message);
      return;
    }

    // Переносим новую сессию в основной клиент, чтобы пользователь остался залогинен.
    if (data?.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token ?? '',
      });
    }

    setPhase('done');
  };

  const titleText = useMemo(() => {
    if (isBoot) return 'Preparing reset...';
    if (isDone) return 'Password updated ✅';
    return 'Set a new password';
  }, [isBoot, isDone]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{titleText}</Text>

          {isBoot && (
            <View style={styles.centerRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          )}

          {phase === 'ready' && (
            <>
              <TextInput
                placeholder="New password"
                placeholderTextColor="#999"
                secureTextEntry
                style={styles.inputField}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              {passwordTooShort && (
                <Text style={styles.errorText}>
                  Password must be at least {MIN_PASSWORD_LEN} characters
                </Text>
              )}

              <TextInput
                placeholder="Confirm password"
                placeholderTextColor="#999"
                secureTextEntry
                style={styles.inputField}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {passwordsMismatch && (
                <Text style={styles.errorText}>Passwords do not match</Text>
              )}

              <Pressable
                onPress={handleSave}
                disabled={!canSave || isSaving}
                style={styles.modalPrimaryButton}
              >
                {isSaving ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save</Text>
                )}
              </Pressable>
            </>
          )}

          {isDone && (
            <Pressable
              onPress={() => router.replace('/onboarding/Login' as any)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryText}>Go to login</Text>
            </Pressable>
          )}

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: 304,
    padding: 24,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  inputField: {
    backgroundColor: '#AEACAC',
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  modalPrimaryButton: {
    marginTop: 12,
    padding: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    alignItems: 'center',
  },
  modalPrimaryText: { color: '#fff' },
  errorText: { color: '#ff6b6b', textAlign: 'center', marginTop: 10 },
  centerRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  loadingText: { color: '#fff' },
});
