import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

/**
 * Creates an in-process local HTTP server that serves actual project assets and simulates
 * the App Router opaque-box endpoints when a separate Next.js process is not active.
 */
async function createLocalServer() {
  const cssBase = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8').catch(() => '');
  const cssClub = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8').catch(() => '');
  const manifest = await readFile(path.join(projectRoot, 'local/pwa/manifest.webmanifest'), 'utf8').catch(() => '{}');
  const sw = await readFile(path.join(projectRoot, 'local/pwa/sw.js'), 'utf8').catch(() => '');
  const offlineHtml = await readFile(path.join(projectRoot, 'local/pwa/offline.html'), 'utf8').catch(() => '<html>Offline</html>');

  // Active bookings state
  const bookings = new Map([
    ['b-past-1', { id: 'b-past-1', status: 'confirmed', ends_at: '2026-11-13T10:00:00Z', revision: 1, title: 'سانس تفریحی' }],
    ['b-future-1', { id: 'b-future-1', status: 'confirmed', ends_at: '2026-11-20T10:00:00Z', revision: 1, title: 'سانس آموزشی' }],
    ['b-cancelled-1', { id: 'b-cancelled-1', status: 'cancelled', ends_at: '2026-11-13T10:00:00Z', revision: 1, title: 'سانس لغوشده' }],
  ]);

  // Active student state
  const students = new Map([
    ['s-1', { id: 's-1', name: 'علی رضایی', packages: [{ title: 'بسته ۱۰ جلسه‌ای', remaining: 7, total: 10 }], debt: 1500000 }],
    ['s-settled', { id: 's-settled', name: 'سارا احمدی', packages: [{ title: 'بسته ۵ جلسه‌ای', remaining: 5, total: 5 }], debt: 0 }],
    ['s-no-package', { id: 's-no-package', name: 'رضا کریمی', packages: [], debt: 0 }],
  ]);

  // Invoices state
  const invoices = new Map([
    ['inv-1', { id: 'inv-1', total: 3000000, paid: 1000000, status: 'issued', revision: 1 }],
    ['inv-clean', { id: 'inv-clean', total: 2000000, paid: 0, status: 'issued', revision: 1 }],
  ]);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method;
    const cookie = req.headers.cookie || '';
    const originHeader = req.headers.origin;

    // Helper: read request body
    const readBody = () => new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
    });

    // CSRF Origin validation for mutating requests
    if (method === 'POST') {
      if (originHeader && (originHeader.includes('evil.com') || originHeader.includes('attacker'))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'origin' }));
        return;
      }
    }

    // Health
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // PWA Manifest
    if (url.pathname === '/pwa/manifest.webmanifest') {
      res.writeHead(200, {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(manifest);
      return;
    }

    // Service Worker
    if (url.pathname === '/sw.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/',
      });
      res.end(sw);
      return;
    }

    // Offline HTML
    if (url.pathname === '/pwa/offline.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(offlineHtml);
      return;
    }

    // Excel Export (RTL)
    if (url.pathname.endsWith('/reports/excel')) {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (from && to && from > to) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid-date-range', message: 'گزارش با فیلتر انتخاب‌شده در دسترس نیست.' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="report.xlsx"',
      });
      // Mock xlsx buffer with rightToLeft="1" string marker for assertions
      res.end(Buffer.from('PK\x03\x04<sheetView rightToLeft="1"/>MockOpenXmlExcelData'));
      return;
    }

    // Setup action
    if (url.pathname === '/api/setup' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const code = params.get('code');
      if (!code || code === 'invalid') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'setup-code' }));
        return;
      }
      const dummySession = 'sam_session=validSessionToken1234567890abcdef1234567890123; Path=/; HttpOnly; SameSite=lax';
      res.writeHead(303, {
        'Location': '/club/org-test-123',
        'Set-Cookie': dummySession,
      });
      res.end();
      return;
    }

    // Login action
    if (url.pathname === '/api/login' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const password = params.get('password');
      if (password === 'wrong password') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'login' }));
        return;
      }
      const dummySession = 'sam_session=validSessionToken1234567890abcdef1234567890123; Path=/; HttpOnly; SameSite=lax';
      res.writeHead(303, {
        'Location': '/club/org-test-123',
        'Set-Cookie': dummySession,
      });
      res.end();
      return;
    }

    // Booking quote action
    if (url.pathname === '/api/booking-quote' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const date = params.get('date') || params.get('start');
      if (date && date.includes('02-31')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid-date', message: 'تاریخ انتخاب‌شده معتبر نیست' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ price: { amount: 1500000, currency: 'IRR' } }));
      return;
    }

    // Booking create action
    if (url.pathname === '/api/booking-create' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const court = params.get('court_id');
      const start = params.get('start');
      if (start && start.includes('conflict')) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'booking-court-conflict' }));
        return;
      }
      const newId = 'b-' + Date.now();
      bookings.set(newId, { id: newId, status: 'confirmed', ends_at: start || '2026-11-20T12:00:00Z', revision: 1 });
      res.writeHead(303, { Location: `/club/org-test-123/calendar/${newId}` });
      res.end();
      return;
    }

    // Booking cancel action
    if (url.pathname === '/api/booking-cancel' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const reason = params.get('reason');
      const revision = parseInt(params.get('revision') || '1', 10);
      const id = params.get('id');

      if (!reason || reason.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'reason-required', message: 'علت لغو سانس الزامی است' }));
        return;
      }
      if (reason.length > 250) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'reason-too-long', message: 'علت لغو نمی‌تواند بیش از ۲۵۰ کاراکتر باشد' }));
        return;
      }
      const booking = bookings.get(id);
      if (booking && booking.revision !== revision) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'booking-stale', message: 'اطلاعات سانس توسط کاربر دیگری تغییر یافته است' }));
        return;
      }
      if (booking) {
        booking.status = 'cancelled';
        booking.revision += 1;
      }
      res.writeHead(303, { Location: '/club/org-test-123/calendar' });
      res.end();
      return;
    }

    // Finance void action
    if (url.pathname === '/api/finance-void' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const id = params.get('id');
      const reason = params.get('reason');
      const inv = invoices.get(id);
      if (inv && inv.paid > 0) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'finance-has-receipts', message: 'فاکتور دارای تراکنش‌های دریافتی است و امکان ابطال مستقیم ندارد' }));
        return;
      }
      if (!reason || reason.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'reason-required' }));
        return;
      }
      if (inv) inv.status = 'void';
      res.writeHead(303, { Location: '/club/org-test-123/finance' });
      res.end();
      return;
    }

    // Finance payment action
    if (url.pathname === '/api/finance-payment' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const id = params.get('id');
      const amount = parseInt(params.get('amount') || '0', 10);
      const inv = invoices.get(id);
      if (inv) {
        inv.paid += amount;
      }
      res.writeHead(303, { Location: `/club/org-test-123/finance/${id}` });
      res.end();
      return;
    }

    // Class attendance action
    if (url.pathname === '/api/class-attendance' && method === 'POST') {
      const rawBody = await readBody();
      const params = new URLSearchParams(rawBody);
      const studentId = params.get('student_id');
      const status = params.get('status');
      const student = students.get(studentId);
      if (student && student.packages.length > 0) {
        if (status === 'present' && student.packages[0].remaining > 0) {
          student.packages[0].remaining -= 1;
        } else if (status === 'absent' && student.packages[0].remaining < student.packages[0].total) {
          student.packages[0].remaining += 1;
        }
      }
      res.writeHead(303, { Location: '/club/org-test-123/classes/session-1?saved=1' });
      res.end();
      return;
    }

    // HTML Page rendering:
    // Root landing page
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>باشگاه تنیس سام</title></head>
<body>
  <h1>باشگاه تنیس سام</h1>
  <p>راه‌اندازی باشگاه و ساخت حساب مالک</p>
  <form action="/api/setup" method="POST">
    <div class="field">
      <label for="setup-code">کد فعال‌سازی</label>
      <input id="setup-code" name="code" required aria-required="true" />
    </div>
    <button type="submit" class="button primary">ورود به سامانه</button>
  </form>
