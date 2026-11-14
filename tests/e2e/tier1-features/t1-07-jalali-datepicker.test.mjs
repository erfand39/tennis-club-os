import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPersianDateFormatted } from '../helpers/assertions.mjs';
import { TestClient } from '../helpers/test-client.mjs';

const client = new TestClient();

test('T1-07-DATE-01: Calendar renders user-facing Shamsi formatted date', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assertPersianDateFormatted(html);
  assert.match(html, /data-jalali-date="۱۴۰۴\/۰۸\/۲۴"/);
});

test('T1-07-DATE-02: Shamsi date picker produces valid Gregorian ISO date format for form submission', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<input[^>]*name="date"[^>]*value="\d{4}-\d{2}-\d{2}"/);
});

test('T1-07-DATE-03: Booking creation submits ISO date to /api/booking-quote', async () => {
  const res = await client.post('booking-quote', {
    court_id: 'court-1',
    start: '2026-11-20T10:00:00Z',
    date: '2026-11-20',
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.price.amount, 1500000);
});

test('T1-07-DATE-04: Date picker markup declares Jalali picker hook', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /data-jalali-picker="true"/);
});

test('T1-07-DATE-05: Finance ledger date filters initialize with Shamsi representations', async () => {
  const html = await client.getText('/club/org-test-123/finance');
  assert.match(html, /data-jalali-range="true"/);
  assert.match(html, /آبان ۱۴۰۴/);
});
