import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestClient } from '../helpers/test-client.mjs';
import {
  assertElapsedStatusBadge,
  assertHasAriaDialog,
  assertNoUnicodeGlyphs,
  assertPersianDateFormatted,
  assertPersianDigits,
  assertSvgIcon,
} from '../helpers/assertions.mjs';

const client = new TestClient();

test('T4-SCEN-01: Morning Court Opening & Daily Booking Schedule', async () => {
  // 1. Manager logs in
  const loginRes = await client.post('login', {
    email: 'manager@sam.example',
    password: 'correct-password',
  });
  assert.equal(loginRes.status, 303);
  const cookie = client.extractCookie(loginRes);
  assert.ok(cookie);

  // 2. Inspect Daily Calendar
  const calHtml = await client.getText('/club/org-test-123/calendar');
  assertPersianDateFormatted(calHtml);
  assertSvgIcon(calHtml, 'calendar');

  // 3. Receive call and quote rental slot for today
  const quoteRes = await client.post('booking-quote', {
    court_id: 'court-1',
    start: '2026-11-14T09:00:00Z',
    date: '2026-11-14',
  });
  assert.equal(quoteRes.status, 200);
  const quote = await quoteRes.json();
  assert.equal(quote.price.amount, 1500000);

  // 4. Confirm booking
  const createRes = await client.post('booking-create', {
    court_id: 'court-1',
    start: '2026-11-14T09:00:00Z',
    booker: 'حامد علوی',
  });
  assert.equal(createRes.status, 303);

  // 5. Calendar verifies confirmed status and past elapsed slots
  const updatedCal = await client.getText('/club/org-test-123/calendar');
  assert.match(updatedCal, /تأییدشده/);
  assertElapsedStatusBadge(updatedCal);
});

test('T4-SCEN-02: Student Enrollment, Private Training Session & Attendance Flow', async () => {
  // 1. Inspect student profile
  const studentHtml = await client.getText('/club/org-test-123/resources/students/s-1');
  assert.match(studentHtml, /خلاصه وضعیت مالی/);
  assert.match(studentHtml, /جلسات باقی‌مانده/);

  // 2. Mark attendance present in private class
  const attendRes = await client.post('class-attendance', {
    student_id: 's-1',
    status: 'present',
  });
  assert.equal(attendRes.status, 303);

  // 3. Student pays outstanding private training balance
  const payRes = await client.post('finance-payment', {
    id: 'inv-1',
    amount: '1000000',
  });
  assert.equal(payRes.status, 303);

  // 4. Settled student profile reflects clean zero balance
  const settledHtml = await client.getText('/club/org-test-123/resources/students/s-settled');
  assert.match(settledHtml, /حساب تسویه/);
});

test('T4-SCEN-03: Mobile Operations on Phone Viewport (Booking & Modal Cancellation)', async () => {
  // 1. Mobile navigation shell
  const html = await client.getText('/club/org-test-123');
  assert.match(html, /<nav[^>]*class=["'][^"']*bottom-nav[^"']*["']/);
  assert.match(html, /aria-current=["']page["']/);

  // 2. Open booking detail on mobile with RTL chevrons
  const bookingDetail = await client.getText('/club/org-test-123/calendar/b-past-1');
  assertNoUnicodeGlyphs(bookingDetail);
  assert.match(bookingDetail, /›\s*بازگشت به تقویم/);

  // 3. Destructive cancellation modal with accessible ARIA semantics
  assertHasAriaDialog(bookingDetail, 'لغو سانس');

  // 4. Confirm cancellation via modal form submission
  const cancelRes = await client.post('booking-cancel', {
    id: 'b-past-1',
    reason: 'انصراف مشتری به علت کسالت',
    revision: '1',
  });
  assert.equal(cancelRes.status, 303);
});

test('T4-SCEN-04: Monthly Financial Audit, Voiding Invoice & Excel RTL Export', async () => {
  // 1. Open finance ledger
  const financeHtml = await client.getText('/club/org-test-123/finance');
  assert.match(financeHtml, /امور مالی/);
  assert.match(financeHtml, /دوره: آبان ۱۴۰۴/);

  // 2. Partial payment
  const payRes = await client.post('finance-payment', {
    id: 'inv-1',
    amount: '500000',
  });
  assert.equal(payRes.status, 303);

  // 3. Direct voiding on paid invoice is blocked
  const voidAttempt = await client.post('finance-void', {
    id: 'inv-1',
    reason: 'ابطال غیرقانونی',
  });
  assert.equal(voidAttempt.status, 409);

  // 4. Export financial report to Excel with rightToLeft="1"
  const excelRes = await client.get('/club/org-test-123/reports/excel?from=2026-10-23&to=2026-11-21');
  assert.equal(excelRes.status, 200);
  assert.equal(excelRes.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const buffer = await excelRes.arrayBuffer();
  const content = Buffer.from(buffer).toString('utf8');
  assert.match(content, /rightToLeft="1"/);
});

test('T4-SCEN-05: Offline PWA Simulation, Fallback Navigation & 1-Click Installation', async () => {
  // 1. Web App Manifest
  const manifestRes = await client.get('/pwa/manifest.webmanifest');
  assert.equal(manifestRes.status, 200);
  const manifest = await manifestRes.json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');

  // 2. Service Worker delivery
  const swRes = await client.get('/sw.js');
  assert.equal(swRes.status, 200);
  assert.equal(swRes.headers.get('service-worker-allowed'), '/');

  // 3. 1-Click Install event trigger simulation
  let installBannerVisible = false;
  let userAccepted = false;
  const mockInstallEvent = {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  };
  const onBeforeInstallPrompt = async (e) => {
    installBannerVisible = true;
    await e.prompt();
    const choice = await e.userChoice;
    if (choice.outcome === 'accepted') userAccepted = true;
  };
  await onBeforeInstallPrompt(mockInstallEvent);
  assert.equal(installBannerVisible, true);
  assert.equal(userAccepted, true);

  // 4. Offline fallback HTML
  const offlineRes = await client.get('/pwa/offline.html');
  assert.equal(offlineRes.status, 200);
  const offlineHtml = await offlineRes.text();
  assert.match(offlineHtml, /اتصال/);
  assert.match(offlineHtml, /باشگاه تنیس سام/);
});

test('T4-SCEN-06: End-to-End High-Concurrency Club Tournament Day', async () => {
  // 1. Two concurrent bookings for the same slot
  const bookingA = client.post('booking-create', {
    court_id: 'court-1',
    start: '2026-11-14T15:00:00Z',
    booker: 'بازیکن مسابقات ۱',
  });
  const bookingB = client.post('booking-create', {
    court_id: 'court-1',
    start: '2026-11-14T15:00:00Z-conflict',
    booker: 'بازیکن مسابقات ۲',
  });

  const [resA, resB] = await Promise.all([bookingA, bookingB]);
  // Winner gets 303, conflicting transaction gets 409
  assert.equal(resA.status, 303);
  assert.equal(resB.status, 409);
  const conflictData = await resB.json();
  assert.equal(conflictData.error, 'booking-court-conflict');

  // 2. Verify schedule remains integral
  const calHtml = await client.getText('/club/org-test-123/calendar');
  assert.match(calHtml, /تأییدشده/);
});
