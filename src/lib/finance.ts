import 'server-only';
import { type Branch } from './club';
import { asUser } from './db';
import { type InvoiceState,paymentMethods } from './finance-fields';
import { type bookingKinds } from './resource-fields';

type InvoiceRow={
  id:string; invoice_number:string; issued_at:Date; currency:string; total:string;
  due:string; received:string; status:InvoiceState; discount:string;
};
type InvoiceDetail=InvoiceRow & { location_id:string; discount_reason:string|null; voided_at:Date|null; void_reason:string|null };
type Breakdown={kind:'court'|'coach'; key:string; title:string; currency:string; net:string};
type Totals={currency:string; invoiced:string; received:string; refunded:string; due:string; net:string};
type Item={id:string;booking_id:string;amount:string;kind:keyof typeof bookingKinds;court:string;status:'confirmed'|'cancelled';name:string|null;starts_at:Date};
type Payment={id:string;amount:string;available:string;method:keyof typeof paymentMethods;reference:string|null;effective_at:Date};
type Refund={id:string;payment_id:string;amount:string;reason:string;effective_at:Date};
const amounts=`i.total_amount_minor::text as total,i.discount_minor::text as discount,
  b.received_minor::text as received,b.due_minor::text as due,b.status`;

export function financeOverview(user:string,org:string,branch:Branch,from:string,to:string,status:InvoiceState|null,page:number,invoiceNumber:string|null) {
  const size=24;
  return asUser(user,async db=>{
    const params=[org,branch.id,branch.timezone,from,to];
    const totals=(await db.query<Totals>(`
      with period as (
        select $4::date::timestamp at time zone $3 as start_at,$5::date::timestamp at time zone $3 as end_at
      ), amounts as (
        select i.currency,i.total_amount_minor as invoiced,0 as received,0 as refunded,0 as due
        from public.invoices i cross join period d where i.organization_id=$1 and i.location_id=$2
          and i.voided_at is null and i.issued_at>=d.start_at and i.issued_at<d.end_at
        union all
        select i.currency,0,p.amount_minor,0,0
        from public.payments p join public.invoices i on i.id=p.invoice_id cross join period d
        where p.organization_id=$1 and p.location_id=$2 and p.effective_at>=d.start_at and p.effective_at<d.end_at
        union all
        select i.currency,0,0,r.amount_minor,0
        from public.refunds r join public.payments p on p.id=r.payment_id join public.invoices i on i.id=p.invoice_id cross join period d
        where r.organization_id=$1 and r.location_id=$2 and r.effective_at>=d.start_at and r.effective_at<d.end_at
        union all
        select b.currency,0,0,0,b.due_minor from public.invoice_balances b
        where b.organization_id=$1 and b.location_id=$2 and b.due_minor>0
        union all
        select currency,0,0,0,0 from public.organizations where id=$1
      )
      select currency,sum(invoiced)::text as invoiced,sum(received)::text as received,sum(refunded)::text as refunded,
        (sum(received)-sum(refunded))::text as net,sum(due)::text as due
      from amounts group by currency order by currency
    `,params)).rows;
    const rows=(await db.query<InvoiceRow>(`
      select i.id,i.invoice_number,i.issued_at,i.currency,${amounts}
      from public.invoices i join public.invoice_balances b on b.invoice_id=i.id
      where i.organization_id=$1 and i.location_id=$2
        and (($9::bigint is not null and i.invoice_number=$9) or ($9 is null
          and i.issued_at>=($4::date::timestamp at time zone $3) and i.issued_at<($5::date::timestamp at time zone $3)
          and ($6::text is null or b.status=$6)))
      order by i.issued_at desc,i.id limit $7 offset $8
    `,[...params,status,size+1,(page-1)*size,invoiceNumber])).rows;
    const breakdown=(await db.query<Breakdown>(`
      with period as (
        select $4::date::timestamp at time zone $3 as start_at,$5::date::timestamp at time zone $3 as end_at
      ), movements as (
        select p.invoice_id,p.amount_minor as amount from public.payments p cross join period d
          where p.organization_id=$1 and p.location_id=$2 and p.effective_at>=d.start_at and p.effective_at<d.end_at
        union all
        select p.invoice_id,-r.amount_minor from public.refunds r join public.payments p on p.id=r.payment_id cross join period d
          where r.organization_id=$1 and r.location_id=$2 and r.effective_at>=d.start_at and r.effective_at<d.end_at
      ), balances as (
        select invoice_id,sum(amount) as net from movements group by invoice_id
      ), allocated as (
        select i.currency,b.net,booking.id as booking_id,c.id as court_id,c.name as court,coach.id as coach_id,coach.name as coach
        from balances b join public.invoices i on i.id=b.invoice_id
        left join lateral (
          select min(booking_id::text)::uuid as id from public.invoice_items li
          where li.invoice_id=b.invoice_id having count(*)=1
        ) single_booking on true
        left join public.bookings booking on booking.id=single_booking.id
        left join public.courts c on c.id=booking.court_id
        left join public.sessions s on s.booking_id=booking.id
        left join public.coach_profiles coach on coach.id=s.coach_id
      )
      select 'court' as kind,coalesce(court_id::text,'unassigned') as key,coalesce(court,'تخصیص‌نیافته') as title,
        currency,sum(net)::text as net from allocated group by court_id,court,currency
      union all
      select 'coach',coalesce(coach_id::text,case when booking_id is null then 'unassigned' else 'no-coach' end),
        coalesce(coach,case when booking_id is null then 'تخصیص‌نیافته' else 'سانس بدون مربی' end),
        currency,sum(net)::text from allocated group by 2,3,currency
      order by kind,title,key,currency
    `,params)).rows;
    return { totals,breakdown,rows:rows.slice(0,size),hasNext:rows.length>size };
  },true);
}

