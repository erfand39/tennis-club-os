begin;

create type public.club_resource_kind as enum ('court','coach','student');

alter table public.courts
  add column capacity smallint not null default 4 check (capacity between 1 and 100),
  add column amenities text[] not null default '{}' check (cardinality(amenities) <= 15),
  add column notes text check (length(notes) <= 2000),
  add column updated_at timestamptz not null default now(),
  add column revision bigint not null default 0 check (revision >= 0);
alter table public.coach_profiles
  add column contact_phone text check (contact_phone ~ '^[+0-9() -]{3,35}$'),
  add column contact_email text check (length(contact_email) <= 254 and position('@' in contact_email) > 1),
  add column qualification text check (length(qualification) <= 240),
  add column joined_on date,
  add column pay_basis text check (pay_basis in ('hourly','per_session')),
  add column pay_amount_minor bigint check (pay_amount_minor between 0 and 9999999999999),
  add column notes text check (length(notes) <= 2000),
  add column updated_at timestamptz not null default now(),
  add column revision bigint not null default 0 check (revision >= 0),
  add constraint coach_pay_fields_pair check ((pay_basis is null) = (pay_amount_minor is null));
alter table public.student_profiles
  add column contact_phone text check (contact_phone ~ '^[+0-9() -]{3,35}$'),
  add column contact_email text check (length(contact_email) <= 254 and position('@' in contact_email) > 1),
  add column joined_on date,
  add column created_at timestamptz not null default now(),
  add column notes text check (length(notes) <= 2000),
  add column updated_at timestamptz not null default now(),
  add column revision bigint not null default 0 check (revision >= 0);
alter table public.coach_locations add column active boolean not null default true;
alter table public.student_locations add column active boolean not null default true;

alter policy visible_coach_profile on public.coach_profiles
using (
  tennis_private.can_org(organization_id,array['owner']::public.club_role[])
  or exists (select from public.coach_locations as scope
    where scope.organization_id=coach_profiles.organization_id and scope.coach_id=coach_profiles.id and scope.active)
);
alter policy visible_student_profile on public.student_profiles
using (
  tennis_private.can_org(organization_id,array['owner']::public.club_role[])
  or exists (select from public.student_locations as scope
    where scope.organization_id=student_profiles.organization_id and scope.student_id=student_profiles.id and scope.active)
);

create table public.coach_courts (
  organization_id uuid not null,
  location_id uuid not null,
  coach_id uuid not null,
  court_id uuid not null,
  primary key (organization_id,coach_id,location_id,court_id),
  foreign key (organization_id,location_id,coach_id) references public.coach_locations (organization_id,location_id,coach_id),
  foreign key (organization_id,location_id,court_id) references public.courts (organization_id,location_id,id)
);
create index coach_courts_court_idx on public.coach_courts (organization_id,location_id,court_id);
alter table public.coach_courts enable row level security;
revoke all on public.coach_courts from public, anon, authenticated;
grant select on public.coach_courts to authenticated;
create policy manager_reads_coach_courts on public.coach_courts for select to authenticated
using (tennis_private.can_location(organization_id,location_id,array['owner','admin']::public.club_role[]));

create table tennis_private.resource_changes (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  kind public.club_resource_kind not null,
  resource_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  payload_hash bytea not null,
  action text not null check (action in ('created','edited','archived','hours','rate')),
  previous_status public.resource_status,
  current_status public.resource_status,
  branch_ids uuid[] not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id,actor_id,request_id)
);
create index resource_changes_history_idx
  on tennis_private.resource_changes (organization_id,kind,resource_id,occurred_at desc,id desc);
alter table tennis_private.resource_changes enable row level security;
revoke all on tennis_private.resource_changes from public, anon, authenticated;

