begin;

create type public.payment_method as enum ('cash', 'card', 'transfer');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount_minor bigint not null check (total_amount_minor between 0 and 9999999999999),
  revision bigint not null default 0 check (revision >= 0),
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  unique (organization_id, location_id, id)
);

create index invoices_scope_idx on public.invoices (organization_id, location_id, issued_at desc, id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  invoice_id uuid not null,
  booking_id uuid not null unique,
  amount_minor bigint not null check (amount_minor between 0 and 9999999999999),
  foreign key (organization_id, location_id, invoice_id) references public.invoices (organization_id, location_id, id),
  foreign key (organization_id, location_id, booking_id) references public.bookings (organization_id, location_id, id)
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  invoice_id uuid not null,
  method public.payment_method not null,
  amount_minor bigint not null check (amount_minor between 1 and 9999999999999),
  received_by uuid not null,
  effective_at timestamptz not null default now(),
  foreign key (organization_id, location_id, invoice_id) references public.invoices (organization_id, location_id, id),
  unique (organization_id, location_id, id)
);
create index payments_invoice_idx on public.payments (invoice_id, id);
create index payments_effective_idx on public.payments (organization_id, location_id, effective_at);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  payment_id uuid not null,
  amount_minor bigint not null check (amount_minor between 1 and 9999999999999),
  reason text not null check (length(btrim(reason)) between 1 and 250),
  recorded_by uuid not null,
  effective_at timestamptz not null default now(),
  foreign key (organization_id, location_id, payment_id) references public.payments (organization_id, location_id, id)
);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_effective_idx on public.refunds (organization_id, location_id, effective_at);

create view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id, i.organization_id, i.location_id, i.currency, i.total_amount_minor,
  (p.paid_minor - r.refunded_minor)::bigint as received_minor,
  (i.total_amount_minor - p.paid_minor + r.refunded_minor)::bigint as due_minor,
  case
    when i.total_amount_minor = p.paid_minor - r.refunded_minor then 'settled'
    when p.paid_minor > r.refunded_minor then 'partial'
    else 'open'
  end as status
from public.invoices as i
cross join lateral (
  select coalesce(sum(amount_minor), 0) as paid_minor from public.payments where invoice_id = i.id
) as p
cross join lateral (
  select coalesce(sum(rf.amount_minor), 0) as refunded_minor
  from public.refunds as rf join public.payments as py on py.id = rf.payment_id
  where py.invoice_id = i.id
) as r;

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;

revoke all on public.invoices, public.invoice_items, public.payments, public.refunds, public.invoice_balances
  from public, anon, authenticated;
grant select on public.invoices, public.invoice_items, public.payments, public.refunds, public.invoice_balances to authenticated;

create policy staff_reads_invoice on public.invoices for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[]));
create policy staff_reads_invoice_items on public.invoice_items for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[]));
create policy staff_reads_payments on public.payments for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[]));
create policy staff_reads_refunds on public.refunds for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[]));

create function tennis_private.issue_booking_invoice(
  p_org uuid, p_location uuid, p_booking uuid, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'issue_booking_invoice';
  v_actor uuid := tennis_private.require_location(p_org, p_location,
    array['owner','admin','receptionist','accountant']::public.club_role[]);
  v_result uuid;
  v_price public.booking_prices%rowtype;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request, jsonb_build_array(p_booking));
  if v_result is not null then return v_result; end if;

  perform 1 from public.bookings where (organization_id, location_id, id) = (p_org, p_location, p_booking)
    and status = 'confirmed' for no key update;
  if not found then raise exception 'booking_not_invoiceable' using errcode = '22023'; end if;

  select * into strict v_price from public.booking_prices
  where (organization_id, location_id, booking_id) = (p_org, p_location, p_booking);
  insert into public.invoices (organization_id, location_id, currency, total_amount_minor, issued_by)
  values (p_org, p_location, v_price.currency, v_price.amount_minor, v_actor) returning id into v_result;
  insert into public.invoice_items (organization_id, location_id, invoice_id, booking_id, amount_minor)
  values (p_org, p_location, v_result, p_booking, v_price.amount_minor);
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result,
    jsonb_build_object('booking_id', p_booking));
end;
$$;