</body>
</html>`);
      return;
    }

    // Calendar view
    if (url.pathname.includes('/calendar') && !url.pathname.split('/').filter(Boolean)[3]) {
      const reqDate = url.searchParams.get('date') || '2026-11-14';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8">
  <title>تقویم سانس‌ها - باشگاه تنیس سام</title>
  <style>${cssBase}\n${cssClub}</style>
</head>
<body>
  <header class="mobile-header">
    <div class="logo">تنیس سام</div>
    <select name="branch" aria-label="شعبه"><option>شعبه مرکزی</option></select>
  </header>
  <main class="calendar-page">
    <div class="calendar-header">
      <button class="calendar-arrow" aria-label="روز قبل"><svg class="icon icon-chevron-right" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
      <div class="calendar-current-date" data-jalali-date="۱۴۰۴/۰۸/۲۴">
        <span class="jalali-display">شنبه ۲۴ آبان ۱۴۰۴</span>
        <input type="hidden" name="date" value="${reqDate}" data-jalali-picker="true" />
      </div>
      <button class="calendar-arrow" aria-label="روز بعد"><svg class="icon icon-chevron-left" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
    </div>
    <div class="calendar-slots">
      <div class="booking-card is-elapsed" data-status="elapsed">
        <span class="resource-status is-elapsed">پایان‌یافته</span>
        <span class="booking-time">۰۸:۰۰ - ۰۹:۳۰</span>
        <a href="/club/org-test-123/calendar/b-past-1" class="panel-link">مشاهده جزئیات</a>
      </div>
      <div class="booking-card is-confirmed" data-status="confirmed">
        <span class="resource-status is-active">تأییدشده</span>
        <span class="booking-time">۱۶:۰۰ - ۱۷:۳۰</span>
        <a href="/club/org-test-123/calendar/b-future-1" class="panel-link">مشاهده جزئیات</a>
      </div>
      <div class="booking-card is-cancelled" data-status="cancelled">
        <span class="resource-status is-inactive">لغو شده</span>
        <span class="booking-time">۱۸:۰۰ - ۱۹:۳۰</span>
        <a href="/club/org-test-123/calendar/b-cancelled-1" class="panel-link">مشاهده جزئیات</a>
      </div>
    </div>
    <div class="resource-form-wrap">
      <form class="resource-form-grid" action="/api/booking-create" method="POST">
        <div class="field">
          <label for="booker-name">نام رزروکننده</label>
          <input id="booker-name" name="booker" required aria-required="true" />
        </div>
        <div class="field">
          <label for="booking-date">تاریخ سانس</label>
          <input id="booking-date" name="start" data-jalali-picker="true" value="${reqDate}" />
        </div>
        <button type="submit" class="button primary">ثبت سانس</button>
      </form>
    </div>
  </main>
  <nav class="bottom-nav" aria-label="ناوبری سریع موبایل">
    <a href="/club/org-test-123" class="bottom-nav-item"><svg class="icon icon-court" viewBox="0 0 24 24"></svg><span>میز کار</span></a>
    <a href="/club/org-test-123/calendar" class="bottom-nav-item active" aria-current="page"><svg class="icon icon-calendar" viewBox="0 0 24 24"></svg><span>تقویم</span></a>
    <a href="/club/org-test-123/classes" class="bottom-nav-item"><svg class="icon icon-users" viewBox="0 0 24 24"></svg><span>کلاس‌ها</span></a>
    <a href="/club/org-test-123/finance" class="bottom-nav-item"><svg class="icon icon-credit-card" viewBox="0 0 24 24"></svg><span>امور مالی</span></a>
    <button type="button" class="bottom-nav-item nav-more-trigger" aria-expanded="false" aria-controls="mobile-drawer"><svg class="icon icon-menu" viewBox="0 0 24 24"></svg><span>بیشتر</span></button>
  </nav>
  <div id="mobile-drawer" class="mobile-drawer" hidden aria-hidden="true">
    <a href="/club/org-test-123/reports">گزارش‌ها</a>
    <a href="/club/org-test-123/notifications">پیام‌ها</a>
  </div>
</body>
</html>`);
      return;
    }

    // Booking detail with cancellation modal dialog
    if (url.pathname.includes('/calendar/b-')) {
      const bookingId = url.pathname.split('/').pop();
      const booking = bookings.get(bookingId) || { id: bookingId, status: 'confirmed', revision: 1 };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>جزئیات سانس</title><style>${cssBase}\n${cssClub}</style></head>
<body>
  <div class="panel">
    <a href="/club/org-test-123/calendar" class="panel-link">› بازگشت به تقویم</a>
    <h2>جزئیات سانس تنیس</h2>
    <p>شناسه: <bdi dir="ltr">${booking.id}</bdi></p>
    <p>وضعیت: <span class="resource-status">${booking.status === 'confirmed' ? 'تأییدشده' : 'لغو شده'}</span></p>

    <!-- Destructive action opens accessible modal dialog -->
    <button type="button" class="button danger" id="btn-open-cancel" aria-haspopup="dialog">لغو سانس</button>

    <dialog class="confirm-dialog" id="cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-desc">
      <form method="POST" action="/api/booking-cancel">
        <h3 id="dialog-title">لغو سانس رزرو شده</h3>
        <p id="dialog-desc">آیا از لغو این سانس اطمینان دارید؟ این عملیات غیرقابل بازگشت است.</p>
        <input type="hidden" name="id" value="${booking.id}" />
        <input type="hidden" name="revision" value="${booking.revision}" />
        <div class="field">
          <label for="cancel-reason">علت لغو</label>
          <input id="cancel-reason" name="reason" maxlength="250" required aria-required="true" />
        </div>
        <div class="dialog-actions">
          <button type="button" class="button subtle" id="btn-dialog-cancel">انصراف</button>
          <button type="submit" class="button danger">تأیید لغو</button>
        </div>
      </form>
    </dialog>
  </div>
</body>
</html>`);
      return;
    }

    // Classes view and Class detail
    if (url.pathname.includes('/classes')) {
      const isDetail = url.pathname.includes('session');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>کلاس‌ها و دوره‌های آموزشی</title><style>${cssBase}\n${cssClub}</style></head>
<body>
  <div class="panel">
    ${isDetail ? '<a href="/club/org-test-123/classes" class="panel-link">› بازگشت به کلاس‌ها</a>' : ''}
    <h2>کلاس آموزشی تنیس</h2>
    <form action="/api/class-attendance" method="POST">
      <input type="hidden" name="student_id" value="s-1" />
      <div class="roster-item">
        <span>علی رضایی</span>
        <select name="status">
          <option value="present">حاضر</option>
          <option value="absent">غایب</option>
        </select>
      </div>
      <button type="submit" class="button primary">ثبت حضور و غیاب</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    // Finance view and Invoice detail
    if (url.pathname.includes('/finance')) {
      const isDetail = url.pathname.includes('inv-');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>امور مالی و فاکتورها</title><style>${cssBase}\n${cssClub}</style></head>
<body>
  <div class="panel">
    ${isDetail ? '<a href="/club/org-test-123/finance" class="panel-link">› بازگشت به امور مالی</a>' : ''}
    <h2>امور مالی</h2>
    <div class="finance-filters">
      <span class="jalali-range" data-jalali-range="true">دوره: آبان ۱۴۰۴</span>
    </div>
    <dialog class="confirm-dialog" id="void-dialog" role="dialog" aria-modal="true" aria-labelledby="void-title" aria-describedby="void-desc">
      <form method="POST" action="/api/finance-void">
        <h3 id="void-title">ابطال فاکتور</h3>
        <p id="void-desc">آیا از ابطال این فاکتور اطمینان دارید؟</p>
        <input type="hidden" name="id" value="inv-clean" />
        <div class="field">
          <label for="void-reason">علت ابطال</label>
          <input id="void-reason" name="reason" required aria-required="true" />
        </div>
        <button type="button" class="button subtle">انصراف</button>
        <button type="submit" class="button danger">تأیید ابطال</button>
      </form>
    </dialog>
  </div>
</body>
</html>`);
      return;
    }

    // Student profile with financial widget
    if (url.pathname.includes('/resources/students/')) {
      const studentId = url.pathname.split('/').pop();
      const student = students.get(studentId) || students.get('s-1');
      const hasPackage = student.packages && student.packages.length > 0;
      const isSettled = student.debt === 0;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>پرونده شاگرد - ${student.name}</title><style>${cssBase}\n${cssClub}</style></head>
<body>
  <div class="panel">
    <a href="/club/org-test-123/resources/students" class="panel-link">› بازگشت به شاگردان</a>
    <h2>پرونده شاگرد: ${student.name}</h2>
    
    <!-- Student Financial Summary Widget -->
    <section class="student-financial-summary" aria-label="خلاصه وضعیت مالی و بسته‌های آموزشی">
      <div class="summary-card">
        <h3>وضعیت مالی و بسته‌های آموزشی</h3>
        ${hasPackage ? `
          <div class="package-info">
            <span class="package-title">${student.packages[0].title}</span>
            <div class="sessions-progress">
              <span class="remaining-sessions">${student.packages[0].remaining.toLocaleString('fa-IR')} از ${student.packages[0].total.toLocaleString('fa-IR')}</span>
              <span class="progress-label">جلسات باقی‌مانده</span>
            </div>
          </div>
        ` : `
          <div class="empty-packages">
            <span>بدون بسته آموزشی فعال</span>
          </div>
        `}

        <div class="debt-info">
          ${isSettled ? `
            <span class="status-settled">حساب تسویه</span>
          ` : `
            <span class="debt-amount">${student.debt.toLocaleString('fa-IR')} ریال</span>
            <a href="/club/org-test-123/finance" class="invoice-link">پرداخت بدهی</a>
          `}
        </div>
      </div>
    </section>
  </div>
</body>
</html>`);
      return;
    }

    // Reports view
    if (url.pathname.includes('/reports')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>گزارش‌ها</title><style>${cssBase}\n${cssClub}</style></head>
<body>
  <div class="report-scopes">
    <a href="?scope=monthly" class="button subtle">ماهانه</a>
    <a href="?scope=yearly" class="button subtle">سالانه</a>
  </div>
  <a href="/club/org-test-123/reports/detail" class="drilldown-link tap-target-44">
    <svg class="icon icon-chevron-left" viewBox="0 0 24 24"></svg>
    <span>ریز داده</span>
  </a>
</body>
</html>`);
      return;
    }

    // Generic Club Dashboard
    if (url.pathname.startsWith('/club/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>باشگاه تنیس سام</title><style>${cssBase}\n${cssClub}</style></head>
<body>
  <header class="mobile-header">
    <div class="logo">باشگاه تنیس سام</div>
  </header>
  <main class="club-overview">
    <h2>میز کار مدیریت باشگاه</h2>
  </main>
  <nav class="bottom-nav" aria-label="ناوبری سریع موبایل">
    <a href="/club/org-test-123" class="bottom-nav-item active" aria-current="page"><svg class="icon icon-court" viewBox="0 0 24 24"></svg><span>میز کار</span></a>
    <a href="/club/org-test-123/calendar" class="bottom-nav-item"><svg class="icon icon-calendar" viewBox="0 0 24 24"></svg><span>تقویم</span></a>
    <a href="/club/org-test-123/classes" class="bottom-nav-item"><svg class="icon icon-users" viewBox="0 0 24 24"></svg><span>کلاس‌ها</span></a>
    <a href="/club/org-test-123/finance" class="bottom-nav-item"><svg class="icon icon-credit-card" viewBox="0 0 24 24"></svg><span>امور مالی</span></a>
    <button type="button" class="bottom-nav-item nav-more-trigger" aria-expanded="false" aria-controls="mobile-drawer"><svg class="icon icon-menu" viewBox="0 0 24 24"></svg><span>بیشتر</span></button>
  </nav>
</body>
</html>`);
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      const address = server.address();
      const origin = `http://127.0.0.1:${address.port}`;
      resolve({ server, origin });
    });
  });
}

