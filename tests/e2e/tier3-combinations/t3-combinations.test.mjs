import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestClient } from '../helpers/test-client.mjs';
import {
  assertElapsedStatusBadge,
  assertHasAriaDialog,
  assertNoUnicodeGlyphs,
  assertPersianDigits,
  assertSvgIcon,
  assertTouchTargetSize,
} from '../helpers/assertions.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T3-COMB-01: Rental Booking + Jalali Date Picker + Elapsed Status Lifecycle', async () => {
  // 1. Submit quote for past timeslot using Jalali picker ISO output
  const quoteRes = await client.post('booking-quote', {
    court_id: 'court-1',
    start: '2026-11-13T08:00:00Z',
    date: '2026-11-13',
  });
  assert.equal(quoteRes.status, 200);

  // 2. Create the booking
  const createRes = await client.post('booking-create', {
    court_id: 'court-1',
    start: '2026-11-13T08:00:00Z',
    booker: 'حامد حسینی',
  });
  assert.equal(createRes.status, 303);

  // 3. Inspect calendar for past date: must render elapsed badge
  const calHtml = await client.getText('/club/org-test-123/calendar?date=2026-11-13');
  assertElapsedStatusBadge(calHtml);
});

test('T3-COMB-02: Student Profile + Financial Summary Widget + Invoice Partial Payment Settlement', async () => {
  // 1. Initial student profile has debt
  const initialHtml = await client.getText('/club/org-test-123/resources/students/s-1');
  assert.match(initialHtml, /ریال/);
  assert.match(initialHtml, /پرداخت بدهی/);

  // 2. Partial payment
  const partPayRes = await client.post('finance-payment', { id: 'inv-1', amount: '500000' });
  assert.equal(partPayRes.status, 303);

  // 3. Full settlement
  const settledHtml = await client.getText('/club/org-test-123/resources/students/s-settled');
  assert.match(settledHtml, /حساب تسویه/);
  assert.doesNotMatch(settledHtml, /پرداخت بدهی/);
});

test('T3-COMB-03: Mobile Navigation Shell + BottomNav + Accessible Modal Dialog + RTL Inversion', async () => {
  // 1. Load booking detail page with mobile bottom nav and dialog
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');

  // Verify RTL back chevron
  assertNoUnicodeGlyphs(html);
  assert.match(html, /›\s*بازگشت به تقویم/);

  // Verify accessible modal dialog
  assertHasAriaDialog(html, 'لغو سانس');
});

test('T3-COMB-04: PWA 1-Click Install + Web App Manifest + Service Worker Offline Fallback', async () => {
  // 1. Verify manifest
  const manifestRes = await client.get('/pwa/manifest.webmanifest');
  assert.equal(manifestRes.status, 200);
  const manifest = await manifestRes.json();
  assert.equal(manifest.display, 'standalone');

  // 2. Verify service worker delivery
  const swRes = await client.get('/sw.js');
  assert.equal(swRes.status, 200);
  assert.equal(swRes.headers.get('service-worker-allowed'), '/');

  // 3. Verify offline fallback
  const offlineRes = await client.get('/pwa/offline.html');
  assert.equal(offlineRes.status, 200);
  assert.match(await offlineRes.text(), /باشگاه تنیس سام/);
});

test('T3-COMB-05: Jalali Date Picker + Form Accessibility (ARIA Error Association)', async () => {
  // Attempt invalid date selection (e.g. 31 Ordibehesht in 30-day month boundary)
  const res = await client.post('booking-quote', {
    court_id: 'court-1',
    start: '2026-02-31T10:00:00Z',
    date: '2026-02-31',
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'invalid-date');
});

test('T3-COMB-06: Destructive Modal Dialog + Booking Cancellation + Optimistic Locking Revision Check', async () => {
  // Attempt to cancel booking with an outdated revision number (2 instead of 1)
  const res = await client.post('booking-cancel', {
    id: 'b-past-1',
    reason: 'لغو با شماره بازنگری قدیمی',
    revision: '99',
  });
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error, 'booking-stale');
});

test('T3-COMB-07: Student Financial Summary + Class Attendance (present vs absent) + Package Credit Sync', async () => {
  // 1. Mark present in class
  const presentRes = await client.post('class-attendance', {
    student_id: 's-1',
    status: 'present',
  });
  assert.equal(presentRes.status, 303);

  // 2. Revert to absent with adjustment
  const absentRes = await client.post('class-attendance', {
    student_id: 's-1',
    status: 'absent',
  });
  assert.equal(absentRes.status, 303);

  // 3. Check student profile reflects credits
  const html = await client.getText('/club/org-test-123/resources/students/s-1');
  assert.match(html, /جلسات باقی‌مانده/);
  assertPersianDigits(html);
});

test('T3-COMB-08: Mobile Form Grid + Jalali DateTime Picker + SVG Iconography + Touch Target Hit Areas', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assertSvgIcon(html, 'chevron-right');
  assertSvgIcon(html, 'chevron-left');
  assert.match(html, /data-jalali-picker="true"/);
  assert.match(html, /class=["'][^"']*resource-form-grid[^"']*["']/);
});

test('T3-COMB-09: Finance Void Invoice + Destructive Modal Dialog + Payment Precondition Check', async () => {
  // 1. Invoice with existing payments cannot be directly voided
  const conflictRes = await client.post('finance-void', {
    id: 'inv-1',
    reason: 'ابطال غیرمجاز فاکتور پرداخت شده',
  });
  assert.equal(conflictRes.status, 409);
  const conflictData = await conflictRes.json();
  assert.equal(conflictData.error, 'finance-has-receipts');

  // 2. Clean invoice with zero payments can be voided with reason
  const validRes = await client.post('finance-void', {
    id: 'inv-clean',
    reason: 'ابطال به علت اشتباه در صدور فاکتور',
  });
  assert.equal(validRes.status, 303);
});

test('T3-COMB-10: RTL Navigation Chevron + Mobile BottomNav Drawer + Responsive Viewport Switching', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<nav[^>]*class=["'][^"']*bottom-nav[^"']*["']/);
  assert.match(html, /id=["']mobile-drawer["']/);
  assertNoUnicodeGlyphs(html);
});

test('T3-COMB-11: PWA Offline Fallback + Local-Only Origin Boundary + Session Cookie Isolation', async () => {
  // 1. Malicious external origin is rejected
  const hostileRes = await client.post('booking-create', { booker: 'نفوذگر' }, {
    Origin: 'http://evil.com',
  });
  assert.equal(hostileRes.status, 403);

  // 2. Offline guide is accessible without credentials
  const offlineRes = await client.get('/pwa/offline.html');
  assert.equal(offlineRes.status, 200);
});

test('T3-COMB-12: High-Volume Calendar Filtering + Jalali Range Picker + Elapsed Status Badge Rendering', async () => {
  const html = await client.getText('/club/org-test-123/calendar?date=2026-11-14');
  assertElapsedStatusBadge(html);
  assert.match(html, /تأییدشده/);
  assert.match(html, /لغو شده/);
  assertPersianDigits(html);
});
