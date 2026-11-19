import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { addDays,branchDateTime,calendarPath,longDay,numberFa,validCalendarDate } from '@/lib/calendar-dates';
import { classStates,classesPath,type ClassState } from '@/lib/class-fields';
import { classList } from '@/lib/classes';
import { branches } from '@/lib/club';
import { bookingKinds } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { LocalTimeRange } from '../calendar/booking-ui';

export default async function ClassesPage({params,searchParams}:{
  params:Promise<{org:string}>;
  searchParams:Promise<{branch?:string; date?:string; status?:string; span?:string; page?:string}>;
}) {
  const [{org},filters,user]=await Promise.all([params,searchParams,currentUser()]);
  if (!user) redirect('/');
  const scope=await branches(user.id,org);
  const branch=filters.branch ? scope.find(item=>item.id===filters.branch) : scope.find(item=>item.active) ?? scope[0];
  if (filters.branch && !branch) notFound();
  if (!branch) return <section className="panel local-panel"><h1>کلاس‌ها</h1><p>شعبه‌ای در دسترس نیست.</p></section>;
  const today=branchDateTime(branch.timezone).date;
  const date=typeof filters.date==='string' && validCalendarDate(filters.date) ? filters.date : today;
  const span=filters.span==='day' ? 'day' : 'week';
  const count=span==='day' ? 1 : 7;
  const status=typeof filters.status==='string' && Object.hasOwn(classStates,filters.status) ? filters.status as ClassState : null;
  const page=typeof filters.page==='string' && /^\d{1,5}$/.test(filters.page) ? Math.max(1,Number(filters.page)) : 1;
  const {rows,hasNext}=await classList(user.id,org,branch,date,addDays(date,count),status,page);
  const path=(target:string,number=1)=>classesPath(org,undefined,{branch:branch.id,date:target,span,status:status ?? '',page:String(number)});

  return <>
    <header className="local-heading directory-heading"><div><h1>کلاس‌ها</h1><p>{branch.name}</p></div>
      <Link className="button primary" href={calendarPath(org,{branch:branch.id,date})}>تقویم رزرو</Link>
    </header>
    <section className="panel local-panel">
      <form className="resource-filters class-filters" method="get">
        <label className="field"><span>شعبه</span><select name="branch" defaultValue={branch.id}>
          {scope.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="field"><span>تاریخ شروع</span><input type="date" name="date" dir="ltr" defaultValue={date} required /></label>
        <label className="field"><span>بازه</span><select name="span" defaultValue={span}>
          <option value="week">۷ روز</option><option value="day">یک روز</option>
        </select></label>
        <label className="field"><span>وضعیت</span><select name="status" defaultValue={status ?? ''}>
          <option value="">همهٔ وضعیت‌ها</option>
          {Object.entries(classStates).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <button className="button subtle">نمایش</button>
      </form>
      <div className="calendar-section-title class-period">
        <h2>{count===1 ? longDay(date) : `${longDay(date)} تا ${longDay(addDays(date,count-1))}`}</h2>
        <nav className="calendar-arrows" aria-label="تغییر بازهٔ کلاس">
          {validCalendarDate(addDays(date,-count)) && <Link className="button subtle calendar-arrow" href={path(addDays(date,-count))} aria-label="بازهٔ قبلی">›</Link>}
          <Link className="button subtle" href={path(today)}>امروز</Link>
          {validCalendarDate(addDays(date,count)) && <Link className="button subtle calendar-arrow" href={path(addDays(date,count))} aria-label="بازهٔ بعدی">‹</Link>}
        </nav>
      </div>
      {rows.length ? <ul className="resource-list class-list">{rows.map(item=><li key={item.id}>
        <Link className="calendar-row class-row" href={classesPath(org,item.id)}>
          <span><strong>{bookingKinds[item.kind]}</strong><small>{item.coach ?? 'مربی'}</small></span>
          <span>{item.court}<small>{numberFa.format(item.enrolled)} از {numberFa.format(item.capacity)} نفر</small></span>
          <span><LocalTimeRange start={item.starts_at} end={item.ends_at} zone={item.timezone} />
            <small>{longDay(branchDateTime(item.timezone,item.starts_at).date)}</small></span>
          <span className={`resource-status ${item.status==='completed'?'is-active':item.status==='cancelled'?'is-inactive':'is-archived'}`}><i />{classStates[item.status]}</span>
        </Link>
      </li>)}</ul> : <div className="empty-state"><strong>کلاسی در این بازه نمایش داده نمی‌شود.</strong></div>}
      {(page>1 || hasNext) && <nav className="resource-pagination" aria-label="صفحه‌های کلاس">
        {page>1 && <Link className="button subtle" href={path(date,page-1)}>قبلی</Link>}
        <span>صفحهٔ {numberFa.format(page)}</span>
        {hasNext && <Link className="button subtle" href={path(date,page+1)}>بعدی</Link>}
      </nav>}
    </section>
  </>;
}
