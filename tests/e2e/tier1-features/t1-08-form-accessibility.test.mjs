import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestClient } from '../helpers/test-client.mjs';

const client = new TestClient();

test('T1-08-A11Y-01: Resource form fields have explicit <label for="..."> associations', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<label\s+for="booker-name">/);
  assert.match(html, /<input[^>]*id="booker-name"/);
});

test('T1-08-A11Y-02: Mandatory form inputs specify required and aria-required="true"', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<input[^>]*id="booker-name"[^>]*required/);
  assert.match(html, /<input[^>]*id="booker-name"[^>]*aria-required="true"/);
});

test('T1-08-A11Y-03: Modal dialog form fields have explicit labels and constraints', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assert.match(html, /<label\s+for="cancel-reason">/);
  assert.match(html, /<input[^>]*id="cancel-reason"/);
  assert.match(html, /aria-required="true"/);
});

test('T1-08-A11Y-04: Form submission with empty required value is rejected by API with 400', async () => {
  const res = await client.post('booking-cancel', { id: 'b-past-1', reason: '' });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'reason-required');
});

test('T1-08-A11Y-05: Valid form submission successfully completes without error', async () => {
  const res = await client.post('booking-cancel', { id: 'b-past-1', reason: 'علت موجه جهت لغو سانس', revision: '1' });
  assert.equal(res.status, 303);
});