create function tennis_private.resource_locations(p_org uuid,p_kind public.club_resource_kind,p_id uuid)
returns uuid[] language sql stable set search_path=''
as $$
  select array(
    select c.location_id from public.courts c where p_kind='court' and c.organization_id=p_org and c.id=p_id
    union all
    select c.location_id from public.coach_locations c where p_kind='coach' and c.organization_id=p_org and c.coach_id=p_id and c.active
    union all
    select s.location_id from public.student_locations s where p_kind='student' and s.organization_id=p_org and s.student_id=p_id and s.active
    order by 1
  );
$$;

create function tennis_private.begin_resource_change(p_org uuid,p_request uuid,p_payload jsonb)
returns uuid language plpgsql set search_path=''
as $$
declare
  v_result tennis_private.resource_changes%rowtype;
begin
  if not tennis_private.can_org(p_org,array['owner','admin']::public.club_role[]) then
    raise exception 'resource_access_denied' using errcode='42501';
  end if;
  if p_request is null then raise exception 'resource_request_required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,9053004));
  select * into v_result from tennis_private.resource_changes
    where organization_id=p_org and actor_id=auth.uid() and request_id=p_request;
  if found then
    if v_result.payload_hash<>sha256(convert_to(p_payload::text,'UTF8')) then
      raise exception 'request_payload_mismatch' using errcode='22023';
    end if;
    return v_result.resource_id;
  end if;
  return null;
end;
$$;

create function tennis_private.finish_resource_change(
  p_org uuid,p_kind public.club_resource_kind,p_id uuid,p_request uuid,p_payload jsonb,
  p_action text,p_previous public.resource_status,p_current public.resource_status,p_locations uuid[]
) returns uuid language plpgsql set search_path=''
as $$
begin
  insert into tennis_private.resource_changes
    (organization_id,kind,resource_id,actor_id,request_id,payload_hash,action,previous_status,current_status,branch_ids)
  values (p_org,p_kind,p_id,auth.uid(),p_request,sha256(convert_to(p_payload::text,'UTF8')),p_action,p_previous,p_current,p_locations);
  return p_id;
end;
$$;

