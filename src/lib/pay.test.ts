import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRcti, shiftHours, shiftTimes, weekStart, weekEnd, isISODate } from './pay.ts';

test('weeks run Monday to Sunday', () => {
  assert.equal(weekStart('2026-10-12'), '2026-10-12'); // Monday
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // Sunday
  assert.equal(weekStart('2026-10-19'), '2026-10-19');
  assert.equal(weekEnd('2026-10-12'), '2026-10-18');
});

test('validates dates', () => {
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
  assert.ok(!isISODate('12/10/2026'));
});

test('overnight shift rolls to the next day', () => {
  const t = shiftTimes('2026-10-12', '22:00', '06:30')!;
  assert.equal(shiftHours(t.start.toISOString(), t.end.toISOString(), 30), 8);
});

test('rejects bad times', () => {
  assert.equal(shiftTimes('2026-10-12', '25:00', '06:00'), null);
});

test('builds RCTI totals with GST', () => {
  const t = shiftTimes('2026-10-13', '06:00', '16:00')!;
  const r = buildRcti(
    [
      { trip_date: '2026-10-13', pickup: 'Melbourne', dropoff: 'Geelong', truck_rego: 'XY12AB', job_ref: '55', amount: 450, status: 'completed' },
      { trip_date: '2026-10-14', pickup: 'A', dropoff: 'B', truck_rego: 'XY12AB', job_ref: null, amount: 300, status: 'in_progress' },
    ],
    [{ shift_date: '2026-10-13', start_at: t.start.toISOString(), end_at: t.end.toISOString(), break_minutes: 30 }],
    40,
    true,
  );
  assert.equal(r.lines.length, 2);
  assert.equal(r.hours, 9.5);
  assert.equal(r.subtotal, 830);
  assert.equal(r.gst, 83);
  assert.equal(r.total, 913);
});

test('no GST when driver is not registered', () => {
  const r = buildRcti(
    [{ trip_date: '2026-10-13', pickup: 'A', dropoff: 'B', truck_rego: 'X', job_ref: null, amount: 100, status: 'completed' }],
    [],
    0,
    false,
  );
  assert.equal(r.gst, 0);
  assert.equal(r.total, 100);
});
