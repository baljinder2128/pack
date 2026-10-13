import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { router } from 'expo-router';
import { Platform, Text } from 'react-native';

import { DriverPicker } from '@/components/DriverPicker';
import { PayslipPanel } from '@/components/PayslipPanel';
import { WeekNav } from '@/components/WeekNav';
import { Button, Card, Empty, ErrorText, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { callFunction, listDrivers } from '@/lib/drivers';
import { formatDate, formatDateTime } from '@/lib/format';
import { addDays, buildRcti, money, round2, shiftHours, toISODate, weekEnd, weekStart } from '@/lib/pay';
import { rctiHtml } from '@/lib/rctiHtml';
import { rctiPdf, toBase64 } from '@/lib/rctiPdf';
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
  const [msg, setMsg] = useState<string | null>(null);

  const drivers = useFocusQuery(async () => (isOffice ? listDrivers({ includeRemoved: true }) : []), [isOffice]);
  const selectedId = driverId ?? (isOffice ? null : profile?.id ?? null);

  const week = useFocusQuery(async () => {
    if (!selectedId) return null;
    const end = weekEnd(start);
    const sunday = addDays(start, 6); // fetched only to warn about Sunday work
    const [driverRes, tripsRes, shiftsRes, companyRes, rctiRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', selectedId).single(),
      supabase.from('trips').select('*').eq('driver_id', selectedId).gte('trip_date', start).lte('trip_date', sunday),
      supabase.from('shifts').select('*').eq('driver_id', selectedId).gte('shift_date', start).lte('shift_date', sunday),
      supabase.from('company').select('*').eq('id', 1).single(),
      supabase.from('rctis').select('*').eq('driver_id', selectedId).eq('week_start', start).maybeSingle(),
    ]);
    const driver = unwrap(driverRes) as Profile;
    const allTrips = unwrap(tripsRes) as Trip[];
    const allShifts = unwrap(shiftsRes) as Shift[];
    const trips = allTrips.filter((t) => t.trip_date <= end);
    const shifts = allShifts.filter((x) => x.shift_date <= end);
    const sundayEntries = allTrips.length - trips.length + allShifts.length - shifts.length;
    // Monday to Saturday: hours and trips logged each day, so gaps stand out.
    const days = [0, 1, 2, 3, 4, 5].map((i) => {
      const date = addDays(start, i);
      const dayShifts = shifts.filter((x) => x.shift_date === date);
      return {
        date,
        hours: round2(dayShifts.reduce((h, x) => h + shiftHours(x.start_at, x.end_at, x.break_minutes), 0)),
        trips: trips.filter((t) => t.trip_date === date).length,
      };
    });
    const company = unwrap(companyRes) as Company;
    const issued = (rctiRes.data as Rcti | null) ?? null;
    const totals = buildRcti(trips, shifts, Number(driver.hourly_rate), driver.gst_registered);
    const openTrips = trips.filter((t) => t.status !== 'completed').length;
    return { driver, trips, company, issued, totals, openTrips, days, sundayEntries };
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
      // Keep the PDF exactly as issued, for the archive.
      const pdf = await rctiPdf({ number: rcti.number, issuedAt: rcti.issued_at, weekStart: start, weekEnd: weekEnd(start), ...w });
      const path = `${w.driver.id}/RCTI-${rcti.number}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('rcti-pdfs')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      // Still email it if the archive copy can't be saved (e.g. the bucket isn't set up yet).
      if (!uploadError) await supabase.from('rctis').update({ pdf_path: path }).eq('id', rcti.id);
      week.reload();
      await emailRcti(rcti, pdf);
      if (uploadError)
        throw new Error(`RCTI #${rcti.number} was emailed, but it couldn't be saved to the archive: ${uploadError.message}. Run the 0005 SQL in Supabase, then re-issue.`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function emailRcti(rcti: Rcti, pdf: Uint8Array) {
    setMsg('Emailing the RCTI to the office…');
    try {
      await callFunction('send-rcti', { rcti_id: rcti.id, pdf_base64: toBase64(pdf) });
      setMsg(`RCTI #${rcti.number} emailed to sbtruckin@outlook.com as a PDF.`);
    } catch (e) {
      setMsg(null);
      throw new Error(`RCTI #${rcti.number} is issued, but the email failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function emailAgain() {
    if (!week.data?.issued) return;
    setBusy(true);
    setActionError(null);
    try {
      const w = week.data;
      const rcti = w.issued!;
      // Email the archived copy when there is one, so it matches what was issued.
      let pdf: Uint8Array | null = null;
      if (rcti.pdf_path) {
        const { data: blob } = await supabase.storage.from('rcti-pdfs').download(rcti.pdf_path);
        if (blob) pdf = new Uint8Array(await blob.arrayBuffer());
      }
      pdf ??= await rctiPdf({ number: rcti.number, issuedAt: rcti.issued_at, weekStart: start, weekEnd: weekEnd(start), ...w });
      await emailRcti(rcti, pdf);
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
  const tfn = w?.driver.pay_type === 'tfn';

  return (
    <Screen>
      <Button title="Archive: all RCTIs and payslips" variant="secondary" onPress={() => router.push('/rcti-archive')} />
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
              {formatDate(start)} – {formatDate(weekEnd(start))} · {tfn ? 'TFN employee (payslip)' : 'ABN contractor (RCTI)'}
            </Muted>
            {!tfn && (
              <>
                <Text style={{ fontSize: 16 }}>Hours: {w.totals.hours}</Text>
                <Text style={{ fontSize: 16 }}>Subtotal (ex GST): {money(w.totals.subtotal)}</Text>
                <Text style={{ fontSize: 16 }}>GST included: {money(w.totals.gst)}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800' }}>Total (inc GST): {money(w.totals.total)}</Text>
                {w.issued ? (
                  <Muted>
                    RCTI #{w.issued.number} issued {formatDateTime(w.issued.issued_at)}
                  </Muted>
                ) : (
                  <Muted>Not issued yet</Muted>
                )}
              </>
            )}
          </Card>
          <Card>
            <Title>Each day</Title>
            {w.days.map((d) => (
              <Row key={d.date}>
                <Text style={{ flex: 1 }}>{formatDate(d.date)}</Text>
                <Text style={{ color: d.hours || d.trips ? colors.text : colors.warning, fontWeight: '600' }}>
                  {d.hours || d.trips
                    ? `${d.hours} hrs${d.trips ? ` · ${d.trips} trip${d.trips === 1 ? '' : 's'}` : ''}`
                    : 'Nothing logged'}
                </Text>
              </Row>
            ))}
            <Muted>Check every day is right before issuing.</Muted>
          </Card>
          {w.sundayEntries > 0 && (
            <Text style={{ color: colors.warning }}>
              {w.sundayEntries} entr{w.sundayEntries === 1 ? 'y is' : 'ies are'} on Sunday, which is outside the Monday to
              Saturday pay week, so {w.sundayEntries === 1 ? 'it is' : 'they are'} not paid this week.
            </Text>
          )}
          {w.openTrips > 0 && (
            <Text style={{ color: colors.warning }}>
              {w.openTrips} trip(s) this week are not completed and are left off this week's pay.
            </Text>
          )}
          {isOffice && !tfn && !w.driver.abn && <Text style={{ color: colors.warning }}>This driver has no ABN on file.</Text>}
          {isOffice && !tfn && !w.company.abn && (
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
          {tfn && <PayslipPanel driver={w.driver} company={w.company} pay={w.totals} start={start} isOffice={isOffice} />}
          {!tfn && (
            <>
              {msg && <Text style={{ color: colors.success }}>{msg}</Text>}
              <ErrorText>{actionError ?? week.error}</ErrorText>
              {isOffice ? (
                <>
                  <Button title={w.issued ? 'Re-issue RCTI & email PDF' : 'Everything OK: issue RCTI & email PDF'} onPress={issue} busy={busy} />
                  {w.issued && <Button title="Email this RCTI again" variant="secondary" onPress={emailAgain} busy={busy} />}
                </>
              ) : (
                w.issued && <Button title="Download my RCTI (PDF)" onPress={download} busy={busy} />
              )}
              {isOffice && <Button title="Preview PDF" variant="secondary" onPress={download} busy={busy} />}
            </>
          )}
        </>
      ) : (
        <ErrorText>{week.error}</ErrorText>
      )}
    </Screen>
  );
}
