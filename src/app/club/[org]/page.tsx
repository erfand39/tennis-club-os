import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowUpLeft,
  CalendarDays,
  CalendarPlus,
  Clock3,
  GraduationCap,
  MapPin,
  Users,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { branchDateTime, calendarPath } from '@/lib/calendar-dates';
import { classesPath } from '@/lib/class-fields';
import { branches, clubFor, clubOverviewCounts, clubTodaySessions } from '@/lib/club';
import { financePath } from '@/lib/finance-fields';
import { bookingKinds, resourcePath } from '@/lib/resource-fields';
import { roles } from '@/lib/roles';
import { currentUser } from '@/lib/session';

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();

  const [scope, counts] = await Promise.all([
    branches(user.id, org),
    clubOverviewCounts(user.id, org),
  ]);
  const todaySessions = await clubTodaySessions(user.id, org, scope);
  const activeBranch = scope.find(branch => branch.active);
  const number = new Intl.NumberFormat('fa-IR');

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
          <h1>نمای کلی</h1>
          <p>{club.name} · {roles[club.role]}</p>
        </div>
        <div className="dashboard-top-actions">
          <Link className="button subtle" href={classesPath(org)}>
            <GraduationCap size={17} aria-hidden="true" />
            <span>کلاس‌ها و حضور</span>
          </Link>
          {activeBranch && (
            <Link className="button primary" href={calendarPath(org, { booking: 'new', branch: activeBranch.id })}>
              <CalendarPlus size={17} aria-hidden="true" />
              <span>ثبت رزرو جدید</span>
            </Link>
          )}
        </div>
      </header>

      <section className="local-hero">
        <div className="local-hero-body">
          <h2>{club.name}</h2>
          <p>{scope.length ? scope.map(branch => branch.name).join('، ') : 'شعبه‌ای برای حساب شما فعال نشده است.'}</p>
          <div className="local-hero-actions">
            {activeBranch && (
              <Link className="hero-link is-primary" href={calendarPath(org, { booking: 'new', branch: activeBranch.id })}>
                <CalendarPlus size={16} aria-hidden="true" />
                <span>ثبت رزرو جدید</span>
              </Link>
            )}
            <Link className="hero-link" href={calendarPath(org)}>
              <CalendarDays size={16} aria-hidden="true" />
              <span>تقویم امروز</span>
            </Link>
            <Link className="hero-link" href={classesPath(org)}>
              <GraduationCap size={16} aria-hidden="true" />
              <span>کلاس‌ها</span>
            </Link>
            <Link className="hero-link" href={financePath(org)}>
              <Wallet size={16} aria-hidden="true" />
              <span>امور مالی</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="stats" aria-label="شاخص‌های محدودهٔ دسترسی">
        {kpis.map(({ label, value, href, hint, Icon }) => (
          <Link className="stat-card stat-card-link" key={label} href={href}>
            <span className="stat-top">
              <Icon size={16} aria-hidden="true" className="stat-icon" />
              <span>{label}</span>
            </span>
            <strong className="stat-value">{number.format(value)}</strong>
            <span className="stat-hint">
              <span>{hint}</span>
              <ArrowUpLeft size={14} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel local-panel" aria-label="سانس‌های امروز">
          <div className="calendar-section-title table-section-head">
            <div>
              <h2>سانس‌های امروز</h2>
              <small>{todaySessions.length ? `${number.format(todaySessions[0].total_today)} سانس در برنامهٔ امروز` : 'برنامهٔ روزانهٔ زمین‌ها'}</small>
            </div>
            <Link className="panel-link" href={calendarPath(org)}>
              <span>تقویم کامل</span>
              <ArrowUpLeft size={15} aria-hidden="true" />
            </Link>
          </div>

          {todaySessions.length ? (
            <ul className="resource-list dashboard-session-list">
              {todaySessions.map(item => {
                const startClock = branchDateTime(item.timezone, item.starts_at).hour;
                const endClock = branchDateTime(item.timezone, item.ends_at).hour;
                const statusText = item.status === 'cancelled'
                  ? 'لغوشده'
                  : item.session_status === 'completed'
                    ? 'برگزارشده'
                    : 'تأییدشده';
                const statusClass = item.status === 'cancelled'
                  ? 'is-inactive'
                  : item.session_status === 'completed'
                    ? 'is-archived'
                    : 'is-active';

                return (
                  <li key={item.id} className="dashboard-session-item">
                    <div className="dashboard-session-main">
                      <div className="dashboard-session-title">
                        <strong>{bookingKinds[item.kind]}</strong>
                        <span className={`resource-status ${statusClass}`}>
                          <i />
                          {statusText}
                        </span>
                      </div>
                      <small className="dashboard-session-meta">
                        <Clock3 size={13} aria-hidden="true" />
                        <bdi dir="ltr">{startClock}–{endClock}</bdi>
                        <span>· {item.court_name} ({item.branch_name})</span>
                        {(item.coach_name || item.booker_name) && (
                          <span>· {item.coach_name ?? item.booker_name}</span>
                        )}
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
              <p>می‌توانید همین حالا سانس جدیدی روی تقویم ثبت کنید.</p>
              {activeBranch && (
                <Link className="button primary" href={calendarPath(org, { booking: 'new', branch: activeBranch.id })}>
                  <CalendarPlus size={16} aria-hidden="true" />
                  <span>ثبت رزرو جدید</span>
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="panel local-panel">
          <div className="calendar-section-title table-section-head">
            <h2>شعبه‌های قابل‌دسترسی</h2>
            {club.role === 'owner' && (
              <Link className="panel-link" href={`/club/${org}/members`}>
                <span>مدیریت دسترسی‌ها</span>
                <ArrowUpLeft size={15} aria-hidden="true" />
              </Link>
            )}
          </div>
          {scope.length ? (
            <ul className="local-branches">
              {scope.map(branch => (
                <li key={branch.id}>
                  <div>
                    <strong>{branch.name}</strong>
                    <small dir="ltr">{branch.timezone}</small>
                  </div>
                  <span className={`resource-status ${branch.active ? 'is-active' : 'is-inactive'}`}>
                    <i />
                    {branch.active ? 'فعال' : 'غیرفعال'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>شعبه‌ای نمایش داده نمی‌شود.</strong>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
