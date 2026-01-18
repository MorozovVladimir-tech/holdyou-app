// app/auth/confirmed.tsx
import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabaseClient';

type Phase = 'boot' | 'done' | 'error';

export default function ConfirmedScreen() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        // после подтверждения на вебе — просим Supabase обновить сессию/юзера
        await supabase.auth.refreshSession();

        if (!isMounted) return;
        setPhase('done');

        // уводим внутрь
        setTimeout(() => {
          router.replace('/(tabs)/talk');
        }, 250);
      } catch (e: any) {
        if (!isMounted) return;
        setPhase('error');
        setErrorMessage(e?.message || 'Could not refresh session. Please try again.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const titleText =
    phase === 'boot' ? 'Confirming...' : phase === 'done' ? 'Confirmed ✅' : 'Confirmation';
  const subtitleText =
    phase === 'boot'
      ? 'Signing you in securely...'
      : phase === 'done'
      ? 'Redirecting you into the app…'
      : 'Something went wrong.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{titleText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>

          {phase === 'boot' && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#00B8D9" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}

          {phase === 'error' && !!errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
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
    minHeight: 240,
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
  errorText: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '500',
    color: '#ff6b6b',
    textAlign: 'center',
  },
});
