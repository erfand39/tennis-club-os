import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTrustedPostOrigin,
  resolveExpectedOrigin,
  safeRedirectPath,
} from '../src/lib/origin-security.ts';
import {
  clampIsoDate,
  formatToPersianDigits,
  getJalaliMonthDays,
  gregorianToJalali,
  jalaliToGregorian,
  toIsoDate,
} from '../src/lib/jalali.ts';

test('safeRedirectPath allows internal paths and blocks open redirects', () => {
  assert.equal(safeRedirectPath('/club/123?saved=1'), '/club/123?saved=1');
  assert.equal(safeRedirectPath('/'), '/');
  assert.equal(safeRedirectPath('//evil.example/login'), '/');
  assert.equal(safeRedirectPath('/\\evil.example'), '/');
  assert.equal(safeRedirectPath('https://evil.example/'), '/');
  assert.equal(safeRedirectPath('/club\r\nSet-Cookie: a=b'), '/');
  assert.equal(safeRedirectPath(''), '/');
});

test('resolveExpectedOrigin prioritizes SAM_ORIGIN and rejects malformed host headers', () => {
  assert.equal(
    resolveExpectedOrigin('http://127.0.0.1:3030/api/login', 'evil.example', 'https://sam-mac.local:8443'),
    'https://sam-mac.local:8443',
  );
  assert.equal(
    resolveExpectedOrigin('http://127.0.0.1:3030/api/login', 'localhost:3030'),
    'http://localhost:3030',
  );
  assert.equal(
    resolveExpectedOrigin('http://127.0.0.1:3030/api/login', 'evil.example/redirect'),
    'http://127.0.0.1:3030',
  );
  assert.equal(
    resolveExpectedOrigin('http://127.0.0.1:3030/api/login', 'user@evil.example'),
    'http://127.0.0.1:3030',
  );
});

test('isTrustedPostOrigin enforces same-origin and Safari opaque origin guardrails', () => {
  const expected = 'http://127.0.0.1:3030';
  assert.equal(
    isTrustedPostOrigin({
      expectedOrigin: expected,
      originHeader: expected,
      hostHeader: '127.0.0.1:3030',
      secFetchSite: 'same-origin',
      hasConfiguredOrigin: true,
    }),
    true,
  );
  assert.equal(
    isTrustedPostOrigin({
      expectedOrigin: expected,
      originHeader: 'https://evil.example',
      hostHeader: '127.0.0.1:3030',
      secFetchSite: 'cross-site',
      hasConfiguredOrigin: true,
    }),
    false,
  );
  assert.equal(
    isTrustedPostOrigin({
      expectedOrigin: expected,
      originHeader: 'null',
      hostHeader: '127.0.0.1:3030',
      secFetchSite: 'same-origin',
      hasConfiguredOrigin: true,
    }),
    true,
  );
  assert.equal(
    isTrustedPostOrigin({
      expectedOrigin: expected,
      originHeader: 'null',
      hostHeader: 'evil.example',
      secFetchSite: 'same-origin',
      hasConfiguredOrigin: true,
    }),
    false,
  );
  assert.equal(
    isTrustedPostOrigin({
      expectedOrigin: expected,
      originHeader: null,
      hostHeader: '127.0.0.1:3030',
      secFetchSite: 'same-origin',
      hasConfiguredOrigin: false,
    }),
    true,
  );
  assert.equal(
    isTrustedPostOrigin({
      expectedOrigin: expected,
      originHeader: null,
      hostHeader: '127.0.0.1:3030',
      secFetchSite: 'same-origin',
      hasConfiguredOrigin: true,
    }),
    false,
  );
});

test('getJalaliMonthDays handles leap and common Esfand lengths accurately', () => {
  for (let m = 1; m <= 6; m++) assert.equal(getJalaliMonthDays(1404, m), 31);
  for (let m = 7; m <= 11; m++) assert.equal(getJalaliMonthDays(1404, m), 30);
  assert.equal(getJalaliMonthDays(1403, 12), 30);
  assert.equal(getJalaliMonthDays(1404, 12), 29);
  assert.equal(getJalaliMonthDays(1399, 12), 30);
});

test('gregorianToJalali and jalaliToGregorian round-trip key calendar boundaries', () => {
  const cases = [
    ['2025-03-20', { year: 1403, month: 12, day: 30 }],
    ['2025-03-21', { year: 1404, month: 1, day: 1 }],
    ['2025-09-22', { year: 1404, month: 6, day: 31 }],
    ['2025-09-23', { year: 1404, month: 7, day: 1 }],
    ['2026-03-20', { year: 1404, month: 12, day: 29 }],
  ];
  for (const [iso, jalali] of cases) {
    assert.deepEqual(gregorianToJalali(iso), jalali);
    const { gy, gm, gd } = jalaliToGregorian(jalali.year, jalali.month, jalali.day);
    assert.equal(toIsoDate(gy, gm, gd), iso);
  }
  assert.equal(formatToPersianDigits('1404/08/25'), '۱۴۰۴/۰۸/۲۵');
});

test('clampIsoDate constrains dates within min and max bounds', () => {
  assert.equal(clampIsoDate('2026-11-10', '2026-11-15', '2026-11-25'), '2026-11-15');
  assert.equal(clampIsoDate('2026-11-30', '2026-11-15', '2026-11-25'), '2026-11-25');
  assert.equal(clampIsoDate('2026-11-20', '2026-11-15', '2026-11-25'), '2026-11-20');
});
