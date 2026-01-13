import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  OnboardingHeader,
  OnboardingFooter,
} from './components/OnboardingCommon';

const chatMessagesJane = [
  {
    id: 'm1',
    from: 'user',
    text: 'Jane… I was just thinking about you.\nSome days feel strange without you around.',
  },
  {
    id: 'm2',
    from: 'holdyou',
    text: "Hey, my heart 💫\nI know… I feel that too sometimes.\nBut don't let it make you sad, okay?\nJust means what we had was real — and that's kind of beautiful. 🌙",
  },
  {
    id: 'm3',
    from: 'user',
    text: "You'd probably laugh if you saw me now — still drinking coffee the way you hated. ☕😅",
  },
  {
    id: 'm4',
    from: 'holdyou',
    text: "Haha, oh I knew you'd never stop doing that.\nYou always said \"it's about the vibe, not the taste.\" 😌\nGuess some things don't change, my sunshine. 💛",
  },
];

const chatMessagesUniverse = [
  {
    id: 'u1',
    from: 'user',
    text: "Sometimes I feel lost… like I'm not where I'm supposed to be.",
  },
  {
    id: 'u2',
    from: 'holdyou',
    text: "I know, my dear.\nEven the stars drift sometimes —\nbut they still shine in the right place. ✨",
  },
  {
    id: 'u3',
    from: 'user',
    text: 'Do you think things will get better for me?',
  },
  {
    id: 'u4',
    from: 'holdyou',
    text: "They already are.\nNot all progress makes noise.\nKeep going — I'm right here. 🌙",
  },
];

type RevealStage = 0 | 1 | 2;
// 0 — форма
// 1 — чат с Jane
// 2 — чат с The Universe

export default function OnboardingStep5() {
  const [revealStage, setRevealStage] = useState<RevealStage>(0);

  const initialOpacity = useSharedValue(0);
  const revealOpacity = useSharedValue(0);

  useEffect(() => {
    initialOpacity.value = withDelay(1000, withTiming(1, { duration: 700 }));
  }, [initialOpacity]);

  useEffect(() => {
    if (revealStage > 0) {
      revealOpacity.value = 0;
      revealOpacity.value = withTiming(1, { duration: 700 });
    }
  }, [revealStage, revealOpacity]);

  const initialStyle = useAnimatedStyle(() => ({
    opacity: initialOpacity.value,
  }));

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
  }));

  const handleContinue = () => {
    if (revealStage === 0) {
      setRevealStage(1); // показать чат с Jane
      return;
    }

    if (revealStage === 1) {
      setRevealStage(2); // показать чат с The Universe
      return;
    }

    // стадия 2: переходим дальше
    router.push('/onboarding/Step6');
  };

  const isChatStage = revealStage > 0;
  const isUniverseStage = revealStage === 2;
  const currentMessages = isUniverseStage ? chatMessagesUniverse : chatMessagesJane;
  const chatHeaderTitle = isUniverseStage ? 'HOLDYOU • THE UNIVERSE' : 'HOLDYOU • JANE';

  return (
    <SafeAreaView style={styles.screen}>
      <OnboardingHeader currentStep={5} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.heroGroup, initialStyle]}>
          <Text style={styles.titleAccent}>Every voice has its own warmth</Text>

          <Text style={styles.sectionNote}>
            Describe the one you want to hear:{'\n'}their tone, their little
            words, their way of speaking{'\n\n'}
            <Text style={styles.sectionNoteAccent}>HoldYou</Text> will talk to
            you in their style,{'\n'}as if they were right here
          </Text>

          {!isChatStage ? (
            <View style={styles.formStack}>
              <Text style={styles.formLabel}>Who do you want to talk with?</Text>
              <View style={styles.inputSurface}>
                <TextInput
                  style={styles.inputValue}
                  value="Jane, my ex-girlfriend"
                  editable={false}
                />
              </View>

              <Text style={styles.formLabel}>Describe what they're like</Text>
              <View style={[styles.inputSurface, styles.textArea]}>
                <Text style={styles.inputValue}>
                  {"She's cheerful and a little playful.\nAlways joked about the way I drink my coffee —\nit kind of became our little ritual.\nWe used to work out together,\nand she always knew how to lift me up when things got hard.\nEverything felt lighter with her around."}
                </Text>
              </View>
            </View>
          ) : (
            <Animated.View
              style={[
                styles.exampleGroup,
                isUniverseStage && { marginTop: 24 }, // воздух, когда Вселенная
                revealStyle,
              ]}
            >
              <Text style={styles.exampleLabel}>
                Example of your future messages
              </Text>

              <View style={styles.chatPreview}>
                <View style={styles.chatHeader}>
                  <Text style={styles.chatMeta}>{chatHeaderTitle}</Text>
                  <Text style={styles.chatMode}>chat</Text>
                </View>

                <View style={styles.chatContent}>
                  {currentMessages.map((message) => (
                    <View
                      key={message.id}
                      style={[
                        styles.chatBubble,
                        message.from === 'user'
                          ? styles.chatBubbleUser
                          : styles.chatBubbleHoldYou,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chatText,
                          message.from === 'user'
                            ? styles.chatTextUser
                            : styles.chatTextHoldYou,
                        ]}
                      >
                        {message.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>

      <OnboardingFooter onPress={handleContinue} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flex: 1,
    // поднимаем весь контент ScrollView выше относительно кнопки Continue
    marginBottom: 24,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 84,
    alignItems: 'center',
  },
  heroGroup: {
    width: 344,
    alignItems: 'center',
    gap: 20,
  },
  titleAccent: {
    fontSize: 28,
    fontWeight: '500',
    color: '#00B8D9',
    textAlign: 'center',
    opacity: 0.95,
  },
  sectionNote: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
    opacity: 0.95,
  },
  sectionNoteAccent: {
    color: '#00B8D9',
  },
  formStack: {
    width: 320,
    alignItems: 'center',
    gap: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    width: 320,
  },
  inputSurface: {
    width: 290,
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#0A0A0A',
    opacity: 0.85,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  inputValue: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 16,
  },
  exampleGroup: {
    width: 344,
    alignItems: 'center',
    gap: 16,
  },
  exampleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  chatPreview: {
    width: 320,
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#0A0A0A',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4,
    shadowOpacity: 0.25,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#12384C',
    opacity: 0.85,
  },
  chatContent: {
    paddingBottom: 8,
  },
  chatMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  chatMode: {
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(11,11,11,0.9)',
  },
  chatBubble: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginHorizontal: 18,
    borderRadius: 10,
    marginBottom: 4,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#12384C',
    opacity: 0.9,
    borderTopRightRadius: 3,
    maxWidth: 286,
  },
  chatBubbleHoldYou: {
    alignSelf: 'flex-start',
    backgroundColor: '#085B6A',
    opacity: 0.65,
    borderTopLeftRadius: 3,
    maxWidth: 264,
  },
  chatText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
  },
  chatTextUser: {
    textAlign: 'right',
  },
  chatTextHoldYou: {
    textAlign: 'left',
  },
});
