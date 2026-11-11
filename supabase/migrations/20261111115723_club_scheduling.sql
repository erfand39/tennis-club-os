begin;

create type public.booking_kind as enum ('rental', 'private', 'group');
create type public.booking_status as enum ('confirmed', 'cancelled');
create type public.session_status as enum ('scheduled', 'completed', 'cancelled');
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');

create table public.court_operating_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  court_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  valid_dates daterange not null check (not isempty(valid_dates) and not lower_inf(valid_dates)),
  local_minutes int4range not null check (not isempty(local_minutes) and local_minutes <@ '[0,1440)'::int4range),
  foreign key (organization_id, location_id, court_id) references public.courts (organization_id, location_id, id),
  exclude using gist (court_id with =, weekday with =, valid_dates with &&, local_minutes with &&)
);

create table public.coach_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  coach_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  valid_dates daterange not null check (not isempty(valid_dates) and not lower_inf(valid_dates)),
  local_minutes int4range not null check (not isempty(local_minutes) and local_minutes <@ '[0,1440)'::int4range),
  foreign key (organization_id, location_id, coach_id) references public.coach_locations (organization_id, location_id, coach_id),
  exclude using gist (location_id with =, coach_id with =, weekday with =, valid_dates with &&, local_minutes with &&)
);

create table public.location_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  slot tstzrange not null check (tennis_private.valid_slot(slot)),
  reason text not null check (length(btrim(reason)) between 1 and 250),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  released_at timestamptz,
  exclude using gist (location_id with =, slot with &&) where (released_at is null)
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  court_id uuid not null,
  kind public.booking_kind not null,
  effective tstzrange not null check (not isempty(effective) and not lower_inf(effective) and lower_inc(effective) and not upper_inc(effective)),
  unit_minutes smallint not null check (unit_minutes between 1 and 1440),
  amount_minor bigint not null check (amount_minor between 0 and 9999999999999),
  foreign key (organization_id, location_id, court_id) references public.courts (organization_id, location_id, id),
  unique (organization_id, location_id, court_id, kind, id),
  exclude using gist (court_id with =, kind with =, effective with &&)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  court_id uuid not null,
  slot tstzrange not null check (tennis_private.valid_slot(slot)),
  starts_at timestamptz generated always as (lower(slot)) stored,
  ends_at timestamptz generated always as (upper(slot)) stored,
  timezone text not null,
  kind public.booking_kind not null,
  status public.booking_status not null default 'confirmed',
  booker_name text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text check (length(btrim(cancellation_reason)) between 1 and 250),
  foreign key (organization_id, location_id, court_id) references public.courts (organization_id, location_id, id),
  unique (organization_id, location_id, id),
  unique (organization_id, location_id, court_id, id),
  unique (organization_id, location_id, court_id, kind, id),
  check (
    (kind = 'rental' and booker_name is not null and length(btrim(booker_name)) between 1 and 120)
    or (kind <> 'rental' and booker_name is null)
  ),
  check ((status = 'cancelled') = (cancelled_at is not null and cancellation_reason is not null)),
  check ((cancelled_at is null) = (cancellation_reason is null)),
  check (extract(epoch from (upper(slot) - lower(slot))) <= 86400)
);

create table public.booking_prices (
  booking_id uuid primary key,
  organization_id uuid not null,
  location_id uuid not null,
  court_id uuid not null,
  kind public.booking_kind not null,
  pricing_rule_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit_minutes smallint not null check (unit_minutes between 1 and 1440),
  booked_minutes smallint not null check (booked_minutes between 1 and 1440),
  unit_amount_minor bigint not null check (unit_amount_minor between 0 and 9999999999999),
  amount_minor bigint not null check (amount_minor between 0 and 9999999999999),
  foreign key (organization_id, location_id, court_id, kind, booking_id)
    references public.bookings (organization_id, location_id, court_id, kind, id),
  foreign key (organization_id, location_id, court_id, kind, pricing_rule_id)
    references public.pricing_rules (organization_id, location_id, court_id, kind, id),
  check (mod(booked_minutes, unit_minutes) = 0),
  check (booked_minutes * unit_amount_minor = amount_minor * unit_minutes)
);

create index bookings_calendar_idx on public.bookings (organization_id, location_id, starts_at, id);
create index bookings_active_slot_idx on public.bookings using gist (organization_id, location_id, slot)
where status = 'confirmed';

