begin;

create table public.training_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  student_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  sessions smallint check (sessions between 1 and 1000),
  valid_from date not null,
  valid_until date not null,
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id,location_id,student_id) references public.student_locations(organization_id,location_id,student_id),
  unique (organization_id,location_id,id),
  unique (organization_id,location_id,student_id,id),
  check (isfinite(valid_from) and isfinite(valid_until) and valid_until>=valid_from)
);
create index training_packages_student_idx on public.training_packages(organization_id,location_id,student_id);

alter table public.invoice_items alter column booking_id drop not null,
  add column package_id uuid,
  add constraint invoice_item_source check (num_nonnulls(booking_id,package_id)=1),
  add foreign key (organization_id,location_id,package_id) references public.training_packages(organization_id,location_id,id);
create unique index invoice_items_package_idx on public.invoice_items(package_id) where package_id is not null;

create table public.training_uses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  student_id uuid not null,
  package_id uuid not null,
  participant_id uuid not null,
  used_at timestamptz not null default clock_timestamp(),
  reversed_at timestamptz,
  reversal_reason text check (length(btrim(reversal_reason)) between 1 and 250),
  check ((reversed_at is null)=(reversal_reason is null)),
  foreign key (organization_id,location_id,student_id,package_id) references public.training_packages(organization_id,location_id,student_id,id),
  foreign key (organization_id,location_id,student_id,participant_id) references public.session_participants(organization_id,location_id,student_id,id)
);
create unique index training_uses_one_active_idx on public.training_uses(participant_id) where reversed_at is null;
create index training_uses_participant_idx on public.training_uses(organization_id,location_id,student_id,participant_id);
create index training_uses_history_idx on public.training_uses(package_id,used_at desc,id);
create index training_uses_package_idx on public.training_uses(organization_id,location_id,student_id,package_id);

create table public.club_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null check (category in ('maintenance','equipment','utilities','rent','other')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor between 1 and 9999999999999),
  method public.payment_method not null,
  effective_on date not null check (isfinite(effective_on)),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  voided_at timestamptz,
  void_reason text check (length(btrim(void_reason)) between 1 and 250),
  check ((voided_at is null)=(void_reason is null)),
  foreign key (organization_id,location_id) references public.locations(organization_id,id)
);
create index club_expenses_period_idx on public.club_expenses(organization_id,location_id,effective_on desc,id);

alter table public.coach_profiles drop constraint coach_profiles_pay_basis_check,
  add constraint coach_profiles_pay_basis_check check (pay_basis in ('hourly','per_session','revenue_share','agreement')),
  add constraint coach_revenue_share_range check (pay_basis<>'revenue_share' or pay_amount_minor between 0 and 100);
alter table public.sessions
  add column pay_basis_snapshot text check (pay_basis_snapshot in ('hourly','per_session','revenue_share','agreement')),
  add column pay_rate_snapshot bigint check (pay_rate_snapshot between 0 and 9999999999999),
  add column pay_currency_snapshot text check (pay_currency_snapshot ~ '^[A-Z]{3}$'),
  add constraint session_pay_snapshot_complete check (num_nonnulls(pay_basis_snapshot,pay_rate_snapshot,pay_currency_snapshot) in (0,3));

create table public.coach_payables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  session_id uuid not null unique,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','ready','adjusted','approved','paid')),
  amount_minor bigint check (amount_minor between 0 and 9999999999999),
  manual_amount_minor bigint check (manual_amount_minor between 0 and 9999999999999),
  basis_minor bigint check (basis_minor between 0 and 9999999999999),
  approved_at timestamptz,
  paid_at timestamptz,
  payment_method public.payment_method,
  payment_reference text check (length(btrim(payment_reference)) between 1 and 120),
  foreign key (organization_id,location_id,session_id) references public.sessions(organization_id,location_id,id),
  check ((status in ('approved','paid'))=(approved_at is not null and amount_minor is not null)),
  check ((status='paid')=(paid_at is not null and payment_method is not null)),
  check (status<>'adjusted' or manual_amount_minor is not null)
);
create index coach_payables_scope_idx on public.coach_payables(organization_id,location_id,status,id);
create index coach_payables_paid_idx on public.coach_payables(organization_id,location_id,paid_at) where paid_at is not null;

