// app/auth/reset-password.tsx
import React, { useEffect, useMemo, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabaseClient';

type Phase = 'boot' | 'ready' | 'saving' | 'done' | 'error';

type Params = {
  code?: string;
  access_token?: string;
  refresh_token?: string;
  type?: string;
};

function parseTokensFromUrl(url: string): {
  access_token?: string;
  refresh_token?: string;
  type?: string;
  code?: string;
} {
  // url can be:
  // holdyou://auth/reset-password?access_token=...&refresh_token=...&type=recovery
  // https://holdyou.app/auth/reset-password#access_token=...&refresh_token=...&type=recovery
  // https://holdyou.app/auth/reset-password?code=...

  const out: any = {};

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

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<Params>();

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

  const canSave =
    newPassword.length >= MIN_PASSWORD_LEN && newPassword === confirmPassword;

  async function openRecoverySession(payload: {
    access_token?: string;
    refresh_token?: string;
    type?: string;
    code?: string;
  }) {
    setPhase('boot');
    setErrorMessage(null);

    const { access_token, refresh_token, type, code } = payload;

    console.log('=== APP: reset payload ===');
    console.log({ access_token: !!access_token, refresh_token: !!refresh_token, type, code: !!code });
    console.log('=========================');

    // ✅ MAIN PATH: tokens
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (error) {
        console.log('setSession error', error);
        setPhase('error');
        setErrorMessage(error.message || 'Could not open recovery session.');
        return;
      }

      setPhase('ready');
      return;
    }

    // ⚠️ FALLBACK: code (often fails in your scenario)
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.log('exchangeCodeForSession error', error);
        setPhase('error');
        setErrorMessage(
          error.message ||
            'Could not open recovery session. (Likely missing PKCE flow state)'
        );
        return;
      }

      setPhase('ready');
      return;
    }

    setPhase('error');
    setErrorMessage(
      'Recovery link did not include tokens. Make sure your web page forwards access_token + refresh_token into the app.'
    );
  }

  // 1) Expo Router params (when deep link is opened and router got query)
  useEffect(() => {
    const access_token = typeof params?.access_token === 'string' ? params.access_token : undefined;
    const refresh_token = typeof params?.refresh_token === 'string' ? params.refresh_token : undefined;
    const type = typeof params?.type === 'string' ? params.type : undefined;
    const code = typeof params?.code === 'string' ? params.code : undefined;

    if (access_token || refresh_token || code) {
      openRecoverySession({ access_token, refresh_token, type, code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.access_token, params?.refresh_token, params?.type, params?.code]);

  // 2) Linking fallback (getInitialURL + runtime URL events)
  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      console.log('=== APP: onUrl ===');
      console.log('url:', url);
      console.log('=============');

      const parsed = parseTokensFromUrl(url);
      openRecoverySession(parsed);
    };

    const sub = Linking.addEventListener('url', onUrl);

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      console.log('=== APP: getInitialURL ===');
      console.log('initialUrl:', initialUrl);
      console.log('========================');

      if (initialUrl) onUrl({ url: initialUrl });
    })();

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SAVE PASSWORD
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

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.log('updateUser password error', error);
      setPhase('error');
      setErrorMessage(error.message || 'Failed to update password.');
      return;
    }

    setPhase('done');

    setTimeout(() => {
      router.replace('/(tabs)/talk');
    }, 600);
  };

  const titleText = useMemo(() => {
    if (isBoot) return 'Preparing reset...';
    if (isDone) return 'Saved ✅';
    return 'Set a new password';
  }, [isBoot, isDone]);

  const subtitleText = useMemo(() => {
    if (isBoot) return 'Opening secure recovery session...';
    if (isDone) return 'Your password has been updated.';
    return 'Enter a new password and confirm it.';
  }, [isBoot, isDone]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{titleText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>

          {isBoot && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#00B8D9" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}

          {!isBoot && !isDone && phase === 'ready' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New password</Text>
                <TextInput
                  style={styles.inputField}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
                <Text style={styles.helperText}>
                  At least {MIN_PASSWORD_LEN} characters
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm new password</Text>
                <TextInput
                  style={styles.inputField}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
                {passwordsMismatch && (
                  <Text style={[styles.helperText, styles.helperTextError]}>
                    Passwords do not match
                  </Text>
                )}
              </View>

              <Pressable
                onPress={handleSave}
                disabled={!canSave || isSaving}
                style={styles.modalPrimaryButton}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#00B8D9" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save</Text>
                )}
              </Pressable>
            </>
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
  modalTitle: { color: '#fff', fontSize: 20, textAlign: 'center' },
  subtitle: {
    color: '#fff',
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 12 },
  inputLabel: { color: '#fff', marginBottom: 4 },
  inputField: { backgroundColor: '#AEACAC', padding: 10, borderRadius: 4 },
  helperText: { color: '#ccc', fontSize: 12 },
  helperTextError: { color: '#ff6b6b' },
  modalPrimaryButton: {
    marginTop: 12,
    padding: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    alignItems: 'center',
  },
  modalPrimaryText: { color: '#fff' },
  errorText: { color: '#ff6b6b', textAlign: 'center', marginTop: 12 },
  centerRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 10,
  },
  loadingText: { color: '#fff' },
});