create function tennis_private.save_club_resource(
  p_org uuid,p_kind public.club_resource_kind,p_id uuid,p_revision bigint,p_locations uuid[],
  p_values jsonb,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_roles constant public.club_role[] := array['owner','admin']::public.club_role[];
  v_payload jsonb := jsonb_build_array('resource',p_kind,p_id,p_revision,p_locations,p_values);
  v_result uuid;
  v_locations uuid[];
  v_old_locations uuid[];
  v_location uuid;
  v_old_status public.resource_status;
  v_status public.resource_status;
  v_revision bigint;
  v_name text := nullif(btrim(p_values->>'name'),'');
  v_notes text := nullif(btrim(p_values->>'notes'),'');
  v_phone text := nullif(btrim(p_values->>'phone'),'');
  v_email text := nullif(lower(btrim(p_values->>'email')),'');
  v_joined_on date;
  v_archive boolean := coalesce(p_values->>'action'='archive',false);
  v_court_ids uuid[] := '{}'::uuid[];
  v_actual uuid := coalesce(p_id,gen_random_uuid());
  v_action text;
begin
  v_result := tennis_private.begin_resource_change(p_org,p_request,v_payload);
  if v_result is not null then return v_result; end if;
  if p_kind is null or p_values is null or jsonb_typeof(p_values)<>'object' or (v_archive and p_id is null) then
    raise exception 'invalid_resource' using errcode='22023';
  end if;
  if p_id is not null then
    case p_kind
      when 'court' then select status,revision into v_old_status,v_revision from public.courts where organization_id=p_org and id=p_id;
      when 'coach' then select status,revision into v_old_status,v_revision from public.coach_profiles where organization_id=p_org and id=p_id;
      when 'student' then select status,revision into v_old_status,v_revision from public.student_profiles where organization_id=p_org and id=p_id;
    end case;
    if v_old_status is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
  end if;
  v_old_locations := tennis_private.resource_locations(p_org,p_kind,p_id);
  if p_id is not null and cardinality(v_old_locations)=0
    and not tennis_private.can_org(p_org,array['owner']::public.club_role[]) then
    raise exception 'resource_access_denied' using errcode='42501';
  end if;
  if v_archive then
    v_locations := v_old_locations;
    v_status := 'archived';
  else
    select array(select distinct unnest(p_locations) order by 1) into v_locations;
    v_status := nullif(p_values->>'status','')::public.resource_status;
    if v_status is null or v_name is null or length(v_name)>120 or cardinality(v_locations)=0
      or cardinality(v_locations)>100 or array_position(v_locations,null) is not null
      or (p_kind='court' and cardinality(v_locations)<>1)
      or (p_kind='court' and p_id is not null and v_locations<>v_old_locations) then
      raise exception 'invalid_resource' using errcode='22023';
    end if;
  end if;
  -- A profile shared across branches can be changed only by a manager of every affected branch.
  for v_location in select unnest(v_old_locations) union select unnest(v_locations) order by 1 loop
    perform tennis_private.require_location(p_org,v_location,v_roles);
    perform tennis_private.lock_location(p_org,v_location,v_location=any(v_locations) and not v_location=any(v_old_locations));
  end loop;
  if p_id is not null and v_revision is distinct from p_revision then
    raise exception 'resource_stale' using errcode='40001';
  end if;
  if not v_archive and p_kind='coach' then
    select array(select distinct item::uuid from jsonb_array_elements_text(coalesce(p_values->'court_ids','[]'::jsonb)) as item order by 1)
      into v_court_ids;
  end if;
  if p_kind='coach' and exists (select from unnest(v_court_ids) x(id)
    left join public.courts c on c.id=x.id and c.organization_id=p_org and c.location_id=any(v_locations)
    where c.id is null) then
    raise exception 'coach_court_scope_invalid' using errcode='22023';
  end if;

  if p_id is not null and (
    (p_kind='court' and v_status<>'active' and exists (
      select from tennis_private.court_allocations a where a.organization_id=p_org and a.court_id=p_id
        and a.booking_id is not null and a.active and upper(a.slot)>statement_timestamp()))
    or (p_kind='coach' and exists (
      select from tennis_private.coach_allocations a
      join public.sessions s on s.organization_id=a.organization_id and s.id=a.session_id
      join public.bookings b on b.organization_id=s.organization_id and b.id=s.booking_id
      where a.organization_id=p_org and a.coach_id=p_id and a.active and upper(a.slot)>statement_timestamp()
        and (v_status<>'active' or not a.location_id=any(v_locations)
          or (exists (select from public.courts c where c.location_id=a.location_id and c.id=any(v_court_ids))
            and not b.court_id=any(v_court_ids)))))
    or (p_kind='student' and exists (
      select from tennis_private.student_allocations a where a.organization_id=p_org and a.student_id=p_id
        and a.active and upper(a.slot)>statement_timestamp() and (v_status<>'active' or not a.location_id=any(v_locations))))
  ) then raise exception 'resource_has_future_booking' using errcode='23P01'; end if;

  if v_archive then
    case p_kind
      when 'court' then update public.courts set status=v_status,updated_at=now(),revision=revision+1 where id=p_id;
      when 'coach' then update public.coach_profiles set status=v_status,updated_at=now(),revision=revision+1 where id=p_id;
      when 'student' then update public.student_profiles set status=v_status,updated_at=now(),revision=revision+1 where id=p_id;
    end case;
  elsif p_kind='court' then
    if nullif(btrim(p_values->>'surface'),'') is null then raise exception 'court_surface_required' using errcode='22023'; end if;
    insert into public.courts (id,organization_id,location_id,name,surface,status,capacity,amenities,notes)
    values (v_actual,p_org,v_locations[1],v_name,btrim(p_values->>'surface'),v_status,
      coalesce((p_values->>'capacity')::smallint,4),
      array(select item from jsonb_array_elements_text(coalesce(p_values->'amenities','[]'::jsonb)) as item),v_notes)
    on conflict (id) do update set name=excluded.name,surface=excluded.surface,status=excluded.status,
      capacity=excluded.capacity,amenities=excluded.amenities,notes=excluded.notes,updated_at=now(),revision=courts.revision+1;
  else
    v_joined_on := nullif(p_values->>'joined_on','')::date;
    if p_kind='coach' then
      insert into public.coach_profiles (id,organization_id,name,status,specialty,qualification,contact_phone,contact_email,
        joined_on,pay_basis,pay_amount_minor,notes)
      values (v_actual,p_org,v_name,v_status,nullif(btrim(p_values->>'specialty'),''),nullif(btrim(p_values->>'qualification'),''),
        v_phone,v_email,v_joined_on,nullif(p_values->>'pay_basis',''),nullif(p_values->>'pay_amount_minor','')::bigint,v_notes)
      on conflict (id) do update set name=excluded.name,status=excluded.status,specialty=excluded.specialty,
        qualification=excluded.qualification,contact_phone=excluded.contact_phone,contact_email=excluded.contact_email,
        joined_on=excluded.joined_on,pay_basis=excluded.pay_basis,pay_amount_minor=excluded.pay_amount_minor,
        notes=excluded.notes,updated_at=now(),revision=coach_profiles.revision+1;
      update public.coach_locations set active=false where organization_id=p_org and coach_id=v_actual
        and active and not location_id=any(v_locations);
      insert into public.coach_locations (organization_id,location_id,coach_id)
        select p_org,id,v_actual from unnest(v_locations) as x(id)
        on conflict (organization_id,location_id,coach_id) do update set active=true;
      delete from public.coach_courts where organization_id=p_org and coach_id=v_actual;
      insert into public.coach_courts (organization_id,location_id,coach_id,court_id)
        select p_org,c.location_id,v_actual,c.id from public.courts c where c.organization_id=p_org and c.id=any(v_court_ids);
    else
      insert into public.student_profiles (id,organization_id,name,status,skill_level,contact_phone,contact_email,joined_on,notes)
      values (v_actual,p_org,v_name,v_status,nullif(btrim(p_values->>'skill_level'),''),v_phone,v_email,v_joined_on,v_notes)
      on conflict (id) do update set name=excluded.name,status=excluded.status,skill_level=excluded.skill_level,
        contact_phone=excluded.contact_phone,contact_email=excluded.contact_email,joined_on=excluded.joined_on,
        notes=excluded.notes,updated_at=now(),revision=student_profiles.revision+1;
      update public.student_locations set active=false where organization_id=p_org and student_id=v_actual
        and active and not location_id=any(v_locations);
      insert into public.student_locations (organization_id,location_id,student_id)
        select p_org,id,v_actual from unnest(v_locations) as x(id)
        on conflict (organization_id,location_id,student_id) do update set active=true;
    end if;
  end if;

  v_action := case when v_archive then 'archived' when p_id is null then 'created' else 'edited' end;
  return tennis_private.finish_resource_change(p_org,p_kind,v_actual,p_request,v_payload,v_action,v_old_status,v_status,v_locations);
end;
$$;

create function tennis_private.resource_history(p_org uuid,p_kind public.club_resource_kind,p_id uuid)
returns table (occurred_at timestamptz,action text,actor text,previous_status public.resource_status,current_status public.resource_status)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not tennis_private.can_org(p_org,array['owner','admin']::public.club_role[]) or (
    not tennis_private.can_org(p_org,array['owner']::public.club_role[]) and not exists (
      select from unnest(tennis_private.resource_locations(p_org,p_kind,p_id)) loc(id)
      where tennis_private.can_location(p_org,loc.id,array['admin']::public.club_role[])
    )) then raise exception 'resource_access_denied' using errcode='42501'; end if;
  return query
    select h.occurred_at,h.action,p.display_name,h.previous_status,h.current_status
    from tennis_private.resource_changes h left join public.profiles p on p.user_id=h.actor_id
    where h.organization_id=p_org and h.kind=p_kind and h.resource_id=p_id
      and (tennis_private.can_org(p_org,array['owner']::public.club_role[])
        or exists (select from unnest(h.branch_ids) loc(id) where tennis_private.can_location(p_org,loc.id,array['admin']::public.club_role[])))
    order by h.occurred_at desc,h.id desc limit 30;
end;
$$;

create function tennis_private.check_directory_allocation() returns trigger
language plpgsql set search_path=''
as $$
begin
  if not new.active then return new; end if;
  if tg_table_name='coach_allocations' then
    if not exists (select from public.coach_locations l where l.organization_id=new.organization_id
      and l.location_id=new.location_id and l.coach_id=new.coach_id and l.active) then
      raise exception 'coach_unavailable' using errcode='22023';
    end if;
    if exists (select from public.coach_courts c where c.organization_id=new.organization_id
      and c.location_id=new.location_id and c.coach_id=new.coach_id) and not exists (
        select from public.sessions s join public.bookings b on b.organization_id=s.organization_id and b.id=s.booking_id
        join public.coach_courts c on c.organization_id=b.organization_id and c.location_id=b.location_id
          and c.coach_id=s.coach_id and c.court_id=b.court_id
        where s.organization_id=new.organization_id and s.id=new.session_id
      ) then raise exception 'coach_court_not_allowed' using errcode='22023'; end if;
  elsif not exists (select from public.student_locations l where l.organization_id=new.organization_id
      and l.location_id=new.location_id and l.student_id=new.student_id and l.active) then
    raise exception 'student_unavailable' using errcode='22023';
  end if;
  return new;
end;
$$;

create trigger enforce_coach_directory before insert or update of slot,active on tennis_private.coach_allocations
for each row execute function tennis_private.check_directory_allocation();
create trigger enforce_student_directory before insert or update of slot,active on tennis_private.student_allocations
for each row execute function tennis_private.check_directory_allocation();

create function public.save_club_resource(
  p_org uuid,p_kind public.club_resource_kind,p_id uuid,p_revision bigint,p_locations uuid[],p_values jsonb,p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.save_club_resource(p_org,p_kind,p_id,p_revision,p_locations,p_values,p_request); $$;

create function public.resource_history(p_org uuid,p_kind public.club_resource_kind,p_id uuid)
returns table (occurred_at timestamptz,action text,actor text,previous_status public.resource_status,current_status public.resource_status)
language sql stable security invoker set search_path=''
as $$ select * from tennis_private.resource_history(p_org,p_kind,p_id); $$;

revoke all on function tennis_private.resource_locations(uuid,public.club_resource_kind,uuid),
  tennis_private.begin_resource_change(uuid,uuid,jsonb),
  tennis_private.finish_resource_change(uuid,public.club_resource_kind,uuid,uuid,jsonb,text,public.resource_status,public.resource_status,uuid[]),
  tennis_private.check_directory_allocation() from public,anon,authenticated;
revoke all on function public.save_club_resource(uuid,public.club_resource_kind,uuid,bigint,uuid[],jsonb,uuid),
  tennis_private.save_club_resource(uuid,public.club_resource_kind,uuid,bigint,uuid[],jsonb,uuid),
  public.resource_history(uuid,public.club_resource_kind,uuid),
  tennis_private.resource_history(uuid,public.club_resource_kind,uuid) from public,anon,authenticated;
grant execute on function public.save_club_resource(uuid,public.club_resource_kind,uuid,bigint,uuid[],jsonb,uuid),
  tennis_private.save_club_resource(uuid,public.club_resource_kind,uuid,bigint,uuid[],jsonb,uuid),
  public.resource_history(uuid,public.club_resource_kind,uuid),
  tennis_private.resource_history(uuid,public.club_resource_kind,uuid) to authenticated;

commit;
