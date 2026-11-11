import 'server-only';
import { asUser } from './db';
import { type Branch } from './club';
import { type coachBases,type expenseCategories,type payableStates } from './club-finance-fields';
import { type paymentMethods } from './finance-fields';
import { type bookingKinds } from './resource-fields';

type Student={id:string;name:string};
type Package={
  id:string;title:string;student:string|null;sessions:number|null;used:number;valid_from:string;valid_until:string;
  status:'active'|'suspended'|'cancelled';invoice_id:string|null;
};
type Use={id:string;session_id:string;day:string;used_at:Date;reversed_at:Date|null;reversal_reason:string|null};
type Eligible={id:string;court:string;day:string;status:'present'|'late'};
type Expense={
  id:string;title:string;category:keyof typeof expenseCategories;currency:string;amount:string;
  method:keyof typeof paymentMethods;effective_on:string;voided_at:Date|null;void_reason:string|null;
};
type Payable={
  id:string;session_id:string;currency:string;status:keyof typeof payableStates;amount:string|null;calculated:string|null;
  basis:keyof typeof coachBases|null;rate:string|null;basis_amount:string|null;coach:string|null;starts_at:Date;
  paid_at:Date|null;payment_method:keyof typeof paymentMethods|null;reference:string|null;paid_total:string|null;
};
type Adjustment={id:string;payable_id:string;delta:string;reason:string;effective_at:Date};
type Rate={id:string;kind:keyof typeof bookingKinds;court:string;effective_at:Date;unit_minutes:number;amount:string};
type Special={id:string;rate_id:string;weekday:number;start_minute:number;end_minute:number;min_minutes:number;max_minutes:number;amount:string;retired_at:Date|null};
const size=24;
const paging=(page:number)=>[size+1,(page-1)*size];
const pageOf=<T,>(rows:T[])=>({rows:rows.slice(0,size),hasNext:rows.length>size});

export function trainingFinance(user:string,org:string,branch:Branch,page:number,selected?:string,session?:string) {
  return asUser(user,async db=>{
    const scope=[org,branch.id];
    const students=(await db.query<Student>(`
      select sp.id,sp.name from public.student_locations l join public.student_profiles sp on sp.id=l.student_id
      where l.organization_id=$1 and l.location_id=$2 and l.active and sp.status='active' order by sp.name,sp.id
    `,scope)).rows;
    const packages=(await db.query<Package>(`
      select p.id,p.title,s.name as student,p.sessions,p.status,p.valid_from::text,p.valid_until::text,
        (select count(*)::int from public.training_uses u where u.package_id=p.id and u.reversed_at is null) as used,
        (select li.invoice_id from public.invoice_items li where li.package_id=p.id) as invoice_id
      from public.training_packages p left join public.student_profiles s on s.id=p.student_id
      where p.organization_id=$1 and p.location_id=$2 and ($3::uuid is null or p.id=$3)
      order by p.created_at desc,p.id limit $4 offset $5
    `,[...scope,selected ?? null,...paging(selected?1:page)])).rows;
    if (!selected || !packages.length) return {...pageOf(packages),students,uses:[],eligible:[]};
    const uses=(await db.query<Use>(`
      select u.id,pp.session_id,timezone(b.timezone,lower(s.actual_slot))::date::text as day,u.used_at,u.reversed_at,u.reversal_reason
      from public.training_uses u join public.session_participants pp on pp.id=u.participant_id
      join public.sessions s on s.id=pp.session_id join public.bookings b on b.id=s.booking_id
      where (u.organization_id,u.location_id,u.package_id)=($1,$2,$3) order by u.used_at desc,u.id
    `,[...scope,selected])).rows;
    const eligible=(await db.query<Eligible>(`
      select pp.id,c.name as court,timezone(b.timezone,lower(s.actual_slot))::date::text as day,a.status
      from public.training_packages p join public.session_participants pp
        on (pp.organization_id,pp.location_id,pp.student_id)=(p.organization_id,p.location_id,p.student_id)
      join public.sessions s on s.id=pp.session_id join public.bookings b on b.id=s.booking_id
      join public.courts c on c.id=b.court_id join public.attendance_records a on a.participant_id=pp.id
      where (p.organization_id,p.location_id,p.id)=($1,$2,$3) and p.status='active'
        and pp.withdrawn_at is null and s.status='completed' and b.status='confirmed' and a.status in ('present','late')
        and timezone(b.timezone,lower(s.actual_slot))::date between p.valid_from and p.valid_until
        and ($4::uuid is null or s.id=$4)
        and not exists(select from public.training_uses u where u.participant_id=pp.id and u.reversed_at is null)
      order by lower(s.actual_slot) desc,pp.id
    `,[...scope,selected,session ?? null])).rows;
    return {...pageOf(packages),students,uses,eligible};
  },true);
}

