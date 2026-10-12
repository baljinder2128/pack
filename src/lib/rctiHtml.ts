import { formatDate } from './format';
import { money, type RctiTotals } from './pay';
import type { Company, Profile } from './types';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * HTML for a Recipient Created Tax Invoice. Includes what the ATO requires:
 * the "Recipient created tax invoice" heading, both parties' names and ABNs,
 * issue date, description, GST and the written agreement.
 */
export function rctiHtml(opts: {
  number: number | null;
  issuedAt: string;
  weekStart: string;
  weekEnd: string;
  company: Company;
  driver: Profile;
  totals: RctiTotals;
}): string {
  const { number, issuedAt, weekStart, weekEnd, company, driver, totals } = opts;
  const rows = totals.lines
    .map(
      (l) => `<tr>
        <td>${esc(formatDate(l.date))}</td>
        <td>${esc(l.description)}</td>
        <td class="n">${l.quantity} ${esc(l.unit)}</td>
        <td class="n">${money(l.rate)}</td>
        <td class="n">${money(l.amount)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; font-size: 12px; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .grid { display: flex; gap: 32px; margin: 16px 0; }
  .grid > div { flex: 1; }
  h3 { font-size: 12px; text-transform: uppercase; color: #555; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f3f4f6; }
  .n { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 260px; margin-top: 12px; }
  .totals td { border: none; padding: 3px 4px; }
  .grand td { font-size: 15px; font-weight: 700; border-top: 2px solid #111; }
  .agreement { margin-top: 24px; font-size: 10px; color: #444; }
</style></head>
<body>
  <h1>Recipient Created Tax Invoice</h1>
  <div>RCTI no. ${number ?? 'DRAFT'} &middot; Issued ${esc(new Date(issuedAt).toLocaleDateString('en-AU'))}
    &middot; Period ${esc(formatDate(weekStart))} to ${esc(formatDate(weekEnd))}</div>
  <div class="grid">
    <div>
      <h3>Recipient (issuer)</h3>
      <div><b>${esc(company.name)}</b></div>
      <div>ABN ${esc(company.abn)}</div>
      <div>${esc(company.address)}</div>
      <div>${esc(company.email)}</div>
    </div>
    <div>
      <h3>Supplier</h3>
      <div><b>${esc(driver.business_name || driver.full_name)}</b></div>
      ${driver.business_name ? `<div>${esc(driver.full_name)}</div>` : ''}
      <div>ABN ${esc(driver.abn || 'not provided')}</div>
      <div>${esc(driver.address)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No paid work this period.</td></tr>'}</tbody>
  </table>
  <table class="totals">
    <tr><td>Total hours</td><td class="n">${totals.hours}</td></tr>
    <tr><td>Subtotal (ex GST)</td><td class="n">${money(totals.subtotal)}</td></tr>
    <tr><td>GST${driver.gst_registered ? ' (10%)' : ' (supplier not registered)'}</td><td class="n">${money(totals.gst)}</td></tr>
    <tr class="grand"><td>Total payable</td><td class="n">${money(totals.total)}</td></tr>
  </table>
  <p class="agreement">${esc(company.rcti_agreement)}</p>
</body></html>`;
}
