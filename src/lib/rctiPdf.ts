// Builds the RCTI as a real PDF file (A4), the same content as rctiHtml, so it
// can be attached to an email from any device, including the web app.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { LOGO_DATA_URI } from './logo.ts';
import { money, type RctiTotals } from './pay.ts';
import type { Company, Profile } from './types.ts';

const A4: [number, number] = [595.28, 841.89];
const M = 40; // page margin

export function dmy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Standard PDF fonts only cover Latin-1, so swap anything else for '?'. */
export function clean(s: unknown): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/→/g, 'to')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export async function rctiPdf(opts: {
  number: number | null;
  issuedAt: string;
  weekStart: string;
  weekEnd: string;
  company: Company;
  driver: Profile;
  totals: RctiTotals;
}): Promise<Uint8Array> {
  const { number, issuedAt, weekStart, weekEnd, company, driver, totals } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(`RCTI ${number ?? 'draft'} - ${clean(driver.full_name)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(LOGO_DATA_URI.split(',')[1]);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
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

  // Header
  const logoH = 48;
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: A4[0] - M - logoW, y: y - logoH + 10, width: logoW, height: logoH });
  text('Recipient Created Tax Invoice', M, 20, bold);
  y -= 18;
  text(`RCTI no. ${number ?? 'DRAFT'}   Issued ${dmy(issuedAt)}   Period ${dmy(weekStart)} to ${dmy(weekEnd)}`, M, 10);
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
  const yA = party(M, 'Recipient (issuer)', [
    company.name || '(company name not set)',
    company.abn ? `ABN ${company.abn}` : 'ABN not set',
    company.address,
    company.email,
  ]);
  const yB = party(M + colW, 'Supplier (driver)', [
    driver.business_name ? `${driver.business_name} (${driver.full_name})` : driver.full_name,
    driver.abn ? `ABN ${driver.abn}` : 'ABN not set',
    driver.address ?? '',
    driver.gst_registered ? 'Registered for GST' : 'Not registered for GST',
  ]);
  y = Math.min(yA, yB) - 16;

  // Same layout as the payslip: grey section bands, logo top right.
  const band = (title: string) => {
    newPageIfNeeded(40);
    page.drawRectangle({ x: M, y: y - 4, width: A4[0] - 2 * M, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text(title, M + 4, 10, bold);
    y -= 20;
  };

  // Work this week
  const inc = driver.gst_registered ? ' (inc GST)' : '';
  const cols = { date: M + 4, desc: M + 66, qtyR: A4[0] - M - 190, rateR: A4[0] - M - 95, amtR: A4[0] - M - 4 };
  band('Work this week');
  text('Date', cols.date, 9, bold);
  text('Description', cols.desc, 9, bold);
  right('Qty', cols.qtyR, 9, bold);
  right(`Rate${inc}`, cols.rateR, 9, bold);
  right(`Amount${inc}`, cols.amtR, 9, bold);
  y -= 14;
  if (totals.lines.length === 0) {
    text('No paid work this period.', cols.desc, 10);
    y -= 14;
  }
  for (const l of totals.lines) {
    const desc = wrap(l.description, font, 9, cols.qtyR - cols.desc - 50);
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

  // Payment summary
  const labelX = M + 4;
  const row = (label: string, value: string, f = font, size = 10) => {
    newPageIfNeeded(size + 8);
    text(label, labelX, size, f);
    right(value, cols.amtR, size, f);
    y -= size + 6;
  };
  y -= 6;
  band('Payment summary');
  row('Total hours', String(totals.hours));
  row('Subtotal (ex GST)', money(totals.subtotal));
  row(driver.gst_registered ? 'GST included (1/11)' : 'GST (supplier not registered)', money(totals.gst));
  page.drawLine({ start: { x: labelX, y: y + 12 }, end: { x: A4[0] - M, y: y + 12 }, thickness: 1.5 });
  row('Total payable', money(totals.total), bold, 13);

  // Agreement
  y -= 6;
  band('RCTI agreement');
  for (const l of wrap(company.rcti_agreement, font, 8, A4[0] - 2 * M - 8)) {
    newPageIfNeeded(12);
    text(l, M + 4, 8, font, rgb(0.3, 0.3, 0.3));
    y -= 10;
  }
  return doc.save();
}

/** Base64 without Node's Buffer, for the email attachment. */
export function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return out;
}
