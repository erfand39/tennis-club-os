import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { branchDateTime,calendarPath,longDay,numberFa } from '@/lib/calendar-dates';
import { attendanceStates,classStates,classesPath } from '@/lib/class-fields';
import { classDetail } from '@/lib/classes';
import { branches,uuid } from '@/lib/club';
import { errorMessage } from '@/lib/messages';
import { bookingKinds,resourcePath } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { LocalTimeRange } from '../../calendar/booking-ui';
import { ResourceCommand } from '../../resources/command';

export default async function ClassPage({params,searchParams}:{
  params:Promise<{org:string;session:string}>;
  searchParams:Promise<{saved?:string;error?:string}>;
}) {
  const [{org,session:id},filters,user]=await Promise.all([params,searchParams,currentUser()]);
  if (!user) redirect('/');
  if (!uuid(id)) notFound();
  const [data,scope]=await Promise.all([classDetail(user.id,org,id),branches(user.id,org)]);
  if (!data) notFound();
  const {session,roster,students,history}=data;
  const branch=scope.find(item=>item.id===session.location_id);
  if (!branch) notFound();

  const active=roster.filter(item=>!item.withdrawn_at);
  const withdrawn=roster.filter(item=>item.withdrawn_at);
  const now=Date.now();
  const scheduled=branchDateTime(session.timezone,session.starts_at);
  const completed=session.status==='completed';
  const enrollmentOpen=session.kind==='group' && session.status==='scheduled' && branch.active &&
    +session.starts_at>=Math.floor(now/60000)*60000;
  const attendanceOpen=session.status!=='cancelled' && +session.starts_at<=now;
  const actualStart=branchDateTime(session.timezone,session.actual_start ?? session.starts_at);
  const actualEnd=branchDateTime(session.timezone,session.actual_end ?? session.ends_at);
  const hidden=()=> <>
    <input type="hidden" name="org" value={org} /><input type="hidden" name="branch" value={branch.id} />
    <input type="hidden" name="session" value={id} /><input type="hidden" name="request" value={randomUUID()} />
  </>;
  const totals=Object.fromEntries(Object.keys(attendanceStates).map(status=>[status,active.filter(item=>item.status===status).length]));
  const problem=typeof filters.error==='string' ? errorMessage(filters.error) : undefined;

  return <>
    <Link className="panel-link" href={classesPath(org,undefined,{branch:branch.id,date:scheduled.date})}>‹ بازگشت به کلاس‌ها</Link>
    <header className="local-heading directory-heading"><div><h1>{bookingKinds[session.kind]}</h1><p>{branch.name} · {longDay(scheduled.date)}</p></div>
      <span className={`resource-status ${completed?'is-active':session.status==='cancelled'?'is-inactive':'is-archived'}`}><i />{classStates[session.status]}</span>
    </header>
    {filters.saved==='1' && <p className="local-notice" role="status">تغییرات کلاس ذخیره شد.</p>}
    {problem && <p className="local-notice error" role="alert">{problem}</p>}
    <section className="panel local-panel class-summary">
      <dl className="detail-list">
        <div><dt>مربی</dt><dd>{session.coach ?? '—'}</dd></div>
        <div><dt>زمین</dt><dd>{session.court}</dd></div>
        <div><dt>ساعت برنامه</dt><dd><LocalTimeRange start={session.starts_at} end={session.ends_at} zone={session.timezone} /></dd></div>
        {session.actual_start && session.actual_end && <div><dt>ساعت واقعی</dt><dd><LocalTimeRange start={session.actual_start} end={session.actual_end} zone={session.timezone} /></dd></div>}
        <div><dt>ظرفیت ثبت‌نام</dt><dd>{numberFa.format(active.length)} از {numberFa.format(session.capacity)} نفر</dd></div>
      </dl>
      <Link className="panel-link" href={calendarPath(org,{booking:session.booking_id})}>جزئیات سانس و رزرو</Link>
    </section>
    {completed && <section className="class-totals" aria-label="خلاصهٔ حضور">
      {Object.entries(attendanceStates).map(([key,label])=><article className="stat-card" key={key}>
        <span className="stat-top">{label}</span><strong className="stat-value">{numberFa.format(totals[key])}</strong>
      </article>)}
    </section>}
    <div className="calendar-detail">
      <section className="panel local-panel">
        <h2>شاگردان کلاس</h2>
        {active.length ? <ul className="resource-list class-roster">{active.map(item=><li key={item.id}>
          <div className="class-roster-row">
            <Link className="panel-link" href={resourcePath(org,'students',item.student_id)}>{item.name ?? 'پروندهٔ شاگرد'}</Link>
            {item.status && <span className={`resource-status ${item.status==='present'?'is-active':item.status==='absent'?'is-inactive':'is-archived'}`}><i />{attendanceStates[item.status]}</span>}
          </div>
          {enrollmentOpen && <details className="resource-disclosure">
            <summary>لغو ثبت‌نام</summary>
            <ResourceCommand action="class-withdraw" danger label="تأیید لغو ثبت‌نام">
              {hidden()}<input type="hidden" name="participant" value={item.id} />
            </ResourceCommand>
          </details>}
        </li>)}</ul> : <p>هنوز شاگردی در این کلاس ثبت‌نام نشده است.</p>}
        {enrollmentOpen && active.length<session.capacity && students.length>0 && <details className="resource-disclosure" open={!active.length}>
          <summary>افزودن شاگرد</summary>
          <ResourceCommand action="class-enroll" label="ثبت شاگرد">
            {hidden()}<label className="field"><span>شاگرد فعال شعبه</span><select name="student" required defaultValue="">
              <option value="">انتخاب شاگرد</option>{students.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
          </ResourceCommand>
        </details>}
        {enrollmentOpen && active.length>=session.capacity && <p className="local-notice">ظرفیت کلاس تکمیل است.</p>}
        {enrollmentOpen && active.length<session.capacity && !students.length && <p>شاگرد فعال دیگری در این شعبه در دسترس نیست.</p>}
        {withdrawn.length>0 && <details className="resource-disclosure">
          <summary>ثبت‌نام‌های لغوشده</summary>
          <ul className="resource-timeline">{withdrawn.map(item=><li key={item.id}><span>{item.name ?? 'پروندهٔ شاگرد'}</span></li>)}</ul>
        </details>}
      </section>
      <section className="panel local-panel">
        <h2>حضور و غیاب</h2>
        {attendanceOpen ? <details className="resource-disclosure" open={!completed}>
          <summary>{completed ? 'اصلاح حضور یا زمان واقعی' : 'ثبت برگزاری کلاس'}</summary>
          <ResourceCommand action="class-attendance" label={completed ? 'ذخیرهٔ اصلاح' : 'ثبت نهایی برگزاری'}>
            {hidden()}
            <input type="hidden" name="revision" value={session.revision} /><input type="hidden" name="booking_revision" value={session.booking_revision} />
            <div className="resource-form-grid">
              <label className="field"><span>شروع واقعی</span><input name="start" type="datetime-local" dir="ltr" defaultValue={actualStart.input} required /></label>
              <label className="field"><span>پایان واقعی</span><input name="end" type="datetime-local" dir="ltr" defaultValue={actualEnd.input} required /></label>
            </div>
            {active.map(item=><label className="field class-attendance-field" key={item.id}><span>{item.name ?? 'شاگرد'}</span>
              <select name={`attendance.${item.id}`} required defaultValue={item.status ?? ''}><option value="">انتخاب وضعیت</option>
                {Object.entries(attendanceStates).map(([status,label])=><option key={status} value={status}>{label}</option>)}
              </select>
            </label>)}
            {completed && <label className="field"><span>علت اصلاح</span><input name="reason" maxLength={250} required /></label>}
          </ResourceCommand>
        </details> : <p>{session.status==='cancelled' ? 'این کلاس لغو شده است.' : 'پس از برگزاری کلاس، زمان واقعی و وضعیت هر شاگرد را ثبت کنید.'}</p>}
        {history.length>0 && <div className="class-history"><h3>تاریخچهٔ ثبت و اصلاح</h3>
          <ul className="resource-timeline">{history.map((event,index)=><li key={index}><span>
            <strong>{event.corrected ? 'اصلاح ثبت' : 'ثبت برگزاری'}</strong>
            <small>{event.actor ?? 'مدیر'} · {longDay(branchDateTime(session.timezone,event.recorded_at).date)}</small>
            {event.reason && <small>{event.reason}</small>}
          </span></li>)}</ul></div>}
      </section>
    </div>
  </>;
}