export function financeExpenses(user:string,org:string,branch:string,from:string,to:string,page:number) {
  return asUser(user,async db=>pageOf((await db.query<Expense>(`
    select id,title,category,currency,amount_minor::text as amount,method,effective_on::text,voided_at,void_reason
    from public.club_expenses where organization_id=$1 and location_id=$2 and effective_on between $3 and $4
    order by effective_on desc,created_at desc,id limit $5 offset $6
  `,[org,branch,from,to,...paging(page)])).rows));
}

export function coachFinance(user:string,org:string,branch:Branch,from:string,to:string,page:number,session?:string) {
  return asUser(user,async db=>{
    const rows=(await db.query<Payable>(`
      select p.id,p.session_id,p.currency,p.status,p.amount_minor::text as amount,p.basis_minor::text as basis_amount,
        estimate.amount::text as calculated,s.pay_basis_snapshot as basis,s.pay_rate_snapshot::text as rate,
        c.name as coach,lower(s.actual_slot) as starts_at,p.paid_at,p.payment_method,p.payment_reference as reference,
        case when p.paid_at is not null then (p.amount_minor+coalesce(a.delta,0))::text end as paid_total
      from public.coach_payables p join public.sessions s on s.id=p.session_id left join public.coach_profiles c on c.id=s.coach_id
      cross join lateral tennis_private.coach_calculation(p.id) estimate
      cross join lateral (select sum(delta_minor) as delta from public.coach_payment_adjustments a where a.payable_id=p.id) a
      where (p.organization_id,p.location_id)=($1,$2) and
        (($6::uuid is not null and p.session_id=$6) or ($6 is null and lower(s.actual_slot)>=($4::date::timestamp at time zone $3)
        and lower(s.actual_slot)<(($5::date+1)::timestamp at time zone $3)))
      order by lower(s.actual_slot) desc,p.id limit $7 offset $8
    `,[org,branch.id,branch.timezone,from,to,session ?? null,...paging(page)])).rows;
    const result=pageOf(rows);
    const adjustments=(await db.query<Adjustment>(`
      select id,payable_id,delta_minor::text as delta,reason,effective_at from public.coach_payment_adjustments
      where organization_id=$1 and location_id=$2 and payable_id=any($3::uuid[]) order by effective_at,id
    `,[org,branch.id,result.rows.map(row=>row.id)])).rows;
    return {...result,adjustments};
  },true);
}

export function financeRates(user:string,org:string,branch:string) {
  return asUser(user,async db=>{
    const rates=(await db.query<Rate>(`
      select r.id,r.kind,c.name as court,lower(r.effective) as effective_at,r.unit_minutes,r.amount_minor::text as amount
      from public.pricing_rules r join public.courts c on c.id=r.court_id
      where r.organization_id=$1 and r.location_id=$2 and c.status='active' and (upper_inf(r.effective) or upper(r.effective)>now())
      order by c.name,r.kind,lower(r.effective) desc,r.id
    `,[org,branch])).rows;
    const specials=(await db.query<Special>(`
      select id,rate_id,weekday,lower(local_minutes) as start_minute,upper(local_minutes) as end_minute,
        lower(duration_minutes) as min_minutes,upper(duration_minutes)-1 as max_minutes,amount_minor::text as amount,retired_at
      from public.pricing_specials where organization_id=$1 and location_id=$2 and rate_id=any($3::uuid[])
      order by rate_id,weekday,local_minutes
    `,[org,branch,rates.map(rate=>rate.id)])).rows;
    return {rates,specials};
  },true);
}
