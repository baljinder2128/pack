import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Button, Card, Empty, ErrorText, Field, Loading, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { money, toDMY } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Payslip, Rcti } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

type ArchiveRow = Rcti & { driver: { full_name: string } | null };
type PayslipRow = Payslip & { driver: { full_name: string } | null };

/** Every RCTI and payslip ever issued, newest first, with its saved PDF. */
export default function RctiArchive() {
  const { isOffice } = useAuth();
  const [kind, setKind] = useState<'rcti' | 'payslip'>('rcti');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data, loading, error: loadError } = useFocusQuery(async () => {
    return unwrap(
      await supabase
        .from('rctis')
        .select('*, driver:profiles!rctis_driver_id_fkey(full_name)')
        .order('week_start', { ascending: false })
        .order('number', { ascending: false })
        .limit(1000),
    ) as ArchiveRow[];
  }, []);
  const slips = useFocusQuery(async () => {
    return unwrap(
      await supabase
        .from('payslips')
        .select('*, driver:profiles!payslips_employee_id_fkey(full_name)')
        .order('week_start', { ascending: false })
        .order('number', { ascending: false })
        .limit(1000),
    ) as PayslipRow[];
  }, []);

  async function open(bucket: string, path: string) {
    setError(null);
    const { data: signed, error: e } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
    if (e || !signed) return setError(e?.message ?? 'Could not open the PDF.');
    // Same tab on web: a new tab opened after a network call is often blocked.
    if (Platform.OS === 'web') window.location.href = signed.signedUrl;
    else Linking.openURL(signed.signedUrl);
  }

  const term = search.trim().toLowerCase();
  const slipRows = (slips.data ?? []).filter(
    (r) => !term || r.driver?.full_name.toLowerCase().includes(term) || String(r.number) === term,
  );
  const rows = (data ?? []).filter(
    (r) => !term || r.driver?.full_name.toLowerCase().includes(term) || String(r.number) === term,
  );

  return (
    <Screen>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'rcti', label: 'RCTIs (ABN)' },
          { value: 'payslip', label: 'Payslips (TFN)' },
        ]}
      />
      {isOffice && (
        <Field label="Find a driver or number" value={search} onChangeText={setSearch} placeholder="e.g. Dan or 12" />
      )}
      <ErrorText>{error ?? (kind === 'rcti' ? loadError : slips.error)}</ErrorText>
      {kind === 'payslip' ? (
        slips.loading && !slips.data ? (
          <Loading />
        ) : slipRows.length ? (
          <>
            <Muted>
              {slipRows.length} payslip{slipRows.length === 1 ? '' : 's'} · gross {money(slipRows.reduce((t, r) => t + Number(r.gross), 0))} · tax{' '}
              {money(slipRows.reduce((t, r) => t + Number(r.tax) + Number(r.stsl), 0))}
            </Muted>
            {slipRows.map((r) => (
              <Card key={r.id}>
                <Row>
                  <Title>Payslip #{r.number}</Title>
                  <Muted>{money(r.net)} net</Muted>
                </Row>
                <Muted>
                  {isOffice && r.driver ? `${r.driver.full_name} · ` : ''}
                  Week {toDMY(r.week_start)} to {toDMY(r.week_end)} · paid {toDMY(r.pay_date)}
                </Muted>
                <Muted>
                  Gross {money(r.gross)} · tax {money(Number(r.tax) + Number(r.stsl))} · super {money(r.super)}
                </Muted>
                <Muted>
                  Year to date: gross {money(r.ytd_gross)} · tax {money(r.ytd_tax)} · super {money(r.ytd_super)}
                </Muted>
                {r.pdf_path && <Button title="Open PDF" variant="secondary" onPress={() => open('payslip-pdfs', r.pdf_path!)} />}
              </Card>
            ))}
          </>
        ) : (
          <Empty>{term ? 'No payslips match.' : 'No payslips issued yet.'}</Empty>
        )
      ) : loading && !data ? (
        <Loading />
      ) : rows.length ? (
        <>
          <Muted>
            {rows.length} RCTI{rows.length === 1 ? '' : 's'} · total paid {money(rows.reduce((t, r) => t + Number(r.total), 0))}
          </Muted>
          {rows.map((r) => (
            <Card key={r.id}>
              <Row>
                <Title>RCTI #{r.number}</Title>
                <Muted>{money(r.total)}</Muted>
              </Row>
              <Muted>
                {isOffice && r.driver ? `${r.driver.full_name} · ` : ''}
                Week {toDMY(r.week_start)} to {toDMY(r.week_end)}
              </Muted>
              <Muted>
                GST {money(r.gst)} · issued {formatDateTime(r.issued_at)}
              </Muted>
              {r.pdf_path ? (
                <Button title="Open PDF" variant="secondary" onPress={() => open('rcti-pdfs', r.pdf_path!)} />
              ) : (
                <Muted>Issued before PDFs were saved. Re-issue that week on the RCTI tab to keep a copy.</Muted>
              )}
            </Card>
          ))}
        </>
      ) : (
        <Empty>{term ? 'No RCTIs match.' : 'No RCTIs issued yet.'}</Empty>
      )}
    </Screen>
  );
}
