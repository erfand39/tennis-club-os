import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPersianDigits } from '../helpers/assertions.mjs';
import { TestClient } from '../helpers/test-client.mjs';

const client = new TestClient();

test('T1-10-WIDGET-01: Student profile page renders .student-financial-summary widget section', async () => {
  const html = await client.getText('/club/org-test-123/resources/students/s-1');
  assert.match(html, /<section[^>]*class=["'][^"']*student-financial-summary[^"']*["']/);
});

test('T1-10-WIDGET-02: Widget displays package title and remaining sessions ratio', async () => {
  const html = await client.getText('/club/org-test-123/resources/students/s-1');
  assert.match(html, /بسته ۱۰ جلسه‌ای/);
  assert.match(html, /۷ از ۱۰/);
  assertPersianDigits(html);
});

test('T1-10-WIDGET-03: Widget displays outstanding debt with direct link to payment', async () => {
  const html = await client.getText('/club/org-test-123/resources/students/s-1');
  assert.match(html, /ریال/);
  assert.match(html, /<a[^>]*href=["'][^"']*\/finance["'][^>]*>پرداخت بدهی<\/a>/);
});

test('T1-10-WIDGET-04: Student with zero debt displays حساب تسویه indicator', async () => {
  const html = await client.getText('/club/org-test-123/resources/students/s-settled');
  assert.match(html, /حساب تسویه/);
});

test('T1-10-WIDGET-05: Student without active package displays empty state notice', async () => {
  const html = await client.getText('/club/org-test-123/resources/students/s-no-package');
  assert.match(html, /بدون بسته آموزشی فعال/);
});
