begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema tennis_private;
revoke all on schema tennis_private from public, anon, authenticated;
grant usage on schema tennis_private to authenticated;

create type public.club_role as enum ('owner', 'admin', 'receptionist', 'coach', 'accountant', 'student');
create type public.resource_status as enum ('active', 'inactive', 'archived');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  currency text not null default 'IRR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(btrim(name)) between 1 and 120),
  timezone text not null default 'Asia/Tehran',
  active boolean not null default true,
  schedule_revision bigint not null default 0 check (schedule_revision >= 0),
  unique (organization_id, id),
  unique (organization_id, name)
);

create function tennis_private.validate_location_timezone() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_location_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger validate_location_timezone
before insert or update of timezone on public.locations
for each row execute function tennis_private.validate_location_timezone();

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120)
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.club_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id, organization_id) where active;

create table public.member_locations (
  organization_id uuid not null,
  location_id uuid not null,
  user_id uuid not null,
  primary key (organization_id, user_id, location_id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 100),
  surface text not null check (length(btrim(surface)) between 1 and 60),
  status public.resource_status not null default 'active',
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  unique (organization_id, location_id, id),
  unique (organization_id, location_id, name)
);

create table public.coach_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  specialty text,
  status public.resource_status not null default 'active',
  unique (organization_id, id),
  unique (organization_id, user_id)
);

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  skill_level text,
  status public.resource_status not null default 'active',
  unique (organization_id, id),
  unique (organization_id, user_id)
);

create table public.coach_locations (
  organization_id uuid not null,
  location_id uuid not null,
  coach_id uuid not null,
  primary key (organization_id, location_id, coach_id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, coach_id) references public.coach_profiles (organization_id, id)
);
create index coach_locations_coach_idx on public.coach_locations (organization_id, coach_id, location_id);

create table public.student_locations (
  organization_id uuid not null,
  location_id uuid not null,
  student_id uuid not null,
  primary key (organization_id, location_id, student_id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, student_id) references public.student_profiles (organization_id, id)
);
create index student_locations_student_idx on public.student_locations (organization_id, student_id, location_id);

create function tennis_private.can_org(p_org uuid, p_roles public.club_role[] default null) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select from public.organization_members as m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.active
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

create function tennis_private.can_location(
  p_org uuid, p_location uuid, p_roles public.club_role[] default null
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select from public.organization_members as m
    join public.locations as l on l.organization_id = m.organization_id and l.id = p_location
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.active
      and (p_roles is null or m.role = any(p_roles))
      and (
        m.role = 'owner' or exists (
          select from public.member_locations as scope
          where scope.organization_id = p_org and scope.location_id = p_location and scope.user_id = m.user_id
        )
      )
  );
$$;

create function tennis_private.owns_coach(p_org uuid, p_coach uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select tennis_private.can_org(p_org, array['coach']::public.club_role[]) and exists (
    select from public.coach_profiles as p
    where p.organization_id = p_org and p.id = p_coach and p.user_id = (select auth.uid())
  );
$$;

create function tennis_private.owns_student(p_org uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select tennis_private.can_org(p_org, array['student']::public.club_role[]) and exists (
    select from public.student_profiles as p
    where p.organization_id = p_org and p.id = p_student and p.user_id = (select auth.uid())
  );
$$;

create function tennis_private.require_location(p_org uuid, p_location uuid, p_roles public.club_role[]) returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not tennis_private.can_location(p_org, p_location, p_roles) then
    raise exception 'location_access_denied' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create function tennis_private.valid_slot(p_slot tstzrange) returns boolean
language sql immutable strict set search_path = ''
as $$
  select not isempty(p_slot) and lower_inc(p_slot) and not upper_inc(p_slot)
    and not lower_inf(p_slot) and not upper_inf(p_slot)
    and isfinite(lower(p_slot)) and isfinite(upper(p_slot));
$$;

create table tennis_private.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  location_id uuid not null,
  actor_user_id uuid not null,
  action text not null,
  target_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references public.locations (organization_id, id)
);
create index audit_events_scope_idx on tennis_private.audit_events (organization_id, location_id, created_at desc, id);

create table tennis_private.operation_requests (
  organization_id uuid not null,
  location_id uuid not null,
  actor_user_id uuid not null,
  command text not null,
  request_id uuid not null,
  payload_hash bytea not null,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, location_id, actor_user_id, command, request_id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id)
);

