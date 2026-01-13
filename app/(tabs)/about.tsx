// app/(tabs)/about.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

// ✅ правильный маршрут до экрана логина в папке onboarding
const LOGIN_ROUTE = '/onboarding/Login' as const;

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

export default function AboutScreen() {
  const { user, logout } = useAuth();
  const [nextNotifications, setNextNotifications] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<'free' | 'active'>('free');
  const [subExpiresAt, setSubExpiresAt] = useState<string | null>(null);
  const [isLoadingSub, setIsLoadingSub] = useState<boolean>(true);
  const [subError, setSubError] = useState<string | null>(null);
  const [isPrivacyVisible, setIsPrivacyVisible] = useState<boolean>(false);
  const [isTermsVisible, setIsTermsVisible] = useState<boolean>(false);

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
          const times = data.map((row) => {
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
          .select('subscription_status, subscription_expires_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setSubStatus(
            data.subscription_status === 'active' ? 'active' : 'free'
          );
          setSubExpiresAt(
            data.subscription_expires_at ? data.subscription_expires_at : null
          );
        } else {
          setSubStatus('free');
          setSubExpiresAt(null);
        }
      } catch (err: any) {
        console.warn('Failed to load subscription', err);
        if (isMounted) {
          setSubError(err?.message ?? 'Failed to load subscription status.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingSub(false);
        }
      }
    }

    loadSubscription();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleFakePurchase = async () => {
    if (!user) return;

    setSubError(null);
    setIsLoadingSub(true);

    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    try {
      const { error } = await supabase
        .from('sender_profiles')
        .upsert(
          {
            user_id: user.id,
            subscription_status: 'active',
            subscription_expires_at: expires.toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setSubStatus('active');
      setSubExpiresAt(expires.toISOString());
    } catch (err: any) {
      console.warn('Failed to update subscription', err);
      setSubError(err?.message ?? 'Failed to update subscription.');
    } finally {
      setIsLoadingSub(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.warn('Failed to logout', error);
    }
    // ✅ корректный переход на экран логина
    router.replace(LOGIN_ROUTE as never);
  };

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
              Email:{' '}
              <Text style={styles.accountValue}>
                {user.email ?? 'Unknown'}
              </Text>
            </Text>
            <Text style={styles.accountInfo}>
              Registered:{' '}
              <Text style={styles.accountValue}>
                {formatDate(user.created_at ?? null)}
              </Text>
            </Text>
          </View>
        )}

        {/* SUBSCRIPTION CARD */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Subscription status:</Text>
          <Text style={styles.cardStatus}>
            {subStatus === 'active' ? 'Active' : 'Free'}
          </Text>

          {subStatus === 'active' && subExpiresAt && (
            <Text style={styles.cardExpires}>
              Active until {formatDate(subExpiresAt)}
            </Text>
          )}

          {subStatus === 'free' && (
            <Text style={styles.cardPrice}>1$ = 30 days</Text>
          )}

          <Text style={styles.cardFooter}>
            Because some voices are{' '}
            <Text style={styles.cardFooterAccent}>worth keeping</Text>
          </Text>

          {nextNotifications && (
            <Text style={styles.notificationTime}>
              Next messages: {nextNotifications}
            </Text>
          )}
        </View>

        {subError && <Text style={styles.errorText}>{subError}</Text>}

        {/* SUBSCRIPTION BUTTON */}
        <Pressable
          style={styles.buyButton}
          onPress={isLoadingSub ? undefined : handleFakePurchase}
          disabled={isLoadingSub}
        >
          <Text style={styles.buyButtonText}>
            {isLoadingSub
              ? '...'
              : subStatus === 'free'
              ? 'BUY (1$ = 30 days)'
              : 'EXTEND 30 DAYS'}
          </Text>
        </Pressable>

        {/* OUR STORY */}
        <View style={styles.storyBlock}>
          <Text style={styles.sectionTitle}>Why HoldYou exists</Text>
          <Text style={styles.storyText}>
            I spent a long time in silence after losing someone who truly
            believed in me. For a while it felt like there was no one left who
            would say &quot;I&apos;m here for you&quot;.
          </Text>
          <Text style={styles.storyText}>
            One day, a simple message from a friend — a few warm words of
            support — hit me so deeply that it reminded me how powerful one
            voice can be.
          </Text>
          <Text style={styles.storyText}>
            HoldYou was created for people who are alone, grieving, or just
            missing someone who can no longer write to them — so they can still
            feel that voice by their side.
          </Text>
        </View>

        {/* LEGAL / PRIVACY / TERMS */}
        <View style={styles.legalBlock}>
          <Text style={styles.sectionTitle}>Safety & legal</Text>

          <Text style={styles.legalText}>
            HoldYou is an emotional support app powered by AI. It does not
            provide medical advice, diagnosis, or therapy and cannot replace a
            mental health professional.
          </Text>
          <Text style={styles.legalText}>
            If you feel in danger or crisis, please contact local emergency
            services or a crisis hotline in your country.
          </Text>

          <View style={styles.linksRow}>
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setIsPrivacyVisible(true);
              }}
            >
              <Text style={styles.linkButtonText}>Privacy Policy</Text>
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setIsTermsVisible(true);
              }}
            >
              <Text style={styles.linkButtonText}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>

        {/* CONTACT */}
        <View style={styles.contactBlock}>
          <Text style={styles.sectionTitle}>Support</Text>
          <Text style={styles.contactText}>
            For questions, feedback or data requests, you can contact our team
            at:
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
            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalBodyText}>
                HoldYou is an emotional support app powered by AI. We store only
                the minimum amount of personal data needed to run the service,
                such as your email, basic profile information and message
                settings.
              </Text>
              <Text style={styles.modalBodyText}>
                Your messages are processed by AI models to generate supportive
                responses. We may use anonymized and aggregated data to improve
                the quality and safety of the service.
              </Text>
              <Text style={styles.modalBodyText}>
                We do not sell your personal data to third parties. Data may be
                processed by trusted service providers (for example, cloud
                hosting or analytics) under strict confidentiality agreements.
              </Text>
              <Text style={styles.modalBodyText}>
                You can request deletion of your account and personal data by
                contacting support@holdyou.app. Some data may be stored for a
                limited time if required by law or for security and anti-abuse
                purposes.
              </Text>
            </ScrollView>
            <Pressable
              style={styles.modalCloseButton}
              onPress={() => setIsPrivacyVisible(false)}
            >
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
            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalBodyText}>
                HoldYou is designed for emotional support and reflection. It
                does not provide medical advice, diagnosis, therapy or crisis
                intervention, and must not be used as a substitute for
                professional help.
              </Text>
              <Text style={styles.modalBodyText}>
                By using the app, you agree to be responsible for your own
                decisions and actions. You must not use HoldYou to harm yourself
                or others, or to share illegal, hateful or abusive content.
              </Text>
              <Text style={styles.modalBodyText}>
                We may update these Terms from time to time to improve safety or
                comply with legal requirements. Continued use of the app after
                changes means you accept the updated Terms.
              </Text>
              <Text style={styles.modalBodyText}>
                If you are in immediate danger or crisis, please contact local
                emergency services or a crisis hotline in your country instead
                of relying on the app.
              </Text>
            </ScrollView>
            <Pressable
              style={styles.modalCloseButton}
              onPress={() => setIsTermsVisible(false)}
            >
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
    paddingTop: 0,          // было 8 — подняли ближе к орбу
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,        // было 10 — выровняли с Sender/Talk
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 20,
  },

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

  // ACCOUNT
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
  accountValue: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // SUBSCRIPTION CARD
  card: {
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    paddingVertical: 32,
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
    marginBottom: 24,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  cardFooter: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardFooterAccent: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  notificationTime: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '500',
    color: '#00B8D9',
    textAlign: 'center',
  },
  cardExpires: {
    fontSize: 13,
    fontWeight: '500',
    color: '#00B8D9',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: '#FF6B6B',
    textAlign: 'center',
  },

  buyButton: {
    marginTop: 16,
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
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },

  // STORY
  storyBlock: {
    marginTop: 8,
    paddingHorizontal: 2,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'left',
  },
  storyText: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.8)',
  },

  // LEGAL
  legalBlock: {
    marginTop: 8,
    paddingHorizontal: 2,
    gap: 8,
  },
  legalText: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.7)',
  },
  linksRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
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
  linkButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#00B8D9',
  },

  // CONTACT
  contactBlock: {
    marginTop: 12,
    paddingHorizontal: 2,
    gap: 6,
    alignItems: 'center',
  },
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
  supportEmailIcon: {
    fontSize: 14,
    color: '#00B8D9',
    marginRight: 6,
  },
  supportEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00B8D9',
  },

  // LOGOUT
  logoutButton: {
    marginTop: 24,
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
  logoutText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },

  // MODAL
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
  modalScrollView: {
    maxHeight: 400,
    marginBottom: 16,
  },
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