create function tennis_private.record_payment(
  p_org uuid, p_location uuid, p_invoice uuid, p_amount bigint, p_method public.payment_method, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'record_payment';
  v_actor uuid := tennis_private.require_location(p_org, p_location,
    array['owner','admin','receptionist','accountant']::public.club_role[]);
  v_result uuid;
  v_due bigint;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(p_invoice, p_amount, p_method));
  if v_result is not null then return v_result; end if;
  if p_amount is null or p_amount <= 0 or p_method is null then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;

  update public.invoices set revision = revision + 1
  where (organization_id, location_id, id) = (p_org, p_location, p_invoice);
  if not found then raise exception 'invoice_not_found' using errcode = '22023'; end if;
  select due_minor into strict v_due from public.invoice_balances where invoice_id = p_invoice;
  if p_amount > v_due then raise exception 'payment_exceeds_due' using errcode = '23514'; end if;

  insert into public.payments (organization_id, location_id, invoice_id, amount_minor, method, received_by)
  values (p_org, p_location, p_invoice, p_amount, p_method, v_actor) returning id into v_result;
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result,
    jsonb_build_object('invoice_id', p_invoice));
end;
$$;

create function tennis_private.record_refund(
  p_org uuid, p_location uuid, p_payment uuid, p_amount bigint, p_reason text, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'record_refund';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin','accountant']::public.club_role[]);
  v_result uuid;
  v_reason text := nullif(btrim(p_reason), '');
  v_payment public.payments%rowtype;
  v_refunded numeric;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(p_payment, p_amount, v_reason));
  if v_result is not null then return v_result; end if;
  if p_amount is null or p_amount <= 0 or v_reason is null or length(v_reason) > 250 then
    raise exception 'invalid_refund' using errcode = '22023';
  end if;

  select * into v_payment from public.payments
  where (organization_id, location_id, id) = (p_org, p_location, p_payment);
  if not found then raise exception 'payment_not_found' using errcode = '22023'; end if;
  update public.invoices set revision = revision + 1 where id = v_payment.invoice_id;
  select coalesce(sum(amount_minor), 0) into v_refunded from public.refunds where payment_id = p_payment;
  if p_amount > v_payment.amount_minor - v_refunded then raise exception 'refund_exceeds_payment' using errcode = '23514'; end if;

  insert into public.refunds (organization_id, location_id, payment_id, amount_minor, reason, recorded_by)
  values (p_org, p_location, p_payment, p_amount, v_reason, v_actor) returning id into v_result;
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result,
    jsonb_build_object('payment_id', p_payment));
end;
$$;

create function public.issue_booking_invoice(
  p_org uuid, p_location uuid, p_booking uuid,
  p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.issue_booking_invoice(p_org, p_location, p_booking, p_request);
$$;

revoke all on function
  public.issue_booking_invoice(uuid, uuid, uuid, uuid),
  tennis_private.issue_booking_invoice(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.issue_booking_invoice(uuid, uuid, uuid, uuid),
  tennis_private.issue_booking_invoice(uuid, uuid, uuid, uuid) to authenticated;

create function public.record_payment(
  p_org uuid, p_location uuid, p_invoice uuid,
  p_amount bigint, p_method public.payment_method, p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.record_payment(p_org, p_location, p_invoice, p_amount, p_method, p_request);
$$;

revoke all on function
  public.record_payment(uuid, uuid, uuid, bigint, public.payment_method, uuid),
  tennis_private.record_payment(uuid, uuid, uuid, bigint, public.payment_method, uuid) from public, anon, authenticated;
grant execute on function
  public.record_payment(uuid, uuid, uuid, bigint, public.payment_method, uuid),
  tennis_private.record_payment(uuid, uuid, uuid, bigint, public.payment_method, uuid) to authenticated;

create function public.record_refund(
  p_org uuid, p_location uuid, p_payment uuid,
  p_amount bigint, p_reason text, p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.record_refund(p_org, p_location, p_payment, p_amount, p_reason, p_request);
$$;

revoke all on function
  public.record_refund(uuid, uuid, uuid, bigint, text, uuid),
  tennis_private.record_refund(uuid, uuid, uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function
  public.record_refund(uuid, uuid, uuid, bigint, text, uuid),
  tennis_private.record_refund(uuid, uuid, uuid, bigint, text, uuid) to authenticated;

commit;
