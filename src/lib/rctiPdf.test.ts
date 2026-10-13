import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRcti, shiftTimes } from './pay.ts';
import { rctiPdf, toBase64 } from './rctiPdf.ts';

test('base64 matches Node', () => {
  for (const n of [0, 1, 2, 3, 10, 257]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
    assert.equal(toBase64(b), Buffer.from(b).toString('base64'));
  }
});

test('builds an RCTI PDF', async () => {
  const t = shiftTimes('2026-10-13', '06:00', '16:00')!;
  const totals = buildRcti(
    [{ trip_date: '2026-10-13', pickup: 'Melbourne → Port', dropoff: 'Geelong', truck_rego: 'XY12AB', job_ref: '55', amount: 450, status: 'completed' }],
    [{ shift_date: '2026-10-13', start_at: t.start.toISOString(), end_at: t.end.toISOString(), break_minutes: 30 }],
    40,
    true,
  );
  const pdf = await rctiPdf({
    number: 7,
    issuedAt: '2026-10-19T01:00:00Z',
    weekStart: '2026-10-12',
    weekEnd: '2026-10-17',
    company: { id: 1, name: 'SBT Truckin Pty Ltd', abn: '12 345 678 901', address: '1 Road St, Melbourne VIC', email: 'sbtruckin@outlook.com', rcti_agreement: 'The recipient and the supplier agree that the recipient will issue tax invoices.' },
    driver: { full_name: 'Dan Driver', abn: '98 765 432 109', business_name: null, address: null, gst_registered: true } as never,
    totals,
  });
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), '%PDF-');
  if (process.env.RCTI_PDF_OUT) fs.writeFileSync(process.env.RCTI_PDF_OUT, pdf);
});