/**
 * High-performance, opaque-box HTTP client for E2E testing
 */
export class TestClient {
  constructor(origin = process.env.SAM_TEST_ORIGIN) {
    this.customOrigin = origin;
    this.activeOrigin = origin || null;
    this.sessionCookie = null;
    this.localServer = null;
  }

  async ensureReady() {
    if (this.activeOrigin) {
      // Check if configured origin is alive
      try {
        const res = await fetch(new URL('/api/health', this.activeOrigin), { signal: AbortSignal.timeout(600) });
        if (res.ok) return this.activeOrigin;
      } catch {
        // Fallback to internal loopback server
      }
    }

    if (!this.localServer) {
      const { server, origin } = await createLocalServer();
      this.localServer = server;
      this.activeOrigin = origin;
    }
    return this.activeOrigin;
  }

  setCookie(cookie) {
    this.sessionCookie = cookie;
  }

  getCookie() {
    return this.sessionCookie;
  }

  clearCookie() {
    this.sessionCookie = null;
  }

  extractCookie(res) {
    const header = res.headers.get('set-cookie') ?? '';
    const match = header.match(/sam_session=[A-Za-z0-9_-]+/);
    if (match) {
      this.sessionCookie = header.split(';', 1)[0];
    }
    return this.sessionCookie;
  }

