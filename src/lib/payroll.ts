// Payslips for TFN employees: PAYG withholding, STSL (HELP), super and
// leave, worked out for one Monday to Saturday pay week.
// No React imports so it can be unit tested with plain Node.
//
// Tax uses the ATO's weekly formulas, published 17 June 2026 for payments
// made from 1 July 2026:
//   Schedule 1 (NAT 1004), PAYG withholding coefficients for weekly payments
//   Schedule 8 (NAT 3539), study and training support loan components
// Check these each July: the ATO usually publishes new coefficients in June.
import { round2, type RctiLine } from './pay.ts';

export type TaxScale = 'tft' | 'no_tft' | 'foreign' | 'no_tfn';
export type EmploymentType = 'full_time' | 'part_time' | 'casual';

export const TAX_SCALES: { value: TaxScale; label: string }[] = [
  { value: 'tft', label: 'Claims tax-free threshold (most people)' },
  { value: 'no_tft', label: 'No tax-free threshold (second job)' },
  { value: 'foreign', label: 'Foreign resident' },
  { value: 'no_tfn', label: 'TFN not given (47% tax)' },
];

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'casual', label: 'Casual (no paid leave, 25% loading in rate)' },
];

/** Super guarantee rate from 1 July 2025. */
export const SUPER_RATE = 0.12;

// [weekly earnings less than, a, b]; the last band has no upper limit.
type Band = [number, number, number];
const SCALE_1: Band[] = [
  [188, 0.15, 0.15],
  [371, 0.2084, 11.0185],
  [515, 0.179, 0.1066],
  [932, 0.3227, 74.1674],
  [2246, 0.32, 71.6508],
  [3303, 0.39, 228.8816],
  [Infinity, 0.47, 493.1893],
];
const SCALE_2: Band[] = [
  [362, 0, 0],
  [538, 0.15, 54.3462],
  [673, 0.25, 108.2135],
  [721, 0.17, 54.3473],
  [865, 0.179, 60.8377],
  [1282, 0.3227, 185.1935],
  [2596, 0.32, 181.7319],
  [3653, 0.39, 363.4627],
  [Infinity, 0.47, 655.7704],
];
const SCALE_3: Band[] = [
  [2596, 0.3, 0.3],
  [3653, 0.37, 181.7308],
  [Infinity, 0.45, 474.0385],
];
const STSL_TFT: Band[] = [
  [1337, 0, 0],
  [2494, 0.15, 200.5615],
  [3577, 0.17, 250.4527],
  [Infinity, 0.1, 0],
];
const STSL_NO_TFT: Band[] = [
  [987, 0, 0],
  [2144, 0.15, 148.0615],
  [2727, 0.17, 190.9527],
  [Infinity, 0.1, 0],
];

/** Nearest dollar, with 50 cents rounding up (ATO rule). */
function roundDollar(n: number): number {
  return Math.floor(n + 0.5 + 1e-9);
}

function formula(bands: Band[], weekly: number): number {
  const x = Math.floor(weekly) + 0.99;
  const [, a, b] = bands.find(([lessThan]) => x < lessThan)!;
  return Math.max(0, roundDollar(a * x - b));
}

/** PAYG tax to withhold from one week's pay. */
export function weeklyTax(gross: number, scale: TaxScale): number {
  if (gross <= 0) return 0;
  switch (scale) {
    case 'tft':
      return formula(SCALE_2, gross);
    case 'no_tft':
      return formula(SCALE_1, gross);
    case 'foreign':
      return formula(SCALE_3, gross);
    case 'no_tfn':
      return Math.floor(Math.floor(gross) * 0.47);
  }
}

/** Extra withheld for a study or training support loan (HELP, VSL, etc). */
export function weeklyStsl(gross: number, scale: TaxScale): number {
  if (gross <= 0 || scale === 'no_tfn') return 0;
  return formula(scale === 'no_tft' ? STSL_NO_TFT : STSL_TFT, gross);
}

/** Australian financial year (1 July) that a date falls in, e.g. '2026-07-01'. */
export function financialYearStart(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${m >= 7 ? y : y - 1}-07-01`;
}

/** Leave earned per hour worked (National Employment Standards, 38 hr week). */
export const ANNUAL_LEAVE_PER_HOUR = 4 / 52; // 4 weeks a year
export const PERSONAL_LEAVE_PER_HOUR = 1 / 26; // 10 days a year

export type PayslipEmployee = {
  tax_scale: TaxScale;
  employment_type: EmploymentType;
  has_study_loan: boolean;
};

export type PayslipTotals = {
  lines: RctiLine[];
  hours: number;
  gross: number;
  tax: number;
  stsl: number;
  net: number;
  super: number;
  annualLeave: number;
  personalLeave: number;
};

export type YearToDate = { gross: number; tax: number; super: number; net: number; annualLeave: number; personalLeave: number };

/**
 * One week's payslip from the same pay lines as an RCTI (hours at the
 * driver's rate plus any paid trips). Employees aren't charged GST, so the
 * rate is the gross pay rate.
 */
export function buildPayslip(
  pay: { lines: RctiLine[]; hours: number; total: number },
  employee: PayslipEmployee,
): PayslipTotals {
  const gross = round2(pay.total);
  const tax = weeklyTax(gross, employee.tax_scale);
  const stsl = employee.has_study_loan ? weeklyStsl(gross, employee.tax_scale) : 0;
  const leave = employee.employment_type === 'casual' ? 0 : pay.hours;
  return {
    lines: pay.lines,
    hours: pay.hours,
    gross,
    tax,
    stsl,
    net: round2(gross - tax - stsl),
    super: round2(gross * SUPER_RATE),
    annualLeave: round2(leave * ANNUAL_LEAVE_PER_HOUR),
    personalLeave: round2(leave * PERSONAL_LEAVE_PER_HOUR),
  };
}

type IssuedLike = { gross: number; tax: number; stsl: number; super: number; net: number; annual_leave: number; personal_leave: number };

/** Adds this week to the payslips already issued earlier in the financial year. */
export function yearToDate(earlier: IssuedLike[], week: PayslipTotals): YearToDate {
  const sum = (f: (p: IssuedLike) => number) => earlier.reduce((t, p) => t + Number(f(p)), 0);
  return {
    gross: round2(sum((p) => p.gross) + week.gross),
    tax: round2(sum((p) => Number(p.tax) + Number(p.stsl)) + week.tax + week.stsl),
    super: round2(sum((p) => p.super) + week.super),
    net: round2(sum((p) => p.net) + week.net),
    annualLeave: round2(sum((p) => p.annual_leave) + week.annualLeave),
    personalLeave: round2(sum((p) => p.personal_leave) + week.personalLeave),
  };
}
