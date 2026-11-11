create table tennis_runtime.push_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 15 and 2048),
  p256dh text not null check (length(p256dh)=87),
  auth_key text not null check (length(auth_key)=22),
  subscribed_at timestamptz not null default now()
);
create index push_devices_membership_idx on tennis_runtime.push_devices(organization_id,user_id);
alter table tennis_runtime.push_devices enable row level security;
create policy push_service_devices on tennis_runtime.push_devices for all to tennis_web using (true) with check (true);
revoke all on tennis_runtime.push_devices from public,anon,authenticated;
grant select,insert,update,delete on tennis_runtime.push_devices to tennis_web;

create table tennis_runtime.push_deliveries (
  event_id uuid not null references public.notification_events(id) on delete cascade,
  device_id uuid not null references tennis_runtime.push_devices(id) on update cascade on delete cascade,
  attempts int not null default 0,
  retry_at timestamptz not null default now(),
  lease uuid,
  finished_at timestamptz,
  outcome text check (outcome in ('sent','failed')),
  primary key (event_id,device_id),
  check ((finished_at is null)=(outcome is null))
);
create index push_deliveries_pending_idx on tennis_runtime.push_deliveries(retry_at,event_id,device_id) where finished_at is null;
create index push_deliveries_device_idx on tennis_runtime.push_deliveries(device_id);
alter table tennis_runtime.push_deliveries enable row level security;
revoke all on tennis_runtime.push_deliveries from public,anon,authenticated,tennis_web;

create view tennis_runtime.push_candidates with (security_invoker=true) as
select e.id as event_id,d.id as device_id,d.endpoint,d.p256dh,d.auth_key,e.organization_id,e.available_at
from public.notification_events e
join tennis_runtime.push_devices d on d.organization_id=e.organization_id and d.subscribed_at<=e.available_at
join public.organization_members m on m.organization_id=e.organization_id and m.user_id=d.user_id
where e.available_at>=now()-interval '24 hours' and m.active and m.role in ('owner','admin')
  and tennis_private.notice_is_current(e.kind,e.source_id,e.available_at,e.expires_at,e.invalidated_at)
  and (m.role='owner' or exists (
    select from public.member_locations s
    where (s.organization_id,s.location_id,s.user_id)=(e.organization_id,e.location_id,d.user_id)
  ));
revoke all on tennis_runtime.push_candidates from public,anon,authenticated,tennis_web;

create function tennis_runtime.claim_push_deliveries(p_limit int)
returns table(event_id uuid,device_id uuid,endpoint text,p256dh text,auth_key text,organization_id uuid,lease uuid,attempts int)
language plpgsql security definer set search_path=''
as $$
begin
  insert into tennis_runtime.push_deliveries(event_id,device_id)
  select c.event_id,c.device_id from tennis_runtime.push_candidates c
  where not exists (select from tennis_runtime.push_deliveries d where (d.event_id,d.device_id)=(c.event_id,c.device_id))
  order by c.available_at,c.event_id,c.device_id limit 100
  on conflict do nothing;

  update tennis_runtime.push_deliveries d
  set lease=null,outcome='failed',finished_at=now()
  where d.finished_at is null and d.attempts>=5 and d.retry_at<=now();

  return query
  with next as (
    select d.event_id,d.device_id,c.endpoint,c.p256dh,c.auth_key,c.organization_id
    from tennis_runtime.push_deliveries d
    join tennis_runtime.push_candidates c on (c.event_id,c.device_id)=(d.event_id,d.device_id)
    where d.finished_at is null and d.attempts<5 and d.retry_at<=now()
    order by d.retry_at,d.event_id,d.device_id
    for update of d skip locked limit least(greatest(p_limit,1),4)
  )
  update tennis_runtime.push_deliveries d
  set lease=gen_random_uuid(),retry_at=now()+interval '90 seconds',attempts=d.attempts+1
  from next n where (d.event_id,d.device_id)=(n.event_id,n.device_id)
  returning d.event_id,d.device_id,n.endpoint,n.p256dh,n.auth_key,n.organization_id,d.lease,d.attempts;
end;
$$;

create function tennis_runtime.finish_push_delivery(p_event uuid,p_device uuid,p_lease uuid,p_outcome text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare n int;
begin
  if p_outcome is null or p_outcome not in ('sent','failed','retry','gone') then return false; end if;
  if p_outcome='gone' then
    delete from tennis_runtime.push_devices d where d.id=p_device and exists (
      select from tennis_runtime.push_deliveries j where (j.event_id,j.device_id,j.lease)=(p_event,p_device,p_lease) and j.finished_at is null
    );
  else
    update tennis_runtime.push_deliveries d
    set lease=null,retry_at=now()+make_interval(mins=>d.attempts*d.attempts),
        outcome=case when p_outcome='sent' then 'sent' when p_outcome='failed' or d.attempts>=5 then 'failed' end,
        finished_at=case when p_outcome<>'retry' or d.attempts>=5 then now() end
    where (d.event_id,d.device_id,d.lease)=(p_event,p_device,p_lease) and d.finished_at is null;
  end if;
  get diagnostics n=row_count;
  return n>0;
end;
$$;

revoke all on function tennis_runtime.claim_push_deliveries(int),tennis_runtime.finish_push_delivery(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function tennis_runtime.claim_push_deliveries(int),tennis_runtime.finish_push_delivery(uuid,uuid,uuid,text) to tennis_web;
