// app/lib/talkAiClient.ts
import { supabase } from './supabaseClient';

// роли сообщений в разговоре
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessagePayload {
  role: ChatRole;
  content: string;
}

// Профиль отправителя, который передаём в Edge Function
export interface SenderProfile {
  name?: string;         // имя отправителя (кого «оживили»)
  myName?: string;       // имя пользователя, чтобы ИИ обращался правильно
  specialWords?: string; // ласковые обращения
  tone?: string;         // тон + манера + personality (склеенные)
}

/**
 * Вызывает Edge-функцию talk-ai
 * @param userId - id пользователя
 * @param messages - история диалога
 * @param senderProfile - расширенный профиль «отправителя»
 */
export async function sendMessagesToAI(
  userId: string,
  messages: ChatMessagePayload[],
  senderProfile?: SenderProfile
) {
  const { data, error } = await supabase.functions.invoke('talk-ai', {
    body: {
      userId,
      messages,
      senderProfile,
    },
  });

  if (error) {
    console.error('talk-ai invoke error:', error);
    throw error;
  }

  if (!data || typeof data.reply !== 'string') {
    console.error('Invalid talk-ai response:', data);
    throw new Error('Invalid AI response format');
  }

  return data.reply as string;
}
