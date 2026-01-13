/**
 * Main Supabase client file.
 * Singleton Supabase client instance used throughout the app.
 *
 * Env:
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL for Supabase client.');
}

if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY for Supabase client.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // ✅ Mobile best practice
    flowType: 'pkce',

    // ✅ RN should not try to parse browser URL callbacks like web
    detectSessionInUrl: false,

    persistSession: true,
    autoRefreshToken: true,
    storage: AsyncStorage,

    // ✅ explicit key (stable между сборками)
    storageKey: 'holdyou.supabase.auth',
  },
});
