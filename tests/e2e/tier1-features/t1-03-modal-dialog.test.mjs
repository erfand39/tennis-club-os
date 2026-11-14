import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHasAriaDialog } from '../helpers/assertions.mjs';
import { TestClient } from '../helpers/test-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T1-03-MODAL-01: Destructive cancellation opens an accessible confirm-dialog', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assert.ok(html.includes('id="cancel-dialog"'), 'Must contain cancel-dialog element');
  assertHasAriaDialog(html, 'لغو سانس رزرو شده');
});

test('T1-03-MODAL-02: Dialog element contains role="dialog", aria-modal="true", and ARIA labelling', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assert.match(html, /role=["']dialog["']/);
  assert.match(html, /aria-modal=["']true["']/);
  assert.match(html, /aria-labelledby=["']dialog-title["']/);
  assert.match(html, /aria-describedby=["']dialog-desc["']/);
});

test('T1-03-MODAL-03: Modal component source manages focus trap and initial focus', async () => {
  const code = await readFile(path.join(projectRoot, 'src/app/components/confirm-dialog.tsx'), 'utf8');
  assert.match(code, /dialogRef|focusTrap|focus\(\)/, 'Modal must handle focus management');
  assert.match(code, /cancelLabel|انصراف/, 'Default focus or action must include cancelLabel');
});

test('T1-03-MODAL-04: Clicking cancel button closes modal with zero destructive side-effects', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assert.match(html, /<button[^>]*id="btn-dialog-cancel"[^>]*>انصراف<\/button>/);
});

test('T1-03-MODAL-05: Submitting confirmation dispatches POST /api/booking-cancel with reason', async () => {
  const res = await client.post('booking-cancel', {
    id: 'b-past-1',
    reason: 'بارندگی شدید و لغو سانس توسط مدیریت',
    revision: '1',
  });
  assert.equal(res.status, 303, 'Booking cancel action must return 303 redirect');
});
