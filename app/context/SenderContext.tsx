// app/context/SenderContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
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

type Tone = 'love' | 'support' | 'calm' | 'motivation';
type TimingMode = 'specific' | 'random';

export interface SenderProfile {
  name: string;
  myName: string;
  specialWords: string; // НЕ обязательное
  status: string;
  personality: string;
  tone: Tone;
  timingMode: TimingMode;
  morningTime?: string;
  eveningTime?: string;
}

interface SenderContextValue {
  senderProfile: SenderProfile;
  updateSenderProfile: (patch: Partial<SenderProfile>) => void;
  resetSenderProfile: () => void;
  isLoaded: boolean;
  isSenderComplete: boolean;
}

const DEFAULT_PROFILE: SenderProfile = {
  name: '',
  myName: '',
  specialWords: '',
  status: '',
  personality: '',
  tone: 'support',
  timingMode: 'specific',
  morningTime: '08:00 AM',
  eveningTime: '07:00 PM',
};

const TONES: readonly Tone[] = ['love', 'support', 'calm', 'motivation'];
const STORAGE_KEY_BASE = 'holdyou_sender_profile_v2';

const SenderContext = createContext<SenderContextValue | undefined>(undefined);

const storageKeyFor = (userId: string | null) =>
  `${STORAGE_KEY_BASE}_${userId ?? 'anon'}`;

// ---------- helpers: time mapping ----------
const toSupabaseTime = (value?: string): string | null => {
  if (!value) return null;

  const match = value.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
};

const fromSupabaseTime = (value?: string | null): string | undefined => {
  if (!value) return undefined;

  const [hourStr, minuteStr = '00'] = value.split(':');
  let hours = parseInt(hourStr, 10);
  if (Number.isNaN(hours)) return undefined;

  const minutes = minuteStr.substring(0, 2);
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;

  return `${displayHour.toString().padStart(2, '0')}:${minutes} ${period}`;
};

// ---------- Supabase <-> SenderProfile ----------
const mapRowToProfile = (row: Record<string, any>): SenderProfile => ({
  name: row.name ?? '',
  myName: row.user_name ?? '',
  specialWords: row.special_words ?? '',
  status: row.status ?? '',
  personality: row.personality ?? '',
  tone: TONES.includes(row.tone) ? (row.tone as Tone) : DEFAULT_PROFILE.tone,
  timingMode: row.timing_mode === 'random' ? 'random' : DEFAULT_PROFILE.timingMode,
  morningTime: fromSupabaseTime(row.message_time_morning) ?? DEFAULT_PROFILE.morningTime,
  eveningTime: fromSupabaseTime(row.message_time_evening) ?? DEFAULT_PROFILE.eveningTime,
});

const buildSupabasePayload = (profile: SenderProfile, userId: string) => ({
  user_id: userId,
  name: profile.name,
  user_name: profile.myName,
  special_words: profile.specialWords,
  status: profile.status,
  personality: profile.personality,
  tone: profile.tone,
  timing_mode: profile.timingMode,
  message_time_morning: toSupabaseTime(profile.morningTime),
  message_time_evening: toSupabaseTime(profile.eveningTime),
  updated_at: new Date().toISOString(),
});

/**
 * Минимальный флаг заполнения:
 * name + status + myName + personality + tone
 * specialWords НЕ обязателен
 */
export function isSenderProfileComplete(profile?: SenderProfile | null): boolean {
  if (!profile) return false;

  const name = (profile.name ?? '').trim();
  const status = (profile.status ?? '').trim();
  const myName = (profile.myName ?? '').trim();
  const personality = (profile.personality ?? '').trim();
  const hasValidTone = TONES.includes(profile.tone);

  return (
    name.length > 0 &&
    status.length > 0 &&
    myName.length > 0 &&
    personality.length > 0 &&
    hasValidTone
  );
}

type SenderProviderProps = { children: React.ReactNode };

export function SenderProvider({ children }: SenderProviderProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [senderProfile, setSenderProfile] = useState<SenderProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadFromCache = useCallback(async (key: string): Promise<SenderProfile | null> => {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    } catch (error) {
      console.warn('Failed to load cached sender profile', error);
      return null;
    }
  }, []);

  const saveToCache = useCallback(async (key: string, next: SenderProfile) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn('Failed to save sender profile locally', error);
    }
  }, []);

  const syncToSupabase = useCallback(async (uid: string, next: SenderProfile) => {
    try {
      const payload = buildSupabasePayload(next, uid);
      const { error } = await supabase.from('sender_profiles').upsert(payload, {
        onConflict: 'user_id',
      });
      if (error) console.warn('Failed to sync sender profile to Supabase', error);
    } catch (error) {
      console.warn('Unexpected error syncing sender profile', error);
    }
  }, []);

  // 🔥 КРИТИЧНО: при смене userId грузим ПРОФИЛЬ ТОЛЬКО ЭТОГО userId (и кеш тоже per-user)
  useEffect(() => {
    let isMounted = true;
    const key = storageKeyFor(userId);

    setIsLoaded(false);

    (async () => {
      // 0) мгновенно сбросим состояние, чтобы не мигали чужие данные
      if (isMounted) setSenderProfile(DEFAULT_PROFILE);

      // 1) если нет userId — грузим anon кеш
      if (!userId) {
        const cached = (await loadFromCache(key)) ?? DEFAULT_PROFILE;
        if (isMounted) {
          setSenderProfile(cached);
          setIsLoaded(true);
        }
        return;
      }

      // 2) есть userId — пробуем Supabase → иначе кеш этого userId → иначе default
      let profile: SenderProfile | null = null;

      try {
        const { data, error } = await supabase
          .from('sender_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          profile = mapRowToProfile(data);
          await saveToCache(key, profile);
        }
      } catch (error) {
        console.warn('Failed to fetch sender profile from Supabase', error);
      }

      if (!profile) {
        profile = (await loadFromCache(key)) ?? DEFAULT_PROFILE;
      }

      if (isMounted) {
        setSenderProfile(profile);
        setIsLoaded(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId, loadFromCache, saveToCache]);

  const updateSenderProfile = useCallback(
    (patch: Partial<SenderProfile>) => {
      const key = storageKeyFor(userId);

      setSenderProfile(prev => {
        const next: SenderProfile = { ...prev, ...patch };

        // кеш всегда
        saveToCache(key, next);

        // Supabase только если есть userId
        if (userId) syncToSupabase(userId, next);

        return next;
      });
    },
    [userId, saveToCache, syncToSupabase]
  );

  const resetSenderProfile = useCallback(() => {
    const key = storageKeyFor(userId);

    setSenderProfile(DEFAULT_PROFILE);
    saveToCache(key, DEFAULT_PROFILE);
    if (userId) syncToSupabase(userId, DEFAULT_PROFILE);
  }, [userId, saveToCache, syncToSupabase]);

  const isSenderComplete = useMemo(
    () => isSenderProfileComplete(senderProfile),
    [senderProfile]
  );

  const value = useMemo(
    () => ({
      senderProfile,
      updateSenderProfile,
      resetSenderProfile,
      isLoaded,
      isSenderComplete,
    }),
    [senderProfile, updateSenderProfile, resetSenderProfile, isLoaded, isSenderComplete]
  );

  return <SenderContext.Provider value={value}>{children}</SenderContext.Provider>;
}

export function useSender(): SenderContextValue {
  const context = useContext(SenderContext);
  if (!context) throw new Error('useSender must be used within SenderProvider');
  return context;
}
