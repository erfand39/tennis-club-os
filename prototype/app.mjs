import {
  addDays, bookingName, bookingsOn, closing, coaches, courts, dayNumber, defaultStart, durations,
  kinds, longDate, monthDays, monthLabel, number, occupied, opening, previewMinute, seedBookings,
  shortDate, statuses, storedBookings, students, time, today, validateBooking, weekday, weekStart,
} from './model.mjs';
import { icon } from './icons.mjs';

const storageKey = 'tennis-club-os-preview-v1';
const pages = [
  { id: 'dashboard', title: 'نمای کلی', icon: 'dashboard' },
  { id: 'calendar', title: 'تقویم سانس‌ها', icon: 'calendar' },
  { id: 'courts', title: 'زمین‌ها', icon: 'court' },
  { id: 'people', title: 'مربیان و شاگردان', icon: 'people' },
];
const views = { day: 'روزانه', week: 'هفتگی', month: 'ماهانه' };
const activeCourts = courts.filter(court => court.active);
const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const announcement = document.querySelector('#announcement');
let toastTimeout;
let dialogOrigin;
let bookings = readBookings() ?? [...seedBookings];
const state = {
  page: pageFromHash(),
  date: today,
  view: 'day',
  court: 'all',
  roster: 'coaches',
  query: '',
};

function readBookings() {
  try {
    return storedBookings(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    return null;
  }
}

function persistBookings() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(bookings));
    return true;
  } catch {
    return false;
  }
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function pageFromHash() {
  const page = location.hash.slice(1);
  return pages.some(item => item.id === page) ? page : 'dashboard';
}

function tell(message) {
  clearTimeout(toastTimeout);
  announcement.textContent = message;
  toast.innerHTML = `${icon('check', 18)}<span>${escape(message)}</span>`;
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 4500);
}

function timeRange(booking) {
  return `<bdi dir="ltr" class="time-range">${time(booking.start)} – ${time(booking.start + booking.duration)}</bdi>`;
}

function statusBadge(status) {
  return `<span class="status status-${status}"><i></i>${statuses[status]}</span>`;
}

function newButton(date = today) {
  return `<button class="button primary" data-action="new" data-date="${date}" ${date < today ? 'disabled' : ''}>${icon('plus')}<span>رزرو سانس</span></button>`;
}

function navLinks(className) {
  return `<nav class="${className}" aria-label="ناوبری اصلی">${pages.map(page => `
    <a href="#${page.id}" data-nav="${page.id}">${icon(page.icon)}<span>${page.title}</span></a>`).join('')}</nav>`;
}

root.innerHTML = `
  <aside class="sidebar">
    <a href="#dashboard" class="brand">
      <img src="./assets/court-icon.svg" width="43" height="43" alt="">
      <span><strong>باشگاه تنیس سام</strong><small dir="ltr">SAM TENNIS CLUB</small></span>
    </a>
    ${navLinks('side-nav')}
    <div class="sidebar-bottom">
      <a class="sidebar-help" href="./manage.html">${icon('people', 18)} مدیریت پرونده‌ها</a>
      <a class="sidebar-help" href="./access.html">${icon('people', 18)} نمونهٔ ورود و دسترسی</a>
      <button class="sidebar-help" data-action="help">${icon('info', 18)} نمونهٔ تعاملی</button>
      <div class="profile"><span class="avatar">م</span><span><strong>مدیر باشگاه</strong><small>شعبهٔ مرکزی</small></span></div>
    </div>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <a href="#dashboard" class="mobile-brand" aria-label="باشگاه تنیس سام"><img src="./assets/court-icon.svg" width="34" height="34" alt=""></a>
      <div class="breadcrumbs"><span>پنل باشگاه</span><span class="breadcrumb-arrow">${icon('chevronLeft', 14)}</span><strong id="current-page"></strong></div>
      <span class="branch">${icon('pin', 16)} شعبهٔ مرکزی</span>
      <button class="icon-button mobile-help" aria-label="دربارهٔ نمونهٔ تعاملی" data-action="help">${icon('info')}</button>
    </header>
    <main id="main-content" class="content" tabindex="-1"></main>
  </div>
  ${navLinks('mobile-nav')}
`;

