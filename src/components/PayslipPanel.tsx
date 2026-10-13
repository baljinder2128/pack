import { useState } from 'react';
import { Linking, Platform, Text } from 'react-native';

import { Button, Card, ErrorText, Muted, Row, Title, colors } from '@/components/ui';
import { callFunction } from '@/lib/drivers';
import { formatDateTime } from '@/lib/format';
import { money, toDMY, toISODate, weekEnd, type RctiTotals } from '@/lib/pay';
import { buildPayslip, financialYearStart, SUPER_RATE, TAX_SCALES, yearToDate } from '@/lib/payroll';
import { payslipPdf } from '@/lib/payslipPdf';
import { toBase64 } from '@/lib/rctiPdf';
import { supabase } from '@/lib/supabase';
import type { Company, Payslip, Profile } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

/** The pay week for a TFN employee: tax, super, leave and year to date, then issue and email the payslip. */
export function PayslipPanel({
  driver,
  company,
  pay,
  start,
  isOffice,
}: {
  driver: Profile;
  company: Company;
  pay: RctiTotals;
  start: string;
  isOffice: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const q = useFocusQuery(async () => {
    const issued = unwrap(
      await supabase.from('payslips').select('*').eq('employee_id', driver.id).eq('week_start', start).maybeSingle(),
    ) as Payslip | null;
    // Year to date follows the pay date: 1 July to 30 June.
    const payDate = issued?.pay_date ?? toISODate(new Date());
    const fy = financialYearStart(payDate);
    const earlier = unwrap(
      await supabase
        .from('payslips')
        .select('*')
        .eq('employee_id', driver.id)
        .gte('pay_date', fy)
        .lt('pay_date', `${Number(fy.slice(0, 4)) + 1}-07-01`)
        .neq('week_start', start),
    ) as Payslip[];
    return { issued, payDate, earlier: earlier.filter((p) => p.week_start < start) };
  }, [driver.id, start]);

  const slip = buildPayslip(pay, driver);
  const ytd = q.data ? yearToDate(q.data.earlier, slip) : null;

  async function makePdf(number: number, payDate: string) {
    return payslipPdf({ number, payDate, weekStart: start, weekEnd: weekEnd(start), company, driver, slip, ytd: ytd! });
  }

  async function email(p: Payslip, pdf: Uint8Array) {
    setMsg('Emailing the payslip…');
    try {
      const res = await callFunction<{ ok: true; to: string; employee_error?: string }>('send-payslip', {
        payslip_id: p.id,
        pdf_base64: toBase64(pdf),
      });
      setMsg(
        res.employee_error
          ? `Payslip #${p.number} could not go to ${driver.email}, so it was emailed to ${res.to} instead. To send to drivers, verify your domain in Resend.`
          : `Payslip #${p.number} emailed to ${res.to}${res.to === driver.email ? ' with a copy to the office' : ''}.`,
      );
    } catch (e) {
      setMsg(null);
      throw new Error(`Payslip #${p.number} is issued, but the email failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function issue() {
    if (!q.data || !ytd) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('payslips')
        .upsert(
          {
            employee_id: driver.id,
            week_start: start,
            week_end: weekEnd(start),
            pay_date: q.data.payDate,
            hours: slip.hours,
            gross: slip.gross,
            tax: slip.tax,
            stsl: slip.stsl,
            net: slip.net,
            super: slip.super,
            annual_leave: slip.annualLeave,
            personal_leave: slip.personalLeave,
            ytd_gross: ytd.gross,
            ytd_tax: ytd.tax,
            ytd_super: ytd.super,
            issued_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id,week_start' },
        )
        .select()
        .single();
      if (e) throw new Error(e.message);
      const p = data as Payslip;
      const pdf = await makePdf(p.number, p.pay_date);
      const path = `${driver.id}/Payslip-${p.number}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('payslip-pdfs')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw new Error(`Payslip #${p.number} is issued, but saving the PDF failed: ${uploadError.message}`);
      await supabase.from('payslips').update({ pdf_path: path }).eq('id', p.id);
      q.reload();
      await email(p, pdf);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    const p = q.data?.issued;
    if (!p?.pdf_path) return;
    setError(null);
    const { data: signed, error: e } = await supabase.storage.from('payslip-pdfs').createSignedUrl(p.pdf_path, 600);
    if (e || !signed) return setError(e?.message ?? 'Could not open the PDF.');
    if (Platform.OS === 'web') window.location.href = signed.signedUrl;
    else Linking.openURL(signed.signedUrl);
  }

  async function emailAgain() {
    const p = q.data?.issued;
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      let pdf: Uint8Array | null = null;
      if (p.pdf_path) {
        const { data: blob } = await supabase.storage.from('payslip-pdfs').download(p.pdf_path);
        if (blob) pdf = new Uint8Array(await blob.arrayBuffer());
      }
      pdf ??= await makePdf(p.number, p.pay_date);
      await email(p, pdf);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const issued = q.data?.issued;
  const scale = TAX_SCALES.find((s) => s.value === driver.tax_scale)?.label;

  return (
    <>
      <Card>
        <Title>Payslip (TFN employee)</Title>
        <Row>
          <Text style={{ flex: 1, fontSize: 16 }}>Gross pay ({slip.hours} hrs)</Text>
          <Text style={{ fontSize: 16 }}>{money(slip.gross)}</Text>
        </Row>
        <Row>
          <Text style={{ flex: 1, fontSize: 16 }}>PAYG tax</Text>
          <Text style={{ fontSize: 16 }}>-{money(slip.tax)}</Text>
        </Row>
        {driver.has_study_loan && (
          <Row>
            <Text style={{ flex: 1, fontSize: 16 }}>Study loan (HELP)</Text>
            <Text style={{ fontSize: 16 }}>-{money(slip.stsl)}</Text>
          </Row>
        )}
        <Row>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800' }}>Net pay</Text>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>{money(slip.net)}</Text>
        </Row>
        <Row>
          <Text style={{ flex: 1 }}>Super {Math.round(SUPER_RATE * 100)}% (on top, to {driver.super_fund || 'fund not set'})</Text>
          <Text>{money(slip.super)}</Text>
        </Row>
        {driver.employment_type !== 'casual' && (
          <Muted>
            Leave earned: {slip.annualLeave} hrs annual, {slip.personalLeave} hrs personal
          </Muted>
        )}
        <Muted>{scale}</Muted>
      </Card>
      {ytd && (
        <Card>
          <Title>Year to date (from 1 July)</Title>
          <Muted>
            Gross {money(ytd.gross)} · Tax {money(ytd.tax)} · Net {money(ytd.net)} · Super {money(ytd.super)}
          </Muted>
          {driver.employment_type !== 'casual' && (
            <Muted>
              Leave earned: {ytd.annualLeave} hrs annual, {ytd.personalLeave} hrs personal
            </Muted>
          )}
        </Card>
      )}
      {issued ? (
        <Muted>
          Payslip #{issued.number} issued {formatDateTime(issued.issued_at)}, paid {toDMY(issued.pay_date)}
        </Muted>
      ) : (
        <Muted>Payslip not issued yet</Muted>
      )}
      {isOffice && !driver.super_fund && <Text style={{ color: colors.warning }}>Add their super fund on the Drivers page.</Text>}
      {isOffice && !company.abn && <Text style={{ color: colors.warning }}>Add your company ABN under More → Company details.</Text>}
      {msg && <Text style={{ color: colors.success }}>{msg}</Text>}
      <ErrorText>{error ?? q.error}</ErrorText>
      {isOffice && (
        <>
          <Button
            title={issued ? 'Re-issue payslip & email PDF' : 'Everything OK: issue payslip & email PDF'}
            onPress={issue}
            busy={busy || q.loading}
          />
          {issued && <Button title="Email this payslip again" variant="secondary" onPress={emailAgain} busy={busy} />}
        </>
      )}
      {issued?.pdf_path && <Button title="Open payslip PDF" variant="secondary" onPress={openPdf} busy={busy} />}
    </>
  );
}
