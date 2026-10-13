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

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Checks the lookup's answer has what we need, so a bad reply can't crash the screen. */
function toResult(data: unknown, abn: string): AbnResult {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const entityName = str(d.entityName).trim();
  if (!entityName) {
    throw new Error(
      'The ABN lookup did not return a business name. Check the abn-lookup function in Supabase has the SBT code and the ABR_GUID secret.',
    );
  }
  return {
    abn: str(d.abn) || abn,
    status: str(d.status) || 'Unknown',
    entityName,
    entityType: str(d.entityType),
    businessNames: Array.isArray(d.businessNames) ? d.businessNames.map(str).filter(Boolean) : [],
    gstRegistered: d.gstRegistered === true,
    gstFrom: d.gstFrom ? str(d.gstFrom) : null,
    state: str(d.state),
    postcode: str(d.postcode),
  };
}

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
      const r = toResult(await callFunction<unknown>('abn-lookup', { abn: cleanAbn(abn) }), cleanAbn(abn));
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
          {found.gstRegistered
            ? `Registered for GST${found.gstFrom ? ` from ${found.gstFrom.slice(0, 10).split('-').reverse().join('/')}` : ''}`
            : 'NOT registered for GST'}
          {found.state ? ` · ${found.state} ${found.postcode}` : ''}
          {'\n'}Name and GST filled in below. Tap Save to keep them.
        </Text>
      )}
    </>
  );
}
