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
  specialWords: string; // НЕ обязателен
  status: string;
  personality: string;
  tone: Tone;
  timingMode: TimingMode;
  morningTime?: string;
  eveningTime?: string;
}

const TONES: readonly Tone[] = ['love', 'support', 'calm', 'motivation'];

export function isSenderProfileComplete(
  profile?: SenderProfile | null
): boolean {
  if (!profile) return false;

  const name = (profile.name ?? '').toString().trim();
  const status = (profile.status ?? '').toString().trim();
  const myName = (profile.myName ?? '').toString().trim();
  const personality = (profile.personality ?? '').toString().trim();

  const hasValidTone = TONES.includes(profile.tone);

  return (
    name.length > 0 &&
    status.length > 0 &&
    myName.length > 0 &&
    personality.length > 0 &&
    hasValidTone
  );
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

const STORAGE_KEY = 'holdyou_sender_profile_v1';

const SenderContext = createContext<SenderContextValue | undefined>(undefined);

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
  const hours = parseInt(hourStr, 10);
  if (Number.isNaN(hours)) return undefined;

  const minutes = minuteStr.substring(0, 2);
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;

  return `${displayHour.toString().padStart(2, '0')}:${minutes} ${period}`;
};

// ---------- mapping Supabase <-> SenderProfile ----------

const mapRowToProfile = (row: Record<string, any>): SenderProfile => ({
  name: row.name ?? '',
  myName: row.user_name ?? '',
  specialWords: row.special_words ?? '',
  status: row.status ?? '',
  personality: row.personality ?? '',
  tone: TONES.includes(row.tone) ? (row.tone as Tone) : DEFAULT_PROFILE.tone,
  timingMode: row.timing_mode === 'random' ? 'random' : DEFAULT_PROFILE.timingMode,
  morningTime:
    fromSupabaseTime(row.message_time_morning) ?? DEFAULT_PROFILE.morningTime,
  eveningTime:
    fromSupabaseTime(row.message_time_evening) ?? DEFAULT_PROFILE.eveningTime,
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

type SenderProviderProps = {
  children: React.ReactNode;
};

export function SenderProvider({ children }: SenderProviderProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [senderProfile, setSenderProfile] =
    useState<SenderProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadFromCache = useCallback(async (): Promise<SenderProfile | null> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    } catch (error) {
      console.warn('Failed to load cached sender profile', error);
      return null;
    }
  }, []);

  const syncProfile = useCallback(
    async (next: SenderProfile) => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to save sender profile locally', error);
      }

      if (!userId) return;

      try {
        const payload = buildSupabasePayload(next, userId);
        const { error } = await supabase
          .from('sender_profiles')
          .upsert(payload, { onConflict: 'user_id' });

        if (error) {
          console.warn('Failed to sync sender profile to Supabase', error);
        }
      } catch (error) {
        console.warn('Unexpected error syncing sender profile', error);
      }
    },
    [userId]
  );

  useEffect(() => {
    let isMounted = true;

    (async () => {
      let nextProfile: SenderProfile | null = null;

      // 1) Supabase (если авторизован)
      if (userId) {
        try {
          const { data, error } = await supabase
            .from('sender_profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

          if (error) throw error;

          if (data) {
            nextProfile = mapRowToProfile(data);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfile));
          }
        } catch (error) {
          console.warn('Failed to fetch sender profile from Supabase', error);
        }
      }

      // 2) Cache fallback
      if (!nextProfile) {
        nextProfile = (await loadFromCache()) ?? DEFAULT_PROFILE;
      }

      // ✅ ВАЖНО: setSenderProfile получает только SenderProfile (не null)
      if (isMounted) {
        setSenderProfile(nextProfile);
        setIsLoaded(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loadFromCache, userId]);

  const updateSenderProfile = useCallback(
    (patch: Partial<SenderProfile>) => {
      setSenderProfile((prev) => {
        const next = { ...prev, ...patch };
        syncProfile(next);
        return next;
      });
    },
    [syncProfile]
  );

  const resetSenderProfile = useCallback(() => {
    setSenderProfile(DEFAULT_PROFILE);
    syncProfile(DEFAULT_PROFILE);
  }, [syncProfile]);

  const isSenderComplete = useMemo(() => {
    return isSenderProfileComplete(senderProfile);
  }, [senderProfile]);

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

  return (
    <SenderContext.Provider value={value}>{children}</SenderContext.Provider>
  );
}

export function useSender(): SenderContextValue {
  const context = useContext(SenderContext);
  if (!context) {
    throw new Error('useSender must be used within SenderProvider');
  }
  return context;
}
