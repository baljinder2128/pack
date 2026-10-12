import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { DriverPicker } from '@/components/DriverPicker';
import { WeekNav } from '@/components/WeekNav';
import { Button, Card, Empty, ErrorText, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDrivers } from '@/lib/drivers';
import { formatDate, formatDateTime } from '@/lib/format';
import { buildRcti, money, toISODate, weekEnd, weekStart } from '@/lib/pay';
import { rctiHtml } from '@/lib/rctiHtml';
import { supabase } from '@/lib/supabase';
import type { Company, Profile, Rcti, Shift, Trip } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

async function sharePdf(html: string, fileName: string) {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
}

export default function RctiScreen() {
  const { profile, isOffice } = useAuth();
  // Default to last week: RCTIs are done once the week has finished.
  const [start, setStart] = useState(weekStart(toISODate(new Date(Date.now() - 7 * 86400000))));
  const [driverId, setDriverId] = useState<string | null>(isOffice ? null : profile?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const drivers = useFocusQuery(async () => (isOffice ? listDrivers({ includeRemoved: true }) : []), [isOffice]);
  const selectedId = driverId ?? (isOffice ? null : profile?.id ?? null);

  const week = useFocusQuery(async () => {
    if (!selectedId) return null;
    const end = weekEnd(start);
    const [driverRes, tripsRes, shiftsRes, companyRes, rctiRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', selectedId).single(),
      supabase.from('trips').select('*').eq('driver_id', selectedId).gte('trip_date', start).lte('trip_date', end),
      supabase.from('shifts').select('*').eq('driver_id', selectedId).gte('shift_date', start).lte('shift_date', end),
      supabase.from('company').select('*').eq('id', 1).single(),
      supabase.from('rctis').select('*').eq('driver_id', selectedId).eq('week_start', start).maybeSingle(),
    ]);
    const driver = unwrap(driverRes) as Profile;
    const trips = unwrap(tripsRes) as Trip[];
    const shifts = unwrap(shiftsRes) as Shift[];
    const company = unwrap(companyRes) as Company;
    const issued = (rctiRes.data as Rcti | null) ?? null;
    const totals = buildRcti(trips, shifts, Number(driver.hourly_rate), driver.gst_registered);
    const openTrips = trips.filter((t) => t.status !== 'completed').length;
    return { driver, trips, company, issued, totals, openTrips };
  }, [selectedId, start]);

  async function issue() {
    const w = week.data;
    if (!w) return;
    setBusy(true);
    setActionError(null);
    try {
      const { data, error } = await supabase
        .from('rctis')
        .upsert(
          {
            driver_id: w.driver.id,
            week_start: start,
            week_end: weekEnd(start),
            subtotal: w.totals.subtotal,
            gst: w.totals.gst,
            total: w.totals.total,
            issued_at: new Date().toISOString(),
          },
          { onConflict: 'driver_id,week_start' },
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      const rcti = data as Rcti;
      await sharePdf(
        rctiHtml({ number: rcti.number, issuedAt: rcti.issued_at, weekStart: start, weekEnd: weekEnd(start), ...w }),
        `RCTI ${rcti.number}`,
      );
      week.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const w = week.data;
    if (!w) return;
    setBusy(true);
    try {
      await sharePdf(
        rctiHtml({
          number: w.issued?.number ?? null,
          issuedAt: w.issued?.issued_at ?? new Date().toISOString(),
          weekStart: start,
          weekEnd: weekEnd(start),
          ...w,
        }),
        w.issued ? `RCTI ${w.issued.number}` : 'RCTI draft',
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const w = week.data;

  return (
    <Screen>
      <WeekNav start={start} onChange={setStart} />
      {isOffice && drivers.data && (
        <DriverPicker drivers={drivers.data} value={selectedId} onChange={setDriverId} />
      )}
      {!selectedId ? (
        <Empty>Choose a driver to see their week.</Empty>
      ) : week.loading && !w ? (
        <Loading />
      ) : w ? (
        <>
          <Card>
            <Title>{w.driver.full_name}</Title>
            <Muted>
              {formatDate(start)} – {formatDate(weekEnd(start))}
            </Muted>
            <Text style={{ fontSize: 16 }}>Hours: {w.totals.hours}</Text>
            <Text style={{ fontSize: 16 }}>Subtotal: {money(w.totals.subtotal)}</Text>
            <Text style={{ fontSize: 16 }}>GST: {money(w.totals.gst)}</Text>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>Total: {money(w.totals.total)}</Text>
            {w.issued ? (
              <Muted>
                RCTI #{w.issued.number} issued {formatDateTime(w.issued.issued_at)}
              </Muted>
            ) : (
              <Muted>Not issued yet</Muted>
            )}
          </Card>
          {w.openTrips > 0 && (
            <Text style={{ color: colors.warning }}>
              {w.openTrips} trip(s) this week are not completed and are left off the RCTI.
            </Text>
          )}
          {isOffice && !w.driver.abn && <Text style={{ color: colors.warning }}>This driver has no ABN on file.</Text>}
          {isOffice && !w.company.abn && (
            <Text style={{ color: colors.warning }}>Add your company ABN under More → Company details.</Text>
          )}
          {w.totals.lines.map((l, i) => (
            <Card key={i}>
              <Row>
                <Text style={{ flex: 1, fontWeight: '600' }}>{l.description}</Text>
                <Text style={{ fontWeight: '700' }}>{money(l.amount)}</Text>
              </Row>
              <Muted>
                {formatDate(l.date)} · {l.quantity} {l.unit} × {money(l.rate)}
              </Muted>
            </Card>
          ))}
          {w.totals.lines.length === 0 && <Empty>No paid trips or hours this week.</Empty>}
          <ErrorText>{actionError ?? week.error}</ErrorText>
          {isOffice ? (
            <Button title={w.issued ? 'Re-issue RCTI & share PDF' : 'Issue RCTI & share PDF'} onPress={issue} busy={busy} />
          ) : (
            w.issued && <Button title="Download my RCTI (PDF)" onPress={download} busy={busy} />
          )}
          {isOffice && <Button title="Preview PDF" variant="secondary" onPress={download} busy={busy} />}
        </>
      ) : (
        <ErrorText>{week.error}</ErrorText>
      )}
    </Screen>
  );
}
