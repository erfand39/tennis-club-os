import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowUpLeft,
  CalendarDays,
  CalendarPlus,
  Clock3,
  FileBarChart2,
  MapPin,
  Users,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { calendarCourts, courtFreeWindows } from '@/lib/calendar';
import { branchDateTime, calendarPath } from '@/lib/calendar-dates';
import { classesPath } from '@/lib/class-fields';
import { branches, clubFor, clubOverviewCounts, clubTodaySessions } from '@/lib/club';
import { operationsPath } from '@/lib/club-finance-fields';
import { reportPath } from '@/lib/report-dates';
import { bookingKinds, resourcePath, resourceStatuses } from '@/lib/resource-fields';
import { roles } from '@/lib/roles';
import { currentUser } from '@/lib/session';

export default async function Dashboard({ params, searchParams }: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const [{ org }, { branch: requestedBranch }] = await Promise.all([params, searchParams]);
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();

  const [scope, counts] = await Promise.all([
    branches(user.id, org),
    clubOverviewCounts(user.id, org),
  ]);
  const branch = scope.find(item => item.id === requestedBranch) ?? scope.find(item => item.active) ?? scope[0];
  const now = new Date();
  const today = branch && branchDateTime(branch.timezone, now);
  const [todaySessions, courts, free] = await Promise.all([
    clubTodaySessions(user.id, org, branch ? [branch] : []),
    branch ? calendarCourts(user.id, org, branch.id) : [],
    branch && today ? courtFreeWindows(user.id, org, branch, today.date) : [],
  ]);
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
    <>
      <header className="local-heading directory-heading">
        <div>
          <h1>میز کار باشگاه</h1>
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

      <section className="local-hero">
        <div className="local-hero-body">
          <h2>{branch?.name ?? club.name}</h2>
          <div className="local-hero-actions">
            {create && (
              <Link className="hero-link is-primary" href={create}>
                <CalendarPlus size={16} aria-hidden="true" />
                <span>ثبت سانس</span>
              </Link>
            )}
            <Link className="hero-link" href={calendar}>
              <CalendarDays size={16} aria-hidden="true" />
              <span>تقویم امروز</span>
            </Link>
            {expenses && <Link className="hero-link" href={expenses}>
              <Wallet size={16} aria-hidden="true" />
              <span>ثبت هزینه</span>
            </Link>}
            <Link className="hero-link" href={reportPath(org)}>
              <FileBarChart2 size={16} aria-hidden="true" />
              <span>گزارش‌ها و خروجی</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel local-panel" aria-label="سانس‌های امروز">
          <div className="calendar-section-title table-section-head">
            <div>
              <h2>سانس‌های امروز</h2>
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
                  <li key={item.id} className="dashboard-session-item">
                    <div className="dashboard-session-main">
                      <div className="dashboard-session-title">
                        <strong>{item.student_name ?? item.booker_name ?? bookingKinds[item.kind]}</strong>
                        <span className={`resource-status ${statusClass}`}>
                          <i />
                          {statusText}
                        </span>
                      </div>
                      <small className="dashboard-session-meta">
                        <Clock3 size={13} aria-hidden="true" />
                        <bdi dir="ltr">{startClock}–{endClock}</bdi>
                        <span>· {item.court_name} ({item.branch_name})</span>
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
              <strong>برای امروز سانسی ثبت نشده است.</strong>
            </div>
          )}
        </section>

        <section className="panel local-panel">
          <div className="calendar-section-title table-section-head">
            <h2>وضعیت زمین‌های امروز</h2>
            <Link className="panel-link" href={resourcePath(org, 'courts') + (branch ? `?branch=${branch.id}` : '')}>
              مدیریت زمین‌ها <ArrowUpLeft size={15} aria-hidden="true" />
            </Link>
          </div>
          {branch && today && courts.length ? (
            <ul className="local-branches">
              {courts.map(court => {
                const slot = free.find(window => window.court_id === court.id);
                const clock = slot && branchDateTime(branch.timezone, slot.start_at);
                const openNow = clock && clock.input <= today.input;
                return <li key={court.id}>
                  <div>
                    <Link className="panel-link" href={calendarPath(org, { branch: branch.id, court: court.id })}>{court.name}</Link>
                    {court.status !== 'active' ? <small>{resourceStatuses[court.status]}</small>
                      : !branch.active ? <small>شعبه غیرفعال است</small>
                      : !clock ? <small>بازهٔ آزاد باقی نمانده</small>
                      : <small>{openNow ? 'اکنون آزاد' : 'آزاد از '} {!openNow && <bdi dir="ltr">{clock.hour}</bdi>}</small>}
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
              <strong>{branch ? 'زمینی برای این شعبه ثبت نشده است.' : 'شعبه‌ای در دسترس نیست.'}</strong>
            </div>
          )}
        </section>
      </div>
      <div className="stats" aria-label="شاخص‌های کل شعبه‌های قابل‌دسترسی">
        {kpis.map(({ label, value, href, hint, Icon }) => (
          <Link className="stat-card stat-card-link" key={label} href={href}>
            <span className="stat-top"><Icon size={16} aria-hidden="true" className="stat-icon" />{label}</span>
            <strong className="stat-value">{number.format(value)}</strong>
            <span className="stat-hint">{hint}<ArrowUpLeft size={14} aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </>
  );
}
