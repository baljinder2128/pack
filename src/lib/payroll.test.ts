import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayslip, financialYearStart, weeklyStsl, weeklyTax, yearToDate } from './payroll.ts';

test('weekly PAYG tax, ATO 2026-27 formulas', () => {
  assert.equal(weeklyTax(361, 'tft'), 0); // under the tax-free threshold
  assert.equal(weeklyTax(1000, 'tft'), 138); // 0.3227 x 1000.99 - 185.1935 = 137.83
  assert.equal(weeklyTax(1000.75, 'tft'), 138); // cents are ignored
  assert.equal(weeklyTax(1000, 'no_tft'), 249); // 0.32 x 1000.99 - 71.6508 = 248.67
  assert.equal(weeklyTax(1000, 'foreign'), 300);
  assert.equal(weeklyTax(1000.6, 'no_tfn'), 470);
  assert.equal(weeklyTax(0, 'tft'), 0);
});

test('tax rises smoothly across every band', () => {
  for (const scale of ['tft', 'no_tft', 'foreign'] as const) {
    let last = 0;
    for (let w = 0; w <= 5000; w++) {
      const t = weeklyTax(w, scale);
      assert.ok(t >= last && t - last <= 2, `${scale} at $${w}: ${last} -> ${t}`);
      last = t;
    }
  }
});

test('study loan is only withheld above the threshold', () => {
  assert.equal(weeklyStsl(1300, 'tft'), 0);
  assert.equal(weeklyStsl(1500, 'tft'), 25); // 0.15 x 1500.99 - 200.5615 = 24.59
  assert.equal(weeklyStsl(1500, 'no_tfn'), 0);
});

test('financial year starts 1 July', () => {
  assert.equal(financialYearStart('2026-10-12'), '2026-07-01');
  assert.equal(financialYearStart('2027-06-30'), '2026-07-01');
  assert.equal(financialYearStart('2026-07-01'), '2026-07-01');
});

test('payslip with super, leave and year to date', () => {
  const p = buildPayslip({ lines: [], hours: 38, total: 1140 }, { tax_scale: 'tft', employment_type: 'full_time', has_study_loan: false });
  assert.equal(p.gross, 1140);
  assert.equal(p.tax, weeklyTax(1140, 'tft'));
  assert.equal(p.net, 1140 - p.tax);
  assert.equal(p.super, 136.8);
  assert.equal(p.annualLeave, 2.92);
  assert.equal(p.personalLeave, 1.46);
  const ytd = yearToDate([{ gross: 1000, tax: 138, stsl: 0, super: 120, net: 862, annual_leave: 2.5, personal_leave: 1.2 }], p);
  assert.equal(ytd.gross, 2140);
  assert.equal(ytd.tax, 138 + p.tax);
  assert.equal(ytd.super, 256.8);
  const casual = buildPayslip({ lines: [], hours: 38, total: 1140 }, { tax_scale: 'tft', employment_type: 'casual', has_study_loan: false });
  assert.equal(casual.annualLeave, 0);
});
