// app/lib/pushNotifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// EAS Project ID из `npx eas-cli init`
const EAS_PROJECT_ID = '334b8044-f25c-4b92-8e8a-788a8dbad64b';

// Регистрация пушей и сохранение токена в Supabase
export async function registerForPushNotificationsAsync(userId: string) {
  try {
    // На эмуляторах пуши не работают
    if (!Device.isDevice) {
      console.log('Push notifications are only supported on physical devices');
      return;
    }

    // 1. Проверяем / запрашиваем разрешения
    const settings = await Notifications.getPermissionsAsync();
    let finalStatus = settings.status;

    if (finalStatus !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      finalStatus = request.status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push permissions not granted');
      return;
    }

    // 2. Получаем Expo push token (с projectId)
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });

    const expoPushToken = tokenData.data;

    if (!expoPushToken) {
      console.log('Expo push token is empty');
      return;
    }

    // 3. Сохраняем / обновляем токен в Supabase
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: expoPushToken,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.log('Error saving push token to Supabase', error);
    } else {
      console.log('Push token saved for user', userId, expoPushToken);
    }

    // 4. Канал для Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00B8D9',
      });
    }
  } catch (e) {
    console.log('registerForPushNotificationsAsync error:', e);
  }
}
