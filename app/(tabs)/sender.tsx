// app/(tabs)/sender.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSender } from '../context/SenderContext';
import * as Notifications from 'expo-notifications';
import { rescheduleSenderNotifications } from '../lib/notifications';
import { registerForPushNotificationsAsync } from '../lib/pushNotifications';
import * as Haptics from 'expo-haptics';

const EAS_PROJECT_ID = '334b8044-f25c-4b92-8e8a-788a8dbad64b';

type ToneOption = {
  key: 'love' | 'support' | 'calm' | 'motivation';
  title: string;
  subtitle: string;
};

type TimingModeOption = {
  key: 'specific' | 'random';
  label: string;
};

const toneOptions: ToneOption[] = [
  { key: 'love',       title: 'Love',       subtitle: 'gentle and warm messages' },
  { key: 'support',    title: 'Support',    subtitle: 'encouraging and caring tone' },
  { key: 'calm',       title: 'Calm',       subtitle: 'peaceful, grounding words' },
  { key: 'motivation', title: 'Motivation', subtitle: 'uplifting and strong voice' },
];

const timingOptions: TimingModeOption[] = [
  { key: 'specific', label: 'At a specific time' },
  { key: 'random',   label: 'Random moments' },
];

const MORNING_TIMES = ['07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM'];
const EVENING_TIMES = ['06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM'];

