do $$
begin
  if not exists (
    select from public.organization_members m join auth.users u on u.id=m.user_id
    where m.role='owner' and m.active
  ) then
    raise exception 'The archive lacks an active club owner.';
  end if;
  if not exists (select from tennis_install.migrations) then
    raise exception 'The archive lacks the application migration history.';
  end if;
  if exists (select from public.invoice_balances where due_minor<0) then
    raise exception 'A restored invoice has a negative balance.';
  end if;
  if exists (
    select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('bookings','payments','refunds','invoices','student_profiles')
      and not c.relrowsecurity
  ) then
    raise exception 'Row-level security is missing on a restored club table.';
  end if;
end
$$;

select
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.locations) as branches,
  (select count(*) from public.bookings) as bookings,
  (select count(*) from public.sessions) as sessions,
  (select count(*) from public.invoices) as invoices,
  (select count(*) from public.payments) as payments,
  (select count(*) from public.refunds) as refunds,
  (select count(*) from tennis_install.migrations) as migrations;
