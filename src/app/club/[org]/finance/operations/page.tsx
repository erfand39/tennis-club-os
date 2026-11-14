import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { branchDateTime,numberFa,periodDates,validCalendarDate } from '@/lib/calendar-dates';
import { classesPath } from '@/lib/class-fields';
import { branches,uuid,type Branch } from '@/lib/club';
import { coachFinance,financeExpenses,financeRates,trainingFinance } from '@/lib/club-finance';
import { coachBases,expenseCategories,operationsPath,operationsTabs,payableStates,type OperationsTab } from '@/lib/club-finance-fields';
import { asUser } from '@/lib/db';
import { financePath,paymentMethods } from '@/lib/finance-fields';
import { errorMessage } from '@/lib/messages';
import { formatMinor } from '@/lib/money';
import { bookingKinds,minutesLabel,persianDate,weekdays } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { AmountFields,FinanceActions,FinanceForm } from '../actions';

type Scope={org:string;branch:Branch;currency:string;today:string};
type Filters={branch?:string;tab?:string;package?:string;session?:string;from?:string;to?:string;page?:string;saved?:string;error?:string};
const packageStates={active:'فعال',suspended:'معلق',cancelled:'لغوشده'} as const;

function Reason({title='علت'}:{title?:string}) {
  return <label className="field"><span>{title}</span><input name="reason" maxLength={250} required /></label>;
}
function Method() {
  return <label className="field"><span>روش پرداخت</span><select name="method" defaultValue="cash">
    {Object.entries(paymentMethods).map(([key,label])=><option key={key} value={key}>{label}</option>)}
  </select></label>;
}
function Target({id}:{id:string}) { return <input type="hidden" name="target" value={id} />; }

