import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorCode } from '../src/lib/api-errors.ts';
import { InputError } from '../src/lib/input.ts';

test('database errors preserve the operation family and shared permission and retry responses', () => {
  for (const code of ['23514', '22023', '23505', '23P01']) {
    assert.equal(errorCode({code}, 'finance'), 'finance-invalid');
    assert.equal(errorCode({code}, 'club-finance'), 'club-finance-invalid');
    assert.equal(errorCode({code}, 'booking'), 'booking-invalid');
    assert.equal(errorCode({code}, 'class'), 'attendance-invalid');
    assert.equal(errorCode({code}, 'general'), 'invalid');
  }
  assert.equal(errorCode({code:'23505'}, 'resource'), 'resource-duplicate');
  assert.equal(errorCode({code:'23P01'}, 'resource'), 'resource-conflict');
  assert.equal(errorCode({code:'42501'}, 'finance'), 'denied');
  assert.equal(errorCode({code:'55P03'}, 'finance'), 'retry');
  assert.equal(errorCode(new InputError('finance-stale'), 'finance'), 'finance-stale');
  assert.equal(errorCode(null, 'general'), 'unavailable');
});
