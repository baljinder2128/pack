// Builds an employee payslip as a PDF (A4), with everything the Fair Work
// Act asks a payslip to show: employer and ABN, pay period and pay date,
// hours and rate, gross and net pay, tax withheld, super and fund, plus
// year to date totals and leave earned.
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';

import { LOGO_DATA_URI } from './logo.ts';
import { money } from './pay.ts';
import { EMPLOYMENT_TYPES, SUPER_RATE, TAX_SCALES, type PayslipTotals, type YearToDate } from './payroll.ts';
import { clean, dmy, wrap } from './rctiPdf.ts';
import type { Company, Profile } from './types.ts';

const A4: [number, number] = [595.28, 841.89];
const M = 40;

export async function payslipPdf(opts: {
  number: number | null;
  payDate: string;
  weekStart: string;
  weekEnd: string;
  company: Company;
  driver: Profile;
  slip: PayslipTotals;
  ytd: YearToDate;
}): Promise<Uint8Array> {
  const { number, payDate, weekStart, weekEnd, company, driver, slip, ytd } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(`Payslip ${number ?? 'draft'} - ${clean(driver.full_name)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(LOGO_DATA_URI.split(',')[1]);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const grey = rgb(0.3, 0.3, 0.3);
  const text = (s: string, x: number, size = 10, f = font, color = rgb(0.07, 0.07, 0.07)) =>
    page.drawText(clean(s), { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 10, f = font) =>
    page.drawText(clean(s), { x: xRight - f.widthOfTextAtSize(clean(s), size), y, size, font: f });
  const newPageIfNeeded = (need: number) => {
    if (y - need < M) {
      page = doc.addPage(A4);
      y = A4[1] - M;
    }
  };
  const band = (title: string) => {
    newPageIfNeeded(40);
    page.drawRectangle({ x: M, y: y - 4, width: A4[0] - 2 * M, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text(title, M + 4, 10, bold);
    y -= 20;
  };

  // Header
  const logoH = 48;
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: A4[0] - M - logoW, y: y - logoH + 10, width: logoW, height: logoH });
  text('Payslip', M, 20, bold);
  y -= 18;
  text(`Payslip no. ${number ?? 'DRAFT'}   Paid ${dmy(payDate)}   Period ${dmy(weekStart)} to ${dmy(weekEnd)}`, M, 10);
  y -= 34;

  // Parties
  const colW = (A4[0] - 2 * M) / 2;
  const party = (x: number, title: string, rows: string[]) => {
    let yy = y;
    page.drawText(title, { x, y: yy, size: 11, font: bold });
    yy -= 15;
    for (const r of rows.filter(Boolean)) {
      for (const l of wrap(r, font, 10, colW - 12)) {
        page.drawText(l, { x, y: yy, size: 10, font });
        yy -= 13;
      }
    }
    return yy;
  };
  const employment = EMPLOYMENT_TYPES.find((e) => e.value === driver.employment_type)?.label.split(' (')[0] ?? '';
  const yA = party(M, 'Employer', [
    company.name || '(company name not set)',
    company.abn ? `ABN ${company.abn}` : 'ABN not set',
    company.address,
  ]);
  const yB = party(M + colW, 'Employee', [
    driver.full_name,
    `${employment} employee`,
    driver.address ?? '',
    driver.start_date ? `Started ${dmy(driver.start_date)}` : '',
  ]);
  y = Math.min(yA, yB) - 16;

  // Earnings
  const cols = { date: M + 4, desc: M + 66, qtyR: A4[0] - M - 190, rateR: A4[0] - M - 95, amtR: A4[0] - M - 4 };
  band('Earnings');
  if (slip.lines.length === 0) {
    text('No paid work this period.', cols.desc, 10);
    y -= 14;
  }
  for (const l of slip.lines) {
    const desc = wrap(l.description === 'Driving hours' ? 'Ordinary hours' : l.description, font, 9, cols.qtyR - cols.desc - 50);
    newPageIfNeeded(desc.length * 12 + 6);
    text(dmy(l.date), cols.date, 9);
    right(`${l.quantity} ${l.unit}`, cols.qtyR, 9);
    right(`${money(l.rate)}${l.unit === 'hrs' ? '/hr' : ''}`, cols.rateR, 9);
    right(money(l.amount), cols.amtR, 9);
    for (const d of desc) {
      text(d, cols.desc, 9);
      y -= 12;
    }
    y -= 2;
  }

  // Summary, with year to date beside this pay
  const labelX = M + 4;
  const thisR = A4[0] - M - 110;
  const ytdR = A4[0] - M - 4;
  const row = (label: string, now: string, toDate: string, f = font, size = 10) => {
    newPageIfNeeded(size + 8);
    text(label, labelX, size, f);
    right(now, thisR, size, f);
    right(toDate, ytdR, size, f);
    y -= size + 6;
  };
  y -= 6;
  band('Pay summary');
  row('', 'This pay', 'Year to date', bold, 9);
  row(`Gross pay (${slip.hours} hrs)`, money(slip.gross), money(ytd.gross));
  row('PAYG tax withheld', `-${money(slip.tax)}`, '');
  if (slip.stsl > 0 || driver.has_study_loan) row('Study loan (HELP) withheld', `-${money(slip.stsl)}`, '');
  row('Total tax withheld', `-${money(slip.tax + slip.stsl)}`, money(ytd.tax));
  page.drawLine({ start: { x: labelX, y: y + 12 }, end: { x: A4[0] - M, y: y + 12 }, thickness: 1.5 });
  row('Net pay', money(slip.net), money(ytd.net), bold, 13);

  y -= 6;
  band('Superannuation (paid by employer, not taken from your pay)');
  row(`Super guarantee ${Math.round(SUPER_RATE * 100)}%`, money(slip.super), money(ytd.super));
  text(`Fund: ${driver.super_fund || 'not set'}${driver.super_member_no ? `   Member no. ${driver.super_member_no}` : ''}`, labelX, 9);
  y -= 16;

  if (driver.employment_type !== 'casual') {
    band('Leave earned');
    row('Annual leave (hours)', String(slip.annualLeave), String(ytd.annualLeave));
    row('Personal / carer\'s leave (hours)', String(slip.personalLeave), String(ytd.personalLeave));
    y -= 4;
  }

  y -= 8;
  const scale = (TAX_SCALES.find((s) => s.value === driver.tax_scale)?.label ?? '').replace(/ \(.*\)$/, '');
  for (const l of wrap(
    `Tax worked out with the ATO weekly withholding formulas for 2026-27 (${scale}). ` +
      'Year to date is from 1 July. Keep this payslip for your records.',
    font,
    8,
    A4[0] - 2 * M,
  )) {
    newPageIfNeeded(12);
    text(l, M, 8, font, grey);
    y -= 10;
  }
  return doc.save();
}