export function financeInvoice(user:string,org:string,invoice:string) {
  return asUser(user,async db=>{
    const detail=(await db.query<InvoiceDetail>(`
      select i.id,i.location_id,i.invoice_number,i.issued_at,i.currency,${amounts},i.discount_reason,i.voided_at,i.void_reason
      from public.invoices i join public.invoice_balances b on b.invoice_id=i.id
      where i.organization_id=$1 and i.id=$2
    `,[org,invoice])).rows[0];
    if (!detail) return null;
    const scope=[org,detail.location_id,invoice];
    const items=(await db.query<Item>(`
      select li.id,li.booking_id,li.amount_minor::text as amount,b.kind,c.name as court,b.status,
        coalesce(b.booker_name,coach.name) as name,b.starts_at
      from public.invoice_items li join public.bookings b on b.id=li.booking_id join public.courts c on c.id=b.court_id
      left join public.sessions s on s.booking_id=b.id
      left join public.coach_profiles coach on coach.id=s.coach_id
      where (li.organization_id,li.location_id,li.invoice_id)=($1,$2,$3) order by li.id
    `,scope)).rows;
    const payments=(await db.query<Payment>(`
      select p.id,p.method,p.reference,p.effective_at,p.amount_minor::text as amount,
        (p.amount_minor-coalesce(r.total,0))::text as available
      from public.payments p cross join lateral (
        select sum(amount_minor) as total from public.refunds where payment_id=p.id
      ) r where (p.organization_id,p.location_id,p.invoice_id)=($1,$2,$3) order by p.effective_at desc,p.id
    `,scope)).rows;
    const refunds=(await db.query<Refund>(`
      select r.id,r.payment_id,r.amount_minor::text as amount,r.reason,r.effective_at
      from public.refunds r join public.payments p on p.id=r.payment_id
      where (p.organization_id,p.location_id,p.invoice_id)=($1,$2,$3) order by r.effective_at desc,r.id
    `,scope)).rows;
    return {detail,items,payments,refunds};
  },true);
}
