begin;

alter table public.invoices
  add column invoice_number bigint generated always as identity unique,
  add column discount_minor bigint not null default 0 check (discount_minor>=0 and discount_minor+total_amount_minor<=9999999999999),
  add column discount_reason text check (length(btrim(discount_reason)) between 1 and 250),
  add column voided_at timestamptz,
  add column voided_by uuid,
  add column void_reason text check (length(btrim(void_reason)) between 1 and 250),
  add constraint invoice_discount_has_reason check ((discount_minor=0)=(discount_reason is null)),
  add constraint invoice_void_is_complete check (num_nonnulls(voided_at,voided_by,void_reason) in (0,3)),
  alter column issued_at set default clock_timestamp();

alter table public.invoice_items add column active boolean not null default true;
create unique index invoice_items_active_booking_idx on public.invoice_items(booking_id) where active;
create index invoice_items_booking_idx on public.invoice_items(booking_id);
alter table public.invoice_items drop constraint invoice_items_booking_id_key;

alter table public.payments
  add column reference text check (length(btrim(reference)) between 1 and 120),
  alter column effective_at set default clock_timestamp();
alter table public.refunds alter column effective_at set default clock_timestamp();

create or replace view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id, i.organization_id, i.location_id, i.currency, i.total_amount_minor,
  (p.paid_minor - r.refunded_minor)::bigint as received_minor,
  (case when i.voided_at is not null then 0 else i.total_amount_minor - p.paid_minor + r.refunded_minor end)::bigint as due_minor,
  case
    when i.voided_at is not null then 'voided'
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

