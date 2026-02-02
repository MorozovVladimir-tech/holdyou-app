// app/(tabs)/about.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

// ✅ правильный маршрут до экрана логина в папке onboarding
const LOGIN_ROUTE = '/onboarding/Login' as const;

// ✅ Product ID из App Store Connect (оставляем — пригодится при подключении IAP)
const SUBSCRIPTION_PRODUCT_ID = 'holdyou_plus_monthly';

// ✅ Триал (дни)
const TRIAL_DAYS = 5;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

type AccessState =
  | 'loading'
  | 'trial_active'
  | 'trial_expired'
  | 'sub_active'
  | 'sub_inactive';

export default function AboutScreen() {
  const { user, logout } = useAuth();

  const [nextNotifications, setNextNotifications] = useState<string | null>(null);

  // Supabase subscription/trial data
  const [subStatusRaw, setSubStatusRaw] = useState<'free' | 'active'>('free');
  const [subExpiresAt, setSubExpiresAt] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  // UI/loading/errors
  const [isLoadingSub, setIsLoadingSub] = useState<boolean>(true);
  const [subError, setSubError] = useState<string | null>(null);

  const [isPrivacyVisible, setIsPrivacyVisible] = useState<boolean>(false);
  const [isTermsVisible, setIsTermsVisible] = useState<boolean>(false);

  // IAP state (пока не подключено — держим, чтобы UI не ломать)
  const [iapReady] = useState<boolean>(false);
  const [iapLoading, setIapLoading] = useState<boolean>(false);

  // ---------------------------
  // Notifications schedule
  // ---------------------------
  useEffect(() => {
    if (!user?.id) {
      setNextNotifications(null);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from('notification_schedules')
          .select('hour, minute, label')
          .eq('user_id', user.id)
          .order('hour', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          const times = data.map((row: { hour: number; minute: number; label?: string | null }) => {
            const period = row.hour >= 12 ? 'PM' : 'AM';
            let displayHour = row.hour % 12;
            if (displayHour === 0) displayHour = 12;
            const minuteStr = row.minute.toString().padStart(2, '0');
            return `${displayHour}:${minuteStr} ${period}`;
          });
          setNextNotifications(times.join(', '));
        } else {
          setNextNotifications(null);
        }
      } catch (error) {
        console.warn('Failed to load notification schedule', error);
        setNextNotifications(null);
      }
    })();
  }, [user?.id]);

  // ---------------------------
  // Load subscription/trial from Supabase
  // ---------------------------
  useEffect(() => {
    let isMounted = true;

    async function loadSubscription() {
      if (!user) {
        setIsLoadingSub(false);
        return;
      }

      setIsLoadingSub(true);
      setSubError(null);

      try {
        const { data, error } = await supabase
          .from('sender_profiles')
          .select('subscription_status, subscription_expires_at, trial_ends_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        // If no record or no trial_ends_at => set trial based on created_at (once)
        const createdAt = user.created_at ? new Date(user.created_at) : new Date();
        const defaultTrialEnds = new Date(
          createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
        );

        const resolvedTrialEndsAt = data?.trial_ends_at ?? defaultTrialEnds.toISOString();

        // Upsert trial_ends_at if missing (safe)
        if (!data?.trial_ends_at) {
          const { error: upsertErr } = await supabase
            .from('sender_profiles')
            .upsert(
              {
                user_id: user.id,
                trial_ends_at: resolvedTrialEndsAt,
                // keep subscription fields as-is if row exists
              },
              { onConflict: 'user_id' }
            );
          if (upsertErr) console.warn('Failed to upsert trial_ends_at', upsertErr);
        }

        if (isMounted) {
          setTrialEndsAt(resolvedTrialEndsAt);

          const isActive = data?.subscription_status === 'active';
          setSubStatusRaw(isActive ? 'active' : 'free');
          setSubExpiresAt(data?.subscription_expires_at ?? null);
        }
      } catch (err: unknown) {
        console.warn('Failed to load subscription', err);
        const msg = err instanceof Error ? err.message : 'Failed to load subscription status.';
        if (isMounted) setSubError(msg);
      } finally {
        if (isMounted) setIsLoadingSub(false);
      }
    }

    loadSubscription();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // ---------------------------
  // Derived access state
  // ---------------------------
  const accessState: AccessState = useMemo(() => {
    if (isLoadingSub) return 'loading';

    const now = new Date();

    // Subscription active?
    if (subStatusRaw === 'active') {
      if (!subExpiresAt) return 'sub_active';
      const exp = new Date(subExpiresAt);
      if (!Number.isNaN(exp.getTime()) && exp > now) return 'sub_active';
      // expired date -> treat as inactive unless trial still active
    }

    // Trial active?
    if (trialEndsAt) {
      const t = new Date(trialEndsAt);
      if (!Number.isNaN(t.getTime())) {
        if (t > now) return 'trial_active';
        return 'trial_expired';
      }
    }

    return 'sub_inactive';
  }, [isLoadingSub, subStatusRaw, subExpiresAt, trialEndsAt]);

  const trialDaysLeftText = useMemo(() => {
    if (!trialEndsAt) return null;
    const now = new Date();
    const t = new Date(trialEndsAt);
    if (Number.isNaN(t.getTime())) return null;
    const diffMs = t.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (days <= 0) return '0 days';
    return `${days} day${days === 1 ? '' : 's'}`;
  }, [trialEndsAt]);

  // ---------------------------
  // Actions
  // ---------------------------
  const handleSubscribe = async () => {
    // IAP ещё не подключён — сейчас тестируем доступ через Supabase (A/B/C)
    setSubError(
      `IAP is not connected in this build yet. For now, set subscription_status/expiry in Supabase. (${SUBSCRIPTION_PRODUCT_ID})`
    );
    Alert.alert('Subscribe', 'IAP is not connected yet in this build.');
  };

  const handleRestore = async () => {
    setSubError('Restore is not available until IAP is connected.');
    Alert.alert('Restore', 'IAP is not connected yet in this build.');
  };

  const handleManageSubscription = async () => {
    // iOS official page
    try {
      await Linking.openURL('https://apps.apple.com/account/subscriptions');
    } catch (e) {
      console.warn('open subscriptions error', e);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.warn('Failed to logout', error);
    }
    router.replace(LOGIN_ROUTE as never);
  };

  // ---------------------------
  // UI copy
  // ---------------------------
  const statusTitle = useMemo(() => {
    if (accessState === 'sub_active') return 'Active';
    if (accessState === 'trial_active') return 'Trial';
    if (accessState === 'trial_expired') return 'Expired';
    if (accessState === 'sub_inactive') return 'Free';
    return '...';
  }, [accessState]);

  const primaryButtonText = useMemo(() => {
    if (iapLoading || isLoadingSub) return '...';
    if (accessState === 'sub_active') return 'MANAGE SUBSCRIPTION';
    return 'SUBSCRIBE — $4.99 / MONTH';
  }, [accessState, iapLoading, isLoadingSub]);

  const primaryButtonAction = useMemo(() => {
    if (iapLoading || isLoadingSub) return undefined;
    if (accessState === 'sub_active') return handleManageSubscription;
    return handleSubscribe;
  }, [accessState, iapLoading, isLoadingSub]);

  const isPrimaryDisabled = useMemo(() => {
    return Boolean(iapLoading || isLoadingSub);
  }, [iapLoading, isLoadingSub]);

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <View style={styles.screen}>
      {/* HEADER — как в Sender/Talk */}
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Stay close. Even from afar.</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ACCOUNT INFO */}
        {user && (
          <View style={styles.accountBlock}>
            <Text style={styles.accountInfo}>
              Email: <Text style={styles.accountValue}>{user.email ?? 'Unknown'}</Text>
            </Text>
            <Text style={styles.accountInfo}>
              Registered: <Text style={styles.accountValue}>{formatDate(user.created_at ?? null)}</Text>
            </Text>
          </View>
        )}

        {/* SUBSCRIPTION CARD */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Subscription status:</Text>
          <Text style={styles.cardStatus}>{statusTitle}</Text>

          {/* Active */}
          {accessState === 'sub_active' && subExpiresAt && (
            <Text style={styles.cardExpires}>Active until {formatDate(subExpiresAt)}</Text>
          )}

          {/* Trial */}
          {accessState === 'trial_active' && trialEndsAt && (
            <>
              <Text style={styles.cardExpires}>Trial ends {formatDate(trialEndsAt)}</Text>
              {trialDaysLeftText && (
                <Text style={styles.trialHint}>({trialDaysLeftText} left)</Text>
              )}
            </>
          )}

          {/* Trial expired */}
          {accessState === 'trial_expired' && (
            <Text style={styles.expiredText}>Trial expired — subscribe to continue</Text>
          )}

          {/* Free */}
          {accessState === 'sub_inactive' && <Text style={styles.cardPrice}>$4.99 / month</Text>}

          <Text style={styles.cardFooter}>
            Because some voices are <Text style={styles.cardFooterAccent}>worth keeping</Text>
          </Text>

          {nextNotifications && (
            <Text style={styles.notificationTime}>Next messages: {nextNotifications}</Text>
          )}
        </View>

        {subError && <Text style={styles.errorText}>{subError}</Text>}

        {/* PRIMARY BUTTON */}
        <Pressable
          style={styles.buyButton}
          onPress={primaryButtonAction}
          disabled={isPrimaryDisabled}
        >
          <Text style={styles.buyButtonText}>{primaryButtonText}</Text>
        </Pressable>

        {/* RESTORE */}
        <Pressable
          style={styles.restoreButton}
          onPress={iapLoading || isLoadingSub ? undefined : handleRestore}
          disabled={iapLoading || isLoadingSub}
        >
          <Text style={styles.restoreButtonText}>Restore purchases</Text>
        </Pressable>

        {/* CANCEL HELP */}
        <Text style={styles.cancelHelp}>
          To cancel, open Apple Subscriptions from “Manage subscription”.
        </Text>

        {/* OUR STORY */}
        <View style={styles.storyBlock}>
          <Text style={styles.sectionTitle}>Why HoldYou exists</Text>
          <Text style={styles.storyText}>
            I spent a long time in silence after losing someone who truly believed in me. For a while it felt like
            there was no one left who would say &quot;I&apos;m here for you&quot;.
          </Text>
          <Text style={styles.storyText}>
            One day, a simple message from a friend — a few warm words of support — hit me so deeply that it reminded
            me how powerful one voice can be.
          </Text>
          <Text style={styles.storyText}>
            HoldYou was created for people who are alone, grieving, or just missing someone who can no longer write
            to them — so they can still feel that voice by their side.
          </Text>
        </View>

        {/* LEGAL / PRIVACY / TERMS */}
        <View style={styles.legalBlock}>
          <Text style={styles.sectionTitle}>Safety & legal</Text>

          <Text style={styles.legalText}>
            HoldYou is an emotional support app powered by AI. It does not provide medical advice, diagnosis, or therapy
            and cannot replace a mental health professional.
          </Text>
          <Text style={styles.legalText}>
            If you feel in danger or crisis, please contact local emergency services or a crisis hotline in your country.
          </Text>

          <View style={styles.linksRow}>
            <Pressable style={styles.linkButton} onPress={() => setIsPrivacyVisible(true)}>
              <Text style={styles.linkButtonText}>Privacy Policy</Text>
            </Pressable>

            <Pressable style={styles.linkButton} onPress={() => setIsTermsVisible(true)}>
              <Text style={styles.linkButtonText}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>

        {/* CONTACT */}
        <View style={styles.contactBlock}>
          <Text style={styles.sectionTitle}>Support</Text>
          <Text style={styles.contactText}>
            For questions, feedback or data requests, you can contact our team at:
          </Text>
          <View style={styles.supportEmailRow}>
            <Text style={styles.supportEmailIcon}>✉</Text>
            <Text style={styles.supportEmail}>support@holdyou.app</Text>
          </View>
        </View>

        {/* LOGOUT */}
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>

      {/* PRIVACY POLICY MODAL */}
      <Modal
        visible={isPrivacyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPrivacyVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Privacy Policy</Text>
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalBodyText}>
                HoldYou is an emotional support app powered by AI. We store only the minimum amount of personal data
                needed to run the service, such as your email, basic profile information and message settings.
              </Text>
              <Text style={styles.modalBodyText}>
                Your messages are processed by AI models to generate supportive responses. We may use anonymized and
                aggregated data to improve the quality and safety of the service.
              </Text>
              <Text style={styles.modalBodyText}>
                We do not sell your personal data to third parties. Data may be processed by trusted service providers
                (for example, cloud hosting or analytics) under strict confidentiality agreements.
              </Text>
              <Text style={styles.modalBodyText}>
                You can request deletion of your account and personal data by contacting support@holdyou.app. Some data
                may be stored for a limited time if required by law or for security and anti-abuse purposes.
              </Text>
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setIsPrivacyVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* TERMS OF USE MODAL */}
      <Modal
        visible={isTermsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTermsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Terms of Use</Text>
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalBodyText}>
                HoldYou is designed for emotional support and reflection. It does not provide medical advice, diagnosis,
                therapy or crisis intervention, and must not be used as a substitute for professional help.
              </Text>
              <Text style={styles.modalBodyText}>
                By using the app, you agree to be responsible for your own decisions and actions. You must not use HoldYou
                to harm yourself or others, or to share illegal, hateful or abusive content.
              </Text>
              <Text style={styles.modalBodyText}>
                We may update these Terms from time to time to improve safety or comply with legal requirements. Continued
                use of the app after changes means you accept the updated Terms.
              </Text>
              <Text style={styles.modalBodyText}>
                If you are in immediate danger or crisis, please contact local emergency services or a crisis hotline in
                your country instead of relying on the app.
              </Text>
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setIsTermsVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 0,
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  content: { flex: 1 },
  scrollContent: { paddingBottom: 32, gap: 14 },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  accountBlock: {
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 184, 217, 0.3)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  accountInfo: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 4,
  },
  accountValue: { color: '#FFFFFF', fontWeight: '600' },

  card: {
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    paddingVertical: 28,
    paddingHorizontal: 24,
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardStatus: {
    fontSize: 18,
    fontWeight: '600',
    color: '#00B8D9',
    marginBottom: 16,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  cardExpires: {
    fontSize: 13,
    fontWeight: '500',
    color: '#00B8D9',
    marginBottom: 10,
    textAlign: 'center',
  },
  trialHint: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 10,
  },
  expiredText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00B8D9',
    marginBottom: 12,
    textAlign: 'center',
  },
  cardFooter: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardFooterAccent: { color: '#FFFFFF', fontWeight: '600' },
  notificationTime: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '500',
    color: '#00B8D9',
    textAlign: 'center',
  },

  errorText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#FF6B6B',
    textAlign: 'center',
  },

  buyButton: {
    marginTop: 6,
    width: '100%',
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  buyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  restoreButton: {
    marginTop: 8,
    width: '100%',
    height: 42,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(0, 184, 217, 0.6)',
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00B8D9',
  },

  cancelHelp: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },

  storyBlock: { marginTop: 8, paddingHorizontal: 2, gap: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'left',
  },
  storyText: { fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.8)' },

  legalBlock: { marginTop: 8, paddingHorizontal: 2, gap: 8 },
  legalText: { fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.7)' },
  linksRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  linkButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
  },
  linkButtonText: { fontSize: 13, fontWeight: '500', color: '#00B8D9' },

  contactBlock: { marginTop: 12, paddingHorizontal: 2, gap: 6, alignItems: 'center' },
  contactText: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  supportEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  supportEmailIcon: { fontSize: 14, color: '#00B8D9', marginRight: 6 },
  supportEmail: { fontSize: 13, fontWeight: '600', color: '#00B8D9' },

  logoutButton: {
    marginTop: 20,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
  },
  logoutText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#000000',
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 24,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalScrollView: { maxHeight: 400, marginBottom: 16 },
  modalBodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
    textAlign: 'left',
    marginBottom: 12,
  },
  modalCloseButton: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#050505',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
