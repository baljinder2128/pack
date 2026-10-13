import { useState } from 'react';
import { Text } from 'react-native';

import { cleanAbn, formatAbn, isValidAbn } from '@/lib/abn';
import { callFunction } from '@/lib/drivers';
import { Button, ErrorText, colors } from './ui';

export type AbnResult = {
  abn: string;
  status: string;
  entityName: string;
  entityType: string;
  businessNames: string[];
  gstRegistered: boolean;
  gstFrom: string | null;
  state: string;
  postcode: string;
};

/** "Look up ABN" button: checks the ABR and hands back the name and GST status. */
export function AbnLookup({ abn, onResult }: { abn: string; onResult: (r: AbnResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<AbnResult | null>(null);

  async function lookUp() {
    setError(null);
    setFound(null);
    if (!isValidAbn(abn)) return setError('That ABN is not valid. Check the 11 digits.');
    setBusy(true);
    try {
      const r = await callFunction<AbnResult>('abn-lookup', { abn: cleanAbn(abn) });
      setFound(r);
      onResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const active = found?.status === 'Active';
  return (
    <>
      <Button title="Look up ABN (fills name and GST)" variant="secondary" onPress={lookUp} busy={busy} />
      <ErrorText>{error}</ErrorText>
      {found && (
        <Text style={{ color: active ? colors.success : colors.danger }}>
          ABN {formatAbn(found.abn)} · {found.status}
          {'\n'}
          {found.entityName}
          {found.businessNames.length ? ` (trading as ${found.businessNames.join(', ')})` : ''}
          {'\n'}
          {found.gstRegistered ? `Registered for GST from ${found.gstFrom?.slice(0, 10).split('-').reverse().join('/')}` : 'NOT registered for GST'}
          {found.state ? ` · ${found.state} ${found.postcode}` : ''}
          {'\n'}Name and GST filled in below. Tap Save to keep them.
        </Text>
      )}
    </>
  );
}