create function tennis_private.issue_booking_invoice(
  p_org uuid,p_location uuid,p_booking uuid,p_discount bigint,p_reason text,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_action constant text := 'issue_booking_invoice';
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_reason text := nullif(btrim(p_reason),'');
  v_result uuid;
  v_price public.booking_prices%rowtype;
begin
  if p_discount is null or p_discount<0 or (p_discount=0)<>(v_reason is null) or length(v_reason)>250 then
    raise exception 'invalid_invoice_discount' using errcode='22023';
  end if;
  v_result := tennis_private.begin_operation(p_org,p_location,v_actor,v_action,p_request,
    case when p_discount=0 then jsonb_build_array(p_booking) else jsonb_build_array(p_booking,p_discount,v_reason) end);
  if v_result is not null then return v_result; end if;

  -- Serialize issuance with booking cancellation and other attempts for this booking.
  perform 1 from public.bookings where (organization_id,location_id,id)=(p_org,p_location,p_booking) for no key update;
  if not found then raise exception 'invoice_access_denied' using errcode='42501'; end if;
  if exists (select from public.invoice_items li where li.booking_id=p_booking and li.active) then
    -- An existing invoice is discoverable from the booking without creating another financial event.
    raise exception 'booking_already_invoiced' using errcode='23505';
  end if;
  if not exists (select from public.bookings where id=p_booking and status='confirmed') then
    raise exception 'booking_not_invoiceable' using errcode='22023';
  end if;

  select * into v_price from public.booking_prices
  where (organization_id,location_id,booking_id)=(p_org,p_location,p_booking);
  if not found then raise exception 'booking_not_invoiceable' using errcode='22023'; end if;
  if p_discount>v_price.amount_minor then raise exception 'invoice_discount_exceeds_price' using errcode='23514'; end if;

  insert into public.invoices (organization_id,location_id,currency,total_amount_minor,discount_minor,discount_reason,issued_by)
    values (p_org,p_location,v_price.currency,v_price.amount_minor-p_discount,p_discount,v_reason,v_actor) returning id into v_result;
  insert into public.invoice_items (organization_id,location_id,invoice_id,booking_id,amount_minor)
    values (p_org,p_location,v_result,p_booking,v_price.amount_minor-p_discount);
  return tennis_private.finish_operation(p_org,p_location,v_actor,v_action,p_request,v_result,jsonb_build_object('booking_id',p_booking));
end;
$$;

create or replace function tennis_private.issue_booking_invoice(p_org uuid,p_location uuid,p_booking uuid,p_request uuid)
returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.issue_booking_invoice(p_org,p_location,p_booking,0,null,p_request); $$;

create function public.issue_booking_invoice(p_org uuid,p_location uuid,p_booking uuid,p_discount bigint,p_reason text,p_request uuid)
returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.issue_booking_invoice(p_org,p_location,p_booking,p_discount,p_reason,p_request); $$;

create function tennis_private.record_payment(
  p_org uuid,p_location uuid,p_invoice uuid,p_amount bigint,p_method public.payment_method,p_reference text,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_action constant text := 'record_payment';
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_reference text := nullif(btrim(p_reference),'');
  v_result uuid;
  v_due bigint;
begin
  v_result := tennis_private.begin_operation(p_org,p_location,v_actor,v_action,p_request,
    case when v_reference is null then jsonb_build_array(p_invoice,p_amount,p_method)
      else jsonb_build_array(p_invoice,p_amount,p_method,v_reference) end);
  if v_result is not null then return v_result; end if;
  if p_amount is null or p_amount<=0 or p_method is null or length(v_reference)>120 then
    raise exception 'invalid_payment' using errcode='22023';
  end if;
  update public.invoices set revision=revision+1
    where (organization_id,location_id,id)=(p_org,p_location,p_invoice) and voided_at is null;
  if not found then raise exception 'invoice_not_payable' using errcode='22023'; end if;
  select due_minor into strict v_due from public.invoice_balances where invoice_id=p_invoice;
  if p_amount>v_due then raise exception 'payment_exceeds_due' using errcode='23514'; end if;

  insert into public.payments(organization_id,location_id,invoice_id,amount_minor,method,reference,received_by)
    values (p_org,p_location,p_invoice,p_amount,p_method,v_reference,v_actor) returning id into v_result;
  return tennis_private.finish_operation(p_org,p_location,v_actor,v_action,p_request,v_result,jsonb_build_object('invoice_id',p_invoice));
end;
$$;

create or replace function tennis_private.record_payment(
  p_org uuid,p_location uuid,p_invoice uuid,p_amount bigint,p_method public.payment_method,p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.record_payment(p_org,p_location,p_invoice,p_amount,p_method,null,p_request); $$;

create function public.record_payment(
  p_org uuid,p_location uuid,p_invoice uuid,p_amount bigint,p_method public.payment_method,p_reference text,p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.record_payment(p_org,p_location,p_invoice,p_amount,p_method,p_reference,p_request); $$;

create function tennis_private.void_invoice(p_org uuid,p_location uuid,p_invoice uuid,p_reason text,p_request uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_action constant text := 'void_invoice';
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_reason text := nullif(btrim(p_reason),'');
  v_result uuid;
  v_received bigint;
begin
  if v_reason is null or length(v_reason)>250 then raise exception 'invoice_void_reason_required' using errcode='22023'; end if;
  v_result := tennis_private.begin_operation(p_org,p_location,v_actor,v_action,p_request,jsonb_build_array(p_invoice,v_reason));
  if v_result is not null then return v_result; end if;
  update public.invoices set revision=revision+1
    where (organization_id,location_id,id)=(p_org,p_location,p_invoice) and voided_at is null;
  if not found then raise exception 'invoice_not_payable' using errcode='22023'; end if;
  select received_minor into strict v_received from public.invoice_balances where invoice_id=p_invoice;
  if v_received<>0 then raise exception 'invoice_has_receipts' using errcode='23514'; end if;

  update public.invoices set voided_at=clock_timestamp(),voided_by=v_actor,void_reason=v_reason where id=p_invoice;
  update public.invoice_items set active=false where invoice_id=p_invoice and active;
  return tennis_private.finish_operation(p_org,p_location,v_actor,v_action,p_request,p_invoice);
end;
$$;

create function public.void_invoice(p_org uuid,p_location uuid,p_invoice uuid,p_reason text,p_request uuid)
returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.void_invoice(p_org,p_location,p_invoice,p_reason,p_request); $$;

create function tennis_private.finance_command_result(p_org uuid,p_location uuid,p_command text,p_request uuid)
returns uuid language sql stable security definer set search_path=''
as $$
  select case r.command when 'record_payment' then py.invoice_id when 'record_refund' then original.invoice_id else r.result_id end
  from tennis_private.operation_requests r
  left join public.payments py on r.command='record_payment' and (py.organization_id,py.location_id,py.id)=(r.organization_id,r.location_id,r.result_id)
  left join public.refunds rf on r.command='record_refund' and (rf.organization_id,rf.location_id,rf.id)=(r.organization_id,r.location_id,r.result_id)
  left join public.payments original on original.id=rf.payment_id
  where (r.organization_id,r.location_id,r.actor_user_id,r.command,r.request_id)=(p_org,p_location,(select auth.uid()),p_command,p_request)
    and r.command in ('issue_booking_invoice','record_payment','record_refund','void_invoice')
    and tennis_private.can_location(p_org,p_location,array['owner','admin']::public.club_role[]);
$$;

create function public.finance_command_result(p_org uuid,p_location uuid,p_command text,p_request uuid)
returns uuid language sql stable security invoker set search_path=''
as $$ select tennis_private.finance_command_result(p_org,p_location,p_command,p_request); $$;

revoke all on function
  public.issue_booking_invoice(uuid,uuid,uuid,bigint,text,uuid),tennis_private.issue_booking_invoice(uuid,uuid,uuid,bigint,text,uuid),
  public.record_payment(uuid,uuid,uuid,bigint,public.payment_method,text,uuid),tennis_private.record_payment(uuid,uuid,uuid,bigint,public.payment_method,text,uuid),
  public.void_invoice(uuid,uuid,uuid,text,uuid),tennis_private.void_invoice(uuid,uuid,uuid,text,uuid),
  public.finance_command_result(uuid,uuid,text,uuid),tennis_private.finance_command_result(uuid,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function
  public.issue_booking_invoice(uuid,uuid,uuid,bigint,text,uuid),tennis_private.issue_booking_invoice(uuid,uuid,uuid,bigint,text,uuid),
  public.record_payment(uuid,uuid,uuid,bigint,public.payment_method,text,uuid),tennis_private.record_payment(uuid,uuid,uuid,bigint,public.payment_method,text,uuid),
  public.void_invoice(uuid,uuid,uuid,text,uuid),tennis_private.void_invoice(uuid,uuid,uuid,text,uuid),
  public.finance_command_result(uuid,uuid,text,uuid),tennis_private.finance_command_result(uuid,uuid,text,uuid)
to authenticated;

commit;
