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

test('builds a payslip PDF', async () => {
  const { buildPayslip, yearToDate } = await import('./payroll.ts');
  const { payslipPdf } = await import('./payslipPdf.ts');
  const t = shiftTimes('2026-10-13', '06:00', '16:00')!;
  const pay = buildRcti([], [{ shift_date: '2026-10-13', start_at: t.start.toISOString(), end_at: t.end.toISOString(), break_minutes: 30 }], 38.5, false);
  const driver = { full_name: 'Tia Employee', employment_type: 'full_time', tax_scale: 'tft', has_study_loan: true, super_fund: 'AustralianSuper', super_member_no: '123456', start_date: '2025-07-01', address: '2 Lane, Dandenong VIC' } as never;
  const slip = buildPayslip(pay, driver);
  const pdf = await payslipPdf({
    number: 3,
    payDate: '2026-10-19',
    weekStart: '2026-10-12',
    weekEnd: '2026-10-17',
    company: { id: 1, name: 'SBT Truckin Pty Ltd', abn: '12 345 678 901', address: '1 Road St, Melbourne VIC', email: 'sbtruckin@outlook.com', rcti_agreement: '' },
    driver,
    slip,
    ytd: yearToDate([{ gross: 5000, tax: 700, stsl: 0, super: 600, net: 4300, annual_leave: 12, personal_leave: 6 }], slip),
  });
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), '%PDF-');
  if (process.env.PAYSLIP_PDF_OUT) fs.writeFileSync(process.env.PAYSLIP_PDF_OUT, pdf);
});
