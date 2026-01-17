// app/auth/confirmed.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabaseClient';

type Phase = 'boot' | 'done' | 'error';

export default function ConfirmedScreen() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isBoot = phase === 'boot';
  const isDone = phase === 'done';

  const buildCallbackUrlForSupabase = (incomingUrl: string) => {
    // incomingUrl: holdyou://auth/confirmed?... (или без ?)
    const qIndex = incomingUrl.indexOf('?');
    const rawAfterQ = qIndex >= 0 ? incomingUrl.slice(qIndex + 1) : '';

    let decoded = rawAfterQ;
    try {
      decoded = decodeURIComponent(rawAfterQ);
    } catch {
      // ignore
    }

    const base = 'https://holdyou.app/confirmed';

    if (!decoded) return base;

    if (decoded.includes('#')) {
      const cleaned = decoded.replace(/^#/, '');
      return `${base}#${cleaned}`;
    }

    return `${base}?${decoded.replace(/^\?/, '')}`;
  };

  const handleIncomingConfirmedLink = async (url: string) => {
    setErrorMessage(null);

    try {
      const callbackUrl = buildCallbackUrlForSupabase(url);

      const { error } = await supabase.auth.exchangeCodeForSession(callbackUrl);

      if (error) {
        console.log('exchangeCodeForSession error', error);
        setPhase('error');
        setErrorMessage(error.message || 'Could not confirm session. Please open the link again.');
        return;
      }

      setPhase('done');

      setTimeout(() => {
        router.replace('/(tabs)/talk');
      }, 400);
    } catch (e: any) {
      console.log('handleIncomingConfirmedLink unexpected error', e);
      setPhase('error');
      setErrorMessage(e?.message || 'Could not process confirmation link. Please try again.');
    }
  };

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (url.startsWith('holdyou://auth/confirmed')) {
        setPhase('boot');
        handleIncomingConfirmedLink(url);
      }
    };

    const sub = Linking.addEventListener('url', onUrl);

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.startsWith('holdyou://auth/confirmed')) {
          await handleIncomingConfirmedLink(initialUrl);
          return;
        }

        // если открыли экран руками — просто пойдём в приложение
        setPhase('done');
        setTimeout(() => router.replace('/(tabs)/talk'), 300);
      } catch {
        setPhase('done');
        setTimeout(() => router.replace('/(tabs)/talk'), 300);
      }
    })();

    return () => sub.remove();
  }, []);

  const titleText = useMemo(() => {
    if (isBoot) return 'Confirming...';
    if (isDone) return 'Confirmed ✅';
    return 'Confirmation';
  }, [isBoot, isDone]);

  const subtitleText = useMemo(() => {
    if (isBoot) return 'Signing you in securely...';
    if (isDone) return 'Redirecting you into the app…';
    return 'Something went wrong.';
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

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {!isBoot && !isDone && (
            <Pressable
              onPress={() => router.replace('/(tabs)/talk')}
              style={({ pressed }) => [styles.modalPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.modalPrimaryText}>Open app</Text>
            </Pressable>
          )}

          {phase === 'error' && (
            <Pressable
              onPress={() => router.replace('/(tabs)/talk')}
              style={({ pressed }) => [styles.modalSecondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.modalSecondaryText}>Back</Text>
            </Pressable>
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
    minHeight: 260,
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
  centerRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.8,
  },
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
  errorText: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '500',
    color: '#ff6b6b',
    textAlign: 'center',
  },
});
