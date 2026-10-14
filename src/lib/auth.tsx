import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { alert } from './alert';
import { callFunction } from './drivers';
import { supabase } from './supabase';
import { stopTracking } from './tracking';
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
// Longest a driver can be on duty (Billa, 2026-10-14). The server checks too, every 15 minutes.
const MAX_DUTY = 14 * 3600_000;
const BREACH_SEEN = 'sbt-breach-seen';

/** Remember when the app was last open, so a long break can ask for sign-in again. */
function markUsed() {
  AsyncStorage.setItem(LAST_USED, String(Date.now())).catch(() => {});
}

async function breachSignOut(breachAt: string | null) {
  if (breachAt) await AsyncStorage.setItem(BREACH_SEEN, breachAt).catch(() => {});
  await stopTracking().catch(() => {});
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  alert(
    'Signed out after 14 hours on duty',
    'You went over the 14 hour limit, so the app took you off duty and logged your hours. You need to report the breach to the office.',
  );
}

let checking = false;

/**
 * Runs when the app opens, comes back to the screen, and every few minutes:
 *  - a driver on duty over 14 hours is taken off duty (hours logged, office and driver
 *    emailed about the breach) and signed out;
 *  - a driver the server already took off for it is signed out once;
 *  - anyone else who hasn't used the app for 14 hours signs in again (Billa, 2026-10-13),
 *    unless they're on duty: background tracking needs the sign-in.
 */
async function checkLimits() {
  if (checking) return;
  checking = true;
  try {
    const last = Number(await AsyncStorage.getItem(LAST_USED).catch(() => null)) || 0;
    markUsed();
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s) return;
    const { data: me } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    const p = me as Profile | null;
    if (p?.on_duty && p.on_duty_since && Date.now() - Date.parse(p.on_duty_since) > MAX_DUTY) {
      await callFunction('licence-alerts', { day_report: true }).catch(() => {});
      await supabase.from('profiles').update({ on_duty: false }).eq('id', s.user.id);
      return breachSignOut(new Date().toISOString());
    }
    const seen = await AsyncStorage.getItem(BREACH_SEEN).catch(() => null);
    const signedInAt = s.user.last_sign_in_at ? Date.parse(s.user.last_sign_in_at) : 0;
    if (p?.duty_breach_at && p.duty_breach_at !== seen && Date.parse(p.duty_breach_at) > signedInAt) {
      return breachSignOut(p.duty_breach_at);
    }
    if (Date.now() - last < SIGN_IN_AGAIN_AFTER || p?.on_duty) return;
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } finally {
    checking = false;
  }
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
    checkLimits()
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
    // Coming back to the app checks again; any use resets the idle clock.
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkLimits();
      else markUsed();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') checkLimits();
    }, 5 * 60_000);
    return () => {
      sub.subscription.unsubscribe();
      app.remove();
      clearInterval(timer);
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
