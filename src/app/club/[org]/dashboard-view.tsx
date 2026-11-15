import Link from 'next/link';
import {
  ArrowUpLeft,
  CalendarDays,
  CalendarPlus,
  FileBarChart2,
  MapPin,
  Users,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { calendarCourts, courtFreeWindows } from '@/lib/calendar';
import { branchDateTime, calendarPath } from '@/lib/calendar-dates';
import { classesPath } from '@/lib/class-fields';
import type { Branch, Club, TodaySessionItem, clubOverviewCounts } from '@/lib/club';
import { operationsPath } from '@/lib/club-finance-fields';
import { reportPath } from '@/lib/report-dates';
import { bookingKinds, resourcePath, resourceStatuses } from '@/lib/resource-fields';
import { roles } from '@/lib/roles';
import { Icon } from '@/app/components/icon';

export interface DashboardViewProps {
  org: string;
  club: Club;
  scope: Branch[];
  branch?: Branch;
  counts: Awaited<ReturnType<typeof clubOverviewCounts>>;
  todaySessions: TodaySessionItem[];
  courts: Awaited<ReturnType<typeof calendarCourts>>;
  free: Awaited<ReturnType<typeof courtFreeWindows>>;
  now: Date;
}

export function DashboardView({ org, club, scope, branch, counts, todaySessions, courts, free, now }: DashboardViewProps) {
  const today = branch && branchDateTime(branch.timezone, now);
  const number = new Intl.NumberFormat('fa-IR');
  const calendar = calendarPath(org, { branch: branch?.id });
  const create = branch?.active && calendarPath(org, { booking: 'new', branch: branch.id });
  const expenses = branch && operationsPath(org, branch.id, 'expenses') + '#record-expense';

  const kpis = [
    {
      label: 'زمین‌های فعال',
      value: counts.courts,
      href: resourcePath(org, 'courts'),
      hint: 'مدیریت زمین‌ها',
      Icon: MapPin,
    },
    {
      label: 'سانس‌های پیش رو',
      value: counts.bookings,
      href: calendarPath(org),
      hint: 'مشاهدهٔ تقویم',
      Icon: CalendarDays,
    },
    {
      label: 'مربیان فعال',
      value: counts.coaches,
      href: resourcePath(org, 'coaches'),
      hint: 'پروندهٔ مربیان',
      Icon: UserCheck,
    },
    {
      label: 'شاگردان فعال',
      value: counts.students,
      href: resourcePath(org, 'students'),
      hint: 'پروندهٔ شاگردان',
      Icon: Users,
    },
  ];

  return (
    <div className="dashboard-v2">
      <header className="local-heading directory-heading">
        <div>
          <span className="page-eyebrow">مدیریت روزانه</span><h1>امروز در باشگاه</h1>
          <p>{club.name} · {roles[club.role]}{branch && ` · ${new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'full', timeZone: branch.timezone,
          }).format(now)}`}</p>
        </div>
        {scope.length > 1 && <form className="calendar-filter" method="get">
          <label className="field"><span>شعبه</span><select name="branch" defaultValue={branch?.id}>
            {scope.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label><button className="button subtle">نمایش</button>
        </form>}
      </header>

      <section className="daily-welcome" aria-label="عملیات روزانه">
        <div className="daily-welcome-copy">
          <span className="welcome-eyebrow"><span aria-hidden="true" />{branch?.name ?? club.name}</span>
          <h2>یک روز خوب، از یک برنامهٔ مرتب.</h2>
          <p>سانس‌ها، زمین‌ها و کارهای امروز را از همین‌جا مدیریت کنید.</p>
          <div className="daily-welcome-actions">
            {create && <Link className="button welcome-primary" href={create}>
              <CalendarPlus size={18} aria-hidden="true" />ثبت سانس جدید
            </Link>}
            <Link className="welcome-calendar" href={calendar}>مشاهدهٔ تقویم<ArrowUpLeft size={18} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="welcome-court" aria-hidden="true"><Icon name="court" size={150} /></div>
      </section>

      <div className="daily-shortcuts" aria-label="دسترسی سریع">
        {expenses && <Link href={expenses}><span className="shortcut-icon"><Wallet size={19} aria-hidden="true" /></span><span><strong>ثبت هزینه</strong><small>هزینه‌های روزانهٔ شعبه</small></span><ArrowUpLeft size={16} aria-hidden="true" /></Link>}
        <Link href={classesPath(org)}><span className="shortcut-icon"><UserCheck size={19} aria-hidden="true" /></span><span><strong>حضور و غیاب</strong><small>پیگیری جلسه‌های آموزشی</small></span><ArrowUpLeft size={16} aria-hidden="true" /></Link>
        <Link href={reportPath(org, { branch: branch?.id })}><span className="shortcut-icon"><FileBarChart2 size={19} aria-hidden="true" /></span><span><strong>گزارش عملکرد</strong><small>درآمد، هزینه و فعالیت‌ها</small></span><ArrowUpLeft size={16} aria-hidden="true" /></Link>
      </div>

      <div className="dashboard-grid">
        <section className="panel local-panel" aria-label="سانس‌های امروز">
          <div className="calendar-section-title table-section-head">
            <div>
              <h2><CalendarDays size={19} aria-hidden="true" />برنامهٔ امروز</h2>
              <small>{todaySessions.length ? `${number.format(todaySessions[0].total_today)} سانس در برنامهٔ امروز` : 'برنامهٔ روزانهٔ زمین‌ها'}</small>
            </div>
            <Link className="panel-link" href={calendar}>
              <span>تقویم کامل</span>
              <ArrowUpLeft size={15} aria-hidden="true" />
            </Link>
          </div>

          {todaySessions.length ? (
            <ul className="resource-list dashboard-session-list">
              {todaySessions.map(item => {
                const startClock = branchDateTime(item.timezone, item.starts_at).hour;
                const endClock = branchDateTime(item.timezone, item.ends_at).hour;
                const ended = item.ends_at <= now;
                const statusText = item.status === 'cancelled'
                  ? 'لغوشده'
                  : item.session_status === 'completed'
                    ? 'برگزارشده'
                    : ended ? 'پایان‌یافته' : item.starts_at <= now ? 'در حال برگزاری' : 'تأییدشده';
                const statusClass = item.status === 'cancelled'
                  ? 'is-inactive'
                  : item.session_status === 'completed'
                    ? 'is-archived'
                    : ended ? 'is-elapsed' : 'is-active';

                return (
                  <li key={item.id} className={`dashboard-session-item ${item.status === 'cancelled' || ended ? 'session-past' : ''}`}>
                    <div className="session-time"><bdi dir="ltr">{startClock}</bdi><small><bdi dir="ltr">{endClock}</bdi></small></div>
                    <div className="dashboard-session-main">
                      <div className="dashboard-session-title">
                        <strong>{item.student_name ?? item.booker_name ?? bookingKinds[item.kind]}</strong>
                        <span className={`resource-status ${statusClass}`}>
                          <i />
                          {statusText}
                        </span>
                      </div>
                      <small className="dashboard-session-meta">
                        <span>{item.court_name} · {bookingKinds[item.kind]}</span>
                        {item.coach_name && <span>· {item.coach_name}</span>}
                      </small>
                    </div>
                    <div className="dashboard-session-actions">
                      {item.session_id && (
                        <Link className="button subtle dashboard-mini-btn" href={classesPath(org, item.session_id)}>
                          کلاس و حضور
                        </Link>
                      )}
                      <Link className="button subtle dashboard-mini-btn" href={calendarPath(org, { booking: item.id })}>
                        جزئیات
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-state-icon"><CalendarDays size={27} aria-hidden="true" /></span>
              <strong>برنامهٔ امروز هنوز خالی است</strong>
              <p>با ثبت اولین سانس، برنامهٔ روز را شروع کنید.</p>
              {create && <Link className="button subtle" href={create}>ثبت اولین سانس<ArrowUpLeft size={16} aria-hidden="true" /></Link>}
            </div>
          )}
        </section>

        <section className="panel local-panel">
          <div className="calendar-section-title table-section-head">
            <h2><Icon name="court" size={19} />وضعیت زمین‌ها</h2>
            <Link className="panel-link" href={resourcePath(org, 'courts') + (branch ? `?branch=${branch.id}` : '')}>
              مدیریت زمین‌ها <ArrowUpLeft size={15} aria-hidden="true" />
            </Link>
          </div>
          {branch && today && courts.length ? (
            <ul className="local-branches court-status-list">
              {courts.map(court => {
                const slot = court.status === 'active' && branch.active ? free.find(window => window.court_id === court.id) : undefined;
                const clock = slot && branchDateTime(branch.timezone, slot.start_at);
                const openNow = clock && clock.input <= today.input;
                return <li key={court.id}>
                  <span className={`court-status-icon ${openNow ? 'is-free' : ''}`} aria-hidden="true"><Icon name="court" size={26} /></span>
                  <div className="court-status-copy">
                    <Link className="panel-link" href={calendarPath(org, { branch: branch.id, court: court.id })}>{court.name}</Link>
                    {court.status !== 'active' ? <small>{resourceStatuses[court.status]}</small>
                      : !branch.active ? <small>شعبه غیرفعال است</small>
                      : !clock ? <small>بازهٔ آزاد باقی نمانده</small>
                      : <small className={openNow ? 'court-available' : ''}>{openNow ? 'اکنون آزاد' : 'آزاد از '} {!openNow && <bdi dir="ltr">{clock.hour}</bdi>}</small>}
                  </div>
                  {clock && <Link className="button subtle dashboard-mini-btn" aria-label={`ثبت سانس ${court.name}`}
                    href={calendarPath(org, { booking: 'new', branch: branch.id, court: court.id, date: today.date, start: clock.input })}>
                    ثبت سانس
                  </Link>}
                </li>;
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-state-icon"><Icon name="court" size={27} /></span>
              <strong>{branch ? 'زمینی برای این شعبه ثبت نشده است.' : 'شعبه‌ای در دسترس نیست.'}</strong>
              {branch && <Link className="button subtle" href={resourcePath(org, 'courts', 'new')}>افزودن زمین</Link>}
            </div>
          )}
        </section>
      </div>
      <div className="overview-heading"><h2>باشگاه در یک نگاه</h2><span>همهٔ شعبه‌های در دسترس</span></div>
      <div className="stats" aria-label="شاخص‌های کل شعبه‌های قابل‌دسترسی">
        {kpis.map(({ label, value, href, hint, Icon }) => (
          <Link className="stat-card stat-card-link" key={label} href={href}>
            <span className="stat-top"><Icon size={16} aria-hidden="true" className="stat-icon" />{label}</span>
            <strong className="stat-value">{number.format(value)}</strong>
            <span className="stat-hint">{hint}<ArrowUpLeft size={14} aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
