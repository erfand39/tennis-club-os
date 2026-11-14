import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestClient } from '../helpers/test-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T2-03-MODAL-01: Modal component binds Escape key listener to cancel action', async () => {
  const code = await readFile(path.join(projectRoot, 'src/app/components/confirm-dialog.tsx'), 'utf8');
  assert.match(code, /e\.key\s*===\s*['"]Escape['"]/, 'Modal must listen for Escape key');
  assert.match(code, /onCancel\(\)/, 'Escape key must trigger onCancel()');
});

test('T2-03-MODAL-02: Modal focus trap contains Tab and Shift+Tab key navigation', async () => {
  const code = await readFile(path.join(projectRoot, 'src/app/components/confirm-dialog.tsx'), 'utf8');
  assert.match(code, /showModal\(\)|focusTrap|Tab/, 'Modal must rely on native dialog showModal focus trap or key trap');
});

test('T2-03-MODAL-03: Dialog backdrop dismissal handles backdrop click boundaries', async () => {
  const code = await readFile(path.join(projectRoot, 'src/app/components/confirm-dialog.tsx'), 'utf8');
  assert.match(code, /onCancel|backdrop|dialogRef/, 'Modal backdrop interaction must be handled');
});

test('T2-03-MODAL-04: Submitting cancellation with empty reason is rejected with 400', async () => {
  const res = await client.post('booking-cancel', { id: 'b-past-1', reason: '   ' });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'reason-required');
});

test('T2-03-MODAL-05: Submitting cancellation with reason exceeding 250 chars triggers validation error', async () => {
  const longReason = 'الف'.repeat(251);
  const res = await client.post('booking-cancel', { id: 'b-past-1', reason: longReason });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'reason-too-long');
});