create table public.court_maintenance_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  court_id uuid not null,
  slot tstzrange not null check (tennis_private.valid_slot(slot)),
  reason text not null check (length(btrim(reason)) between 1 and 250),
  released_at timestamptz,
  foreign key (organization_id, location_id, court_id) references public.courts (organization_id, location_id, id),
  unique (organization_id, location_id, court_id, id)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  status public.resource_status not null default 'active',
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  unique (organization_id, location_id, id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid not null,
  program_id uuid,
  coach_id uuid not null,
  capacity smallint not null check (capacity between 1 and 100),
  status public.session_status not null default 'scheduled',
  actual_slot tstzrange check (tennis_private.valid_slot(actual_slot)),
  foreign key (organization_id, location_id, booking_id) references public.bookings (organization_id, location_id, id),
  foreign key (organization_id, location_id, coach_id) references public.coach_locations (organization_id, location_id, coach_id),
  foreign key (organization_id, location_id, program_id) references public.programs (organization_id, location_id, id),
  unique (organization_id, location_id, booking_id),
  unique (organization_id, location_id, id),
  unique (organization_id, location_id, coach_id, id),
  check ((status = 'completed') = (actual_slot is not null))
);

create index sessions_coach_idx on public.sessions (organization_id, coach_id, location_id, id);

create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  registered_at timestamptz not null default now(),
  foreign key (organization_id, location_id, session_id) references public.sessions (organization_id, location_id, id),
  foreign key (organization_id, location_id, student_id) references public.student_locations (organization_id, location_id, student_id),
  unique (organization_id, location_id, session_id, student_id),
  unique (organization_id, location_id, student_id, id),
  unique (organization_id, location_id, id)
);
create index session_participants_student_idx on public.session_participants (organization_id, student_id, location_id, session_id);

create table public.attendance_records (
  participant_id uuid primary key,
  organization_id uuid not null,
  location_id uuid not null,
  status public.attendance_status not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  foreign key (organization_id, location_id, participant_id)
    references public.session_participants (organization_id, location_id, id)
);

create table tennis_private.court_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  court_id uuid not null,
  booking_id uuid unique,
  maintenance_id uuid unique,
  slot tstzrange not null check (tennis_private.valid_slot(slot)),
  active boolean not null default true,
  foreign key (organization_id, location_id, court_id, booking_id)
    references public.bookings (organization_id, location_id, court_id, id),
  foreign key (organization_id, location_id, court_id, maintenance_id)
    references public.court_maintenance_blocks (organization_id, location_id, court_id, id),
  check (num_nonnulls(booking_id, maintenance_id) = 1),
  constraint court_slot_no_overlap exclude using gist
    (organization_id with =, court_id with =, slot with &&) where (active)
);

create table tennis_private.coach_allocations (
  session_id uuid primary key,
  organization_id uuid not null,
  location_id uuid not null,
  coach_id uuid not null,
  slot tstzrange not null check (tennis_private.valid_slot(slot)),
  active boolean not null default true,
  foreign key (organization_id, location_id, coach_id, session_id)
    references public.sessions (organization_id, location_id, coach_id, id),
  constraint coach_slot_no_overlap exclude using gist
    (organization_id with =, coach_id with =, slot with &&) where (active)
);

create table tennis_private.student_allocations (
  participant_id uuid primary key,
  organization_id uuid not null,
  location_id uuid not null,
  student_id uuid not null,
  slot tstzrange not null check (tennis_private.valid_slot(slot)),
  active boolean not null default true,
  foreign key (organization_id, location_id, student_id, participant_id)
    references public.session_participants (organization_id, location_id, student_id, id),
  constraint student_slot_no_overlap exclude using gist
    (organization_id with =, student_id with =, slot with &&) where (active)
);

