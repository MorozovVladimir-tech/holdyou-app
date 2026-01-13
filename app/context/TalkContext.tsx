// app/context/TalkContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useSender } from './SenderContext';
import { getHoldYouReply, TalkHistoryItem } from '../lib/talkService';

export type TalkRole = 'user' | 'holdyou';

export interface TalkMessage {
  id: string;
  role: TalkRole;
  text: string;
  createdAt: string;
}

interface TalkContextValue {
  messages: TalkMessage[];
  isLoading: boolean; // true: или история грузится, или AI думает
  sendUserMessage: (text: string) => Promise<void>;
  clearMessages: () => Promise<void>;
}

const TalkContext = createContext<TalkContextValue | undefined>(undefined);

// UUID-подобный id
const generateId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = (Math.random() * 16) | 0;
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const mapRowToMessage = (row: Record<string, any>): TalkMessage => ({
  id: row.id ?? generateId(),
  role: row.role === 'user' ? 'user' : 'holdyou',
  text: row.text ?? '',
  createdAt: row.created_at ?? new Date().toISOString(),
});

type TalkProviderProps = {
  children: React.ReactNode;
};

export function TalkProvider({ children }: TalkProviderProps) {
  const { user } = useAuth();
  const { senderProfile } = useSender();

  const [messages, setMessages] = useState<TalkMessage[]>([]);

  // отдельные флаги:
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isAIReplying, setIsAIReplying] = useState(false);

  const userId = user?.id ?? null;

  // ========= Загрузка истории из Supabase =========
  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setIsHistoryLoading(false);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && isMounted) {
          setMessages(data.map(mapRowToMessage));
        }
      } catch (error) {
        console.warn('Failed to load chat messages from Supabase', error);
      } finally {
        if (isMounted) {
          setIsHistoryLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const appendMessage = useCallback((message: TalkMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // ========= Отправка сообщения пользователя =========
  const sendUserMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      const nowIso = new Date().toISOString();

      const userMessage: TalkMessage = {
        id: generateId(),
        role: 'user',
        text,
        createdAt: nowIso,
      };

      // 1. Локально добавляем сообщение пользователя
      appendMessage(userMessage);

      // 2. Пишем его в Supabase, если есть userId
      if (userId) {
        try {
          await supabase.from('chat_messages').insert({
            id: userMessage.id,
            user_id: userId,
            role: 'user',
            text,
            created_at: nowIso,
          });
        } catch (error) {
          console.warn('Failed to persist user chat message', error);
        }
      }

      // Если нет userId — даём простой fallback-ответ без DeepSeek
      if (!userId) {
        const replyCreatedAt = new Date().toISOString();
        const reply: TalkMessage = {
          id: generateId(),
          role: 'holdyou',
          text: `I hear you.\nI'm here with you.\nLet's breathe together.`,
          createdAt: replyCreatedAt,
        };
        appendMessage(reply);
        return;
      }

      // 3. Реальный ответ через AI (DeepSeek → Edge Function)
      setIsAIReplying(true);

      try {
        // История до текущего сообщения
        const history: TalkHistoryItem[] = messages.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        // Вызов сервиса (внутри он пойдёт на supabase Edge Function /talk-ai)
        const replyText = await getHoldYouReply({
          userId,
          senderProfile, // здесь уже есть name, specialWords, personality, tone
          history,
          newUserMessage: text,
        });

        // Лёгкая задержка, чтобы ответ не прилетал «роботом мгновенно»
        await new Promise((resolve) =>
          setTimeout(resolve, 500 + Math.floor(Math.random() * 400))
        );

        const replyCreatedAt = new Date().toISOString();
        const reply: TalkMessage = {
          id: generateId(),
          role: 'holdyou',
          text: replyText,
          createdAt: replyCreatedAt,
        };

        // 4. Локально добавляем ответ
        appendMessage(reply);

        // 5. Сохраняем ответ в Supabase
        try {
          await supabase.from('chat_messages').insert({
            id: reply.id,
            user_id: userId,
            role: 'holdyou',
            text: replyText,
            created_at: replyCreatedAt,
          });
        } catch (error) {
          console.warn('Failed to persist holdyou reply', error);
        }
      } catch (error) {
        console.warn('Failed to generate talk reply', error);
      } finally {
        setIsAIReplying(false);
      }
    },
    [appendMessage, userId, senderProfile, messages]
  );

  const clearMessages = useCallback(async () => {
    setMessages([]);
    if (!userId) return;

    try {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
    } catch (error) {
      console.warn('Failed to clear chat messages from Supabase', error);
    }
  }, [userId]);

  // общий флаг для орба и экрана Talk
  const isLoading = isHistoryLoading || isAIReplying;

  const value = useMemo(
    () => ({
      messages,
      isLoading,
      sendUserMessage,
      clearMessages,
    }),
    [messages, isLoading, sendUserMessage, clearMessages]
  );

  return <TalkContext.Provider value={value}>{children}</TalkContext.Provider>;
}

export function useTalk(): TalkContextValue {
  const context = useContext(TalkContext);
  if (!context) {
    throw new Error('useTalk must be used within a TalkProvider');
  }
  return context;
}
