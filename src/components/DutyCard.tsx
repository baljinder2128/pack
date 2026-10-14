import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text } from 'react-native';

import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/format';
import { toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { callFunction } from '@/lib/drivers';
import { getSendStatus, onSendStatus, sendCurrentPosition, startTracking, stopTracking, type SendStatus } from '@/lib/tracking';
import { BaseLog } from './BaseLog';
import { Button, Card, ErrorText, Muted, Row, Segmented, Title, colors } from './ui';
import { alert } from '@/lib/alert';

const ANDROID_APP = 'https://baljinder2128.github.io/pack/download/sbt-truckin.apk';
const isAndroidBrowser = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Driver's On duty / Off duty switch. Tracking runs only while on duty. */
export function DutyCard() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SendStatus | null>(getSendStatus());
  const [shift, setShift] = useState<'day' | 'night'>(profile?.shift_type ?? 'day');
  useEffect(() => {
    if (profile?.shift_type) setShift(profile.shift_type);
  }, [profile?.shift_type]);
  useEffect(() => onSendStatus(setSent), []);

  // If the app was reinstalled or permissions reset while on duty, restart tracking.
  useEffect(() => {
    if (profile?.on_duty && profile.tracking_consent_at) startTracking().then(setError);
  }, [profile?.on_duty, profile?.tracking_consent_at]);

  if (!profile) return null;

  async function goOnDuty() {
    if (!profile) return;
    if (!profile.tracking_consent_at) {
      router.push('/tracking-consent');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ on_duty: true, on_duty_since: new Date().toISOString(), shift_type: shift })
      .eq('id', profile.id);
    if (updateError) {
      setBusy(false);
      return setError(
        /shift_type/.test(updateError.message) ? `${updateError.message}. The office needs to run the 0018 SQL in Supabase.` : updateError.message,
      );
    }
    const trackError = await startTracking();
    if (trackError) {
      await supabase.from('profiles').update({ on_duty: false }).eq('id', profile.id);
      setError(trackError);
    } else {
      await sendCurrentPosition(profile.id);
    }
    await refreshProfile();
    setBusy(false);
  }

  async function goOffDuty() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const since = profile.on_duty_since;
    // Drivers send the day's runsheet before they finish (Billa, 2026-10-13).
    if (since) {
      const { data: sheets, error: sheetError } = await supabase
        .from('runsheets')
        .select('id')
        .eq('driver_id', profile.id)
        .eq('kind', 'runsheet')
        .or(`run_date.eq.${toISODate(new Date(since))},submitted_at.gte.${since}`)
        .limit(1);
      if (!sheetError && !sheets?.length) {
        setBusy(false);
        return alert('Send your runsheet first', "You can go off duty once today's runsheet is sent to the office.", [
          { text: 'Not now', style: 'cancel' },
          { text: 'Send runsheet', onPress: () => router.push('/runsheet/new') },
        ]);
      }
    }
    await stopTracking();
    // The server logs the hours (first trip to now), takes them off duty and emails
    // the office the day report.
    const report = since
      ? await callFunction<{ hours: { start: string; end: string; minutes: number } | null }>('licence-alerts', { day_report: true }).then(
          (r) => ({ hours: r.hours, error: null }),
          (e) => ({ hours: null, error: e instanceof Error ? e.message : String(e) }),
        )
      : { hours: null, error: null };
    await supabase.from('profiles').update({ on_duty: false }).eq('id', profile.id);
    await refreshProfile();
    setBusy(false);
    if (report.error) {
      setError(`Off duty, but your hours and day report didn't reach the office: ${report.error}. Call the office.`);
    } else if (since) {
      const h = report.hours;
      alert(
        'Off duty',
        h
          ? `Hours logged: ${formatTime(h.start)} to ${formatTime(h.end)} (${Math.floor(h.minutes / 60)}h ${h.minutes % 60}m). The office has your day report.`
          : 'No hours were logged because no trip was accepted or entered this shift. Call the office if you worked.',
      );
    }
  }

  return (
    <Card>
      <Row>
        <Title>{profile.on_duty ? 'On duty' : 'Off duty'}</Title>
        <Text style={{ marginLeft: 'auto', color: profile.on_duty ? colors.success : colors.muted, fontSize: 22 }}>●</Text>
      </Row>
      <Muted>
        {profile.on_duty
          ? `Since ${formatTime(profile.on_duty_since)}. The office can see your location.`
          : 'Your location is not being shared.'}
      </Muted>
      {profile.on_duty && Platform.OS === 'web' && (
        <Text style={{ color: colors.warning, fontWeight: '600' }}>
          Keep this app open on screen while you drive. If you close it or lock the phone, the office can't see you and
          gets a warning.
        </Text>
      )}
      {Platform.OS === 'web' && isAndroidBrowser && (
        // The Android app keeps tracking with the screen locked; the browser can't.
        <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => Linking.openURL(ANDROID_APP)}>
          On Android? Install the SBT Truckin app so your location keeps sending with the phone locked. Tap here.
        </Text>
      )}
      {profile.on_duty && sent && (
        <Text style={{ color: sent.error ? colors.danger : colors.success, fontWeight: '600' }}>
          {sent.error
            ? `Your location did not reach the office: ${sent.error}`
            : `Location sent to the office at ${formatTime(new Date(sent.at).toISOString())}`}
        </Text>
      )}
      {profile.on_duty && !sent && <Muted>Waiting for your first location fix…</Muted>}
      <ErrorText>{error}</ErrorText>
      <Segmented
        value={shift}
        onChange={(v) => {
          setShift(v);
          // Switching mid-shift (e.g. after first sign-on) saves straight away.
          if (profile.on_duty) supabase.from('profiles').update({ shift_type: v }).eq('id', profile.id).then(() => refreshProfile());
        }}
        options={[
          { value: 'day', label: 'Day shift' },
          { value: 'night', label: 'Night shift' },
        ]}
      />
      {profile.on_duty && shift === 'night' && <BaseLog kind="night_load" driverId={profile.id} since={profile.on_duty_since} />}
      {profile.on_duty ? (
        <Button title="Go off duty" variant="danger" onPress={goOffDuty} busy={busy} />
      ) : (
        <Button title="Go on duty" variant="success" onPress={goOnDuty} busy={busy} />
      )}
    </Card>
  );
}
