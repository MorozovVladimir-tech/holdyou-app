// app/lib/talkApi.ts

import { supabase } from './supabaseClient';

export type TalkAIIncomingMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export interface TalkAIRequestBody {
  userId: string;
  messages: TalkAIIncomingMessage[];
  senderProfile?: {
    name?: string;
    specialWords?: string;
    tone?: string;
  };
}

export interface TalkAIResponseBody {
  reply: string;
}

/**
 * Вызывает edge-функцию talk-ai через Supabase client.
 * Supabase сам подставит Authorization / apikey.
 */
export async function callTalkAIEndpoint(
  body: TalkAIRequestBody,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<TalkAIResponseBody>(
    'talk-ai',
    {
      body,
    },
  );

  if (error) {
    console.warn('Talk AI invoke error:', error);
    throw error;
  }

  console.log('Talk AI raw data from function:', data);

  if (!data || typeof data.reply !== 'string') {
    throw new Error('Talk AI: invalid response shape');
  }

  return data.reply;
}
