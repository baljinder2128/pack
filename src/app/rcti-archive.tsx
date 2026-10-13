import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Button, Card, Empty, ErrorText, Field, Loading, Muted, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { money, toDMY } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Rcti } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

type ArchiveRow = Rcti & { driver: { full_name: string } | null };

/** Every RCTI ever issued, newest first, with its saved PDF. */
export default function RctiArchive() {
  const { isOffice } = useAuth();
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

  async function open(r: ArchiveRow) {
    setError(null);
    const { data: signed, error: e } = await supabase.storage.from('rcti-pdfs').createSignedUrl(r.pdf_path!, 600);
    if (e || !signed) return setError(e?.message ?? 'Could not open the PDF.');
    // Same tab on web: a new tab opened after a network call is often blocked.
    if (Platform.OS === 'web') window.location.href = signed.signedUrl;
    else Linking.openURL(signed.signedUrl);
  }

  const term = search.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (r) => !term || r.driver?.full_name.toLowerCase().includes(term) || String(r.number) === term,
  );

  return (
    <Screen>
      {isOffice && (
        <Field label="Find a driver or RCTI number" value={search} onChangeText={setSearch} placeholder="e.g. Dan or 12" />
      )}
      <ErrorText>{error ?? loadError}</ErrorText>
      {loading && !data ? (
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
                <Button title="Open PDF" variant="secondary" onPress={() => open(r)} />
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
