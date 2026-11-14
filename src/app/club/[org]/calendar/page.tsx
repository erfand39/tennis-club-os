import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarBoard, type SerializedBooking, type SerializedPeriodDay } from '@/components/calendar-board';
import { branches, uuid } from '@/lib/club';
import { calendarCourts, calendarPeriod, courtFreeWindows } from '@/lib/calendar';
import {
  branchDateTime,
  calendarPath,
  calendarViews,
  type CalendarView,
  dayNumber,
  longDay,
  monthName,
  periodDates,
  saturdayIndex,
  shortWeekday,
  validCalendarDate,
} from '@/lib/calendar-dates';
import { localDateTimeParts } from '@/lib/calendar-dnd';
import { resourcePath } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { LocalTimeRange } from './booking-ui';

type Filters = { branch?: string; court?: string; date?: string; view?: string; page?: string };

export default async function Calendar({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Filters>;
}) {
  const [{ org }, filters, user] = await Promise.all([params, searchParams, currentUser()]);
  if (!user) redirect('/');
  const scope = await branches(user.id, org);
  const branch = filters.branch
    ? scope.find(item => item.id === filters.branch)
    : scope.find(item => item.active) ?? scope[0];
  if (filters.branch && !branch) notFound();
  if (!branch) {
    return (
      <>
        <header className="local-heading">
          <h1>تقویم سانس‌ها</h1>
        </header>
        <section className="panel local-panel">
          <p>برای حساب شما شعبه‌ای در دسترس نیست.</p>
        </section>
      </>
    );
  }

  const now = branchDateTime(branch.timezone);
  const today = now.date;
  const nowParts = localDateTimeParts(new Date(), branch.timezone);
  const date = typeof filters.date === 'string' && validCalendarDate(filters.date) ? filters.date : today;
  const view =
    typeof filters.view === 'string' && Object.hasOwn(calendarViews, filters.view)
      ? (filters.view as CalendarView)
      : 'day';
  const period = periodDates(date, view);
  const court = filters.court || undefined;
  if (court && (typeof court !== 'string' || !uuid(court))) notFound();
  const requestedPage = /^\d{1,7}$/.test(filters.page ?? '') ? Number(filters.page) : 1;

  const [courts, records, free] = await Promise.all([
    calendarCourts(user.id, org, branch.id),
    calendarPeriod(user.id, org, branch, court, period.start, period.end, requestedPage),
    view === 'day' && date >= today ? courtFreeWindows(user.id, org, branch, date, court) : [],
  ]);

  if (court && !courts.some(item => item.id === court)) notFound();
  const available = courts.filter(item => (!court || item.id === court) && item.status === 'active' && branch.active);
  const path = (target: string, selectedView = view, page?: number) =>
    calendarPath(org, { branch: branch.id, court, date: target, view: selectedView, page });
  const create = (courtId = court, start?: string) =>
    calendarPath(org, {
      booking: 'new',
      branch: branch.id,
      court: courtId,
      date: date < today ? today : date,
      start,
    });
  const title =
    view === 'month'
      ? monthName(date)
      : view === 'week'
        ? `${longDay(period.start)} تا ${longDay(period.days.at(-1)!)}`
        : longDay(date);
  const days = new Map(records.days.map(day => [day.day, day]));

  const serializedBookings: SerializedBooking[] = records.rows.map(booking => {
    const startParts = localDateTimeParts(booking.starts_at, branch.timezone);
    const endParts = localDateTimeParts(booking.ends_at, branch.timezone);
    const endHour = endParts.date !== startParts.date && endParts.hour === '00:00' ? '24:00' : endParts.hour;
    const endMinute = endParts.date !== startParts.date && endParts.minutes === 0 ? 24 * 60 : endParts.minutes;
    return {
      id: booking.id,
      location_id: booking.location_id,
      court_id: booking.court_id,
      court: booking.court,
      startsAtIso: booking.starts_at.toISOString(),
      endsAtIso: booking.ends_at.toISOString(),
      timezone: booking.timezone,
      local_day: booking.local_day,
      kind: booking.kind,
      status: booking.status,
      booker_name: booking.booker_name,
      coach: booking.coach,
      session_id: booking.session_id,
      session_status: booking.session_status,
      capacity: booking.capacity,
      revision: booking.revision,
      startHour: startParts.hour,
      endHour,
      startMinute: startParts.minutes,
      endMinute,
      dayLabel: longDay(booking.local_day),
    };
  });

  const serializedPeriodDays: SerializedPeriodDay[] =
    view === 'day'
      ? []
      : period.days.map(day => {
          const counts = days.get(day);
          const confirmed = (counts?.confirmed ?? 0) + (counts?.completed ?? 0);
          return {
            day,
            dayNumber: dayNumber(day),
            shortWeekday: shortWeekday(day),
            longDay: longDay(day),
            confirmed,
            href: path(day, 'day'),
          };
        });

  const freeWindowsSlot =
    view === 'day' && date >= today ? (
      <section className="panel local-panel" aria-label="زمان‌های آزاد زمین">
        <div className="calendar-section-title">
          <h2>زمان‌های آزاد زمین</h2>
          <small>برای شروع رزرو، یک بازه را انتخاب کنید.</small>
        </div>
        {!available.length ? (
          <p>زمین فعال برای رزرو در این فهرست وجود ندارد.</p>
        ) : (
          <div className="calendar-courts">
            {available.map(item => {
              const windows = free.filter(slot => slot.court_id === item.id);
              return (
                <article className="calendar-court" key={item.id}>
                  <h3>{item.name}</h3>
                  <small>{item.surface}</small>
                  {windows.length ? (
                    <div className="calendar-windows">
                      {windows.map(slot => (
                        <Link
                          key={slot.start_at.toISOString()}
                          href={create(item.id, branchDateTime(branch.timezone, slot.start_at).input)}
                          aria-label={`رزرو ${item.name} از ${branchDateTime(branch.timezone, slot.start_at).hour}`}
                        >
                          <LocalTimeRange start={slot.start_at} end={slot.end_at} zone={branch.timezone} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p>بازهٔ آزاد باقی نمانده است.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    ) : null;

  return (
    <>
      <header className="local-heading directory-heading">
        <div>
          <h1>تقویم سانس‌ها</h1>
          <p>{branch.name}</p>
        </div>
        {available.length > 0 && (
          <Link className="button primary" href={create()}>
            ＋ رزرو سانس
          </Link>
        )}
      </header>
      <section className="panel local-panel calendar-controls" aria-label="فیلتر تقویم">
        <form method="get" className="calendar-filter" aria-label="انتخاب شعبه">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="view" value={view} />
          <label className="field">
            <span>شعبه</span>
            <select name="branch" defaultValue={branch.id}>
              {scope.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.active ? '' : ' · غیرفعال'}
                </option>
              ))}
            </select>
          </label>
          <button className="button subtle">تغییر شعبه</button>
        </form>
        <form method="get" className="calendar-filter" aria-label="تاریخ و زمین">
          <input type="hidden" name="branch" value={branch.id} />
          <input type="hidden" name="view" value={view} />
          <label className="field">
            <span>زمین</span>
            <select name="court" defaultValue={court ?? ''}>
              <option value="">همهٔ زمین‌ها</option>
              {courts.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>رفتن به تاریخ</span>
            <input type="date" name="date" dir="ltr" defaultValue={date} />
          </label>
          <button className="button subtle">نمایش</button>
        </form>
      </section>
      <section className="panel local-panel calendar-period" aria-label="انتخاب بازه">
        <div className="calendar-toolbar">
          <nav className="calendar-tabs" aria-label="نمای تقویم">
            {Object.entries(calendarViews).map(([key, name]) => (
              <Link
                key={key}
                href={path(date, key as CalendarView)}
                className="button subtle"
                aria-current={key === view ? 'page' : undefined}
              >
                {name}
              </Link>
            ))}
          </nav>
          <nav className="calendar-arrows" aria-label="تغییر بازه">
            {validCalendarDate(period.previous) && (
              <Link className="button subtle calendar-arrow" href={path(period.previous)} aria-label="بازهٔ قبلی">
                ›
              </Link>
            )}
            <Link className="button subtle" href={path(today)}>
              امروز
            </Link>
            {validCalendarDate(period.next) && (
              <Link className="button subtle calendar-arrow" href={path(period.next)} aria-label="بازهٔ بعدی">
                ‹
              </Link>
            )}
          </nav>
        </div>
        <h2>{title}</h2>
      </section>
      <CalendarBoard
        org={org}
        branchId={branch.id}
        branchActive={branch.active}
        timezone={branch.timezone}
        view={view}
        date={date}
        today={today}
        nowMinute={nowParts.minutes}
        courts={courts}
        selectedCourt={court}
        bookings={serializedBookings}
        totalBookings={records.total}
        page={records.page}
        pages={records.pages}
        prevPageHref={records.page > 1 ? path(date, view, records.page - 1) : undefined}
        nextPageHref={records.page < records.pages ? path(date, view, records.page + 1) : undefined}
        periodDays={serializedPeriodDays}
        monthOffset={view === 'month' ? saturdayIndex(period.start) : 0}
        freeWindowsSlot={freeWindowsSlot}
      />
      {!courts.length && (
        <Link className="panel-link" href={resourcePath(org, 'courts', 'new')}>
          ثبت زمین
        </Link>
      )}
    </>
  );
}
