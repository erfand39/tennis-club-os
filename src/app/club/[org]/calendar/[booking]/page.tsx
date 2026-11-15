import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { branches, uuid } from '@/lib/club';
import { calendarBooking, calendarBookingOptions, calendarCourts, courtFreeWindows, type BookingKind } from '@/lib/calendar';
import { branchDateTime, calendarDateTime, calendarPath, longDay, numberFa, validCalendarDate } from '@/lib/calendar-dates';
import { classesPath } from '@/lib/class-fields';
import { financePath } from '@/lib/finance-fields';
import { AmountFields,FinanceActions,FinanceForm } from '../../finance/actions';
import { errorMessage } from '@/lib/messages';
import { bookingKinds, resourcePath } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { ResourceCommand } from '../../resources/command';
import { BookingStatus, displayPrice, LocalTimeRange } from '../booking-ui';
import { CreateBookingForm } from '../create-form';

type Filters = { branch?: string; court?: string; date?: string; start?: string; kind?: string; coach?: string; student?: string; saved?: string; error?: string };
const actionLabels: Record<string,string> = { create_booking:'ثبت سانس', reschedule_booking:'جابه‌جایی سانس', cancel_booking:'لغو سانس' };

export default async function BookingPage({ params, searchParams }: {
  params: Promise<{ org: string; booking: string }>; searchParams: Promise<Filters>;
}) {
  const [{org,booking}, filters, user] = await Promise.all([params,searchParams,currentUser()]);
  if (!user) redirect('/');
  if (booking!=='new' && !uuid(booking)) notFound();
  const scope = await branches(user.id,org);
  const problem = typeof filters.error==='string' ? errorMessage(filters.error) : undefined;
  if (booking==='new') {
    const activeBranches = scope.filter(item => item.active);
    const branch = filters.branch ? activeBranches.find(item => item.id===filters.branch) : activeBranches[0];
    if (!branch) notFound();
    const now = branchDateTime(branch.timezone);
    const date = typeof filters.date==='string' && validCalendarDate(filters.date) && filters.date>=now.date ? filters.date : now.date;
    const selected = typeof filters.start==='string' ? calendarDateTime(filters.start) : null;
    const offeredStart = selected && selected.startsWith(date) && selected>=now.input ? selected : null;
    const [allCourts,{coaches,students},free] = await Promise.all([
      calendarCourts(user.id,org,branch.id), calendarBookingOptions(user.id,org,branch.id),
      offeredStart ? [] : courtFreeWindows(user.id,org,branch,date),
    ]);
    const courts = allCourts.filter(item => item.status==='active');
    const preferred = courts.find(item => item.id===filters.court);
    const opening = free.find(item => (!preferred || preferred.id===item.court_id) && +item.end_at - +item.start_at>=3600000);
    const court = preferred ?? courts.find(item => item.id===opening?.court_id) ?? courts[0];
    const kind = typeof filters.kind==='string' && Object.hasOwn(bookingKinds,filters.kind)
      ? filters.kind as BookingKind : coaches.length && students.length ? 'private' : 'rental';
    const coach = coaches.find(person => person.id===filters.coach)?.id;
    const student = students.find(person => person.id===filters.student)?.id;
    const start = offeredStart ?? (opening ? branchDateTime(branch.timezone,opening.start_at).input
      : date===now.date && now.hour>'08:00' ? now.input : date+'T08:00');
    return <>
      <Link className="panel-link" href={calendarPath(org,{branch:branch.id,date})}>› بازگشت به تقویم</Link>
      <header className="local-heading directory-heading"><div><h1>ثبت سانس</h1><p>{branch.name} · {longDay(date)}</p></div>
        {activeBranches.length>1 && <form method="get" className="calendar-filter">
          <input type="hidden" name="date" value={date} /><input type="hidden" name="kind" value={kind} />
          {coach && <input type="hidden" name="coach" value={coach} />}
          {student && <input type="hidden" name="student" value={student} />}
          <label className="field"><span>شعبه</span><select name="branch" defaultValue={branch.id}>
            {activeBranches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label><button className="button subtle">تغییر شعبه</button>
        </form>}
      </header>
      <section className="panel local-panel resource-editor">
        {problem && <p className="local-notice error" role="alert">{problem}</p>}
        {court ? <CreateBookingForm org={org} branch={branch.id} court={court.id} start={start} minStart={now.input}
          courts={courts} coaches={coaches} students={students} request={randomUUID()} defaults={{kind,coach,student}} />
          : <div className="empty-state"><strong>زمین فعال در این شعبه وجود ندارد.</strong>
            <Link className="panel-link" href={resourcePath(org,'courts','new')}>ثبت زمین</Link></div>}
      </section>
    </>;
  }

  const data = await calendarBooking(user.id,org,scope,booking);
  if (!data) notFound();
  const { detail,branch,students,history } = data;
  const now = branchDateTime(branch.timezone);
  const canChange = detail.status==='confirmed' && detail.session_status!=='completed' && +detail.starts_at>=Math.floor(Date.now()/60000)*60000;
  const hidden = (request: string) => <>
    <input type="hidden" name="org" value={org} /><input type="hidden" name="branch" value={branch.id} />
    <input type="hidden" name="booking" value={booking} /><input type="hidden" name="revision" value={detail.revision} />
    <input type="hidden" name="request" value={request} />
  </>;

  return <>
    <Link className="panel-link" href={calendarPath(org,{branch:branch.id,date:detail.local_day})}>› بازگشت به تقویم</Link>
    <header className="local-heading directory-heading"><div><h1>{bookingKinds[detail.kind]}</h1><p>{branch.name} · {longDay(detail.local_day)}</p></div>
      <BookingStatus booking={detail} /></header>
    {filters.saved==='1' && <div className="calendar-section-title">
      <p className="local-notice" role="status">تغییرات سانس ذخیره شد.</p>
      {branch.active && <Link className="button subtle" href={calendarPath(org,{
        booking:'new',branch:branch.id,court:detail.court_id,date:detail.local_day,kind:detail.kind,
      })}>ثبت سانس بعدی</Link>}
    </div>}
    {problem && <p className="local-notice error" role="alert">{problem}</p>}
    <div className="calendar-detail">
      <section className="panel local-panel">
        <h2>جزئیات سانس</h2>
        <dl className="detail-list">
          <div><dt>زمین</dt><dd>{detail.court}</dd></div>
          <div><dt>بازهٔ زمانی</dt><dd><LocalTimeRange start={detail.starts_at} end={detail.ends_at} zone={branch.timezone} /></dd></div>
          <div><dt>مدت</dt><dd>{numberFa.format((+detail.ends_at - +detail.starts_at)/60000)} دقیقه</dd></div>
          {detail.booker_name && <div><dt>رزروکننده</dt><dd>{detail.booker_name}</dd></div>}
          {detail.coach && <div><dt>مربی</dt><dd>{detail.coach}</dd></div>}
          {detail.kind!=='rental' && <div><dt>شاگردان ثبت‌شده</dt><dd>{students.length ? students.map(item => item.name).join('، ') : 'هنوز ثبت نشده'}</dd></div>}
          {detail.capacity && <div><dt>ظرفیت</dt><dd>{numberFa.format(detail.capacity)} نفر</dd></div>}
          <div><dt>مبلغ ثبت‌شده</dt><dd>{detail.amount!==null && detail.currency ? displayPrice(detail.amount,detail.currency) : '—'}</dd></div>
          {detail.cancellation_reason && <div><dt>علت لغو</dt><dd>{detail.cancellation_reason}</dd></div>}
        </dl>
        <FinanceActions user={user.id} org={org} branch={branch.id} subject={{booking}}>
          {detail.active_invoice_id ? <Link className="button subtle" href={financePath(org,detail.active_invoice_id)}>مشاهدهٔ فاکتور</Link>
            : detail.covered_by_training ? <p className="local-notice">هزینهٔ این تمرین با اعتبار بسته پوشش داده شده است.</p>
            : detail.status==='confirmed' && detail.currency && <details className="resource-disclosure">
              <summary>صدور فاکتور</summary>
              <p>مبنای فاکتور، مبلغ ثبت‌شدهٔ سانس است.</p>
              <FinanceForm command="finance-issue" label="صدور فاکتور">
                <AmountFields currency={detail.currency} name="discount" label="مبلغ تخفیف (اختیاری)" required={false} />
                <label className="field"><span>علت تخفیف</span><input name="reason" maxLength={250} /></label>
              </FinanceForm>
            </details>}
        </FinanceActions>
        {detail.session_id && <Link className="button subtle" href={classesPath(org,detail.session_id)}>کلاس و حضور و غیاب</Link>}
        {canChange && branch.active && <details className="resource-disclosure">
          <summary>جابه‌جایی سانس</summary><p>تاریخ یا ساعت شروع را تغییر دهید. زمین، مدت و مبلغ ثبت‌شده حفظ می‌شوند.</p>
          <ResourceCommand action="booking-move" label="ثبت جابه‌جایی">
            {hidden(randomUUID())}
            <label className="field"><span>شروع جدید به وقت شعبه</span><input type="datetime-local" dir="ltr"
              min={now.input} defaultValue={branchDateTime(branch.timezone,detail.starts_at).input} name="start" required /></label>
          </ResourceCommand>
        </details>}
        {canChange && <details className="resource-disclosure">
          <summary>لغو سانس</summary><p>بازهٔ سانس آزاد می‌شود و علت لغو در سوابق ثبت می‌شود.</p>
          <ResourceCommand action="booking-cancel" label="تأیید لغو" danger>
            {hidden(randomUUID())}
            <label className="field"><span>علت لغو</span><input name="reason" maxLength={250} required /></label>
          </ResourceCommand>
        </details>}
      </section>
      <section className="panel local-panel">
        <h2>تاریخچهٔ سانس</h2>
        {history.length ? <ol className="resource-timeline">{history.map((event,index) => {
          const date = branchDateTime(branch.timezone,event.created_at);
          const old = event.old_start && branchDateTime(branch.timezone,event.old_start);
          const next = event.new_start && branchDateTime(branch.timezone,event.new_start);
          return <li key={index}><span><strong>{actionLabels[event.action]}</strong>
            {old && next && <small>{longDay(old.date)}، <bdi>{old.hour}</bdi> به {longDay(next.date)}، <bdi>{next.hour}</bdi></small>}
            <small>{longDay(date.date)}، <bdi>{date.hour}</bdi></small></span></li>;
        })}</ol> : <p>رویدادی برای این سانس ثبت نشده است.</p>}
      </section>
    </div>
  </>;
}
