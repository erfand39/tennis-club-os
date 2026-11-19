// All queries run as the signed-in manager. $3 and $4 are branch-local date boundaries.
const bounds=`
  select l.id,l.name,l.timezone,$3::date as start_day,$4::date as end_day,
    tstzrange($3::date::timestamp at time zone l.timezone,$4::date::timestamp at time zone l.timezone,'[)') as span
  from public.locations l where l.organization_id=$1 and l.id=any($2::uuid[])
`;
const minutes=(expression:string)=>`tennis_private.report_minutes(${expression})::float8`;
const localSlot=(date:string,hours:string,zone:string)=>`tstzrange(
  (${date}+lower(${hours})*interval '1 minute') at time zone ${zone},
  greatest((${date}+lower(${hours})*interval '1 minute') at time zone ${zone},
    (${date}+upper(${hours})*interval '1 minute') at time zone ${zone}),'[)')`;
const scopeBooking=`
  ($5::uuid is null or b.court_id=$5) and ($6::uuid is null or s.coach_id=$6)
    and ($7::uuid is null or exists (select from public.session_participants p
      where p.session_id=s.id and p.student_id=$7 and p.withdrawn_at is null))
`;

export const reportBookings=`
  with bounds as (${bounds})
  select b.id,b.kind,b.status,d.name as branch,c.name as court,
    (b.starts_at at time zone d.timezone)::date::text as day,
    to_char(b.starts_at at time zone d.timezone,'HH24:MI') as time,
    b.starts_at <@ d.span as starts_in_period,
    ${minutes('tstzmultirange(b.slot*d.span)')} as minutes
  from bounds d join public.bookings b on b.location_id=d.id and b.organization_id=$1 and b.slot && d.span
  join public.courts c on c.id=b.court_id
  left join public.sessions s on s.booking_id=b.id
  where ${scopeBooking}
  order by b.starts_at,b.id
`;

export const reportSessions=`
  with bounds as (${bounds}), sessions as materialized (
    select s.id,s.status,b.id as booking_id,d.name as branch,c.name as court,coach.name as coach,
      b.starts_at <@ d.span as planned,
      coalesce(lower(s.actual_slot) <@ d.span,false) as completed,
      (b.starts_at at time zone d.timezone)::date::text as planned_day,
      (lower(s.actual_slot) at time zone d.timezone)::date::text as actual_day,
      ${minutes("coalesce(tstzmultirange(s.actual_slot*d.span),'{}')")} as minutes
    from bounds d join public.sessions s on s.location_id=d.id and s.organization_id=$1
    join public.bookings b on b.id=s.booking_id
    join public.courts c on c.id=b.court_id
    left join public.coach_profiles coach on coach.id=s.coach_id
    where (b.starts_at>=lower(d.span) and b.starts_at<upper(d.span) or (s.status='completed' and s.actual_slot && d.span))
      and ${scopeBooking}
  ), people as (
    select p.id,p.session_id,p.student_id,st.name as student,
      a.status, (st.created_at at time zone d.timezone)::date::text as created_day
    from sessions s join public.session_participants p on p.session_id=s.id and p.withdrawn_at is null
    join bounds d on d.id=p.location_id
    left join public.attendance_records a on a.participant_id=p.id
    left join public.student_profiles st on st.id=p.student_id
    where ($7::uuid is null or p.student_id=$7) and s.completed
  ), new_students as (
    select distinct st.id,st.name,(st.created_at at time zone d.timezone)::date::text as day
    from bounds d join public.student_locations sl on sl.location_id=d.id and sl.organization_id=$1
    join public.student_profiles st on st.id=sl.student_id and st.created_at <@ d.span
    where $5 is null and $6 is null and $7 is null
  )
  select coalesce((select jsonb_agg(to_jsonb(s) order by coalesce(s.actual_day,s.planned_day),s.id) from sessions s),'[]') as sessions,
    coalesce((select jsonb_agg(to_jsonb(p) order by p.session_id,p.id) from people p),'[]') as people,
    coalesce((select jsonb_agg(to_jsonb(n) order by n.day,n.id) from new_students n),'[]') as new_students
`;