const main = document.querySelector('#main-content');

function pageHeading(title, note, date = today) {
  return `<div class="page-heading">
    <div><h1>${title}</h1>${note ? `<p>${note}</p>` : ''}</div>
    ${newButton(date)}
  </div>`;
}

function statCard(symbol, color, label, value, detail) {
  return `<article class="stat-card">
    <div class="stat-top"><span class="stat-icon ${color}">${icon(symbol, 19)}</span><span>${label}</span></div>
    <strong class="stat-value">${value}</strong><p>${detail}</p>
  </article>`;
}

function emptyState(title, detail) {
  return `<div class="empty-state">${icon('calendar', 25)}<strong>${title}</strong><p>${detail}</p></div>`;
}

function bookingTable(rows) {
  if (!rows.length) return emptyState('سانسی برای نمایش نیست', 'زمین یا تاریخ دیگری را انتخاب کنید.');
  return `<div class="schedule-list">
    <div class="schedule-head"><span>ساعت</span><span>سانس</span><span>زمین</span><span>وضعیت</span></div>
    ${rows.map(booking => {
      const court = courts.find(item => item.id === booking.court);
      return `<button type="button" class="schedule-row" data-action="detail" data-id="${escape(booking.id)}">
        <span class="schedule-time"><bdi dir="ltr">${time(booking.start)}</bdi><small>${number(booking.duration)} دقیقه</small></span>
        <span class="schedule-person"><strong>${kinds[booking.kind]}</strong><small>${escape(bookingName(booking))}</small></span>
        <span class="schedule-court"><i class="court-dot ${court.color}"></i>${court.name}</span>
        ${statusBadge(booking.status)}
      </button>`;
    }).join('')}
  </div>`;
}

function occupancyPanel(rows) {
  return `<section class="panel occupancy" aria-labelledby="occupancy-title">
    <div class="panel-heading"><div><h2 id="occupancy-title">اشغال زمین‌ها</h2><p>زمان رزروشده نسبت به ساعات کاری امروز</p></div><span class="panel-symbol">${icon('chart', 19)}</span></div>
    <div class="occupancy-list">${activeCourts.map(court => {
      const minutes = occupied(rows, court.id);
      const share = minutes * 100 / (closing - opening);
      return `<div class="court-progress">
        <div><span><i class="court-dot ${court.color}"></i><strong>${court.name}</strong><small>${court.surface}</small></span><b>${number(Math.round(share))}٪</b></div>
        <progress class="${court.color}" value="${minutes}" max="${closing - opening}" aria-label="اشغال ${court.name}"></progress>
      </div>`;
    }).join('')}</div>
    <a class="panel-link" href="#courts">مشاهدهٔ زمین‌ها ${icon('arrowLeft', 16)}</a>
  </section>`;
}