create function tennis_private.can_read_session(p_org uuid, p_location uuid, p_session uuid, p_coach uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select tennis_private.can_location(p_org, p_location, array['owner','admin','receptionist']::public.club_role[])
    or (
      tennis_private.can_location(p_org, p_location)
      and (
        tennis_private.owns_coach(p_org, p_coach) or exists (
          select from public.session_participants as p
          where p.organization_id = p_org and p.location_id = p_location and p.session_id = p_session
            and tennis_private.owns_student(p_org, p.student_id)
        )
      )
    );
$$;

create function tennis_private.teaches_student(p_org uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select from public.session_participants as p
    join public.sessions as s on (s.organization_id, s.location_id, s.id) = (p.organization_id, p.location_id, p.session_id)
    where p.organization_id = p_org and p.student_id = p_student
      and tennis_private.can_location(p_org, p.location_id) and tennis_private.owns_coach(p_org, s.coach_id)
  );
$$;

alter table public.court_operating_hours enable row level security;
alter table public.coach_availability enable row level security;
alter table public.location_closures enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_prices enable row level security;
alter table public.court_maintenance_blocks enable row level security;
alter table public.programs enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.attendance_records enable row level security;
alter table tennis_private.court_allocations enable row level security;
alter table tennis_private.coach_allocations enable row level security;
alter table tennis_private.student_allocations enable row level security;

revoke all on public.court_operating_hours, public.coach_availability, public.location_closures,
  public.pricing_rules, public.bookings, public.booking_prices, public.court_maintenance_blocks, public.programs, public.sessions,
  public.session_participants, public.attendance_records from public, anon, authenticated;
grant select on public.court_operating_hours, public.coach_availability, public.location_closures,
  public.pricing_rules, public.bookings, public.booking_prices, public.court_maintenance_blocks, public.programs, public.sessions,
  public.session_participants, public.attendance_records to authenticated;

create policy member_reads_court_hours on public.court_operating_hours for select to authenticated
using (tennis_private.can_location(organization_id, location_id));
create policy staff_or_coach_reads_availability on public.coach_availability for select to authenticated
using (
  tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist']::public.club_role[])
  or (tennis_private.can_location(organization_id, location_id) and tennis_private.owns_coach(organization_id, coach_id))
);
create policy staff_reads_location_closures on public.location_closures for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist']::public.club_role[]));
create policy staff_reads_pricing on public.pricing_rules for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[]));
create policy staff_reads_booking_prices on public.booking_prices for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[]));
create policy staff_reads_maintenance on public.court_maintenance_blocks for select to authenticated
using (tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist']::public.club_role[]));
create policy member_reads_program on public.programs for select to authenticated
using (tennis_private.can_location(organization_id, location_id));
create policy visible_session on public.sessions for select to authenticated
using (tennis_private.can_read_session(organization_id, location_id, id, coach_id));
create policy staff_or_session_member_reads_booking on public.bookings for select to authenticated
using (
  tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist','accountant']::public.club_role[])
  or exists (
    select from public.sessions as s
    where (s.organization_id, s.location_id, s.booking_id) = (bookings.organization_id, bookings.location_id, bookings.id)
  )
);
create policy staff_or_session_member_reads_participant on public.session_participants for select to authenticated
using (
  tennis_private.can_location(organization_id, location_id, array['owner','admin','receptionist']::public.club_role[])
  or (tennis_private.can_location(organization_id, location_id) and (
    tennis_private.owns_student(organization_id, student_id)
    or exists (
      select from public.sessions as s
      where (s.organization_id, s.location_id, s.id) =
        (session_participants.organization_id, session_participants.location_id, session_participants.session_id)
        and tennis_private.owns_coach(s.organization_id, s.coach_id)
    )
  ))
);
create policy visible_attendance on public.attendance_records for select to authenticated
using (exists (
  select from public.session_participants as p
  where (p.organization_id, p.location_id, p.id) =
    (attendance_records.organization_id, attendance_records.location_id, attendance_records.participant_id)
));
alter policy visible_student_profile on public.student_profiles
using (
  exists (
    select from public.student_locations as scope
    where scope.organization_id = student_profiles.organization_id and scope.student_id = student_profiles.id
  )
  or tennis_private.teaches_student(organization_id, id)
);

revoke all on tennis_private.court_allocations, tennis_private.coach_allocations, tennis_private.student_allocations
  from public, anon, authenticated;
revoke all on function tennis_private.can_read_session(uuid, uuid, uuid, uuid), tennis_private.teaches_student(uuid, uuid)
  from public, anon, authenticated;
grant execute on function tennis_private.can_read_session(uuid, uuid, uuid, uuid), tennis_private.teaches_student(uuid, uuid)
  to authenticated;

commit;
