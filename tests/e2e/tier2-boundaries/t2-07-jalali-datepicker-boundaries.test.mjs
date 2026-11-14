import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asciiDigits } from '../../../src/lib/resource-fields.ts';

const persianFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

test('T2-07-DATE-01: Shamsi leap year 1403: Esfand has 30 days converting to Gregorian 2025-03-20', () => {
  const leapDayDate = new Date('2025-03-20T00:00:00Z');
  const formatted = persianFormatter.format(leapDayDate);
  assert.equal(formatted, '۱۴۰۳/۱۲/۳۰', '1403/12/30 must convert to 2025-03-20');
});

test('T2-07-DATE-02: Shamsi common year 1404: Esfand has 29 days and day 30 is next year Nowruz', () => {
  const lastDayDate = new Date('2026-03-20T00:00:00Z');
  assert.equal(persianFormatter.format(lastDayDate), '۱۴۰۴/۱۲/۲۹', '1404 Esfand ends on day 29');
  
  const nextDayDate = new Date('2026-03-21T00:00:00Z');
  assert.equal(persianFormatter.format(nextDayDate), '۱۴۰۵/۱/۱', 'Day after 1404/12/29 must be 1405/01/01');
});

test('T2-07-DATE-03: Transition between 31-day month (Shahrivar) and 30-day month (Mehr) renders correct boundaries', () => {
  // 31 Shahrivar 1404
  const shahrivar31 = new Date('2025-09-22T00:00:00Z');
  assert.equal(persianFormatter.format(shahrivar31), '۱۴۰۴/۶/۳۱');
  
  // 1 Mehr 1404
  const mehr1 = new Date('2025-09-23T00:00:00Z');
  assert.equal(persianFormatter.format(mehr1), '۱۴۰۴/۷/۱');
});

test('T2-07-DATE-04: Persian numerals normalize to ASCII standard digits without error', () => {
  const persianInput = '۱۴۰۴/۰۸/۲۵';
  const normalized = asciiDigits(persianInput);
  assert.equal(normalized, '1404/08/25');
  assert.match(normalized, /^\d{4}\/\d{2}\/\d{2}$/);
});

test('T2-07-DATE-05: Date validation rejects out of range dates', () => {
  const invalidDate = '9999-99-99';
  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(invalidDate) && Number.isFinite(+new Date(invalidDate));
  assert.equal(isValid, false, 'Invalid calendar date must fail validation');
});
