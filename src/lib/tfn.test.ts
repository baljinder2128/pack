import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTfn, isValidTfn } from './tfn.ts';

test('checks TFN digits', () => {
  assert.ok(isValidTfn('123 456 782'));
  assert.ok(!isValidTfn('123 456 789'));
  assert.ok(!isValidTfn('12345'));
  assert.equal(formatTfn('123456782'), '123 456 782');
});
