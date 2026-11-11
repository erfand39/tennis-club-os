begin;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  kind text not null check (kind in (
    'lesson_reminder','booking_moved','booking_cancelled','roster_changed',
    'coach_availability','payment_reminder','schedule_block'
  )),
  source_id uuid not null,
  revision bigint not null default 0,
  available_at timestamptz not null default now(),
  expires_at timestamptz,
  invalidated_at timestamptz,
  foreign key (organization_id,location_id) references public.locations(organization_id,id),
  unique (kind,source_id,revision,location_id),
  check (expires_at is null or expires_at>available_at)
);
create index notification_events_scope_idx on public.notification_events(organization_id,location_id,available_at desc,id);
create index notification_events_ready_idx on public.notification_events(available_at,id) where invalidated_at is null;
alter table public.notification_events enable row level security;

create function tennis_private.notice_is_current(p_kind text,p_source uuid,p_available timestamptz,p_expires timestamptz,p_invalidated timestamptz)
returns boolean language sql stable set search_path=''
as $$
  select p_invalidated is null and p_available<=now() and (p_expires is null or p_expires>now())
    and (p_kind<>'payment_reminder' or exists (
      select from public.invoice_balances b where b.invoice_id=p_source and b.due_minor>0
    ));
$$;
revoke all on function tennis_private.notice_is_current(text,uuid,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function tennis_private.notice_is_current(text,uuid,timestamptz,timestamptz,timestamptz) to authenticated;

create policy manager_reads_notifications on public.notification_events for select to authenticated
using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[])
  and tennis_private.notice_is_current(kind,source_id,available_at,expires_at,invalidated_at));
revoke all on public.notification_events from public,anon,authenticated;
grant select on public.notification_events to authenticated;

create table public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.notification_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id,event_id)
);
create index notification_reads_event_idx on public.notification_reads(event_id);
alter table public.notification_reads enable row level security;
create policy read_own_notice_marks on public.notification_reads for select to authenticated using (user_id=(select auth.uid()));
create policy set_own_notice_marks on public.notification_reads for insert to authenticated
with check (user_id=(select auth.uid()) and exists (select from public.notification_events e where e.id=event_id));
revoke all on public.notification_reads from public,anon,authenticated;
grant select,insert on public.notification_reads to authenticated;

create function tennis_private.notice_from_booking() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='UPDATE' then
    if old.status is not distinct from new.status and old.slot is not distinct from new.slot then return new; end if;
    update public.notification_events set invalidated_at=now()
    where kind='lesson_reminder' and source_id=new.id and invalidated_at is null;
    insert into public.notification_events(organization_id,location_id,kind,source_id,revision)
    values (new.organization_id,new.location_id,
      case when new.status='cancelled' then 'booking_cancelled' else 'booking_moved' end,new.id,new.revision)
    on conflict do nothing;
  end if;
  if new.status='confirmed' and new.kind<>'rental' and new.starts_at>now() then
    insert into public.notification_events(organization_id,location_id,kind,source_id,revision,available_at,expires_at)
    values (new.organization_id,new.location_id,'lesson_reminder',new.id,new.revision,greatest(now(),new.starts_at-interval '1 hour'),new.starts_at)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger notice_from_booking after insert or update of slot,status on public.bookings
for each row execute function tennis_private.notice_from_booking();

create function tennis_private.expire_session_reminder() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  update public.notification_events set invalidated_at=now()
  where kind='lesson_reminder' and source_id=new.booking_id and invalidated_at is null;
  return new;
end;
$$;
create trigger expire_session_reminder after update of status on public.sessions
for each row when (old.status='scheduled' and new.status<>'scheduled') execute function tennis_private.expire_session_reminder();

create function tennis_private.notice_from_roster() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='UPDATE' and old.withdrawn_at is not distinct from new.withdrawn_at then return new; end if;
  insert into public.notification_events(organization_id,location_id,kind,source_id,revision)
  select new.organization_id,new.location_id,'roster_changed',s.id,txid_current()
  from public.sessions s join public.bookings b on b.id=s.booking_id
  where s.id=new.session_id and s.status='scheduled' and b.kind='group' and b.starts_at>now()
  on conflict do nothing;
  return new;
end;
$$;
create trigger notice_from_roster after insert or update of withdrawn_at on public.session_participants
for each row execute function tennis_private.notice_from_roster();

create function tennis_private.notice_from_coach_hours() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  insert into public.notification_events(organization_id,location_id,kind,source_id,revision)
  select new.organization_id,loc.id,'coach_availability',new.resource_id,new.id
  from unnest(new.branch_ids) as loc(id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger notice_from_coach_hours after insert on tennis_private.resource_changes
for each row when (new.kind='coach' and new.action='hours') execute function tennis_private.notice_from_coach_hours();

create function tennis_private.notice_from_invoice() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if new.total_amount_minor>0 then
    insert into public.notification_events(organization_id,location_id,kind,source_id,available_at)
    values (new.organization_id,new.location_id,'payment_reminder',new.id,new.issued_at+interval '168 hours')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger notice_from_invoice after insert on public.invoices
for each row execute function tennis_private.notice_from_invoice();

create function tennis_private.notice_from_block() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if upper(new.slot)>now() then
    insert into public.notification_events(organization_id,location_id,kind,source_id)
    values (new.organization_id,new.location_id,'schedule_block',new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger notice_from_closure after insert on public.location_closures
for each row execute function tennis_private.notice_from_block();
create trigger notice_from_maintenance after insert on public.court_maintenance_blocks
for each row execute function tennis_private.notice_from_block();

revoke all on function tennis_private.notice_from_booking(),tennis_private.expire_session_reminder(),tennis_private.notice_from_roster(),
  tennis_private.notice_from_coach_hours(),tennis_private.notice_from_invoice(),tennis_private.notice_from_block()
from public,anon,authenticated;

insert into public.notification_events(organization_id,location_id,kind,source_id,revision,available_at,expires_at)
select organization_id,location_id,'lesson_reminder',id,revision,starts_at-interval '1 hour',starts_at
from public.bookings b where kind<>'rental' and status='confirmed' and starts_at>now()
  and not exists (select from public.sessions s where s.booking_id=b.id and s.status<>'scheduled');

insert into public.notification_events(organization_id,location_id,kind,source_id,available_at)
select i.organization_id,i.location_id,'payment_reminder',i.id,i.issued_at+interval '168 hours'
from public.invoices i join public.invoice_balances b on b.invoice_id=i.id
where b.due_minor>0 and i.voided_at is null;

commit;
