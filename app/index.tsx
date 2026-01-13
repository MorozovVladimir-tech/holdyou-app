import { Redirect } from 'expo-router';

export default function Index() {
  // Временно всегда отправляем пользователя на онбординг
  return <Redirect href="/onboarding/Welcome" />;
}
