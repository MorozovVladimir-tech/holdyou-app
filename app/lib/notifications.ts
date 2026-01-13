// app/lib/notifications.ts
import * as Notifications from 'expo-notifications';
import { supabase } from './supabaseClient';

// Глобальный хендлер поведения уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
} as any); // <- каст к any, чтобы TS не ныл

// ---- Sender notifications helper ----

export type RescheduleSenderNotificationsArgs = {
  userId: string;
  profile: {
    name: string;
    specialWords: string;
    timingMode: 'specific' | 'random';
    morningTime?: string; // "07:00 AM"
    eveningTime?: string; // "07:00 PM"
  };
};

/**
 * Парсим строку "07:00 AM" / "7:30 PM" в 24-часовой формат.
 */
function parseTimeTo24h(
  time?: string
): { hour: number; minute: number } | null {
  if (!time) return null;

  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    console.warn('parseTimeTo24h: invalid time format', time);
    return null;
  }

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hour < 12) {
    hour += 12;
  } else if (period === 'AM' && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
}

/**
 * Перезаписываем расписание уведомлений для конкретного пользователя
 * на основе профиля Sender.
 */
export async function rescheduleSenderNotifications(
  args: RescheduleSenderNotificationsArgs
): Promise<void> {
  const { userId, profile } = args;

  if (!userId) {
    console.warn('rescheduleSenderNotifications: missing userId');
    return;
  }

  try {
    // 1) Чистим старые записи пользователя
    const { error: deleteError } = await supabase
      .from('notification_schedules')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.warn('Failed to delete old notification schedules', deleteError);
      // продолжаем, попробуем всё равно вставить новые
    }

    // 2) Формируем новые записи
    const rows: any[] = [];

    if (profile.timingMode === 'specific') {
      const morning = parseTimeTo24h(profile.morningTime);
      const evening = parseTimeTo24h(profile.eveningTime);

      if (morning) {
        rows.push({
          user_id: userId,
          mode: 'specific',
          label: 'morning',
          hour: morning.hour,
          minute: morning.minute,
        });
      }

      if (evening) {
        rows.push({
          user_id: userId,
          mode: 'specific',
          label: 'evening',
          hour: evening.hour,
          minute: evening.minute,
        });
      }
    } else {
      // timingMode === 'random'
      rows.push({
        user_id: userId,
        mode: 'random',
        label: 'random',
        hour: null,
        minute: null,
      });
    }

    if (!rows.length) {
      console.log('rescheduleSenderNotifications: no rows to insert');
      return;
    }

    const { error: insertError } = await supabase
      .from('notification_schedules')
      .insert(rows);

    if (insertError) {
      console.warn('Failed to insert notification schedules', insertError);
    } else {
      console.log('Notification schedules updated', rows);
    }
  } catch (e) {
    console.warn('rescheduleSenderNotifications unexpected error', e);
  }
}
