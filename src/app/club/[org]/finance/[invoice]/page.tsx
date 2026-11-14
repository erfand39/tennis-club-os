import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { calendarPath,numberFa } from '@/lib/calendar-dates';
import { operationsPath } from '@/lib/club-finance-fields';
import { branches,uuid } from '@/lib/club';
import { financeInvoice } from '@/lib/finance';
import { financePath,paymentMethods } from '@/lib/finance-fields';
import { errorMessage } from '@/lib/messages';
import { formatMinor } from '@/lib/money';
import { bookingKinds,persianDate } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { AmountFields,FinanceActions,FinanceForm } from '../actions';
import { InvoiceStatus } from '../status';

export default async function InvoicePage({params,searchParams}:{
  params:Promise<{org:string;invoice:string}>;searchParams:Promise<{saved?:string;error?:string}>;
}) {
  const [{org,invoice},filters,user]=await Promise.all([params,searchParams,currentUser()]);
  if (!user) redirect('/');
  if (!uuid(invoice)) notFound();
  const [data,scope]=await Promise.all([financeInvoice(user.id,org,invoice),branches(user.id,org)]);
  if (!data) notFound();
  const {detail,items,payments,refunds}=data;
  const branch=scope.find(item=>item.id===detail.location_id);
  if (!branch) notFound();
  const currency=detail.currency;
  const amount=(value:string)=>formatMinor(value,currency);
  const active=detail.status!=='voided';
  const problem=typeof filters.error==='string' ? errorMessage(filters.error) : undefined;
  const localTime=(date:Date)=>persianDate(date,branch.timezone,true);
  return <>
    <Link className="panel-link" href={financePath(org,undefined,{branch:branch.id})}>› بازگشت به امور مالی</Link>
    <header className="local-heading directory-heading"><div><h1>فاکتور {numberFa.format(BigInt(detail.invoice_number))}</h1>
      <p>{branch.name} · {localTime(detail.issued_at)}</p></div><InvoiceStatus status={detail.status} />
    </header>
    {filters.saved==='1' && <p className="local-notice" role="status">عملیات مالی ثبت شد.</p>}
    {problem && <p className="local-notice error" role="alert">{problem}</p>}
    <section className="class-totals finance-detail-totals" aria-label="مانده و مبلغ فاکتور">
      {([
        ['مبلغ فاکتور',detail.total],['تخفیف',detail.discount],['دریافتی خالص',detail.received],['ماندهٔ فاکتور',detail.due],
      ]).map(([title,value])=><article className="stat-card" key={title}><span className="stat-top">{title}</span>
        <strong className="stat-value">{amount(value)}</strong></article>)}
    </section>
    <FinanceActions user={user.id} org={org} branch={branch.id} subject={{invoice}}>
      <div className="calendar-detail">
        <section className="panel local-panel">
          <h2>ردیف‌های فاکتور</h2>
          <ul className="resource-timeline">{items.map(item=><li key={item.id}>
            <span>{item.booking_id && item.kind ? <Link className="panel-link" href={calendarPath(org,{booking:item.booking_id})}>{bookingKinds[item.kind]} · {item.court}</Link>
              : item.package_id && <Link className="panel-link" href={operationsPath(org,branch.id,'packages',{package:item.package_id})}>{item.package_title ?? 'بستهٔ آموزشی'}</Link>}
              <small>{item.starts_at ? localTime(item.starts_at) : ''}{item.name ? (item.starts_at?' · ':'')+item.name : ''}</small>
              {item.status==='cancelled' && <small>سانس لغوشده</small>}</span>
            <strong>{amount(item.amount)}</strong>
          </li>)}</ul>
          {detail.discount_reason && <p>علت تخفیف · {detail.discount_reason}</p>}
          {detail.voided_at && <p>ابطال در {localTime(detail.voided_at)} · {detail.void_reason}</p>}
          {active && detail.due!=='0' && <details className="resource-disclosure">
            <summary>ثبت دریافت</summary>
            <p>ماندهٔ قابل دریافت {amount(detail.due)} است.</p>
            <FinanceForm command="finance-payment" label="ثبت دریافت">
              <AmountFields currency={currency} label="مبلغ دریافتی" />
              <label className="field"><span>روش دریافت</span><select name="method" defaultValue="cash">
                {Object.entries(paymentMethods).map(([key,label])=><option value={key} key={key}>{label}</option>)}
              </select></label>
              <label className="field"><span>شمارهٔ پیگیری (اختیاری)</span><input name="reference" maxLength={120} /></label>
            </FinanceForm>
          </details>}
          {active && detail.received==='0' && <details className="resource-disclosure">
            <summary>ابطال فاکتور</summary>
            <p>ماندهٔ این فاکتور صفر می‌شود و سابقهٔ آن در فهرست می‌ماند.</p>
            <FinanceForm command="finance-void" label="تأیید ابطال" danger>
              <label className="field"><span>علت ابطال</span><input name="reason" maxLength={250} required /></label>
            </FinanceForm>
          </details>}
        </section>
        <section className="panel local-panel">
          <h2>گردش دریافت و بازپرداخت</h2>
          {!payments.length && <p>هنوز دریافتی برای این فاکتور ثبت نشده است.</p>}
          <ul className="resource-list finance-ledger">{payments.map(payment=>{
            const linked=refunds.filter(refund=>refund.payment_id===payment.id);
            return <li key={payment.id}>
              <div className="finance-movement">
                <div><strong>دریافت {paymentMethods[payment.method]}</strong><small>{localTime(payment.effective_at)}</small>
                  {payment.reference && <small>پیگیری · {payment.reference}</small>}</div>
                <strong>{amount(payment.amount)}</strong>
              </div>
              {!!linked.length && <ul className="resource-timeline finance-refunds">
                {linked.map(refund=><li key={refund.id}><span><strong>بازپرداخت</strong>
                  <small>{localTime(refund.effective_at)} · {refund.reason}</small></span><strong>{amount(refund.amount)}</strong></li>)}
              </ul>}
              {active && payment.available!=='0' && <details className="resource-disclosure">
                <summary>ثبت بازپرداخت</summary>
                <p>مبلغ قابل برگشت از این دریافت {amount(payment.available)} است.</p>
                <FinanceForm command="finance-refund" label="ثبت بازپرداخت">
                  <input type="hidden" name="payment" value={payment.id} />
                  <AmountFields currency={currency} label="مبلغ بازپرداخت" />
                  <label className="field"><span>علت بازپرداخت</span><input name="reason" maxLength={250} required /></label>
                </FinanceForm>
              </details>}
            </li>;
          })}</ul>
        </section>
      </div>
    </FinanceActions>
  </>;
}
