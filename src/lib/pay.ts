// Pure date and pay maths, shared by the hours, trips and RCTI screens.
// No imports so it can be unit tested with plain Node.

/** Local date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

/**
 * Reads a date typed the Australian way (13/10/2026, 13-10-26, 13.10.2026)
 * or as 2026-10-13. Returns YYYY-MM-DD, or null if it isn't a real date.
 */
export function parseDateInput(input: string): string | null {
  const s = input.trim();
  if (isISODate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/** YYYY-MM-DD as DD/MM/YYYY, for date boxes. */
export function toDMY(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Pay weeks run Monday to Saturday. Returns the Monday on or before `s`. */
export function weekStart(s: string): string {
  const d = parseISODate(s);
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(s, -offset);
}

/** The Saturday that ends the pay week starting `start`. */
export function weekEnd(start: string): string {
  return addDays(start, 5);
}

/** Parses "7:30", "0730" or "19:05" into minutes after midnight. */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Builds start/end Date objects for a shift entered as a date plus two clock
 * times. A finish earlier than the start is treated as the next day.
 */
export function shiftTimes(date: string, start: string, end: string): { start: Date; end: Date } | null {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null || !isISODate(date)) return null;
  const startAt = parseISODate(date);
  startAt.setMinutes(s);
  const endAt = parseISODate(date);
  endAt.setMinutes(e <= s ? e + 24 * 60 : e);
  return { start: startAt, end: endAt };
}

/** Worked hours for a shift, after breaks, rounded to 2 dp. */
export function shiftHours(startAt: string, endAt: string, breakMinutes: number): number {
  const minutes = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000 - breakMinutes;
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type RctiLine = { date: string; description: string; quantity: number; unit: string; rate: number; amount: number };

export type RctiTotals = { lines: RctiLine[]; hours: number; subtotal: number; gst: number; total: number };

type TripLike = { trip_date: string; pickup: string; dropoff: string; truck_rego: string; job_ref: string | null; amount: number; status: string };
type ShiftLike = { shift_date: string; start_at: string; end_at: string; break_minutes: number };

/**
 * Weekly RCTI lines: one line per completed trip that has an amount, plus one
 * line per shift paid at the driver's hourly rate (when they have one).
 * Every rate and trip amount is GST-inclusive, so the lines add up to the
 * total paid. When the driver is GST registered, the GST in that total is
 * 1/11 of it; otherwise there is no GST and the total is all ex-GST.
 */
export function buildRcti(
  trips: TripLike[],
  shifts: ShiftLike[],
  hourlyRate: number,
  gstRegistered: boolean,
): RctiTotals {
  const lines: RctiLine[] = [];
  for (const t of [...trips].sort((a, b) => a.trip_date.localeCompare(b.trip_date))) {
    if (t.status !== 'completed' || !(Number(t.amount) > 0)) continue;
    const ref = t.job_ref ? ` (job ${t.job_ref})` : '';
    lines.push({
      date: t.trip_date,
      description: `${t.pickup} to ${t.dropoff}, ${t.truck_rego}${ref}`,
      quantity: 1,
      unit: 'trip',
      rate: Number(t.amount),
      amount: round2(Number(t.amount)),
    });
  }
  let hours = 0;
  for (const s of [...shifts].sort((a, b) => a.start_at.localeCompare(b.start_at))) {
    const h = shiftHours(s.start_at, s.end_at, s.break_minutes);
    hours += h;
    if (hourlyRate > 0 && h > 0) {
      lines.push({
        date: s.shift_date,
        description: 'Driving hours',
        quantity: h,
        unit: 'hrs',
        rate: hourlyRate,
        amount: round2(h * hourlyRate),
      });
    }
  }
  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const gst = gstRegistered ? round2(total / 11) : 0;
  return { lines, hours: round2(hours), subtotal: round2(total - gst), gst, total };
}

export function money(n: number): string {
  return `$${round2(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