alter table public.pricing_rules add unique (organization_id,location_id,id);
create table public.pricing_specials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  rate_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  local_minutes int4range not null check (not isempty(local_minutes) and local_minutes <@ '[0,1440)'::int4range),
  duration_minutes int4range not null check (not isempty(duration_minutes) and duration_minutes <@ '[1,1441)'::int4range),
  amount_minor bigint not null check (amount_minor between 0 and 9999999999999),
  retired_at timestamptz,
  foreign key (organization_id,location_id,rate_id) references public.pricing_rules(organization_id,location_id,id),
  exclude using gist (rate_id with =,weekday with =,local_minutes with &&,duration_minutes with &&) where (retired_at is null)
);
create index pricing_specials_scope_idx on public.pricing_specials(organization_id,location_id,rate_id);

alter table public.training_packages enable row level security;
alter table public.training_uses enable row level security;
alter table public.club_expenses enable row level security;
alter table public.coach_payables enable row level security;
alter table public.pricing_specials enable row level security;
revoke all on public.training_packages,public.training_uses,public.club_expenses,public.coach_payables,public.pricing_specials
  from public,anon,authenticated;
grant select on public.training_packages,public.training_uses,public.club_expenses,public.coach_payables,public.pricing_specials
  to authenticated;
create policy training_package_read on public.training_packages for select to authenticated
  using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));
create policy training_use_read on public.training_uses for select to authenticated
  using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));
create policy club_expense_read on public.club_expenses for select to authenticated
  using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));
create policy coach_payable_read on public.coach_payables for select to authenticated
  using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));
create policy pricing_special_read on public.pricing_specials for select to authenticated
  using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));

create function tennis_private.snapshot_coach_terms() returns trigger
language plpgsql set search_path=''
as $$
begin
  select c.pay_basis,c.pay_amount_minor,case when c.pay_basis is not null then o.currency end
  into new.pay_basis_snapshot,new.pay_rate_snapshot,new.pay_currency_snapshot
  from public.coach_profiles c join public.organizations o on o.id=c.organization_id
  where c.organization_id=new.organization_id and c.id=new.coach_id;
  return new;
end;
$$;
create trigger snapshot_coach_terms before insert on public.sessions for each row execute function tennis_private.snapshot_coach_terms();

