import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertElapsedStatusBadge } from '../helpers/assertions.mjs';
import { TestClient } from '../helpers/test-client.mjs';

const client = new TestClient();

test('T1-09-ELAPSED-01: Past confirmed rental booking displays پایان‌یافته badge', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assertElapsedStatusBadge(html);
  assert.match(html, /<span[^>]*class=["'][^"']*is-elapsed[^"']*["']>پایان‌یافته<\/span>/);
});

test('T1-09-ELAPSED-02: Future confirmed rental booking displays تأییدشده badge', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<span[^>]*class=["'][^"']*is-active[^"']*["']>تأییدشده<\/span>/);
});

test('T1-09-ELAPSED-03: Past booking card applies distinct is-elapsed styling class', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<div[^>]*class=["'][^"']*booking-card\s+is-elapsed[^"']*["']/);
});

test('T1-09-ELAPSED-04: Cancelled past booking retains لغو شده without elapsed override', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<span[^>]*class=["'][^"']*is-inactive[^"']*["']>لغو شده<\/span>/);
});

test('T1-09-ELAPSED-05: Calendar time slots maintain consistent tabular layout', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<span\s+class="booking-time">/);
});