export default function SenderScreen() {
  const { user } = useAuth();
  const { senderProfile, updateSenderProfile, isLoaded } = useSender();

  const [name, setName] = useState('');
  const [myName, setMyName] = useState('');         // имя пользователя
  const [status, setStatus] = useState('');         // статус/роль: ex, mom, partner
  const [specialWordsList, setSpecialWordsList] = useState<string[]>([]);
  const [specialWordsInput, setSpecialWordsInput] = useState('');
  const [personality, setPersonality] = useState('');
  const [personalityHeight, setPersonalityHeight] = useState(120);
  const [morningTime, setMorningTime] = useState('08:00 AM');
  const [eveningTime, setEveningTime] = useState('07:00 PM');
  const [tone, setTone] = useState<ToneOption['key']>('support');
  const [timingMode, setTimingMode] =
    useState<TimingModeOption['key']>('specific');
  const [saving, setSaving] = useState(false);

  const [showMorningList, setShowMorningList] = useState(false);
  const [showEveningList, setShowEveningList] = useState(false);

  const [activeSection, setActiveSection] = useState<
    'identity' | 'tone' | 'timing' | null
  >(null);

  // блокировка полей после сохранения
  const [isLocked, setIsLocked] = useState(false);

  // поп-ап "Data saved"
  const [showSavePopup, setShowSavePopup] = useState(false);
  const savePopupAnim = useRef(new Animated.Value(0)).current;

  const scrollY = useRef(new Animated.Value(0)).current;

  const getSectionAnimatedStyle = (index: number) => {
    const base = index * 220;
    return {
      transform: [
        {
          translateY: scrollY.interpolate({
            inputRange: [base - 40, base + 60],
            outputRange: [10, 0],
            extrapolate: 'clamp',
          }),
        },
      ],
    };
  };

  const morningListAnim = useRef(new Animated.Value(0)).current;
  const eveningListAnim = useRef(new Animated.Value(0)).current;

  const animateList = (anim: Animated.Value, show: boolean) => {
    Animated.timing(anim, {
      toValue: show ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  // ✅ Новый минимальный флаг заполнения:
  // name + status + myName + personality + tone
  // ❗ Special words — OPTIONAL (не участвуют в unlock Talk)
  const isComplete = useMemo(() => {
    const n = name.trim();
    const st = status.trim();
    const mn = myName.trim();
    const p = personality.trim();
    const t = (tone ?? '').trim();

    return (
      n.length > 0 &&
      st.length > 0 &&
      mn.length > 0 &&
      p.length > 0 &&
      t.length > 0
    );
  }, [name, status, myName, personality, tone]);

  // Подтягиваем профиль
  useEffect(() => {
    if (!isLoaded) return;

    setName(senderProfile.name ?? '');
    setMyName(senderProfile.myName ?? '');
    setStatus((senderProfile as any).status ?? '');

    if (senderProfile.specialWords) {
      const parsed = senderProfile.specialWords
        .split(',')
        .map(w => w.trim())
        .filter(Boolean);
      setSpecialWordsList(parsed);
    } else {
      setSpecialWordsList([]);
    }
    setSpecialWordsInput('');

    setPersonality(senderProfile.personality ?? '');
    setMorningTime(senderProfile.morningTime ?? '08:00 AM');
    setEveningTime(senderProfile.eveningTime ?? '07:00 PM');
    setTone((senderProfile.tone ?? 'support') as any);
    setTimingMode(senderProfile.timingMode ?? 'specific');

    // ✅ "замороженным" считаем ТОЛЬКО если профиль реально complete
    // ❗ Special words НЕ влияют на isLocked (они optional)
    const profAny = senderProfile as any;
    const profName = (profAny.name ?? '').toString().trim();
    const profStatus = (profAny.status ?? '').toString().trim();
    const profMyName = (profAny.myName ?? '').toString().trim();
    const profPersonality = (profAny.personality ?? '').toString().trim();
    const profTone = (profAny.tone ?? '').toString().trim();

    const hasData =
      profName.length > 0 &&
      profStatus.length > 0 &&
      profMyName.length > 0 &&
      profPersonality.length > 0 &&
      profTone.length > 0;

    setIsLocked(hasData);
  }, [isLoaded, senderProfile]);

  const triggerSavePopup = () => {
    setShowSavePopup(true);
    savePopupAnim.setValue(0);
    Animated.timing(savePopupAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(savePopupAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowSavePopup(false));
      }, 1200);
    });
  };

  const handleSave = async () => {
    if (!isLoaded || isLocked) return;

    // ✅ Валидация по минимальному флагу
    if (!isComplete) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setSaving(true);

    const specialWords = specialWordsList
      .map(w => w.trim())
      .filter(Boolean)
      .join(', ');

    const next = {
      name: name.trim(),
      myName: myName.trim(),
      status: status.trim(),
      specialWords, // ✅ сохраняем как раньше (для ИИ)
      personality: personality.trim(),
      morningTime,
      eveningTime,
      tone,
      timingMode,

      // удобный флаг для контекста (если SenderContext сохраняет — супер)
      // если нет — не ломает, просто будет проигнорирован
      isComplete: true,
    } as const;

    updateSenderProfile(next as any);

    try {
      Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })
        .then((data) => {
          const token = data?.data;
          if (token) {
            console.log('[PushDebug] current expoPushToken=', token);
          } else {
            console.log('[PushDebug] failed to get expoPushToken', { tokenData: data });
          }
        })
        .catch((e) => {
          console.log('[PushDebug] failed to get expoPushToken', e);
        });

      await rescheduleSenderNotifications({
        userId: user?.id ?? '',
        profile: {
          name: next.name,
          specialWords: next.specialWords,
          timingMode: next.timingMode,
          morningTime: next.morningTime,
          eveningTime: next.eveningTime,
        },
      });

      if (user?.id) {
        await registerForPushNotificationsAsync(user.id);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsLocked(true);
      triggerSavePopup();
    } catch (e) {
      console.warn('Failed to schedule/register notifications', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading sender…</Text>
      </View>
    );
  }

  const toggleTimingMode = (mode: TimingModeOption['key']) => {
    if (mode === timingMode) return;
    setTimingMode(mode);
    Haptics.selectionAsync();

    if (mode === 'random') {
      setShowMorningList(false);
      setShowEveningList(false);
      animateList(morningListAnim, false);
      animateList(eveningListAnim, false);
    }
    setActiveSection('timing');
  };

  const handleSelectMorning = (time: string) => {
    setMorningTime(time);
    setShowMorningList(false);
    animateList(morningListAnim, false);
  };

  const handleSelectEvening = (time: string) => {
    setEveningTime(time);
    setShowEveningList(false);
    animateList(eveningListAnim, false);
  };

  // Special words
  const handleAddSpecialWord = () => {
    if (isLocked) return;
    const word = specialWordsInput.trim();
    if (!word) return;

    // нормализуем: не даём дублей по lower-case
    const normalized = word.toLowerCase();
    const exists = specialWordsList.some(w => w.toLowerCase() === normalized);
    if (exists) {
      setSpecialWordsInput('');
      return;
    }

    setSpecialWordsList(prev => [...prev, word]);
    setSpecialWordsInput('');
    setActiveSection('identity');
  };

  const handleRemoveSpecialWord = (index: number) => {
    if (isLocked) return;
    setSpecialWordsList(prev => prev.filter((_, i) => i !== index));
  };

  // Personality autoheight
  const handlePersonalityContentSize = (e: any) => {
    const h = e.nativeEvent.contentSize.height;
    if (h < 120) {
      setPersonalityHeight(120);
    } else if (h < 220) {
      setPersonalityHeight(h + 16);
    } else {
      setPersonalityHeight(236);
    }
  };

  const personalityLength = personality.length;
  const isPersonalityLong = personalityLength > 260;

  return (
    <View style={styles.screen}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Sender</Text>
        <Text style={styles.subtitle}>Create the voice you long to hear</Text>
      </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* IDENTITY SECTION */}
        <Animated.View
          style={[styles.section, getSectionAnimatedStyle(0)]}
          pointerEvents={isLocked ? 'none' : 'auto'}
        >
          <FieldBlock
            label="Name"
            helper="Enter the name of the person who’ll send you messages"
          >
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Jane"
              placeholderTextColor="#555"
              editable={!isLocked}
              onFocus={() => setActiveSection('identity')}
            />
          </FieldBlock>

          <FieldBlock
            label="Your name"
            helper="How should they call you in messages?"
          >
            <TextInput
              style={styles.input}
              value={myName}
              onChangeText={setMyName}
              placeholder="Alex"
              placeholderTextColor="#555"
              editable={!isLocked}
              onFocus={() => setActiveSection('identity')}
            />
          </FieldBlock>

          {/* STATUS */}
          <FieldBlock
            label="Status"
            helper="Who are they for you? (ex, partner, mom, friend, etc.)"
          >
            <TextInput
              style={styles.input}
              value={status}
              onChangeText={setStatus}
              placeholder="ex-girlfriend, mom, partner…"
              placeholderTextColor="#555"
              editable={!isLocked}
              onFocus={() => setActiveSection('identity')}
            />
          </FieldBlock>

          <FieldBlock
            label="Special words"
            helper="How did they use to call you?"
          >
            <View style={styles.specialWordsBlock}>
              {specialWordsList.length > 0 && (
                <View style={styles.chipsRow}>
                  {specialWordsList.map((word, index) => (
                    <Pressable
                      key={`${word}-${index}`}
                      style={styles.chip}
                      onPress={() => handleRemoveSpecialWord(index)}
                    >
                      <Text style={styles.chipText}>{word}</Text>
                      <Text style={styles.chipRemove}>×</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.specialInputRow}>
                <TextInput
                  style={styles.specialInput}
                  value={specialWordsInput}
                  onChangeText={setSpecialWordsInput}
                  placeholder="baby, my love…"
                  placeholderTextColor="#555"
                  editable={!isLocked}
                  onFocus={() => setActiveSection('identity')}
                  onSubmitEditing={handleAddSpecialWord}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleAddSpecialWord}
                  disabled={isLocked}
                  style={({ pressed }) => [
                    styles.addWordButton,
                    (pressed || isLocked) && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.addWordButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          </FieldBlock>

          <FieldBlock
            label="Personality"
            helper="Describe how they would talk to you — and who they are for you"
          >
            <View
              style={[
                styles.personalityWrapper,
                isPersonalityLong && styles.personalityWrapperLong,
              ]}
            >
              <TextInput
                style={[styles.personalityInput, { height: personalityHeight }]}
                value={personality}
                onChangeText={setPersonality}
                placeholder="Describe their personality, tone, and little details you remember…"
                placeholderTextColor="#555"
                multiline
                editable={!isLocked}
                onContentSizeChange={handlePersonalityContentSize}
                onFocus={() => setActiveSection('identity')}
              />
              <Text style={styles.charCounter}>{personalityLength}/500</Text>
            </View>
          </FieldBlock>
        </Animated.View>

        {/* TONE SECTION */}
        <Animated.View
          style={[styles.section, getSectionAnimatedStyle(1)]}
          pointerEvents={isLocked ? 'none' : 'auto'}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tone of Voice</Text>
            <Text style={styles.sectionSubtitle}>
              Choose the tone you want to feel
            </Text>
          </View>

          <View style={styles.toneGrid}>
            {toneOptions.map(option => {
              const isActive = tone === option.key;
              const borderStyle = getToneBorderStyle(option.key);
              return (
                <Animated.View
                  key={option.key}
                  style={[
                    styles.toneCardOuter,
                    borderStyle,
                    isActive && styles.toneCardOuterActive,
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      if (isLocked) return;
                      setTone(option.key);
                      setActiveSection('tone');
                    }}
                    style={({ pressed }) => [
                      styles.toneCard,
                      isActive && styles.toneCardActive,
                      pressed && !isLocked && { transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Text style={styles.toneCardTitle}>{option.title}</Text>
                    <Text style={styles.toneCardBody}>{option.subtitle}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* TIMING SECTION */}
        <Animated.View
          style={[styles.section, getSectionAnimatedStyle(2)]}
          pointerEvents={isLocked ? 'none' : 'auto'}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Message timing</Text>
            <Text style={styles.sectionSubtitle}>
              When do you want to hear from them?
            </Text>
          </View>

          <View style={styles.toggleRow}>
            {timingOptions.map(option => (
              <Pressable
                key={option.key}
                onPress={() => toggleTimingMode(option.key)}
                disabled={isLocked}
                style={[
                  styles.toggleButton,
                  timingMode === option.key && styles.toggleButtonActive,
                  isLocked && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.toggleButtonText,
                    timingMode === option.key &&
                      styles.toggleButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {timingMode === 'specific' && (
            <>
              <FieldBlock
                label="Morning message"
                helper="Select the morning time"
              >
                <Pressable
                  style={styles.selectInput}
                  onPress={() => {
                    if (isLocked) return;
                    const next = !showMorningList;
                    setShowMorningList(next);
                    setShowEveningList(false);
                    animateList(morningListAnim, next);
                    animateList(eveningListAnim, false);
                    setActiveSection('timing');
                  }}
                >
                  <Text style={styles.selectInputText}>{morningTime}</Text>
                </Pressable>

                {showMorningList && (
                  <Animated.View
                    style={[
                      styles.selectList,
                      {
                        opacity: morningListAnim,
                        transform: [
                          {
                            scale: morningListAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.97, 1],
                            }),
                          },
                          {
                            translateY: morningListAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-4, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    {MORNING_TIMES.map(time => (
                      <Pressable
                        key={time}
                        style={styles.selectListItem}
                        onPress={() => handleSelectMorning(time)}
                      >
                        <Text style={styles.selectListItemText}>{time}</Text>
                      </Pressable>
                    ))}
                  </Animated.View>
                )}
              </FieldBlock>

              <FieldBlock
                label="Evening message"
                helper="Select the evening time"
              >
                <Pressable
                  style={styles.selectInput}
                  onPress={() => {
                    if (isLocked) return;
                    const next = !showEveningList;
                    setShowEveningList(next);
                    setShowMorningList(false);
                    animateList(eveningListAnim, next);
                    animateList(morningListAnim, false);
                    setActiveSection('timing');
                  }}
                >
                  <Text style={styles.selectInputText}>{eveningTime}</Text>
                </Pressable>

                {showEveningList && (
                  <Animated.View
                    style={[
                      styles.selectList,
                      {
                        opacity: eveningListAnim,
                        transform: [
                          {
                            scale: eveningListAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.97, 1],
                            }),
                          },
                          {
                            translateY: eveningListAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-4, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    {EVENING_TIMES.map(time => (
                      <Pressable
                        key={time}
                        style={styles.selectListItem}
                        onPress={() => handleSelectEvening(time)}
                      >
                        <Text style={styles.selectListItemText}>{time}</Text>
                      </Pressable>
                    ))}
                  </Animated.View>
                )}
              </FieldBlock>
            </>
          )}
        </Animated.View>

        {/* КНОПКИ В КОНЦЕ СКРОЛЛА */}
        <Pressable
          onPress={handleSave}
          disabled={saving || isLocked}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !saving && !isLocked && styles.primaryButtonPressed,
            (saving || isLocked) && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Saving…' : 'Bring them to life'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (!isLocked) return;
            Haptics.selectionAsync();
            setIsLocked(false);
          }}
          disabled={!isLocked}
          style={({ pressed }) => [
            styles.secondaryButton,
            !isLocked && styles.secondaryButtonDisabled,
            pressed && isLocked && styles.secondaryButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Edit details</Text>
        </Pressable>
      </Animated.ScrollView>

      {/* POPUP "DATA SAVED" */}
      {showSavePopup && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.savePopup,
            {
              opacity: savePopupAnim,
              transform: [
                {
                  scale: savePopupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.savePopupInner}>
            <View style={styles.savePopupIconCircle}>
              <Text style={styles.savePopupCheck}>✓</Text>
            </View>
            <Text style={styles.savePopupText}>Data saved</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

type FieldBlockProps = {
  label: string;
  helper: string;
  children: React.ReactNode;
};

function FieldBlock({ label, helper, children }: FieldBlockProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.helper}>{helper}</Text>
      <View style={styles.fieldContent}>{children}</View>
    </View>
  );
}

function getToneBorderStyle(key: ToneOption['key']) {
  switch (key) {
    case 'love':
      return styles.toneBorderLove;
    case 'calm':
      return styles.toneBorderCalm;
    case 'support':
      return styles.toneBorderSupport;
    case 'motivation':
      return styles.toneBorderMotivation;
    default:
      return {};
  }
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
  scrollContent: {
    paddingBottom: 40,
    gap: 28,
  },
  center: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: '#FFFFFF' },
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

  section: { gap: 14 },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

  fieldBlock: { gap: 8 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  helper: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  fieldContent: { marginTop: 4 },
  input: {
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#0B0B0B',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
  },

  specialWordsBlock: { gap: 8 },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#041822',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  chipRemove: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: -1,
  },
  specialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  specialInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#0B0B0B',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  addWordButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00B8D9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  addWordButtonText: {
    fontSize: 22,
    color: '#00B8D9',
    marginTop: -2,
  },

  personalityWrapper: {
    borderRadius: 12,
    borderWidth: 0.9,
    borderColor: '#00B8D9',
    backgroundColor: '#050505',
    padding: 4,
  },
  personalityWrapperLong: {
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    shadowOpacity: 0.35,
  },
  personalityInput: {
    borderRadius: 10,
    borderWidth: 0,
    backgroundColor: '#050505',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  charCounter: {
    position: 'absolute',
    right: 10,
    bottom: 6,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },

  toneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginTop: 8,
  },
  toneCardOuter: {
    width: '48%',
    borderRadius: 16,
    padding: 1,
    backgroundColor: '#00B8D9',
  },
  toneCardOuterActive: {
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 18,
    shadowOpacity: 0.45,
  },
  toneCard: {
    borderRadius: 15,
    borderWidth: 0.8,
    borderColor: 'rgba(0,184,217,0.7)',
    backgroundColor: '#050505',
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    gap: 6,
  },
  toneCardActive: { backgroundColor: '#041922' },
  toneCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
  },
  toneCardBody: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 16,
  },
  toneBorderLove: { backgroundColor: '#00B8D9' },
  toneBorderCalm: { backgroundColor: '#0288b5' },
  toneBorderSupport: { backgroundColor: '#00a0ff' },
  toneBorderMotivation: { backgroundColor: '#059677' },

  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00B8D9',
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#041922',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.35,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  toggleButtonTextActive: { color: '#00B8D9' },
  selectInput: {
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#0B0B0B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  selectInputText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  selectList: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: '#00B8D9',
    backgroundColor: '#050505',
    overflow: 'hidden',
  },
  selectListItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectListItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },

  primaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#00B8D9',
    paddingVertical: 14,
    backgroundColor: '#000000',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonPressed: { opacity: 0.8 },
  primaryButtonDisabled: { opacity: 0.5, shadowOpacity: 0 },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#00B8D9',
    paddingVertical: 14,
    backgroundColor: '#000000',
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonDisabled: { opacity: 0.35 },
  secondaryButtonPressed: { opacity: 0.8 },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  savePopup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  savePopupInner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#00B8D9',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePopupIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00B8D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  savePopupCheck: { fontSize: 22, color: '#00B8D9' },
  savePopupText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