function Training({scope,data,session}:{scope:Scope;data:Awaited<ReturnType<typeof trainingFinance>>;session?:string}) {
  const {org,branch,today,currency}=scope;
  return <>
    {data.students.length>0 && branch.active && <section className="panel local-panel">
      <details className="resource-disclosure"><summary>صدور بسته یا عضویت</summary>
        <FinanceForm command="finance-training-issue" label="صدور برای شاگرد">
          <div className="resource-form-grid">
            <label className="field"><span>شاگرد</span><select name="student" required defaultValue="">
              <option value="">انتخاب شاگرد</option>{data.students.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
            </select></label>
            <label className="field"><span>عنوان</span><input name="title" maxLength={120} required /></label>
            <label className="field"><span>شروع اعتبار</span><input name="from" type="date" dir="ltr" defaultValue={today} required /></label>
            <label className="field"><span>پایان اعتبار</span><input name="until" type="date" dir="ltr" defaultValue={today} required /></label>
            <label className="field"><span>تعداد جلسه</span><input name="sessions" inputMode="numeric" maxLength={4} dir="ltr" />
              <small>برای عضویت بدون سقف جلسه خالی بگذارید.</small></label>
          </div>
          <AmountFields currency={currency} label="مبلغ صدور فاکتور (اختیاری)" required={false} />
        </FinanceForm>
      </details>
    </section>}
    {session && <p className="local-notice">برای مصرف اعتبار این کلاس، ابتدا بستهٔ شاگرد را باز کنید.</p>}
    <section className="panel local-panel"><h2>بسته‌ها و عضویت‌های شعبه</h2>
      {!data.rows.length && <p>بسته‌ای در این فهرست وجود ندارد.</p>}
      <ul className="resource-list">{data.rows.map(item=>{
        const remaining=item.sessions===null?null:item.sessions-item.used;
        const status=item.status==='active' && item.valid_until<today ? 'منقضی' : item.status==='active' && item.valid_from>today ? 'در انتظار شروع' : packageStates[item.status];
        return <li key={item.id} className="operations-row">
          <div className="calendar-section-title"><div><strong>{item.title}</strong><small>{item.student ?? 'پروندهٔ شاگرد'}</small></div>
            <span className="local-label">{status}</span></div>
          <p>{persianDate(item.valid_from)} تا {persianDate(item.valid_until)} · {remaining===null?'بدون سقف جلسه':`${numberFa.format(remaining)} جلسه مانده`}</p>
          <div className="finance-shortcuts">
            <Link className="button subtle" href={operationsPath(org,branch.id,'packages',{package:item.id,...session?{session}:{}})}>گردش اعتبار</Link>
            {item.invoice_id && <Link className="button subtle" href={financePath(org,item.invoice_id)}>مشاهدهٔ فاکتور</Link>}
          </div>
          {item.status!=='cancelled' && <details className="resource-disclosure"><summary>تغییر وضعیت بسته</summary>
            <FinanceForm command="finance-training-status" label="ثبت وضعیت">
              <Target id={item.id} /><label className="field"><span>وضعیت جدید</span><select name="status" required>
                <option value={item.status==='suspended'?'active':'suspended'}>{item.status==='suspended'?'فعال‌سازی':'تعلیق'}</option>
                <option value="cancelled">لغو بسته</option>
              </select></label><Reason />
            </FinanceForm>
          </details>}
          {data.eligible.length>0 && remaining!==0 && <details className="resource-disclosure" open={Boolean(session)}><summary>مصرف اعتبار جلسه</summary>
            <FinanceForm command="finance-training-redeem" label="مصرف یک جلسه">
              <Target id={item.id} /><label className="field"><span>حضور ثبت‌شده</span><select name="participant" defaultValue="" required>
                <option value="">انتخاب جلسه</option>{data.eligible.map(entry=><option key={entry.id} value={entry.id}>{persianDate(entry.day)} · {entry.court}</option>)}
              </select></label>
            </FinanceForm>
          </details>}
          {data.uses.length>0 && <ul className="resource-timeline">
            {data.uses.map(entry=><li key={entry.id} className="credit-use"><div>
              <Link className="panel-link" href={classesPath(org,entry.session_id)}>جلسهٔ {persianDate(entry.day)}</Link>
              <small>{entry.reversed_at?'اعتبار برگشت · '+entry.reversal_reason:'اعتبار مصرف شد'}</small></div>
              {!entry.reversed_at && <details className="resource-disclosure"><summary>بازگشت اعتبار</summary>
                <FinanceForm command="finance-training-return" label="تأیید بازگشت">
                  <Target id={entry.id} /><Reason title="علت بازگشت" />
                </FinanceForm>
              </details>}
            </li>)}
          </ul>}
        </li>;
      })}</ul>
    </section>
  </>;
}

function Expenses({scope,data}:{scope:Scope;data:Awaited<ReturnType<typeof financeExpenses>>}) {
  return <>
    <section className="panel local-panel"><details className="resource-disclosure"><summary>ثبت هزینهٔ پرداخت‌شده</summary>
      <FinanceForm command="finance-expense-record" label="ثبت هزینه">
        <div className="resource-form-grid">
          <label className="field"><span>عنوان هزینه</span><input name="title" required maxLength={120} /></label>
          <label className="field"><span>دسته</span><select name="category" defaultValue="maintenance">
            {Object.entries(expenseCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="field"><span>تاریخ پرداخت</span><input name="day" type="date" dir="ltr" required defaultValue={scope.today} max={scope.today} /></label><Method />
        </div>
        <AmountFields currency={scope.currency} label="مبلغ هزینه" />
      </FinanceForm>
    </details></section>
    <section className="panel local-panel"><h2>هزینه‌های بازه</h2>
      {!data.rows.length && <p>هزینه‌ای در این بازه ثبت نشده است.</p>}
      <ul className="resource-list">{data.rows.map(item=><li className="operations-row" key={item.id}>
        <div className="calendar-section-title"><div><strong>{item.title}</strong>
          <small>{expenseCategories[item.category]} · {persianDate(item.effective_on)} · {paymentMethods[item.method]}</small></div>
          <strong>{formatMinor(item.amount,item.currency)}</strong></div>
        {item.voided_at ? <p>باطل‌شده · {item.void_reason}</p> : <details className="resource-disclosure"><summary>ابطال هزینه</summary>
          <FinanceForm command="finance-expense-void" label="تأیید ابطال" danger><Target id={item.id} /><Reason title="علت ابطال" /></FinanceForm>
        </details>}
      </li>)}</ul>
    </section>
  </>;
}

function Settlements({scope,data}:{scope:Scope;data:Awaited<ReturnType<typeof coachFinance>>}) {
  return <section className="panel local-panel"><h2>تسویهٔ جلسات برگزارشده</h2>
    {!data.rows.length && <p>جلسه‌ای برای تسویه در این بازه وجود ندارد.</p>}
    <ul className="resource-list">{data.rows.map(item=>{
      const value=item.amount ?? item.calculated;
      const corrections=data.adjustments.filter(entry=>entry.payable_id===item.id);
      return <li className="operations-row" key={item.id}>
        <div className="calendar-section-title"><div><strong>{item.coach ?? 'مربی'}</strong>
          <small><Link className="panel-link" href={classesPath(scope.org,item.session_id)}>{persianDate(item.starts_at,scope.branch.timezone)}</Link>
            {item.basis?' · '+coachBases[item.basis]:''}</small></div>
          <span className="local-label">{payableStates[item.status]}</span></div>
        {value!==null && <p>{item.amount!==null?'مبلغ مصوب':'مبلغ قابل بررسی'} · {formatMinor(value,item.currency)}</p>}
        {item.basis_amount!==null && <p>دریافتی مبنای تأیید · {formatMinor(item.basis_amount,item.currency)}</p>}
        {item.paid_total!==null && item.paid_at && item.payment_method && <p>پرداخت خالص · {formatMinor(item.paid_total,item.currency)}
          {' · '}{paymentMethods[item.payment_method]} · {persianDate(item.paid_at,scope.branch.timezone)}{item.reference?' · '+item.reference:''}</p>}
        {item.status!=='paid' && <details className="resource-disclosure"><summary>ثبت مبلغ توافقی یا اصلاح قبل از پرداخت</summary>
          <FinanceForm command="finance-coach-adjust" label="ثبت مبلغ برای بررسی">
            <Target id={item.id} /><AmountFields currency={item.currency} /><Reason />
          </FinanceForm>
        </details>}
        {(item.status==='ready'||item.status==='adjusted') && value!==null && <details className="resource-disclosure"><summary>تأیید مبلغ تسویه</summary>
          <FinanceForm command="finance-coach-approve" label="تأیید تسویه"><Target id={item.id} />
            <input type="hidden" name="amount" value={value} />
          </FinanceForm>
        </details>}
        {item.status==='approved' && value!==null && <details className="resource-disclosure"><summary>ثبت پرداخت انجام‌شده</summary>
          <FinanceForm command="finance-coach-pay" label="ثبت پرداخت"><Target id={item.id} />
            <input type="hidden" name="amount" value={value} /><Method />
            <label className="field"><span>شمارهٔ پیگیری (اختیاری)</span><input name="reference" maxLength={120} /></label>
          </FinanceForm>
        </details>}
        {item.status==='paid' && item.paid_total!==null && <details className="resource-disclosure"><summary>اصلاح پرداخت ثبت‌شده</summary>
          <FinanceForm command="finance-coach-correct" label="ثبت اختلاف با سابقه"><Target id={item.id} />
            <input type="hidden" name="expected" value={item.paid_total} />
            <AmountFields currency={item.currency} label="مجموع درست پرداخت پس از اصلاح" /><Reason />
          </FinanceForm>
        </details>}
        {corrections.length>0 && <ul className="resource-timeline">
          {corrections.map(entry=><li key={entry.id}><span>{entry.reason}<small>{persianDate(entry.effective_at,scope.branch.timezone)}</small></span>
            <strong>{formatMinor(entry.delta,item.currency)}</strong></li>)}
        </ul>}
      </li>;
    })}</ul>
  </section>;
}

function Rates({scope,data}:{scope:Scope;data:Awaited<ReturnType<typeof financeRates>>}) {
  const title=(item:typeof data.rates[number])=>`${item.court} · ${bookingKinds[item.kind]} · ${persianDate(item.effective_at,scope.branch.timezone)}`;
  return <>
    {scope.branch.active && data.rates.length>0 && <section className="panel local-panel"><details className="resource-disclosure"><summary>ثبت نرخ ویژه برای تعرفهٔ زمین</summary>
      <p>مبلغ ویژه جای مبلغ هر واحد تعرفهٔ پایه را در روز، ساعت و مدت انتخابی می‌گیرد.</p>
      <FinanceForm command="finance-rate-special" label="ثبت تعرفهٔ ویژه">
        <label className="field"><span>تعرفهٔ پایه</span><select name="target" defaultValue="" required>
          <option value="">انتخاب تعرفه</option>{data.rates.map(item=><option key={item.id} value={item.id}>{title(item)}</option>)}
        </select></label>
        <div className="resource-form-grid">
          <label className="field"><span>روز هفته</span><select name="weekday">
            {weekdays.map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="field"><span>شروع ساعت</span><input name="start" dir="ltr" placeholder="08:00" maxLength={5} required /></label>
          <label className="field"><span>پایان ساعت</span><input name="end" dir="ltr" placeholder="24:00" maxLength={5} required /></label>
          <label className="field"><span>حداقل مدت (دقیقه)</span><input name="minimum" dir="ltr" inputMode="numeric" defaultValue="1" maxLength={4} required /></label>
          <label className="field"><span>حداکثر مدت (دقیقه)</span><input name="maximum" dir="ltr" inputMode="numeric" defaultValue="1440" maxLength={4} required /></label>
        </div><AmountFields currency={scope.currency} label="مبلغ ویژهٔ هر واحد" />
      </FinanceForm>
    </details></section>}
    <section className="panel local-panel"><h2>تعرفه‌های جاری و آینده</h2>
      {!data.rates.length && <p>برای زمین‌های فعال این شعبه ابتدا تعرفهٔ پایه ثبت کنید.</p>}
      <ul className="resource-list">{data.rates.map(item=><li key={item.id} className="operations-row">
        <strong>{title(item)}</strong><small>{formatMinor(item.amount,scope.currency)} در هر {numberFa.format(item.unit_minutes)} دقیقه</small>
        <ul className="resource-timeline">{data.specials.filter(rate=>rate.rate_id===item.id).map(rate=><li key={rate.id}>
          <span>{weekdays.find(([day])=>day===rate.weekday)?.[1]} · <bdi>{minutesLabel(rate.start_minute)}–{minutesLabel(rate.end_minute)}</bdi>
            <small>{numberFa.format(rate.min_minutes)} تا {numberFa.format(rate.max_minutes)} دقیقه</small></span>
          <strong>{formatMinor(rate.amount,scope.currency)}</strong>
          {rate.retired_at ? <span className="local-label">غیرفعال</span> : <details className="resource-disclosure">
            <summary>غیرفعال‌کردن</summary><FinanceForm command="finance-rate-retire" label="تأیید غیرفعال‌سازی">
              <Target id={rate.id} /><Reason />
            </FinanceForm>
          </details>}
        </li>)}</ul>
      </li>)}</ul>
    </section>
  </>;
}

export default async function FinanceOperations({params,searchParams}:{params:Promise<{org:string}>;searchParams:Promise<Filters>}) {
  const [{org},filters,user]=await Promise.all([params,searchParams,currentUser()]);
  if (!user) redirect('/');
  const locations=await branches(user.id,org);
  const branch=filters.branch ? locations.find(item=>item.id===filters.branch) : locations.find(item=>item.active) ?? locations[0];
  if (!branch) notFound();
  const tab=typeof filters.tab==='string' && Object.hasOwn(operationsTabs,filters.tab) ? filters.tab as OperationsTab : 'packages';
  const session=typeof filters.session==='string' && uuid(filters.session) ? filters.session : undefined;
  const selected=typeof filters.package==='string' && uuid(filters.package) ? filters.package : undefined;
  const today=branchDateTime(branch.timezone).date;
  const from=typeof filters.from==='string' && validCalendarDate(filters.from) ? filters.from : periodDates(today,'month').start;
  const to=typeof filters.to==='string' && validCalendarDate(filters.to) ? filters.to : today;
  const page=typeof filters.page==='string' && /^\d{1,5}$/.test(filters.page) ? Math.max(1,Number(filters.page)) : 1;
  const {rows:[club]}=await asUser(user.id,db=>db.query<{currency:string}>('select currency from public.organizations where id=$1',[org]));
  if (!club) notFound();
  const scope={org,branch,currency:club.currency,today};
  let content;
  let hasNext=false;
  if (tab==='packages') {
    const data=await trainingFinance(user.id,org,branch,page,selected,session);
    if (selected && !data.rows.length) notFound();
    hasNext=data.hasNext;
    content=<Training scope={scope} data={data} session={session} />;
  } else if (tab==='rates') {
    content=<Rates scope={scope} data={await financeRates(user.id,org,branch.id)} />;
  } else if (from>to) {
    content=<p role="alert" className="local-notice error">تاریخ پایان باید برابر یا بعد از شروع باشد.</p>;
  } else if (tab==='expenses') {
    const data=await financeExpenses(user.id,org,branch.id,from,to,page);
    hasNext=data.hasNext;
    content=<Expenses scope={scope} data={data} />;
  } else {
    const data=await coachFinance(user.id,org,branch,from,to,page,session);
    hasNext=data.hasNext;
    content=<Settlements scope={scope} data={data} />;
  }
  const problem=typeof filters.error==='string' ? errorMessage(filters.error) : undefined;
  const pageLink=(next:number)=>operationsPath(org,branch.id,tab,{from,to,page:String(next),...session?{session}:{}});
  return <>
    <Link className="panel-link" href={financePath(org,undefined,{branch:branch.id})}>› بازگشت به امور مالی</Link>
    <header className="local-heading"><div><h1>{operationsTabs[tab]}</h1><p>{branch.name}</p></div></header>
    <nav className="finance-shortcuts finance-operations-nav" aria-label="عملیات مالی باشگاه">
      {Object.entries(operationsTabs).map(([key,title])=><Link key={key} aria-current={key===tab?'page':undefined}
        className={`button ${key===tab?'primary':'subtle'}`} href={operationsPath(org,branch.id,key as OperationsTab)}>{title}</Link>)}
    </nav>
    <section className="panel local-panel">
      <form className="resource-filters operations-filters" method="get">
        <input type="hidden" name="tab" value={tab} />
        <label className="field"><span>شعبه</span><select name="branch" defaultValue={branch.id}>{locations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {(tab==='expenses'||tab==='coaches') && <>
          <label className="field"><span>از تاریخ</span><input type="date" name="from" dir="ltr" defaultValue={from} required /></label>
          <label className="field"><span>تا تاریخ</span><input type="date" name="to" dir="ltr" defaultValue={to} required /></label>
        </>}
        <button className="button subtle">نمایش</button>
      </form>
      {selected && tab==='packages' && <Link className="panel-link" href={operationsPath(org,branch.id,'packages',session?{session}:{})}>همهٔ بسته‌ها</Link>}
    </section>
    {filters.saved==='1' && <p className="local-notice" role="status">عملیات مالی ثبت شد.</p>}
    {problem && <p className="local-notice error" role="alert">{problem}</p>}
    <FinanceActions user={user.id} org={org} branch={branch.id} subject={{operation:branch.id+':'+tab}}>{content}</FinanceActions>
    {(page>1 || hasNext) && !selected && <nav className="resource-pagination" aria-label="صفحه‌بندی عملیات مالی">
      {page>1 && <Link className="button subtle" href={pageLink(page-1)}>قبلی</Link>}
      <span>صفحهٔ {numberFa.format(page)}</span>{hasNext && <Link className="button subtle" href={pageLink(page+1)}>بعدی</Link>}
    </nav>}
  </>;
}
