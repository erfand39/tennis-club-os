import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { addDays,branchDateTime,calendarPath,numberFa,periodDates,validCalendarDate } from '@/lib/calendar-dates';
import { operationsPath } from '@/lib/club-finance-fields';
import { branches } from '@/lib/club';
import { financeOverview } from '@/lib/finance';
import { financePath,invoiceStates,type InvoiceState } from '@/lib/finance-fields';
import { formatMinor } from '@/lib/money';
import { asciiDigits,persianDate } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { InvoiceStatus } from './status';

type Filters={branch?:string;from?:string;to?:string;status?:string;number?:string;page?:string};
export default async function FinancePage({params,searchParams}:{
  params:Promise<{org:string}>;searchParams:Promise<Filters>;
}) {
  const [{org},filter,user]=await Promise.all([params,searchParams,currentUser()]);
  if (!user) redirect('/');
  const scope=await branches(user.id,org);
  const branch=filter.branch ? scope.find(item=>item.id===filter.branch) : scope.find(item=>item.active) ?? scope[0];
  if (filter.branch && !branch) notFound();
  if (!branch) return <section className="panel local-panel"><h1>امور مالی</h1><p>شعبه‌ای در دسترس نیست.</p></section>;
  const today=branchDateTime(branch.timezone).date;
  const month=periodDates(today,'month');
  const from=typeof filter.from==='string' && validCalendarDate(filter.from) ? filter.from : month.start;
  const to=typeof filter.to==='string' && validCalendarDate(filter.to) ? filter.to : today;
  const status=typeof filter.status==='string' && Object.hasOwn(invoiceStates,filter.status) ? filter.status as InvoiceState : null;
  const number=typeof filter.number==='string' ? asciiDigits(filter.number.trim()) : '';
  const queryNumber=/^\d{1,19}$/.test(number) && BigInt(number)<=9223372036854775807n ? number : null;
  const page=typeof filter.page==='string' && /^\d{1,5}$/.test(filter.page) ? Math.max(1,Number(filter.page)) : 1;
  const invalid=from>to || (number && !queryNumber);
  const data=invalid ? {totals:[],breakdown:[],rows:[],hasNext:false} : await financeOverview(user.id,org,branch,from,addDays(to,1),status,page,queryNumber);
  const path=(next:number)=>financePath(org,undefined,{branch:branch.id,from,to,status:status ?? '',number:number,page:String(next)});
  return <>
    <header className="local-heading directory-heading"><div><h1>امور مالی</h1><p>{branch.name}</p></div>
      <div className="finance-shortcuts">
        <Link className="button subtle" href={calendarPath(org,{branch:branch.id})}>تقویم و صدور فاکتور</Link>
        <Link className="button primary" href={operationsPath(org,branch.id,'packages')}>بسته، هزینه و تسویه</Link>
      </div>
    </header>
    <section className="panel local-panel">
      <form method="get" className="resource-filters finance-filters">
        <label className="field"><span>شعبه</span><select name="branch" defaultValue={branch.id}>
          {scope.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="field"><span>از تاریخ</span><input type="date" name="from" dir="ltr" defaultValue={from} required /></label>
        <label className="field"><span>تا تاریخ</span><input type="date" name="to" dir="ltr" defaultValue={to} required /></label>
        <label className="field"><span>وضعیت فاکتور</span><select name="status" defaultValue={status ?? ''}>
          <option value="">همهٔ وضعیت‌ها</option>{Object.entries(invoiceStates).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <label className="field"><span>شمارهٔ فاکتور</span><input name="number" inputMode="numeric" dir="ltr" maxLength={19} defaultValue={number} /></label>
        <button className="button subtle">نمایش</button>
      </form>
      {invalid && <p className="local-notice error" role="alert">{from>to?'تاریخ پایان باید برابر یا بعد از شروع باشد.':'شمارهٔ فاکتور را با رقم وارد کنید.'}</p>}
    </section>
    {data.totals.map(item=><section key={item.currency} className="finance-totals" aria-label="خلاصهٔ گردش مالی">
      {([
        ['فاکتورهای معتبر در بازه',item.invoiced],['دریافت در بازه',item.received],['بازپرداخت در بازه',item.refunded],
        ['دریافتی خالص در بازه',item.net],['ماندهٔ جاری شعبه',item.due],
        ['هزینه در بازه',item.expense],['پرداخت خالص مربیان در بازه',item.coach],['تسویهٔ مصوب پرداخت‌نشده',item.unpaid],
        ['خالص گردش عملیاتی',item.operating],
      ]).map(([label,value])=><article className="stat-card" key={label}><span className="stat-top">{label}</span>
        <strong className="stat-value">{formatMinor(value,item.currency)}</strong></article>)}
    </section>)}
    {data.breakdown.length>0 && <div className="calendar-detail">
      {(['court','coach'] as const).map(kind=><section className="panel local-panel" key={kind}>
        <h2>{kind==='court'?'دریافتی خالص به تفکیک زمین':'دریافتی خالص به تفکیک مربی'}</h2>
        <ul className="resource-timeline">{data.breakdown.filter(item=>item.kind===kind).map(item=>
          <li key={item.key+item.currency}><span>{item.title}</span><strong>{formatMinor(item.net,item.currency)}</strong></li>)}</ul>
      </section>)}
    </div>}
    <section className="panel local-panel">
      <h2>{queryNumber ? 'نتیجهٔ جست‌وجوی شماره' : 'فاکتورها'}</h2>
      {data.rows.length ? <ul className="resource-list">
        {data.rows.map(item=><li key={item.id}><Link className="calendar-row finance-row" href={financePath(org,item.id)}>
          <span><strong>فاکتور {numberFa.format(BigInt(item.invoice_number))}</strong><small>{persianDate(item.issued_at,branch.timezone)}</small></span>
          <span><small>مبلغ</small>{formatMinor(item.total,item.currency)}</span>
          <span><small>مانده</small>{formatMinor(item.due,item.currency)}</span>
          <InvoiceStatus status={item.status} />
        </Link></li>)}
      </ul> : <div className="empty-state"><strong>فاکتوری برای این فیلتر پیدا نشد.</strong></div>}
      {(page>1 || data.hasNext) && <nav className="resource-pagination" aria-label="صفحه‌های فاکتور">
        {page>1 && <Link className="button subtle" href={path(page-1)}>قبلی</Link>}<span>صفحهٔ {numberFa.format(page)}</span>
        {data.hasNext && <Link className="button subtle" href={path(page+1)}>بعدی</Link>}
      </nav>}
    </section>
  </>;
}
