// app/lib/talkService.ts

import { SenderProfile } from '../context/SenderContext';
import { callTalkAIEndpoint, TalkAIIncomingMessage } from './talkApi';

export interface TalkHistoryItem {
  role: 'user' | 'holdyou';
  text: string;
}

export interface TalkReplyParams {
  userId: string;
  senderProfile: SenderProfile | null;
  history: TalkHistoryItem[];
  newUserMessage: string;
}

// Выбор одного никнейма из строки "baby, Vovka, Bob"
function pickOneSpecialWord(specialWords?: string | null): string | null {
  if (!specialWords) return null;
  const arr = specialWords
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
  if (!arr.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

// Локальный фоллбэк, если бэкенд/DeepSeek упал
function buildFallbackReply(
  senderProfile: SenderProfile | null,
  newUserMessage: string,
): string {
  const special = pickOneSpecialWord(senderProfile?.specialWords);
  const callYou = special || 'you';
  const tone = senderProfile?.tone || 'support';

  // 🔴 ВРЕМЕННО: помечаем, что это именно fallback, чтобы ты видел это в чате
  const prefix = '[OFFLINE MODE] ';

  switch (tone) {
    case 'love':
      return `${prefix}${callYou}… I'm here. I'm holding your heart gently. You are not alone.`;
    case 'calm':
      return `${prefix}Let's breathe together, ${callYou}. I'm here, creating a safe space for you.`;
    case 'motivation':
      return `${prefix}${callYou}, you're stronger than you know. I believe in you, and I'm here to remind you of that.`;
    case 'support':
    default:
      return `${prefix}I hear you, ${callYou}. I'm standing with you through this. We'll get through it together.`;
  }
}

/**
 * Основная функция: дергает edge-функцию talk-ai.
 * Если что-то ломается — возвращает мягкий фоллбэк.
 */
export async function getHoldYouReply(
  params: TalkReplyParams,
): Promise<string> {
  const { userId, senderProfile, history, newUserMessage } = params;

  if (!userId) {
    return buildFallbackReply(senderProfile, newUserMessage);
  }

  // 1. Готовим историю для бэкенда
  const historyMessages: TalkAIIncomingMessage[] = history.map((item) => ({
    role: item.role === 'holdyou' ? 'assistant' : 'user',
    content: item.text,
  }));

  const messages: TalkAIIncomingMessage[] = [
    ...historyMessages,
    {
      role: 'user',
      content: newUserMessage,
    },
  ];

  // 2. Формируем senderProfile для запроса
  const senderPayload = senderProfile
    ? {
        name: senderProfile.name || undefined,
        specialWords: senderProfile.specialWords || undefined,
        tone: senderProfile.tone || undefined,
      }
    : undefined;

  try {
    const reply = await callTalkAIEndpoint({
      userId,
      messages,
      senderProfile: senderPayload,
    });

    const trimmed = reply.trim();
    if (!trimmed) {
      console.warn('Talk AI returned empty reply, using fallback');
      return buildFallbackReply(senderProfile, newUserMessage);
    }
    return trimmed;
  } catch (err) {
    console.warn('getHoldYouReply: backend error, using fallback', err);
    return buildFallbackReply(senderProfile, newUserMessage);
  }
}
