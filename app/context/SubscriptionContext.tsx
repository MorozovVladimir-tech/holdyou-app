import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type SubscriptionStatus = 'trial' | 'active' | 'expired';

export interface SubscriptionState {
  status: SubscriptionStatus;
  trialDaysLeft: number | null;
}

interface SubscriptionContextValue extends SubscriptionState {
  isLoading: boolean;
  activate: () => Promise<void>;
  expire: () => Promise<void>;
  resetTrial: (days: number) => Promise<void>;
}

const STORAGE_KEY = 'holdyou_subscription_v1';

const defaultState: SubscriptionState = {
  status: 'trial',
  trialDaysLeft: 5,
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(
  undefined
);

type SubscriptionProviderProps = {
  children: React.ReactNode;
};

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [state, setState] = useState<SubscriptionState>(defaultState);
  const [isLoading, setIsLoading] = useState(true);

  const persistState = useCallback(
    async (next: SubscriptionState) => {
      setState(next);
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to persist subscription state', error);
      }
    },
    [setState]
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (isMounted) {
            setState({
              status: parsed.status ?? defaultState.status,
              trialDaysLeft:
                typeof parsed.trialDaysLeft === 'number'
                  ? parsed.trialDaysLeft
                  : defaultState.trialDaysLeft,
            });
          }
        } else if (isMounted) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
          setState(defaultState);
        }
      } catch (error) {
        console.warn('Failed to load subscription state', error);
        if (isMounted) {
          setState(defaultState);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const activate = useCallback(async () => {
    const next: SubscriptionState = { status: 'active', trialDaysLeft: null };
    await persistState(next);
  }, [persistState]);

  const expire = useCallback(async () => {
    const next: SubscriptionState = { status: 'expired', trialDaysLeft: 0 };
    await persistState(next);
  }, [persistState]);

  const resetTrial = useCallback(
    async (days: number) => {
      const next: SubscriptionState = { status: 'trial', trialDaysLeft: days };
      await persistState(next);
    },
    [persistState]
  );

  const value = useMemo(
    () => ({
      ...state,
      isLoading,
      activate,
      expire,
      resetTrial,
    }),
    [state, isLoading, activate, expire, resetTrial]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

