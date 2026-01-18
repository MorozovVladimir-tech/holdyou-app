import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

export default function ConfirmedAlias() {
  const params = useLocalSearchParams();

  useEffect(() => {
    const qs = new URLSearchParams(params as any).toString();
    const href = (`/auth/confirmed${qs ? `?${qs}` : ''}`) as any;
    router.replace(href);
  }, [params]);

  return null;
}