export const reportCourts=`
  with bounds as (${bounds}), courts as materialized (
    select c.id,c.name as court,d.id as location,d.name as branch,d.timezone,d.start_day,d.end_day,d.span,
      tennis_private.report_court_active($1,d.id,c.id,d.span) as active
    from bounds d join public.courts c on c.location_id=d.id and c.organization_id=$1
    where ($5::uuid is null or c.id=$5)
  ), blocked as materialized (
    select c.id,coalesce(range_agg(block.slot*c.span),'{}'::tstzmultirange) as slots
    from courts c left join lateral (
      select b.slot from public.location_closures b where b.location_id=c.location
        and b.released_at is null and b.slot && c.span
      union all
      select b.slot from public.court_maintenance_blocks b where b.court_id=c.id
        and b.released_at is null and b.slot && c.span
    ) block on true group by c.id
  ), reserved as materialized (
    select c.id,coalesce(range_agg(b.slot*c.span),'{}'::tstzmultirange) as slots
    from courts c left join public.bookings b on b.organization_id=$1 and b.location_id=c.location
      and b.court_id=c.id and b.status='confirmed' and b.slot && c.span group by c.id
  ), actual as materialized (
    select c.id,coalesce(range_agg(s.actual_slot*c.span),'{}'::tstzmultirange) as slots
    from courts c left join (
      public.sessions s join public.bookings b on b.id=s.booking_id and b.organization_id=$1
    ) on b.court_id=c.id and s.organization_id=$1 and s.location_id=c.location
      and s.status='completed' and s.actual_slot && c.span group by c.id
  ), days as (
    select c.*,c.start_day+i.n as day,
      tstzrange((c.start_day+i.n)::timestamp at time zone c.timezone,
        (c.start_day+i.n+1)::timestamp at time zone c.timezone,'[)') as day_span
    from courts c cross join lateral generate_series(0,c.end_day-c.start_day-1) as i(n)
  ), capacity as (
    select d.id,d.branch,d.court,d.day,d.day_span,
      coalesce(h.slots,'{}') as nominal,
      coalesce(h.slots,'{}')*d.active as working,
      b.slots as blocked,r.slots as reserved,a.slots as actual
    from days d join blocked b on b.id=d.id join reserved r on r.id=d.id join actual a on a.id=d.id
    left join lateral (
      select range_agg(${localSlot('d.day','h.local_minutes','d.timezone')} * d.day_span) as slots
      from public.court_operating_hours h where h.court_id=d.id and h.organization_id=$1
        and h.location_id=d.location and h.weekday=extract(isodow from d.day) and h.valid_dates @> d.day
    ) h on true
  )
  select id,branch,court,day::text,
    ${minutes('working-blocked')} as available,${minutes('working*blocked')} as blocked,
    ${minutes('nominal-working')} as inactive,${minutes('(working-blocked)*reserved')} as occupied,
    ${minutes('actual*tstzmultirange(day_span)')} as actual
  from capacity where nominal<>'{}' or actual && tstzmultirange(day_span) or reserved && tstzmultirange(day_span)
  order by day,branch,court,id
`;

export const reportCoachTime=`
  with bounds as (${bounds}), days as (
    select d.*,d.start_day+i.n as day from bounds d
    cross join lateral generate_series(0,d.end_day-d.start_day-1) i(n)
  ), working as (
    select ${localSlot('d.day','a.local_minutes','d.timezone')} * d.span as slot,
      coalesce(c.slots,'{}') as closed
    from days d join public.coach_availability a on a.organization_id=$1 and a.location_id=d.id
      and a.coach_id=$5::uuid and a.valid_dates @> d.day and a.weekday=extract(isodow from d.day)
    left join lateral (
      select range_agg(c.slot*d.span) as slots from public.location_closures c
      where c.location_id=d.id and c.released_at is null and c.slot && d.span
    ) c on true
  ), capacity as (
    select coalesce(range_agg(t.slot),'{}') as slots
    from working cross join lateral unnest(tstzmultirange(working.slot)-working.closed) t(slot)
  ), teaching as (
    select coalesce(range_agg(s.actual_slot*d.span),'{}') as slots
    from bounds d join public.sessions s on s.organization_id=$1 and s.location_id=d.id
      and s.coach_id=$5::uuid and s.status='completed' and s.actual_slot && d.span
  )
  select ${minutes('capacity.slots')} as available,${minutes('teaching.slots')} as actual,
    ${minutes('capacity.slots*teaching.slots')} as occupied,
    coalesce((
      select jsonb_agg(jsonb_build_object('kind',ranges.kind,'start',lower(t.slot),'end',upper(t.slot),
        'minutes',${minutes('tstzmultirange(t.slot)')}) order by ranges.kind,lower(t.slot))
      from (values ('available',capacity.slots),('actual',teaching.slots),('occupied',capacity.slots*teaching.slots)) ranges(kind,slots)
      cross join lateral unnest(ranges.slots) t(slot)
    ),'[]') as spans
  from capacity cross join teaching
`;