create function tennis_private.open_coach_payable() returns trigger
language plpgsql set search_path=''
as $$
begin
  if new.status='completed' then
    insert into public.coach_payables(organization_id,location_id,session_id,currency,status)
    select new.organization_id,new.location_id,new.id,coalesce(new.pay_currency_snapshot,o.currency),
      case when new.pay_basis_snapshot is null then 'pending' else 'ready' end
    from public.organizations o where o.id=new.organization_id
    on conflict(session_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger open_coach_payable after insert or update of status on public.sessions
  for each row execute function tennis_private.open_coach_payable();
insert into public.coach_payables(organization_id,location_id,session_id,currency)
select s.organization_id,s.location_id,s.id,o.currency from public.sessions s
join public.organizations o on o.id=s.organization_id where s.status='completed';

create function tennis_private.return_credit_on_attendance_change() returns trigger
language plpgsql set search_path=''
as $$
begin
  if new.status in ('absent','excused') and old.status in ('present','late') then
    with returned as (
      update public.training_uses set reversed_at=clock_timestamp(),reversal_reason='اصلاح وضعیت حضور'
      where participant_id=new.participant_id and reversed_at is null returning *
    )
    insert into tennis_private.audit_events(organization_id,location_id,actor_user_id,action,target_id,details)
    select organization_id,location_id,new.recorded_by,'training_credit_attendance_return',id,
      jsonb_build_object('package_id',package_id,'participant_id',participant_id) from returned;
  end if;
  return new;
end;
$$;
create trigger return_credit_on_attendance_change after update of status on public.attendance_records
for each row execute function tennis_private.return_credit_on_attendance_change();

create function tennis_private.require_cancelled_package_for_void() returns trigger
language plpgsql set search_path=''
as $$
begin
  if old.voided_at is null and new.voided_at is not null and exists (
    select from public.invoice_items i join public.training_packages p on p.id=i.package_id
    where i.invoice_id=new.id and p.status<>'cancelled'
  ) then raise exception 'finance_cancel_package_first' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger require_cancelled_package_for_void before update of voided_at on public.invoices
for each row execute function tennis_private.require_cancelled_package_for_void();

create function tennis_private.require_uncovered_private_booking() returns trigger
language plpgsql set search_path=''
as $$
begin
  -- Force a write conflict between invoice issuance and credit redemption on the same private booking.
  update public.bookings set revision=revision where id=new.booking_id and kind='private';
  if found and exists (
    select from public.bookings b join public.sessions s on s.booking_id=b.id
    join public.session_participants pp on pp.session_id=s.id
    join public.training_uses u on u.participant_id=pp.id and u.reversed_at is null
    where b.id=new.booking_id and b.kind='private'
  ) then raise exception 'training_private_covered' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger require_uncovered_private_booking before insert on public.invoice_items
for each row execute function tennis_private.require_uncovered_private_booking();

create function tennis_private.booking_unit_rate(p_rate uuid,p_slot tstzrange,p_timezone text,p_minutes integer)
returns bigint language sql stable security invoker set search_path=''
as $$
  select coalesce(sp.amount_minor,r.amount_minor)
  from public.pricing_rules r
  cross join lateral tennis_private.local_slot(p_slot,p_timezone) s
  left join public.pricing_specials sp on sp.rate_id=r.id and sp.retired_at is null
    and sp.weekday=extract(isodow from s.play_date) and sp.local_minutes @> s.local_minutes and sp.duration_minutes @> p_minutes
  where r.id=p_rate
$$;

create or replace function tennis_private.create_booking(
  p_org uuid, p_location uuid, p_court uuid, p_start timestamptz, p_end timestamptz,
  p_kind public.booking_kind, p_request uuid, p_booker_name text,
  p_coach uuid, p_student uuid, p_capacity integer
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'create_booking';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin','receptionist']::public.club_role[]);
  v_slot tstzrange := tennis_private.make_slot(p_start, p_end);
  v_name text := nullif(btrim(p_booker_name), '');
  v_capacity integer := coalesce(p_capacity, 1);
  v_result uuid;
  v_timezone text;
  v_rule public.pricing_rules%rowtype;
  v_currency text;
  v_minutes integer;
  v_price numeric;
  v_unit_amount bigint;
  v_session uuid;
begin
  if p_kind is null or (p_kind = 'rental' and
      (v_name is null or length(v_name) > 120 or p_coach is not null or p_student is not null or p_capacity is not null))
      or (p_kind <> 'rental' and (v_name is not null or p_coach is null or v_capacity not between 1 and 100))
      or (p_kind = 'private' and (v_capacity <> 1 or p_student is null)) then
    raise exception 'invalid_booking_parties' using errcode = '22023';
  end if;

  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(p_court, extract(epoch from p_start), extract(epoch from p_end),
      p_kind, v_name, p_coach, p_student, v_capacity));
  if v_result is not null then return v_result; end if;

  select timezone into v_timezone from tennis_private.lock_location(p_org, p_location);
  perform tennis_private.check_booking_slot(p_org, p_location, p_court, v_slot, v_timezone, p_coach);

  select r.* into v_rule from public.pricing_rules as r
  where (r.organization_id, r.location_id, r.court_id, r.kind) = (p_org, p_location, p_court, p_kind)
    and r.effective @> v_slot for share;
  if not found then raise exception 'pricing_rule_unavailable' using errcode = '22023'; end if;

  v_minutes := (extract(epoch from (p_end - p_start)) / 60)::integer;
  if mod(v_minutes, v_rule.unit_minutes::integer) <> 0 then
    raise exception 'duration_not_a_pricing_multiple' using errcode = '22023';
  end if;
  v_unit_amount := tennis_private.booking_unit_rate(v_rule.id,v_slot,v_timezone,v_minutes);
  v_price := v_unit_amount::numeric * (v_minutes / v_rule.unit_minutes);
  if v_price > 9999999999999 then raise exception 'booking_amount_out_of_range' using errcode = '22003'; end if;
  select currency into strict v_currency from public.organizations where id = p_org for share;

  insert into public.bookings (organization_id, location_id, court_id, slot, timezone, kind, booker_name, created_by)
  values (p_org, p_location, p_court, v_slot, v_timezone, p_kind, v_name, v_actor)
  returning id into v_result;

  insert into public.booking_prices (booking_id, organization_id, location_id, court_id, kind, pricing_rule_id,
    currency, unit_minutes, booked_minutes, unit_amount_minor, amount_minor)
  values (v_result, p_org, p_location, p_court, p_kind, v_rule.id,
    v_currency, v_rule.unit_minutes, v_minutes, v_unit_amount, v_price::bigint);

  insert into tennis_private.court_allocations (organization_id, location_id, court_id, booking_id, slot)
  values (p_org, p_location, p_court, v_result, v_slot);

  if p_kind <> 'rental' then
    insert into public.sessions (organization_id, location_id, booking_id, coach_id, capacity)
    values (p_org, p_location, v_result, p_coach, v_capacity) returning id into v_session;
    insert into tennis_private.coach_allocations (session_id, organization_id, location_id, coach_id, slot)
    values (v_session, p_org, p_location, p_coach, v_slot);
    if p_student is not null then
      perform tennis_private.insert_participant(p_org, p_location, v_session, p_student, v_slot);
    end if;
  end if;

  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result);
