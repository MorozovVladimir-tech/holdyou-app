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
import { router } from 'expo-router';
import { supabase } from '../lib/supabaseClient';

type Phase = 'boot' | 'ready' | 'saving' | 'done' | 'error' | 'needs_link';

export default function ResetPasswordScreen() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const MIN_PASSWORD_LEN = 6;

  const isBoot = phase === 'boot';
  const isSaving = phase === 'saving';
  const isDone = phase === 'done';
  const needsLink = phase === 'needs_link';

  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const passwordTooShort =
    newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LEN;

  const canSave =
    newPassword.length >= MIN_PASSWORD_LEN && newPassword === confirmPassword;

  const normalizeHoldYouUrl = (url: string) => {
    // приводим holdyou:///auth/... -> holdyou://auth/...
    if (url.startsWith('holdyou:///')) return url.replace('holdyou:///', 'holdyou://');
    // на всякий случай: holdyou:/auth/... -> holdyou://auth/...
    if (url.startsWith('holdyou:/') && !url.startsWith('holdyou://')) {
      return url.replace('holdyou:/', 'holdyou://');
    }
    return url;
  };

  const isResetDeepLink = (url: string) => {
    const u = normalizeHoldYouUrl(url);
    return u.startsWith('holdyou://auth/reset-password');
  };

  const buildCallbackUrlForSupabase = (incomingUrl: string) => {
    const normalized = normalizeHoldYouUrl(incomingUrl);

    // incomingUrl: holdyou://auth/reset-password?ENCODED_PAYLOAD
    const qIndex = normalized.indexOf('?');
    const rawAfterQ = qIndex >= 0 ? normalized.slice(qIndex + 1) : '';

    let decoded = rawAfterQ;
    try {
      decoded = decodeURIComponent(rawAfterQ);
    } catch {
      // ignore
    }

    const base = 'https://holdyou.app/auth/reset-password';

    if (!decoded) return base;

    if (decoded.includes('#')) {
      const cleaned = decoded.replace(/^#/, '');
      return `${base}#${cleaned}`;
    }

    return `${base}?${decoded.replace(/^\?/, '')}`;
  };

  const handleIncomingResetLink = async (url: string) => {
    setErrorMessage(null);

    try {
      const callbackUrl = buildCallbackUrlForSupabase(url);

      const { error } = await supabase.auth.exchangeCodeForSession(callbackUrl);

      if (error) {
        console.log('exchangeCodeForSession error', error);
        setPhase('error');
        setErrorMessage(
          error.message ||
            'Could not open recovery session. Please open the link again.'
        );
        return;
      }

      setPhase('ready');
    } catch (e: any) {
      console.log('handleIncomingResetLink unexpected error', e);
      setPhase('error');
      setErrorMessage(
        e?.message || 'Could not process recovery link. Please try again.'
      );
    }
  };

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (isResetDeepLink(url)) {
        setPhase('boot');
        handleIncomingResetLink(url);
      }
    };

    const sub = Linking.addEventListener('url', onUrl);

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();

        if (initialUrl && isResetDeepLink(initialUrl)) {
          await handleIncomingResetLink(initialUrl);
          return;
        }

        // Если открыли экран без токена — НЕ показываем форму (иначе будет Auth session missing)
        setPhase('needs_link');
        setErrorMessage('Open this screen only from the password reset email link.');
      } catch {
        setPhase('needs_link');
        setErrorMessage('Open this screen only from the password reset email link.');
      }
    })();

    return () => sub.remove();
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

    try {
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
    } catch (e: any) {
      console.log('update password unexpected error', e);
      setPhase('error');
      setErrorMessage(e?.message || 'Failed to update password.');
    }
  };

  const titleText = useMemo(() => {
    if (isBoot) return 'Preparing reset...';
    if (isDone) return 'Saved ✅';
    if (needsLink) return 'Set a new password';
    return 'Set a new password';
  }, [isBoot, isDone, needsLink]);

  const subtitleText = useMemo(() => {
    if (isBoot) return 'Opening secure recovery session...';
    if (isDone) return 'Your password has been updated.';
    if (needsLink) return 'Enter a new password and confirm it.';
    return 'Enter a new password and confirm it.';
  }, [isBoot, isDone, needsLink]);

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

          {/* Показываем форму ТОЛЬКО если есть сессия (phase === ready / saving) */}
          {!isBoot && !isDone && phase === 'ready' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New password</Text>
                <TextInput
                  style={styles.inputField}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="**********"
                  placeholderTextColor="#4C4949"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Text
                  style={[
                    styles.helperText,
                    passwordTooShort && styles.helperTextError,
                  ]}
                >
                  At least {MIN_PASSWORD_LEN} characters
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm new password</Text>
                <TextInput
                  style={styles.inputField}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="**********"
                  placeholderTextColor="#4C4949"
                  secureTextEntry
                  autoCapitalize="none"
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
                style={({ pressed }) => [
                  styles.modalPrimaryButton,
                  (pressed || isSaving) && styles.pressed,
                  (!canSave || isSaving) && { opacity: 0.6 },
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#00B8D9" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.modalSecondaryButton,
                  pressed && styles.pressed,
                  isSaving && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.modalSecondaryText}>Back</Text>
              </Pressable>
            </>
          )}

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {isDone && (
            <Text style={styles.doneHint}>Redirecting you into the app…</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: 304,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 32,
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    minHeight: 360,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: '#FFFFFF',
    opacity: 0.82,
    textAlign: 'center',
    marginBottom: 14,
  },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#FFFFFF', marginBottom: 6 },
  inputField: {
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#AEACAC',
    color: '#111111',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: { marginTop: 6, fontSize: 12, fontWeight: '500', color: '#FFFFFF', opacity: 0.7 },
  helperTextError: { color: '#ff6b6b', opacity: 1 },
  modalPrimaryButton: {
    marginTop: 8,
    height: 38,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  modalPrimaryText: { fontSize: 16, fontWeight: '500', color: '#FFFFFF' },
  modalSecondaryButton: {
    marginTop: 12,
    height: 38,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: { fontSize: 16, fontWeight: '500', color: '#FFFFFF' },
  pressed: { opacity: 0.8 },
  errorText: { marginTop: 14, fontSize: 12, fontWeight: '500', color: '#ff6b6b', textAlign: 'center' },
  centerRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '500', color: '#FFFFFF', opacity: 0.8 },
  doneHint: { marginTop: 10, fontSize: 12, fontWeight: '500', color: '#FFFFFF', opacity: 0.7, textAlign: 'center' },
});