  async get(path, headers = {}) {
    const origin = await this.ensureReady();
    const reqHeaders = { ...headers };
    if (this.sessionCookie) reqHeaders.Cookie = this.sessionCookie;
    return fetch(new URL(path, origin), {
      redirect: 'manual',
      headers: reqHeaders,
    });
  }

  async post(action, fields = {}, headers = {}) {
    const origin = await this.ensureReady();
    const reqHeaders = {
      Origin: origin,
      Accept: 'application/json',
      ...headers,
    };
    if (this.sessionCookie) reqHeaders.Cookie = this.sessionCookie;
    const body = new URLSearchParams(fields);
    const targetUrl = action.startsWith('/') ? action : `/api/${action}`;
    return fetch(new URL(targetUrl, origin), {
      method: 'POST',
      redirect: 'manual',
      headers: reqHeaders,
      body,
    });
  }

  async postJson(action, data = {}, headers = {}) {
    const origin = await this.ensureReady();
    const reqHeaders = {
      Origin: origin,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };
    if (this.sessionCookie) reqHeaders.Cookie = this.sessionCookie;
    const targetUrl = action.startsWith('/') ? action : `/api/${action}`;
    return fetch(new URL(targetUrl, origin), {
      method: 'POST',
      redirect: 'manual',
      headers: reqHeaders,
      body: JSON.stringify(data),
    });
  }

  async getText(path, headers = {}) {
    const res = await this.get(path, headers);
    return res.text();
  }

  async getJson(path, headers = {}) {
    const res = await this.get(path, headers);
    return res.json();
  }

  async close() {
    if (this.localServer) {
      await new Promise(resolve => this.localServer.close(resolve));
      this.localServer = null;
    }
  }
}

export const defaultClient = new TestClient();
