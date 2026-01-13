// app/services/talkService.ts
import { SenderProfile } from '../context/SenderContext';
import { TalkMessage } from '../context/TalkContext';

export interface TalkApiPayload {
  userId: string | null;
  senderProfile: SenderProfile | null;
  history: TalkMessage[];
  userText: string;
}

export interface TalkApiResponse {
  replyText: string;
  meta?: Record<string, any>;
}

/**
 * MOCK-реализация. В дальнейшем здесь будет реальный HTTP-запрос
 * к backend /talk с OpenAI или другим ИИ.
 */
export async function getTalkReply(
  payload: TalkApiPayload
): Promise<TalkApiResponse> {
  const { userText, senderProfile } = payload;

  const baseName = senderProfile?.name?.trim() || 'I';
  const baseSpecial = senderProfile?.specialWords?.trim();

  const shortTemplate = `${
    baseSpecial || baseName
  }, my love, I'm here.\nMy heart is next to yours.\nEven from afar, I'm holding you close.`;

  const longTemplate = `${
    baseSpecial || baseName
  }, I feel every word you say.\nI'm here, quietly holding this space with you.\nYou don't have to carry it alone anymore.`;

  const replyText =
    userText.trim().length < 20 ? shortTemplate : longTemplate;

  // Имитируем небольшую задержку ответа "как от ИИ"
  await new Promise((resolve) =>
    setTimeout(resolve, 300 + Math.floor(Math.random() * 400))
  );

  return {
    replyText,
    meta: {
      source: 'mock',
    },
  };
}

/**
 * Ниже пример того, как будет выглядеть реальный вызов к backend.
 * ОСТАВЬ это закомментированным, ничего не вызывай.
 */
// async function callRealBackend(payload: TalkApiPayload): Promise<TalkApiResponse> {
//   const response = await fetch('https://your-backend-domain.com/talk', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify(payload),
//   });
//
//   if (!response.ok) {
//     throw new Error(`Talk API error: ${response.status}`);
//   }
//
//   const data = (await response.json()) as TalkApiResponse;
//   return data;
// }