end;
$$;

alter table public.coach_payables add unique (organization_id,location_id,id);
create table public.coach_payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  payable_id uuid not null,
  delta_minor bigint not null check (delta_minor between -9999999999999 and 9999999999999 and delta_minor<>0),
  reason text not null check (length(btrim(reason)) between 1 and 250),
  effective_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  foreign key (organization_id,location_id,payable_id) references public.coach_payables(organization_id,location_id,id)
);
create index coach_adjustments_payable_idx on public.coach_payment_adjustments(payable_id);
create index coach_adjustments_period_idx on public.coach_payment_adjustments(organization_id,location_id,effective_at);
alter table public.coach_payment_adjustments enable row level security;
revoke all on public.coach_payment_adjustments from public,anon,authenticated;
grant select on public.coach_payment_adjustments to authenticated;
create policy coach_adjustment_read on public.coach_payment_adjustments for select to authenticated
  using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));

create function tennis_private.coach_calculation(p_payable uuid)
returns table (amount numeric,basis_amount bigint)
language sql stable security invoker set search_path=''
as $$
  select coalesce(cp.manual_amount_minor::numeric,case s.pay_basis_snapshot
    when 'hourly' then round(s.pay_rate_snapshot::numeric * extract(epoch from upper(s.actual_slot)-lower(s.actual_slot))/3600)
    when 'revenue_share' then round(coalesce(balance.received_minor,0)::numeric * s.pay_rate_snapshot/100)
    else s.pay_rate_snapshot::numeric end),
    case when cp.manual_amount_minor is null and s.pay_basis_snapshot='revenue_share' then coalesce(balance.received_minor,0) end
  from public.coach_payables cp join public.sessions s on s.id=cp.session_id
  left join public.invoice_items li on li.booking_id=s.booking_id and li.active
  left join public.invoice_balances balance on balance.invoice_id=li.invoice_id and balance.currency=cp.currency
  where cp.id=p_payable
$$;

