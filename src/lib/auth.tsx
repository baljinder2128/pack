import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { AppState, Platform } from 'react-native';

import { supabase } from './supabase';
import { TRACKING_TASK } from './tracking';
import type { Profile } from './types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isOffice: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  isOffice: false,
  refreshProfile: async () => {},
});

const LAST_USED = 'sbt-last-used';
const SIGN_IN_AGAIN_AFTER = 14 * 3600_000;

/** Remember when the app was last open, so a long break can ask for sign-in again. */
function markUsed() {
  AsyncStorage.setItem(LAST_USED, String(Date.now())).catch(() => {});
}

/**
 * The app asks for sign-in again when it hasn't been used for 14 hours (Billa, 2026-10-13),
 * unless the driver is on duty and being tracked: background tracking needs the sign-in.
 */
async function signOutIfIdle() {
  const last = Number(await AsyncStorage.getItem(LAST_USED).catch(() => null)) || 0;
  markUsed();
  if (Date.now() - last < SIGN_IN_AGAIN_AFTER) return;
  const tracking =
    Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false));
  if (!tracking) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    signOutIfIdle()
      .then(() => supabase.auth.getSession())
      .then(async ({ data }) => {
        setSession(data.session);
        await loadProfile(data.session);
        setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s);
    });
    // Coming back after 14 hours away also asks for sign-in again; any use resets the clock.
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') signOutIfIdle();
      else markUsed();
    });
    return () => {
      sub.subscription.unsubscribe();
      app.remove();
    };
  }, [loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isOffice: profile?.role === 'office',
        refreshProfile: () => loadProfile(session),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
