import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currencyLabel, formatMinor, formatMinorParts, maximumMinor, parseMinor } from '../src/lib/money.ts';

test('formatMinorParts keeps formatted digits and currency unit cleanly separated', () => {
  const parts = formatMinorParts('9999999999990', 'IRR');
  assert.equal(parts.unit, 'ریال');
  assert.ok(parts.formatted.length > 10);
  assert.equal(parts.full, `${parts.formatted} ریال`);
  assert.equal(formatMinor('9999999999990', 'IRR'), parts.full);
});

test('currencyLabel maps IRR and passes through other codes', () => {
  assert.equal(currencyLabel('IRR'), 'ریال');
  assert.equal(currencyLabel('USD'), 'USD');
});

test('parseMinor handles Persian/Arabic digits, toman conversion, and max bound', () => {
  assert.equal(parseMinor('۶۸۰٬۰۰۰', 'toman', 'IRR'), 6_800_000n);
  assert.equal(parseMinor(maximumMinor.toString(), 'minor', 'IRR'), maximumMinor);
  assert.equal(parseMinor('10000000000000', 'minor', 'IRR'), null);
});
