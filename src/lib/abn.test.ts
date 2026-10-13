import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAbn, isValidAbn } from './abn.ts';

test('ABN check digits', () => {
  assert.ok(isValidAbn('51 824 753 556')); // ATO's published example
  assert.ok(isValidAbn('53004085616'));
  assert.ok(!isValidAbn('51 824 753 557'));
  assert.ok(!isValidAbn('1234'));
  assert.equal(formatAbn('51824753556'), '51 824 753 556');
});
