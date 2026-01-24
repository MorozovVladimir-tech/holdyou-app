// app/(tabs)/talk.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Keyboard,
  Platform,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { sendMessagesToAI, SenderProfile as AiSenderProfile } from '../lib/talkAiClient';
import { useAuth } from '../context/AuthContext';
import { useSender } from '../context/SenderContext';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export default function TalkScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);

  const { user } = useAuth();
  const userId: string | null = user?.id ?? null;

  const { senderProfile, isSenderComplete } = useSender();
  const isTalkLocked = !isSenderComplete;

  // ✅ НИКАКОГО dev-user. Только реальный userId.
  const storageKey = useMemo(
    () => (userId ? `holdyou_talk_messages_${userId}` : null),
    [userId]
  );

  // ✅ если userId сменился — чистим локальные сообщения (иначе будет "чат другого профиля")
  useEffect(() => {
    setMessages([]);
    setDraft('');
    setIsLoading(false);
    setShowScrollToBottom(false);
  }, [userId]);

  const aiSenderProfile: AiSenderProfile | undefined = useMemo(() => {
    if (!senderProfile) return undefined;

    const name = senderProfile.name?.trim?.() ?? '';
    const specialWords = senderProfile.specialWords?.trim?.() ?? '';
    const userName = senderProfile.myName?.trim?.() ?? '';
    const status = senderProfile.status ? String(senderProfile.status).trim() : '';

    const toneParts: string[] = [];
    if (senderProfile.tone) toneParts.push(senderProfile.tone);
    if (senderProfile.personality) toneParts.push(senderProfile.personality);

    if (status) {
      toneParts.push(
        `For the user you are their ${status} (ex, partner, mom, friend, etc.). Keep this relationship in mind.`
      );
    }
    if (userName) {
      toneParts.push(`The user’s name is "${userName}". Use this name when you address them.`);
    }

    const tone = toneParts.length ? toneParts.join(' — ') : undefined;

    if (!name && !specialWords && !tone) return undefined;

    return {
      name: name || undefined,
      specialWords: specialWords || undefined, // optional
      tone,
    };
  }, [senderProfile]);

  const [lastAiIndex, setLastAiIndex] = useState<number | null>(null);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const isAtBottomRef = useRef(true);
  const pendingAutoScrollRef = useRef(false);

  const scrollToBottom = (animated = true) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollToEnd({ animated });
  };

  // ✅ Историю грузим ТОЛЬКО если есть userId и storageKey
  useEffect(() => {
    let isMounted = true;

    if (!storageKey) return () => { isMounted = false; };

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
        if (isMounted) {
          setMessages(Array.isArray(parsed) ? parsed : []);
          pendingAutoScrollRef.current = true;
        }
      } catch (e) {
        console.warn('Failed to load talk history', e);
        if (isMounted) setMessages([]);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  // ✅ Сохраняем тоже только если есть storageKey
  useEffect(() => {
    if (!storageKey) return;
    (async () => {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (e) {
        console.warn('Failed to save talk history', e);
      }
    })();
  }, [messages, storageKey]);

  useEffect(() => {
    if (!messages.length) return;

    let idx: number | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'user') {
        idx = i;
        break;
      }
    }
    if (idx === null) return;

    setLastAiIndex(idx);

    highlightAnim.stopAnimation();
    highlightAnim.setValue(1);
    Animated.timing(highlightAnim, {
      toValue: 0,
      duration: 800,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length) return;

    if (isAtBottomRef.current || pendingAutoScrollRef.current) {
      setTimeout(() => {
        scrollToBottom(true);
        pendingAutoScrollRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        if (isAtBottomRef.current) {
          pendingAutoScrollRef.current = true;
          setTimeout(() => scrollToBottom(true), 50);
        }
      }
    );

    return () => showSub.remove();
  }, []);

  const handleSend = async () => {
    if (!userId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (isTalkLocked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const text = draft.trim();
    if (!text || isLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: ChatMessage = {
      id: `${Date.now()}`,
      role: 'user',
      text,
    };

    setDraft('');
    pendingAutoScrollRef.current = true;

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const payload = [
        ...messages.map(m => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        })),
        { role: 'user' as const, content: text },
      ];

      const aiReplyText = await sendMessagesToAI(userId, payload, aiSenderProfile);

      const aiMessage: ChatMessage = {
        id: `${Date.now()}-ai`,
        role: 'assistant',
        text: aiReplyText,
      };

      pendingAutoScrollRef.current = true;
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.warn('Failed to send message', error);
      const fallback: ChatMessage = {
        id: `${Date.now()}-fallback`,
        role: 'assistant',
        text: "I'm having trouble answering right now, but I'm still here with you.",
      };
      pendingAutoScrollRef.current = true;
      setMessages(prev => [...prev, fallback]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputFocus = () => {
    if (isAtBottomRef.current) {
      pendingAutoScrollRef.current = true;
      scrollToBottom(true);
    }
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);

    const atBottom = distanceFromBottom <= 80;
    isAtBottomRef.current = atBottom;
    setShowScrollToBottom(!atBottom);
  };

  const onContentSizeChange = () => {
    if (pendingAutoScrollRef.current) {
      scrollToBottom(true);
      pendingAutoScrollRef.current = false;
    }
  };

  const getBubbleStyle = (message: ChatMessage, index: number) => {
    const isUserMsg = message.role === 'user';
    const base = [styles.bubble, isUserMsg ? styles.bubbleUser : styles.bubbleHoldYou];

    const isHighlighted = !isUserMsg && lastAiIndex === index;

    if (isHighlighted) {
      return [
        ...base,
        {
          backgroundColor: highlightAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['#085B6A', '#0BA6C0'],
          }) as any,
        },
      ];
    }

    return base;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Talk</Text>
        <Text style={styles.subtitle}>Talk with the one you wish could be here</Text>
      </View>

      <View style={styles.chatGradientWrapper}>
        <LinearGradient
          colors={['#00B8D9', '#059677']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.chatGradient}
        >
          <View style={styles.chatContainer}>
            {/* ✅ Talk ВСЕГДА открывается. Если lock — просто оверлей поверх */}
            <>
              <ScrollView
                ref={scrollRef}
                style={styles.chatScroll}
                contentContainerStyle={styles.chatContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onContentSizeChange={onContentSizeChange}
              >
                {!isLoading && messages.length === 0 && (
                  <Text style={styles.chatHint}>
                    Start by saying something to the one you wish could be here.
                  </Text>
                )}

                {messages.map((message, index) => (
                  <Animated.View key={message.id} style={getBubbleStyle(message, index)}>
                    <Text style={styles.bubbleText}>{message.text}</Text>
                  </Animated.View>
                ))}
              </ScrollView>

              {showScrollToBottom && (
                <Pressable style={styles.scrollToBottom} onPress={() => scrollToBottom(true)}>
                  <Ionicons name="arrow-down" size={18} color="#00B8D9" />
                </Pressable>
              )}

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Type what you want to say…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  scrollEnabled
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  onFocus={handleInputFocus}
                  textAlignVertical="top"
                  editable={!isTalkLocked}
                />
                <Pressable
                  onPress={handleSend}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (pressed || isTalkLocked) && { opacity: 0.5 },
                  ]}
                  disabled={isTalkLocked}
                >
                  <Ionicons name="paper-plane" size={20} color="#00B8D9" />
                </Pressable>
              </View>

              {isTalkLocked && (
                <View style={styles.lockOverlay} pointerEvents="auto">
                  <View style={styles.lockCard}>
                    <Text style={styles.lockTitle}>Talk is locked</Text>
                    <Text style={styles.lockText}>Fill Sender and press Save.</Text>

                    <View style={styles.lockReqBox}>
                      <Text style={styles.lockReqTitle}>Required fields:</Text>
                      <Text style={styles.lockReqItem}>• Name</Text>
                      <Text style={styles.lockReqItem}>• Status</Text>
                      <Text style={styles.lockReqItem}>• Your name</Text>
                      <Text style={styles.lockReqItem}>• Personality</Text>
                      <Text style={styles.lockReqItem}>• Tone</Text>
                      <Text style={[styles.lockReqItem, { marginTop: 6, opacity: 0.75 }]}>
                        Optional: Special words
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/(tabs)/sender');
                      }}
                      style={({ pressed }) => [styles.lockBtn, pressed && { opacity: 0.75 }]}
                    >
                      <Text style={styles.lockBtnText}>Go to Sender</Text>
                      <Ionicons name="arrow-forward" size={18} color="#00B8D9" />
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', paddingHorizontal: 12, paddingTop: 0, backgroundColor: '#000000' },

  header: { alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#00B8D9' },
  subtitle: { marginTop: 4, fontSize: 15, fontWeight: '500', color: '#FFFFFF', textAlign: 'center' },

  chatGradientWrapper: { flex: 1, width: '100%', borderRadius: 12 },
  chatGradient: { flex: 1, borderRadius: 12, padding: 0.9 },
  chatContainer: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#000000',
    overflow: 'hidden',
    width: '100%',
    position: 'relative',
  },

  chatScroll: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingVertical: 8 },

  chatHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },

  bubble: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6, maxWidth: '85%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#12384C' },
  bubbleHoldYou: { alignSelf: 'flex-start', backgroundColor: '#085B6A' },
  bubbleText: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.95)' },

  scrollToBottom: {
    position: 'absolute',
    right: 16,
    bottom: 58,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(0,184,217,0.7)',
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#00B8D9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#000000',
  },
  chatInput: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    minHeight: 38,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ✅ overlay
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  lockCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 0.6,
    borderColor: 'rgba(0,184,217,0.65)',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  lockTitle: { fontSize: 18, fontWeight: '700', color: '#00B8D9', textAlign: 'center', marginBottom: 6 },
  lockText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },

  // ✅ ВНУТРЕННЮЮ РАМКУ УБРАЛИ (только border)
  lockReqBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  lockReqTitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginBottom: 6 },
  lockReqItem: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.78)', lineHeight: 18 },

  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    gap: 8 as any,
  },
  lockBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