function dashboard() {
  const rows = bookingsOn(bookings, today);
  const effective = rows.filter(booking => booking.status !== 'cancelled');
  const upcoming = effective.filter(booking => booking.status === 'confirmed' && booking.start >= previewMinute);
  const next = upcoming[0];
  const percent = Math.round(occupied(effective) / (activeCourts.length * (closing - opening)) * 100);
  const lessons = effective.filter(booking => booking.kind !== 'rental').length;
  return `
    ${pageHeading('نمای کلی باشگاه', longDate(today))}
    <section class="hero" aria-labelledby="next-title">
      <div class="hero-content">
        <span class="hero-kicker"><i></i> برنامهٔ امروز</span>
        <h2 id="next-title">${next ? `سانس بعدی، ساعت <bdi dir="ltr">${time(next.start)}</bdi>` : 'برنامهٔ باقی‌مانده آزاد است'}</h2>
        <p>${next ? `${courts.find(court => court.id === next.court).name}<span aria-hidden="true"> · </span>${kinds[next.kind]}<span aria-hidden="true"> · </span>${escape(bookingName(next))}` : 'برای دیدن زمان‌های آزاد، تقویم را باز کنید.'}</p>
        <a class="hero-link" href="#calendar">مشاهدهٔ تقویم ${icon('arrowLeft', 16)}</a>
      </div>
    </section>
    <section class="stats" aria-label="شاخص‌های امروز">
      ${statCard('calendar', 'green', 'سانس‌های امروز', number(effective.length), `${number(upcoming.length)} سانس پیش رو`)}
      ${statCard('chart', 'lime', 'نرخ اشغال', `${number(percent)}٪`, 'از ظرفیت زمین‌های فعال')}
      ${statCard('court', 'blue', 'زمین‌های فعال', number(activeCourts.length), `از ${number(courts.length)} زمین باشگاه`)}
      ${statCard('racket', 'sand', 'جلسات آموزشی', number(lessons), 'تمرین خصوصی و کلاس گروهی')}
    </section>
    <div class="dashboard-columns">
      <section class="panel schedule" aria-labelledby="schedule-title">
        <div class="panel-heading"><div><h2 id="schedule-title">سانس‌های پیش رو</h2><p>برنامهٔ باقی‌ماندهٔ امروز</p></div><a class="panel-link" href="#calendar">کل برنامه ${icon('arrowLeft', 16)}</a></div>
        ${bookingTable(upcoming.slice(0, 4))}
      </section>
      ${occupancyPanel(rows)}
    </div>`;
}

function currentDateLabel() {
  if (state.view === 'month') return monthLabel(state.date);
  if (state.view === 'week') {
    const start = weekStart(state.date);
    return `${shortDate(start)} تا ${shortDate(addDays(start, 6))}`;
  }
  return longDate(state.date);
}

function calendarToolbar() {
  return `<div class="calendar-toolbar">
    <div class="date-control">
      <button class="icon-button" data-action="move-date" data-step="-1" aria-label="بازهٔ قبلی">${icon('chevronRight', 18)}</button>
      <strong aria-live="polite">${currentDateLabel()}</strong>
      <button class="icon-button" data-action="move-date" data-step="1" aria-label="بازهٔ بعدی">${icon('chevronLeft', 18)}</button>
      <button class="button subtle" data-action="today">امروز</button>
    </div>
    <div class="segmented" aria-label="نمای تقویم">${Object.entries(views).map(([id, label]) => `
      <button aria-pressed="${id === state.view}" data-action="view" data-view="${id}">${label}</button>`).join('')}</div>
    <label class="select-filter">${icon('filter', 17)}<span class="sr-only">فیلتر زمین</span>
      <select id="court-filter"><option value="all">همهٔ زمین‌ها</option>${activeCourts.map(court =>
        `<option value="${court.id}" ${state.court === court.id ? 'selected' : ''}>${court.name}</option>`).join('')}</select>
    </label>
  </div>`;
}

function position(minute) {
  return (minute - opening) / (closing - opening) * 100;
}

function slotAllowed(rows, start, duration) {
  if (state.date < today || (state.date === today && start < previewMinute) || start + duration > closing) return false;
  return !rows.some(booking => booking.start < start + duration && start < booking.start + booking.duration);
}

function courtLane(court, rows) {
  const courtRows = rows.filter(booking => booking.court === court.id && booking.status !== 'cancelled');
  const slots = [];
  for (let start = opening; start < closing; start += 30) {
    if (!slotAllowed(courtRows, start, 30)) continue;
    const duration = slotAllowed(courtRows, start, 60) ? 60 : 30;
    slots.push(`<button class="open-slot" style="--top:${position(start)}%"
      data-action="new" data-date="${state.date}" data-court="${court.id}" data-start="${start}" data-duration="${duration}"
      aria-label="رزرو ${court.name} ساعت ${time(start)}">${icon('plus', 17)}</button>`);
  }
  return `<div class="court-lane">
    ${slots.join('')}
    ${courtRows.map(booking => `<button class="calendar-event kind-${booking.kind}${booking.duration === 30 ? ' compact-event' : ''}" data-action="detail" data-id="${escape(booking.id)}"
      style="--top:${position(booking.start)}%;--size:${booking.duration / (closing - opening) * 100}%">
      <strong>${kinds[booking.kind]}</strong><span>${timeRange(booking)} <span class="event-name">· ${escape(bookingName(booking))}</span></span>
    </button>`).join('')}
  </div>`;
}

