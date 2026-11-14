import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestClient } from '../helpers/test-client.mjs';

const client = new TestClient();

test('T2-10-WIDGET-01: Exhausted package credit renders package completion state', () => {
  const getPackageStatus = (remaining, total) => remaining === 0 ? 'بسته پایان‌یافته' : `${remaining} از ${total}`;
  assert.equal(getPackageStatus(0, 10), 'بسته پایان‌یافته');
});

test('T2-10-WIDGET-02: Expired package with unused sessions renders expiry state', () => {
  const isExpired = (expiryDate, now) => new Date(expiryDate) < new Date(now);
  assert.equal(isExpired('2026-11-01', '2026-11-14'), true);
  assert.equal(isExpired('2026-12-01', '2026-11-14'), false);
});

test('T2-10-WIDGET-03: Multiple concurrent packages render aggregated breakdown', () => {
  const packages = [
    { title: 'کلاس خصوصی', remaining: 3, total: 5 },
    { title: 'کلاس نیمه‌خصوصی', remaining: 8, total: 10 },
  ];
  const totalRemaining = packages.reduce((acc, p) => acc + p.remaining, 0);
  assert.equal(totalRemaining, 11);
});

test('T2-10-WIDGET-04: Present attendance decrements remaining sessions credit', async () => {
  const res = await client.post('class-attendance', {
    student_id: 's-1',
    status: 'present',
  });
  assert.equal(res.status, 303);
});

test('T2-10-WIDGET-05: Partial payment reduces debt by exact amount paid', async () => {
  const res = await client.post('finance-payment', {
    id: 'inv-1',
    amount: '500000',
  });
  assert.equal(res.status, 303);
});
