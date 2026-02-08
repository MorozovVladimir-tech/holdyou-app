// app/lib/pushNotifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// EAS Project ID из `npx eas-cli init`
const EAS_PROJECT_ID = '334b8044-f25c-4b92-8e8a-788a8dbad64b';

// Регистрация пушей и сохранение токена в Supabase
export async function registerForPushNotificationsAsync(userId: string) {
  console.log('[PushDiag] enter registerForPush userId=', userId);
  try {
    // На эмуляторах пуши не работают
    if (!Device.isDevice) {
      console.log('[PushDiag] early return because !Device.isDevice');
      return;
    }

    // 1. Проверяем / запрашиваем разрешения
    const settings = await Notifications.getPermissionsAsync();
    let finalStatus = settings.status;
    console.log('[PushDiag] permissionStatus after getPermissionsAsync=', finalStatus);

    if (finalStatus !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      finalStatus = request.status;
      console.log('[PushDiag] permissionStatus after requestPermissionsAsync=', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('[PushDiag] early return because permission not granted finalStatus=', finalStatus);
      return;
    }

    // 2. Получаем Expo push token (с projectId)
    console.log('[PushDiag] before getExpoPushTokenAsync projectId=', EAS_PROJECT_ID);
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    console.log('[PushDiag] after getExpoPushTokenAsync SUCCESS token=', tokenData?.data ?? 'null');

    const expoPushToken = tokenData.data;

    if (!expoPushToken) {
      console.log('[PushDiag] early return because expoPushToken is empty');
      return;
    }

    // 3. Сохраняем / обновляем токен в Supabase
    console.log('[PushDiag] about to upsert token to Supabase userId=', userId);
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
      console.log('[PushDiag] upsert to Supabase error=', error);
    } else {
      console.log('[PushDiag] upsert to Supabase SUCCESS');
    }

    // 4. Канал для Android
    if (Platform.OS === 'android') {
      console.log('[PushDiag] about to setNotificationChannelAsync');
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00B8D9',
      });
      console.log('[PushDiag] setNotificationChannelAsync done');
    }
    console.log('[PushDiag] registerForPush exit SUCCESS');
  } catch (e) {
    console.log('[PushDiag] registerForPush ERROR', e);
  }
}