function dayCalendar(rows) {
  const selectedCourts = state.court === 'all' ? activeCourts : activeCourts.filter(court => court.id === state.court);
  const cancelled = rows.filter(booking => booking.status === 'cancelled');
  return `
    <div class="day-grid" style="--courts:${selectedCourts.length}">
      <div class="day-grid-heading">
        <span>ساعت</span>${selectedCourts.map(court => `<span><i class="court-dot ${court.color}"></i><strong>${court.name}</strong> <small>${court.surface}</small></span>`).join('')}
      </div>
      <div class="day-grid-body">
        <div class="time-axis">${Array.from({ length: 14 }, (_, index) => `<bdi dir="ltr">${time(opening + index * 60)}</bdi>`).join('')}</div>
        ${selectedCourts.map(court => courtLane(court, rows)).join('')}
      </div>
    </div>
    <div class="mobile-agenda">${bookingTable(rows)}</div>
    ${cancelled.length ? `<section class="period-agenda desktop-cancelled"><h2>سانس‌های لغوشده</h2>${bookingTable(cancelled)}</section>` : ''}`;
}

function periodCalendar() {
  const month = state.view === 'month';
  const dates = month ? monthDays(state.date) : Array.from({ length: 7 }, (_, index) => addDays(weekStart(state.date), index));
  const before = month ? (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 1) % 7 : 0;
  const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  return `<div class="period-calendar ${month ? 'month' : 'week'}">
    ${month ? `<div class="month-labels">${dayNames.map(name => `<span>${name}</span>`).join('')}</div>` : ''}
    <div class="period-grid">
      ${'<span class="empty-day" aria-hidden="true"></span>'.repeat(before)}
      ${dates.map(date => {
        const count = bookings.filter(booking => booking.date === date && booking.status !== 'cancelled' &&
          (state.court === 'all' || booking.court === state.court)).length;
        return `<button class="date-tile ${date === today ? 'is-today' : ''}" data-action="select-date" data-date="${date}"
          aria-label="${longDate(date)}، ${number(count)} سانس" aria-pressed="${date === state.date}">
          ${month ? '' : `<span>${weekday(date)}</span>`}
          <strong>${dayNumber(date)}</strong><small>${count ? `${number(count)} سانس` : '—'}</small>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function calendar() {
  const rows = bookingsOn(bookings, state.date).filter(booking => state.court === 'all' || booking.court === state.court);
  const body = state.view === 'day' ? dayCalendar(rows) : `${periodCalendar()}
    <div class="period-agenda"><h2>${longDate(state.date)}</h2>${bookingTable(rows)}</div>`;
  return `${pageHeading('تقویم سانس‌ها', 'برنامهٔ زمین‌ها و جلسات باشگاه', state.date)}
    <section class="panel calendar-panel" aria-label="تقویم سانس‌ها">
      ${calendarToolbar()}${body}
    </section>`;
}

function courtsPage() {
  const rows = bookingsOn(bookings, today);
  return `${pageHeading('زمین‌ها', 'وضعیت زمین‌ها و برنامهٔ امروز')}
    <div class="court-cards">${courts.map(court => {
      const count = rows.filter(booking => booking.court === court.id && booking.status !== 'cancelled').length;
      return `<article class="panel court-card">
        <div class="court-art ${court.color}">${icon('court', 78)}</div>
        <div class="court-card-body"><div class="court-card-title"><h2>${court.name}</h2>
          <span class="status ${court.active ? 'status-confirmed' : 'status-cancelled'}"><i></i>${court.active ? 'فعال' : 'غیرفعال'}</span></div>
          <p>${court.surface}${court.active ? ` · ${number(count)} سانس امروز` : ''}</p>
          ${court.active ? `<button class="panel-link" data-action="court-calendar" data-court="${court.id}">تقویم زمین ${icon('arrowLeft', 16)}</button>` : ''}
        </div>
      </article>`;
    }).join('')}</div>`;
}

function rosterResults() {
  const people = state.roster === 'coaches' ? coaches : students;
  const normalized = text => text.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
  const filtered = people.filter(person => normalized(person.name).includes(normalized(state.query)));
  if (!filtered.length) return emptyState('فردی پیدا نشد', 'نام دیگری را جست‌وجو کنید.');
  return `<ul class="roster-list">${filtered.map(person => `
    <li><span class="avatar">${person.initials}</span><div><strong>${person.name}</strong><small>${person.note}</small></div>
    <span class="status ${person.active ? 'status-confirmed' : 'status-cancelled'}"><i></i>${person.active ? 'فعال' : 'غیرفعال'}</span></li>`).join('')}</ul>`;
}

function peoplePage() {
  return `${pageHeading('مربیان و شاگردان', 'افراد ثبت‌شده در نمونهٔ باشگاه')}
    <section class="panel roster-panel" aria-label="فهرست افراد">
      <div class="calendar-toolbar">
        <div class="segmented" aria-label="گروه افراد">
          <button data-action="roster" data-roster="coaches" aria-pressed="${state.roster === 'coaches'}">مربیان</button>
          <button data-action="roster" data-roster="students" aria-pressed="${state.roster === 'students'}">شاگردان</button>
        </div>
        <label class="search-field">${icon('search', 18)}<span class="sr-only">جست‌وجوی نام</span>
          <input id="person-search" placeholder="جست‌وجوی نام" type="search" value="${escape(state.query)}">
        </label>
      </div>
      <div id="roster-results">${rosterResults()}</div>
    </section>`;
}

const renderPage = { dashboard, calendar, courts: courtsPage, people: peoplePage };

function render({ focus = false } = {}) {
  const currentPage = pages.find(page => page.id === state.page);
  document.querySelector('#current-page').textContent = currentPage.title;
  for (const link of root.querySelectorAll('[data-nav]')) {
    if (link.dataset.nav === state.page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  main.innerHTML = renderPage[state.page]();
  if (focus) main.focus({ preventScroll: true });
}

function focusToolbar(action, qualifier = '') {
  main.querySelector(`[data-action="${action}"]${qualifier}`)?.focus({ preventScroll: true });
}

function showDialog(title, caption, content) {
  if (!dialog.open) dialogOrigin = document.activeElement;
  dialog.innerHTML = `<div class="dialog-inner">
    <header class="dialog-header"><div><h2 id="dialog-title" tabindex="-1">${title}</h2>${caption ? `<p>${caption}</p>` : ''}</div>
    <button type="button" class="icon-button" data-action="close-dialog" aria-label="بستن">${icon('close')}</button></header>
    ${content}
  </div>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('#dialog-title').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}

function options(items, selected) {
  return items.map(([value, label]) =>
    `<option value="${escape(value)}"${String(value) === String(selected) ? ' selected' : ''}>${escape(label)}</option>`).join('');
}

function reserveForm(prefill = {}, previous = null) {
  const date = previous?.date ?? (prefill.date && prefill.date >= today ? prefill.date : today);
  const court = previous?.court ?? (prefill.court || (state.page === 'calendar' && state.court !== 'all' ? state.court : activeCourts[0].id));
  const start = previous?.start ?? (prefill.start ? Number(prefill.start) : defaultStart(bookings, date, court));
  const duration = previous?.duration ?? (prefill.duration ? Number(prefill.duration) : 60);
  const kind = previous?.kind ?? 'rental';
  const dates = Array.from({ length: 60 }, (_, index) => addDays(today, index));
  if (!dates.includes(date)) dates.push(date);
  const times = Array.from({ length: (closing - opening) / 30 }, (_, index) => opening + index * 30);
  showDialog(previous ? 'ویرایش سانس' : 'رزرو سانس', 'جزئیات سانس و زمان شروع را انتخاب کنید.', `
    <form id="booking-form" novalidate data-id="${escape(previous?.id ?? '')}">
      <div class="form-grid">
        <label class="field"><span>تاریخ</span><select name="date">${options(dates.map(day => [day, longDate(day)]), date)}</select></label>
        <label class="field"><span>زمین</span><select name="court">${options(activeCourts.map(item => [item.id, `${item.name} · ${item.surface}`]), court)}</select></label>
        <label class="field"><span>ساعت شروع</span><select name="start">${options(times.map(value => [value, time(value)]), start)}</select></label>
        <label class="field"><span>مدت</span><select name="duration">${options(durations.map(value => [value, `${number(value)} دقیقه`]), duration)}</select></label>
        <label class="field wide"><span>نوع سانس</span><select name="kind">${options(Object.entries(kinds), kind)}</select></label>
        <label id="rental-field" class="field wide"><span>نام رزروکننده</span>
          <input name="name" placeholder="مثلاً نادر کریمی" maxlength="50" autocomplete="off" value="${escape(previous?.name ?? '')}"></label>
        <div id="lesson-fields" class="form-grid wide" hidden>
          <label class="field"><span>مربی</span><select name="coach">${options([['', 'انتخاب مربی'], ...coaches.filter(item => item.active).map(item => [item.id, item.name])], previous?.coach ?? '')}</select></label>
          <label class="field"><span>شاگرد</span><select name="student">${options([['', 'انتخاب شاگرد'], ...students.filter(item => item.active).map(item => [item.id, item.name])], previous?.student ?? '')}</select></label>
        </div>
      </div>
      <p id="booking-error" class="form-error" role="alert" hidden></p>
      <div id="booking-estimate" class="estimate"></div>
      <footer class="dialog-actions"><button type="submit" class="button primary">${icon('check', 18)} ${previous ? 'ذخیرهٔ تغییرات' : 'ثبت سانس آزمایشی'}</button>
        <button type="button" class="button subtle" data-action="close-dialog">انصراف</button></footer>
    </form>`);
  updateForm(dialog.querySelector('#booking-form'));
}

function updateForm(form) {
  const { kind, court, duration, start, name, coach, student } = form.elements;
  const rental = kind.value === 'rental';
  form.querySelector('#rental-field').hidden = !rental;
  form.querySelector('#lesson-fields').hidden = rental;
  name.disabled = !rental;
  coach.disabled = rental;
  student.disabled = rental;

  const courtFees = { one: 180000, two: 210000, three: 210000 };
  const lessonFees = { rental: 0, private: 160000, group: 80000 };
  const minutes = Number(duration.value);
  const price = (courtFees[court.value] + lessonFees[kind.value]) * minutes / 30;
  const end = Number(start.value) + minutes;
  form.querySelector('#booking-estimate').innerHTML = `
    <div><small>زمان پایان</small><bdi dir="ltr">${time(end)}</bdi></div>
    <div><small>تعرفهٔ نمونه</small><strong>${number(price)} <small>تومان</small></strong></div>`;
}

function detail(booking) {
  const court = courts.find(item => item.id === booking.court);
  const coach = coaches.find(item => item.id === booking.coach);
  const editable = booking.status === 'confirmed' && (booking.date > today || (booking.date === today && booking.start >= previewMinute));
  showDialog(kinds[booking.kind], longDate(booking.date), `
    <dl class="detail-list">
      <div><dt>ساعت</dt><dd>${timeRange(booking)}</dd></div>
      <div><dt>زمین</dt><dd><i class="court-dot ${court.color}"></i> ${court.name} · ${court.surface}</dd></div>
      <div><dt>${booking.kind === 'rental' ? 'رزروکننده' : 'شاگرد'}</dt><dd>${escape(bookingName(booking))}</dd></div>
      ${coach ? `<div><dt>مربی</dt><dd>${coach.name}</dd></div>` : ''}
      <div><dt>وضعیت</dt><dd>${statusBadge(booking.status)}</dd></div>
    </dl>
    <footer class="dialog-actions">${editable ? `
      <button class="button primary" data-action="edit" data-id="${escape(booking.id)}">${icon('edit', 17)} ویرایش سانس</button>
      <button class="button danger-quiet" data-action="cancel-prompt" data-id="${escape(booking.id)}">لغو سانس</button>`
      : '<button class="button subtle" data-action="close-dialog">بستن</button>'}
    </footer>`);
}

function cancelPrompt(booking) {
  showDialog('لغو این سانس؟', '', `
    <p class="dialog-copy">بازهٔ ${timeRange(booking)} آزاد می‌شود و این سانس با وضعیت «لغوشده» در فهرست باقی می‌ماند.</p>
    <footer class="dialog-actions"><button class="button danger" data-action="cancel-booking" data-id="${escape(booking.id)}">تأیید لغو</button>
    <button class="button subtle" data-action="detail" data-id="${escape(booking.id)}">بازگشت</button></footer>`);
}

function help() {
  showDialog('نمونهٔ تعاملی باشگاه', '', `
    <p class="dialog-copy">تاریخ نمونه چهارشنبه ۲۰ آبان ۱۴۰۵ است. نام‌ها، رزروها و تعرفه‌ها ساختگی‌اند. ثبت و تغییر سانس روی همین مرورگر ذخیره می‌شود.</p>
    <footer class="dialog-actions"><button class="button subtle" data-action="reset-prompt">${icon('refresh', 18)} بازنشانی داده‌های نمونه</button>
    <a class="button subtle" href="./access.html">نمونهٔ ورود و دسترسی</a>
    <a class="button subtle" href="./manage.html">مدیریت پرونده‌ها</a></footer>`);
}

function complete(message) {
  const saved = persistBookings();
  dialog.close();
  render();
  tell(saved ? message : `${message} ذخیرهٔ مرورگر در دسترس نیست.`);
}

function clearError(form) {
  const error = form.querySelector('#booking-error');
  error.hidden = true;
  form.querySelectorAll('[aria-invalid]').forEach(input => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  });
}

function formError(form, { field, message }) {
  const error = form.querySelector('#booking-error');
  error.textContent = message;
  error.hidden = false;
  const input = form.elements.namedItem(field);
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'booking-error');
    input.focus();
  }
}

dialog.addEventListener('submit', event => {
  const form = event.target;
  if (form.id !== 'booking-form') return;
  event.preventDefault();
  clearError(form);
  const values = new FormData(form);
  const id = form.dataset.id;
  const previous = bookings.find(booking => booking.id === id);
  if (id && previous?.status !== 'confirmed') {
    formError(form, { message: 'وضعیت سانس تغییر کرده است. دوباره جزئیات آن را باز کنید.' });
    return;
  }
  if (!id && bookings.length >= 250) {
    formError(form, { message: 'ظرفیت دادهٔ آزمایشی پر است. نمونه را از بخش راهنما بازنشانی کنید.' });
    return;
  }
  const draft = {
    id: id || crypto.randomUUID(),
    status: 'confirmed',
    date: values.get('date'),
    court: values.get('court'),
    start: Number(values.get('start')),
    duration: Number(values.get('duration')),
    kind: values.get('kind'),
    name: String(values.get('name') ?? '').trim(),
    coach: values.get('coach') ?? '',
    student: values.get('student') ?? '',
  };
  const error = validateBooking(draft, bookings);
  if (error) {
    formError(form, error);
    return;
  }
  bookings = previous ? bookings.map(booking => booking.id === id ? draft : booking) : [...bookings, draft];
  if (state.page === 'calendar') {
    state.date = draft.date;
    if (state.court !== 'all') state.court = draft.court;
  }
  complete(previous ? 'تغییرات سانس ذخیره شد.' : 'سانس آزمایشی ثبت شد.');
});

dialog.addEventListener('input', event => {
  const form = event.target.closest('#booking-form');
  if (form) clearError(form);
});
dialog.addEventListener('change', event => {
  const form = event.target.closest('#booking-form');
  if (form) updateForm(form);
});
dialog.addEventListener('close', () => {
  if (dialogOrigin?.isConnected) dialogOrigin.focus({ preventScroll: true });
  else main.focus({ preventScroll: true });
});

function changeDate(step) {
  if (state.view === 'month') {
    const dates = monthDays(state.date);
    const adjacent = step < 0 ? addDays(dates[0], -1) : addDays(dates.at(-1), 1);
    state.date = monthDays(adjacent)[0];
  } else {
    state.date = addDays(state.date, step * (state.view === 'week' ? 7 : 1));
  }
}

const actions = {
  new: target => reserveForm(target.dataset),
  detail: (_, booking) => { if (booking) detail(booking); },
  edit: (_, booking) => { if (booking?.status === 'confirmed') reserveForm({}, booking); },
  'close-dialog': () => dialog.close(),
  'cancel-prompt': (_, booking) => { if (booking?.status === 'confirmed') cancelPrompt(booking); },
  'cancel-booking': (_, booking) => {
    if (booking?.status !== 'confirmed') return;
    bookings = bookings.map(item => item.id === booking.id ? { ...item, status: 'cancelled' } : item);
    complete('سانس لغو شد و بازه آزاد است.');
  },
  help,
  'reset-prompt': () => showDialog('بازنشانی داده‌های نمونه؟', '', `
    <p class="dialog-copy">تمام تغییرات آزمایشی این مرورگر پاک می‌شوند و برنامهٔ اولیه برمی‌گردد.</p>
    <footer class="dialog-actions"><button class="button danger" data-action="reset">بازنشانی</button>
    <button class="button subtle" data-action="help">بازگشت</button></footer>`),
  reset: () => {
    bookings = [...seedBookings];
    complete('داده‌های اولیهٔ نمونه بازگشت.');
  },
  'move-date': target => {
    changeDate(Number(target.dataset.step));
    render();
    focusToolbar('move-date', `[data-step="${target.dataset.step}"]`);
  },
  today: () => {
    state.date = today;
    render();
    focusToolbar('today');
  },
  view: target => {
    state.view = target.dataset.view;
    render();
    focusToolbar('view', `[data-view="${state.view}"]`);
  },
  'select-date': target => {
    state.date = target.dataset.date;
    render();
    focusToolbar('select-date', `[data-date="${state.date}"]`);
  },
  'court-calendar': target => {
    state.court = target.dataset.court;
    state.date = today;
    state.view = 'day';
    location.hash = 'calendar';
  },
  roster: target => {
    state.roster = target.dataset.roster;
    state.query = '';
    render();
    focusToolbar('roster', `[data-roster="${state.roster}"]`);
  },
};

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const booking = target.dataset.id ? bookings.find(item => item.id === target.dataset.id) : null;
  actions[target.dataset.action]?.(target, booking);
});

main.addEventListener('change', event => {
  if (event.target.id !== 'court-filter') return;
  state.court = event.target.value;
  render();
  document.querySelector('#court-filter').focus({ preventScroll: true });
});

main.addEventListener('input', event => {
  if (event.target.id !== 'person-search') return;
  state.query = event.target.value;
  main.querySelector('#roster-results').innerHTML = rosterResults();
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#main-content') return;
  state.page = pageFromHash();
  render({ focus: true });
  window.scrollTo(0, 0);
});

window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  bookings = readBookings() ?? [...seedBookings];
  render();
});

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});

render();
