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

import {
  sendMessagesToAI,
  SenderProfile as AiSenderProfile,
} from '../lib/talkAiClient';
import { useAuth } from '../context/AuthContext';
import { useSender } from '../context/SenderContext';

// Типы сообщений в чате
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

  // auth + sender
  const { user } = useAuth();
  const userId = user?.id ?? 'dev-user';

  const { senderProfile, isSenderComplete } = useSender();

  // Talk locked if Sender not complete
  const isTalkLocked = !isSenderComplete;

  // Ключ для сохранения истории чата (привязан к пользователю)
  const storageKey = useMemo(() => `holdyou_talk_messages_${userId}`, [userId]);

  // превращаем SenderContext-профиль в "паспорт" для ИИ
  const aiSenderProfile: AiSenderProfile | undefined = useMemo(() => {
    if (!senderProfile) return undefined;

    const name = (senderProfile as any).name?.trim?.() ?? '';
    const specialWords = (senderProfile as any).specialWords?.trim?.() ?? '';
    const userName = (senderProfile as any).myName?.trim?.() ?? '';

    const status = (senderProfile as any).status
      ? String((senderProfile as any).status).trim()
      : '';

    const toneParts: string[] = [];

    if ((senderProfile as any).tone) {
      toneParts.push((senderProfile as any).tone);
    }
    if ((senderProfile as any).personality) {
      toneParts.push((senderProfile as any).personality);
    }

    if (status) {
      toneParts.push(
        `For the user you are their ${status} (ex, partner, mom, friend, etc.). Keep this relationship in mind.`
      );
    }

    if (userName) {
      toneParts.push(
        `The user’s name is "${userName}". Use this name when you address them.`
      );
    }

    const tone = toneParts.length ? toneParts.join(' — ') : undefined;

    // specialWords не обязателен
    if (!name && !specialWords && !tone) return undefined;

    return {
      name: name || undefined,
      specialWords: specialWords || undefined,
      tone,
    };
  }, [senderProfile]);

  // индекс последнего AI-сообщения
  const [lastAiIndex, setLastAiIndex] = useState<number | null>(null);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // ---- автоскролл: умный (не рвём скролл, если юзер ушёл вверх) ----
  const isAtBottomRef = useRef(true);
  const pendingAutoScrollRef = useRef(false);

  const scrollToBottom = (animated = true) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollToEnd({ animated });
  };

  // Если Talk залочен — не показываем историю/не оставляем ввод
  useEffect(() => {
    if (isTalkLocked) {
      setDraft('');
      setIsLoading(false);
      setMessages([]);
      setShowScrollToBottom(false);
      isAtBottomRef.current = true;
      pendingAutoScrollRef.current = false;
    }
  }, [isTalkLocked]);

  // Загружаем историю чата (только если Talk доступен)
  useEffect(() => {
    let isMounted = true;

    if (isTalkLocked)
      return () => {
        isMounted = false;
      };

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && isMounted) {
          setMessages(parsed);
          pendingAutoScrollRef.current = true;
        }
      } catch (e) {
        console.warn('Failed to load talk history', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [storageKey, isTalkLocked]);

  // Сохраняем историю чата (только если Talk доступен)
  useEffect(() => {
    if (isTalkLocked) return;

    (async () => {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (e) {
        console.warn('Failed to save talk history', e);
      }
    })();
  }, [messages, storageKey, isTalkLocked]);

  // Подсветка последнего AI-сообщения
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

  // Автоскролл: только если мы у низа ИЛИ это "запланированный" скролл
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

  // автоскролл, когда появляется клавиатура (но тоже умный)
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

    return () => {
      showSub.remove();
    };
  }, []);

  const handleSend = async () => {
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

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const payload = [
        ...messages.map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        })),
        { role: 'user' as const, content: text },
      ];

      const aiReplyText = await sendMessagesToAI(
        userId,
        payload,
        aiSenderProfile
      );

      const aiMessage: ChatMessage = {
        id: `${Date.now()}-ai`,
        role: 'assistant',
        text: aiReplyText,
      };

      pendingAutoScrollRef.current = true;
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.warn('Failed to send message', error);
      const fallback: ChatMessage = {
        id: `${Date.now()}-fallback`,
        role: 'assistant',
        text: "I'm having trouble answering right now, but I'm still here with you.",
      };
      pendingAutoScrollRef.current = true;
      setMessages((prev) => [...prev, fallback]);
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
    const isUser = message.role === 'user';
    const base = [
      styles.bubble,
      isUser ? styles.bubbleUser : styles.bubbleHoldYou,
    ];

    const isHighlighted = !isUser && lastAiIndex === index;

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
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Talk</Text>
        <Text style={styles.subtitle}>Talk with the one you wish could be here</Text>
      </View>

      {/* Градиентная рамка чата */}
      <View style={styles.chatGradientWrapper}>
        <LinearGradient
          colors={['#00B8D9', '#059677']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.chatGradient}
        >
          <View style={styles.chatContainer}>
            {isTalkLocked ? (
              <View style={styles.lockWrap}>
                <Text style={styles.lockTitle}>Create your Sender first</Text>
                <Text style={styles.lockText}>
                  Talk is locked until you fill the required Sender details and save.
                </Text>

                <View style={styles.lockReqBox}>
                  <Text style={styles.lockReqTitle}>Required fields:</Text>

                  <Text style={styles.lockReqItem}>• Name</Text>
                  <Text style={styles.lockReqItem}>
                    • Status (ex / partner / mom / friend)
                  </Text>
                  <Text style={styles.lockReqItem}>• Your name</Text>
                  <Text style={styles.lockReqItem}>• Personality</Text>
                  <Text style={styles.lockReqItem}>• Tone of voice</Text>

                  <Text style={[styles.lockReqItem, { marginTop: 6, opacity: 0.75 }]}>
                    Optional: Special words
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/(tabs)/sender');
                  }}
                  style={({ pressed }) => [
                    styles.lockBtn,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.lockBtnText}>Go to Sender</Text>
                  <Ionicons name="arrow-forward" size={18} color="#00B8D9" />
                </Pressable>

                <Text style={styles.lockHint}>
                  After you save Sender, come back to Talk.
                </Text>
              </View>
            ) : (
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
                  {isLoading && messages.length === 0 && (
                    <Text style={styles.chatHint}>Loading your messages…</Text>
                  )}

                  {!isLoading && messages.length === 0 && (
                    <Text style={styles.chatHint}>
                      Start by saying something to the one you wish could be here.
                    </Text>
                  )}

                  {messages.map((message, index) => {
                    const isUser = message.role === 'user';
                    const bubbleStyle = getBubbleStyle(message, index);
                    return (
                      <Animated.View key={message.id} style={bubbleStyle}>
                        <Text
                          style={[
                            styles.bubbleText,
                            isUser
                              ? styles.bubbleTextUser
                              : styles.bubbleTextHoldYou,
                          ]}
                        >
                          {message.text}
                        </Text>
                      </Animated.View>
                    );
                  })}
                </ScrollView>

                {showScrollToBottom && (
                  <Pressable
                    style={styles.scrollToBottom}
                    onPress={() => scrollToBottom(true)}
                  >
                    <Ionicons name="arrow-down" size={18} color="#00B8D9" />
                  </Pressable>
                )}

                {/* INPUT ROW */}
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
                  />
                  <Pressable
                    onPress={handleSend}
                    style={({ pressed }) => [
                      styles.sendButton,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons name="paper-plane" size={20} color="#00B8D9" />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 0,
    backgroundColor: '#000000',
  },

  header: {
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#00B8D9',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 184, 217, 0.35)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },

  chatGradientWrapper: {
    flex: 1,
    width: '100%',
    borderRadius: 12,
  },
  chatGradient: {
    flex: 1,
    borderRadius: 12,
    padding: 0.9,
  },
  chatContainer: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#000000',
    overflow: 'hidden',
    width: '100%',
    position: 'relative',
  },

  chatScroll: { flex: 1 },
  chatContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  chatHint: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },

  bubble: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    maxWidth: '85%',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#12384C',
  },
  bubbleHoldYou: {
    alignSelf: 'flex-start',
    backgroundColor: '#085B6A',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.95)',
  },
  bubbleTextUser: { textAlign: 'left' },
  bubbleTextHoldYou: { textAlign: 'left' },

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

  // LOCK UI
  lockWrap: {
    flex: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
    marginBottom: 6,
  },
  lockText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  lockReqBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 0.6,
    borderColor: 'rgba(0,184,217,0.65)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  lockReqTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  lockReqItem: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 18,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  lockBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lockHint: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
});