create function tennis_private.record_club_finance(
  p_org uuid,p_location uuid,p_command text,p_data jsonb,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_result uuid;
  v_target uuid := nullif(p_data->>'target','')::uuid;
  v_student uuid;
  v_package public.training_packages%rowtype;
  v_payable public.coach_payables%rowtype;
  v_invoice uuid;
  v_private_booking uuid;
  v_amount bigint := nullif(p_data->>'amount','')::bigint;
  v_reason text := nullif(btrim(p_data->>'reason'),'');
  v_currency text;
  v_timezone text;
  v_date date;
  v_status text := p_data->>'status';
  v_estimate numeric;
  v_basis bigint;
  v_original bigint;
  v_details jsonb := '{}'::jsonb;
begin
  if p_command is null or p_command not in ('training_issue','training_status','training_redeem','training_return',
    'expense_record','expense_void','coach_adjust','coach_approve','coach_pay','coach_correct','rate_special','rate_retire')
    or jsonb_typeof(p_data) is distinct from 'object' or length(v_reason)>250
    or (v_amount is not null and v_amount not between 0 and 9999999999999) then
    raise exception 'club_finance_invalid' using errcode='22023';
  end if;
  v_result:=tennis_private.begin_operation(p_org,p_location,v_actor,p_command,p_request,p_data);
  if v_result is not null then return v_result; end if;
  select timezone into v_timezone from tennis_private.lock_location(p_org,p_location,p_command in ('training_issue','rate_special'));
  select currency into strict v_currency from public.organizations where id=p_org;

  case p_command
  when 'training_issue' then
    v_student := (p_data->>'student')::uuid;
    perform tennis_private.check_student(p_org,p_location,v_student);
    insert into public.training_packages(organization_id,location_id,student_id,title,sessions,valid_from,valid_until)
    values(p_org,p_location,v_student,btrim(p_data->>'title'),(p_data->>'sessions')::smallint,
      (p_data->>'from')::date,(p_data->>'until')::date) returning id into v_result;
    if v_amount is not null then
      insert into public.invoices(organization_id,location_id,currency,total_amount_minor,issued_by)
        values(p_org,p_location,v_currency,v_amount,v_actor) returning id into v_invoice;
      insert into public.invoice_items(organization_id,location_id,invoice_id,package_id,amount_minor)
        values(p_org,p_location,v_invoice,v_result,v_amount);
      v_details:=jsonb_build_object('invoice_id',v_invoice);
    end if;
  when 'training_status' then
    select * into v_package from public.training_packages
      where (organization_id,location_id,id)=(p_org,p_location,v_target) for update;
    if not found then raise exception 'club_finance_scope' using errcode='42501'; end if;
    if v_status not in ('active','suspended','cancelled') or v_status is null or v_reason is null
      or v_package.status in (v_status,'cancelled') then raise exception 'club_finance_transition' using errcode='22023'; end if;
    if v_status='cancelled' and exists (select from public.training_uses where package_id=v_target and reversed_at is null) then
      raise exception 'training_has_consumption' using errcode='23514';
    end if;
    update public.training_packages set status=v_status where id=v_target;
    v_result:=v_target;
    v_details:=jsonb_build_object('before',v_package.status,'after',v_status,'reason',v_reason);
  when 'training_redeem' then
    select * into v_package from public.training_packages
      where (organization_id,location_id,id)=(p_org,p_location,v_target) for update;
    if not found then raise exception 'club_finance_scope' using errcode='42501'; end if;
    select timezone(b.timezone,lower(s.actual_slot))::date,case when b.kind='private' then b.id end
      into v_date,v_private_booking from public.session_participants pp
      join public.sessions s on s.id=pp.session_id join public.bookings b on b.id=s.booking_id
      join public.attendance_records ar on ar.participant_id=pp.id
      where (pp.organization_id,pp.location_id,pp.student_id,pp.id)=(p_org,p_location,v_package.student_id,(p_data->>'participant')::uuid)
      and pp.withdrawn_at is null and s.status='completed' and b.status='confirmed' and ar.status in ('present','late');
    if v_package.status<>'active' or v_date is null or v_date not between v_package.valid_from and v_package.valid_until then
      raise exception 'training_not_eligible' using errcode='22023';
    end if;
    if v_private_booking is not null then
      update public.bookings set revision=revision where id=v_private_booking;
      if exists (select from public.invoice_items li where li.booking_id=v_private_booking and li.active) then
        raise exception 'training_private_already_billed' using errcode='23514';
      end if;
    end if;
    if exists (select from public.training_uses where participant_id=(p_data->>'participant')::uuid and reversed_at is null) then
      raise exception 'training_already_redeemed' using errcode='23505';
    end if;
    if v_package.sessions is not null and (select count(*) from public.training_uses where package_id=v_target and reversed_at is null)>=v_package.sessions then
      raise exception 'training_no_credit' using errcode='23514';
    end if;
    insert into public.training_uses(organization_id,location_id,student_id,package_id,participant_id)
      values(p_org,p_location,v_package.student_id,v_target,(p_data->>'participant')::uuid) returning id into v_result;
    v_details:=jsonb_build_object('package_id',v_target,'participant_id',p_data->>'participant');
  when 'training_return' then
    if v_reason is null then raise exception 'club_finance_reason' using errcode='22023'; end if;
    update public.training_uses set reversed_at=clock_timestamp(),reversal_reason=v_reason
      where (organization_id,location_id,id)=(p_org,p_location,v_target) and reversed_at is null returning id into v_result;
    if not found then raise exception 'club_finance_transition' using errcode='22023'; end if;
    v_details:=jsonb_build_object('reason',v_reason);
  when 'expense_record' then
    v_date:=(p_data->>'day')::date;
    if v_date is null or v_date>timezone(v_timezone,statement_timestamp())::date then raise exception 'club_finance_date' using errcode='22023'; end if;
    insert into public.club_expenses(organization_id,location_id,title,category,currency,amount_minor,method,effective_on,created_by)
    values(p_org,p_location,btrim(p_data->>'title'),p_data->>'category',v_currency,v_amount,
      (p_data->>'method')::public.payment_method,v_date,v_actor) returning id into v_result;
  when 'expense_void' then
    if v_reason is null then raise exception 'club_finance_reason' using errcode='22023'; end if;
    update public.club_expenses set voided_at=clock_timestamp(),void_reason=v_reason
      where (organization_id,location_id,id)=(p_org,p_location,v_target) and voided_at is null returning id into v_result;
    if not found then raise exception 'club_finance_transition' using errcode='22023'; end if;
    v_details:=jsonb_build_object('reason',v_reason);
  when 'rate_special' then
    if not exists (select from public.pricing_rules r join public.courts c on c.id=r.court_id
      where (r.organization_id,r.location_id,r.id)=(p_org,p_location,v_target) and c.status='active') then
      raise exception 'club_finance_scope' using errcode='42501';
    end if;
    insert into public.pricing_specials(organization_id,location_id,rate_id,weekday,local_minutes,duration_minutes,amount_minor)
    values(p_org,p_location,v_target,(p_data->>'weekday')::smallint,
      int4range((p_data->>'start')::int,(p_data->>'end')::int,'[)'),
      int4range((p_data->>'minimum')::int,(p_data->>'maximum')::int,'[]'),v_amount) returning id into v_result;
  when 'rate_retire' then
    if v_reason is null then raise exception 'club_finance_reason' using errcode='22023'; end if;
    update public.pricing_specials set retired_at=clock_timestamp()
      where (organization_id,location_id,id)=(p_org,p_location,v_target) and retired_at is null returning id into v_result;
    if not found then raise exception 'club_finance_transition' using errcode='22023'; end if;
    v_details:=jsonb_build_object('reason',v_reason);
  else
    select * into v_payable from public.coach_payables
      where (organization_id,location_id,id)=(p_org,p_location,v_target) for update;
    if not found then raise exception 'club_finance_scope' using errcode='42501'; end if;
    v_result:=v_target;
    case p_command
    when 'coach_adjust' then
      if v_payable.status='paid' or v_reason is null or v_amount is null then raise exception 'club_finance_transition' using errcode='22023'; end if;
      update public.coach_payables set status='adjusted',manual_amount_minor=v_amount,
        amount_minor=null,basis_minor=null,approved_at=null where id=v_target;
      v_details:=jsonb_build_object('reason',v_reason,'previous',coalesce(v_payable.amount_minor,v_payable.manual_amount_minor),'amount',v_amount);
    when 'coach_approve' then
      if v_payable.status not in ('ready','adjusted') then raise exception 'club_finance_transition' using errcode='22023'; end if;
      perform i.id from public.invoices i join public.invoice_items li on li.invoice_id=i.id and li.active
      join public.sessions s on s.booking_id=li.booking_id where s.id=v_payable.session_id for no key update of i;
      select amount,basis_amount into v_estimate,v_basis from tennis_private.coach_calculation(v_target);
      if v_estimate is null or v_estimate not between 0 and 9999999999999 or v_estimate is distinct from v_amount::numeric then
        raise exception 'coach_estimate_changed' using errcode='22023';
      end if;
      update public.coach_payables set status='approved',amount_minor=v_estimate,basis_minor=v_basis,approved_at=clock_timestamp() where id=v_target;
      v_details:=jsonb_build_object('amount',v_estimate,'basis_amount',v_basis);
    when 'coach_pay' then
      if v_payable.status<>'approved' then raise exception 'club_finance_transition' using errcode='22023'; end if;
      if v_amount is distinct from v_payable.amount_minor then raise exception 'coach_estimate_changed' using errcode='22023'; end if;
      update public.coach_payables set status='paid',paid_at=clock_timestamp(),
        payment_method=(p_data->>'method')::public.payment_method,payment_reference=nullif(btrim(p_data->>'reference'),'')
        where id=v_target;
      v_details:=jsonb_build_object('amount',v_payable.amount_minor);
    when 'coach_correct' then
      if v_payable.status<>'paid' or v_reason is null or v_amount is null then raise exception 'club_finance_transition' using errcode='22023'; end if;
      select v_payable.amount_minor+coalesce(sum(delta_minor),0) into v_original
        from public.coach_payment_adjustments where payable_id=v_target;
      if v_original is distinct from (p_data->>'expected')::bigint then raise exception 'coach_estimate_changed' using errcode='22023'; end if;
      if v_original=v_amount then raise exception 'club_finance_transition' using errcode='22023'; end if;
      insert into public.coach_payment_adjustments(organization_id,location_id,payable_id,delta_minor,reason,recorded_by)
        values(p_org,p_location,v_target,v_amount-v_original,v_reason,v_actor) returning id into v_result;
      v_details:=jsonb_build_object('payable_id',v_target,'reason',v_reason,'previous',v_original,'amount',v_amount);
    end case;
  end case;
  return tennis_private.finish_operation(p_org,p_location,v_actor,p_command,p_request,v_result,v_details);
end;
$$;

create function public.record_club_finance(p_org uuid,p_location uuid,p_command text,p_data jsonb,p_request uuid)
returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.record_club_finance(p_org,p_location,p_command,p_data,p_request); $$;

create function tennis_private.club_finance_result(p_org uuid,p_location uuid,p_command text,p_request uuid)
returns uuid language sql stable security definer set search_path=''
as $$
  select r.result_id from tennis_private.operation_requests r where
    (r.organization_id,r.location_id,r.actor_user_id,r.command,r.request_id)=(p_org,p_location,(select auth.uid()),p_command,p_request)
    and tennis_private.can_location(p_org,p_location,array['owner','admin']::public.club_role[])
    and r.command in ('training_issue','training_status','training_redeem','training_return','expense_record','expense_void',
      'coach_adjust','coach_approve','coach_pay','coach_correct','rate_special','rate_retire')
$$;
create function public.club_finance_result(p_org uuid,p_location uuid,p_command text,p_request uuid)
returns uuid language sql stable security invoker set search_path=''
as $$ select tennis_private.club_finance_result(p_org,p_location,p_command,p_request); $$;

revoke all on function
  tennis_private.snapshot_coach_terms(),tennis_private.open_coach_payable(),
  tennis_private.return_credit_on_attendance_change(),tennis_private.require_cancelled_package_for_void(),
  tennis_private.require_uncovered_private_booking(),
  tennis_private.booking_unit_rate(uuid,tstzrange,text,integer),tennis_private.coach_calculation(uuid),
  tennis_private.record_club_finance(uuid,uuid,text,jsonb,uuid),public.record_club_finance(uuid,uuid,text,jsonb,uuid),
  tennis_private.club_finance_result(uuid,uuid,text,uuid),public.club_finance_result(uuid,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function
  tennis_private.local_slot(tstzrange,text),
  tennis_private.booking_unit_rate(uuid,tstzrange,text,integer),tennis_private.coach_calculation(uuid),
  tennis_private.record_club_finance(uuid,uuid,text,jsonb,uuid),public.record_club_finance(uuid,uuid,text,jsonb,uuid),
  tennis_private.club_finance_result(uuid,uuid,text,uuid),public.club_finance_result(uuid,uuid,text,uuid)
to authenticated;

commit;