export const reportMoney=`
  with bounds as (${bounds}), cash as (
    select p.id,p.invoice_id,p.location_id,p.amount_minor as amount,p.effective_at,'receipt' as kind
    from bounds d join public.payments p on p.organization_id=$1 and p.location_id=d.id
      and p.effective_at>=lower(d.span) and p.effective_at<upper(d.span)
    union all
    select r.id,p.invoice_id,r.location_id,-r.amount_minor,r.effective_at,'refund'
    from bounds d join public.refunds r on r.organization_id=$1 and r.location_id=d.id
      and r.effective_at>=lower(d.span) and r.effective_at<upper(d.span) join public.payments p on p.id=r.payment_id
  ), balance as (
    select i.id as invoice_id,i.location_id,
      i.total_amount_minor-coalesce(p.amount,0)+coalesce(r.amount,0) as amount,upper(d.span) as cutoff
    from bounds d join public.invoices i on i.organization_id=$1 and i.location_id=d.id
      and i.issued_at<upper(d.span) and (i.voided_at is null or i.voided_at>=upper(d.span))
    left join lateral (
      select sum(p.amount_minor) as amount from public.payments p
      where p.invoice_id=i.id and p.effective_at<upper(d.span)
    ) p on true
    left join lateral (
      select sum(r.amount_minor) as amount from public.payments p join public.refunds r on r.payment_id=p.id
      where p.invoice_id=i.id and p.effective_at<upper(d.span) and r.effective_at<upper(d.span)
    ) r on true
  ), money as (
    select cash.id,cash.invoice_id,cash.location_id,cash.amount,cash.effective_at,cash.kind from cash
    union all select invoice_id,invoice_id,location_id,amount,cutoff-interval '1 microsecond','balance' from balance where amount<>0
  ), sources as (
    select i.id as invoice_id,i.currency,i.invoice_number,
      one.item_count,b.court_id,s.coach_id,package.student_id,b.id as booking_id,package.id as package_id
    from (select distinct invoice_id from money) ids join public.invoices i on i.id=ids.invoice_id
    cross join lateral (
      select count(*) as item_count,min(booking_id::text)::uuid as booking,min(package_id::text)::uuid as package
      from public.invoice_items li where li.invoice_id=i.id
    ) one
    left join public.bookings b on one.item_count=1 and b.id=one.booking
    left join public.sessions s on s.booking_id=b.id
    left join public.training_packages package on one.item_count=1 and package.id=one.package
  ), entries as (
    select m.id,m.invoice_id as source_id,s.invoice_number::text as reference,m.kind,d.name as branch,s.currency,m.amount::text,
      (m.effective_at at time zone d.timezone)::date::text as day,
      case when s.item_count<>1 then 'unallocated'
        when s.booking_id is not null then 'booking' when s.package_id is not null then 'package'
        else 'unallocated' end as allocation
    from money m join sources s on s.invoice_id=m.invoice_id join bounds d on d.id=m.location_id
    where ($5::uuid is null or s.court_id=$5) and ($6::uuid is null or s.coach_id=$6)
      and ($7::uuid is null or s.student_id=$7)
    union all
    select e.id,null,e.title,'expense',d.name,e.currency,e.amount_minor::text,e.effective_on::text,null
    from bounds d join public.club_expenses e on e.organization_id=$1 and e.location_id=d.id
      and e.effective_on>=d.start_day and e.effective_on<d.end_day and e.voided_at is null
    where $5 is null and $6 is null and $7 is null
    union all
    select p.id,p.session_id,null,'wage',d.name,p.currency,p.amount_minor::text,
      (p.paid_at at time zone d.timezone)::date::text,null
    from bounds d join public.coach_payables p on p.organization_id=$1 and p.location_id=d.id and p.paid_at>=lower(d.span) and p.paid_at<upper(d.span)
    join public.sessions s on s.id=p.session_id
    where $5 is null and $7 is null and ($6 is null or s.coach_id=$6)
    union all
    select a.id,p.session_id,null,'wage',d.name,p.currency,a.delta_minor::text,
      (a.effective_at at time zone d.timezone)::date::text,null
    from bounds d join public.coach_payment_adjustments a on a.organization_id=$1 and a.location_id=d.id
      and a.effective_at>=lower(d.span) and a.effective_at<upper(d.span) join public.coach_payables p on p.id=a.payable_id
    join public.sessions s on s.id=p.session_id
    where $5 is null and $7 is null and ($6 is null or s.coach_id=$6)
    union all
    select p.id,p.session_id,null,'wage_due',d.name,p.currency,p.amount_minor::text,(d.end_day-1)::text,null
    from bounds d join public.coach_payables p on p.organization_id=$1 and p.location_id=d.id
      and p.approved_at<upper(d.span) and (p.paid_at is null or p.paid_at>=upper(d.span))
    join public.sessions s on s.id=p.session_id
    where $5 is null and $7 is null and ($6 is null or s.coach_id=$6)
  )
  select * from entries order by day,kind,id
`;