create function tennis_private.begin_operation(
  p_org uuid, p_location uuid, p_actor uuid, p_command text, p_request uuid, p_payload jsonb
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_hash bytea := sha256(convert_to(p_payload::text, 'UTF8'));
  v_existing tennis_private.operation_requests%rowtype;
begin
  if p_request is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;

  insert into tennis_private.operation_requests (organization_id, location_id, actor_user_id, command, request_id, payload_hash)
  values (p_org, p_location, p_actor, p_command, p_request, v_hash)
  on conflict do nothing;
  if found then return null; end if;

  select * into strict v_existing from tennis_private.operation_requests as r
  where r.organization_id = p_org and r.location_id = p_location and r.actor_user_id = p_actor
    and r.command = p_command and r.request_id = p_request;

  if v_existing.payload_hash <> v_hash then
    raise exception 'request_payload_mismatch' using errcode = '22023';
  end if;
  if v_existing.result_id is null then
    raise exception 'operation_result_missing' using errcode = 'XX000';
  end if;
  return v_existing.result_id;
end;
$$;

create function tennis_private.finish_operation(
  p_org uuid, p_location uuid, p_actor uuid, p_command text, p_request uuid, p_target uuid,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql set search_path = ''
as $$
begin
  update tennis_private.operation_requests as r set result_id = p_target
  where r.organization_id = p_org and r.location_id = p_location and r.actor_user_id = p_actor
    and r.command = p_command and r.request_id = p_request and r.result_id is null;
  if not found then
    raise exception 'operation_request_missing' using errcode = 'XX000';
  end if;

  insert into tennis_private.audit_events (organization_id, location_id, actor_user_id, action, target_id, details)
  values (p_org, p_location, p_actor, p_command, p_target, p_details);
  return p_target;
end;
$$;

alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.member_locations enable row level security;
alter table public.courts enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.coach_locations enable row level security;
alter table public.student_locations enable row level security;
alter table tennis_private.audit_events enable row level security;
alter table tennis_private.operation_requests enable row level security;

revoke all on public.organizations, public.locations, public.profiles, public.organization_members,
  public.member_locations, public.courts, public.coach_profiles, public.student_profiles,
  public.coach_locations, public.student_locations from public, anon, authenticated;
grant select on public.organizations, public.locations, public.profiles, public.organization_members,
  public.member_locations, public.courts, public.coach_profiles, public.student_profiles,
  public.coach_locations, public.student_locations to authenticated;

create policy member_reads_organization on public.organizations for select to authenticated
using (tennis_private.can_org(id));
create policy member_reads_location on public.locations for select to authenticated
using (tennis_private.can_location(organization_id, id));
create policy self_reads_profile on public.profiles for select to authenticated
using (user_id = (select auth.uid()));
create policy owner_or_self_reads_member on public.organization_members for select to authenticated
using (user_id = (select auth.uid()) or tennis_private.can_org(organization_id, array['owner']::public.club_role[]));
create policy owner_or_self_reads_member_locations on public.member_locations for select to authenticated
using (user_id = (select auth.uid()) or tennis_private.can_org(organization_id, array['owner']::public.club_role[]));
create policy member_reads_court on public.courts for select to authenticated
using (tennis_private.can_location(organization_id, location_id));
create policy staff_or_self_reads_coach_location on public.coach_locations for select to authenticated
using (
  tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist']::public.club_role[])
  or (tennis_private.can_location(organization_id, location_id) and tennis_private.owns_coach(organization_id, coach_id))
);
create policy staff_or_self_reads_student_location on public.student_locations for select to authenticated
using (
  tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist']::public.club_role[])
  or (tennis_private.can_location(organization_id, location_id) and tennis_private.owns_student(organization_id, student_id))
);
create policy visible_coach_profile on public.coach_profiles for select to authenticated
using (exists (
  select from public.coach_locations as scope
  where scope.organization_id = coach_profiles.organization_id and scope.coach_id = coach_profiles.id
));
create policy visible_student_profile on public.student_profiles for select to authenticated
using (exists (
  select from public.student_locations as scope
  where scope.organization_id = student_profiles.organization_id and scope.student_id = student_profiles.id
));

revoke all on all tables in schema tennis_private from public, anon, authenticated;
revoke all on all functions in schema tennis_private from public, anon, authenticated;
grant execute on function tennis_private.can_org(uuid, public.club_role[]),
  tennis_private.can_location(uuid, uuid, public.club_role[]),
  tennis_private.owns_coach(uuid, uuid), tennis_private.owns_student(uuid, uuid) to authenticated;

commit;