export const reportStudent=`
  with bounds as (${bounds}), student as (
    select id,skill_level from public.student_profiles where organization_id=$1 and id=$5::uuid
  ), visits as (
    select lower(s.actual_slot) as last_at,d.timezone as last_timezone
    from bounds d join public.session_participants p on p.organization_id=$1 and p.location_id=d.id
      and p.student_id=$5 and p.withdrawn_at is null
    join public.attendance_records a on a.participant_id=p.id and a.status in ('present','late')
    join public.sessions s on s.id=p.session_id and s.status='completed' and lower(s.actual_slot)<upper(d.span)
    order by last_at desc,s.id limit 1
  ), changes as (
    select h.id,h.previous_level,h.current_level,h.effective_at
    from student st join public.student_level_changes h on h.student_id=st.id
    where h.organization_id=$1 and exists (select from bounds d where h.effective_at <@ d.span)
  ), packages as (
    select t.id,t.title,d.name as branch,t.valid_from::text,t.valid_until::text,t.status,t.sessions,
      count(u.id)::int as used
    from bounds d join public.training_packages t on t.organization_id=$1 and t.location_id=d.id
      and t.student_id=$5 and t.created_at<upper(d.span)
    left join public.training_uses u on u.package_id=t.id and u.used_at<upper(d.span)
      and (u.reversed_at is null or u.reversed_at>=upper(d.span))
    group by t.id,d.name
  )
  select st.skill_level,visits.last_at,visits.last_timezone,
    coalesce((select jsonb_agg(to_jsonb(h) order by h.effective_at,h.id) from changes h),'[]') as changes,
    coalesce((select jsonb_agg(to_jsonb(p) order by p.valid_from,p.id) from packages p),'[]') as packages
  from student st left join visits on true
`;

export const reportBlocks=`
  with bounds as (${bounds}), blocks as (
    select b.id,d.name as branch,null::text as court,'closure' as kind,b.reason,b.slot,d.span,d.timezone
    from bounds d join public.location_closures b on b.organization_id=$1 and b.location_id=d.id
      and b.slot && d.span and b.released_at is null
    where $5::uuid is null or exists (select from public.courts c where c.location_id=d.id and c.id=$5)
    union all
    select b.id,d.name,c.name,'maintenance',b.reason,b.slot,d.span,d.timezone
    from bounds d join public.court_maintenance_blocks b on b.organization_id=$1 and b.location_id=d.id
      and b.slot && d.span and b.released_at is null
    join public.courts c on c.id=b.court_id
    where $5 is null or b.court_id=$5
  )
  select id,branch,court,kind,reason,
    to_char(lower(slot*span) at time zone timezone,'YYYY-MM-DD HH24:MI') as starts,
    to_char(upper(slot*span) at time zone timezone,'YYYY-MM-DD HH24:MI') as ends
  from blocks order by lower(slot),id
`;
