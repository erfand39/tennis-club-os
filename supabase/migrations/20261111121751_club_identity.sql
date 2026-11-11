begin;

alter table public.organizations
  add column access_revision bigint not null default 0 check (access_revision >= 0);

create table tennis_private.access_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  actor_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in ('access_changed', 'membership_left', 'club_created')),
  previous_access jsonb,
  current_access jsonb not null,
  occurred_at timestamptz not null default now()
);
alter table tennis_private.access_audit enable row level security;
revoke all on tennis_private.access_audit from public, anon, authenticated;
create index access_audit_scope_idx on tennis_private.access_audit (organization_id, occurred_at desc, id);

create function tennis_private.update_my_profile(p_display_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(btrim(p_display_name), '');
begin
  if v_user is null then raise exception 'profile_access_denied' using errcode = '42501'; end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name) values (v_user, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name;
end;
$$;

create function tennis_private.club_members(p_org uuid)
returns table (
  user_id uuid, email text, display_name text, role public.club_role, active boolean,
  location_ids uuid[], person_id uuid
) language plpgsql stable security definer set search_path = ''
as $$
begin
  if not tennis_private.can_org(p_org, array['owner']::public.club_role[]) then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, p.display_name, m.role, m.active,
      array(select scope.location_id from public.member_locations as scope
        where scope.organization_id = p_org and scope.user_id = m.user_id order by scope.location_id),
      case m.role when 'coach' then c.id when 'student' then s.id end
    from public.organization_members as m join auth.users as u on u.id = m.user_id
    left join public.profiles as p on p.user_id = m.user_id
    left join public.coach_profiles as c on c.organization_id = p_org and c.user_id = m.user_id
    left join public.student_profiles as s on s.organization_id = p_org and s.user_id = m.user_id
    where m.organization_id = p_org
    order by coalesce(p.display_name, u.email::text), m.user_id;
end;
$$;

create function tennis_private.set_club_member(
  p_org uuid, p_user uuid, p_role public.club_role, p_active boolean, p_locations uuid[], p_person uuid
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_roles constant public.club_role[] := array['owner']::public.club_role[];
  v_previous public.organization_members%rowtype;
  v_old_locations uuid[];
  v_locations uuid[];
  v_old_person uuid;
  v_person uuid;
begin
  if not tennis_private.can_org(p_org, v_owner_roles) or v_actor = p_user then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;
  if p_user is null or p_role is null or p_active is null or p_locations is null or array_position(p_locations, null) is not null then
    raise exception 'invalid_member_access' using errcode = '22023';
  end if;

  -- Serialize membership edits and recheck the acting owner's membership.
  update public.organizations set access_revision = access_revision + 1 where id = p_org;
  if not tennis_private.can_org(p_org, v_owner_roles) then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;

  select array(select distinct unnest(p_locations) order by 1) into v_locations;
  if (p_role = 'owner' and cardinality(v_locations) <> 0)
    or (p_role <> 'owner' and p_active and cardinality(v_locations) = 0)
    or exists (
      select from unnest(v_locations) as requested(id)
      left join public.locations as l on l.organization_id = p_org and l.id = requested.id
      where l.id is null
    ) then
    raise exception 'invalid_member_locations' using errcode = '22023';
  end if;

  select * into v_previous from public.organization_members where organization_id = p_org and user_id = p_user;
  select array(select location_id from public.member_locations where organization_id = p_org and user_id = p_user order by location_id)
    into v_old_locations;
  if v_previous.role = 'coach' then
    select id into v_old_person from public.coach_profiles where organization_id = p_org and user_id = p_user;
  elsif v_previous.role = 'student' then
    select id into v_old_person from public.student_profiles where organization_id = p_org and user_id = p_user;
  end if;

  if p_person is not null then
    if p_role = 'coach' then
      perform 1 from public.coach_profiles as c where c.organization_id = p_org and c.id = p_person
        and (c.user_id is null or c.user_id = p_user)
        and exists (select from public.coach_locations as s where s.organization_id = p_org
          and s.coach_id = p_person and s.location_id = any(v_locations))
        for no key update;
    elsif p_role = 'student' then
      perform 1 from public.student_profiles as s where s.organization_id = p_org and s.id = p_person
        and (s.user_id is null or s.user_id = p_user)
        and exists (select from public.student_locations as scope where scope.organization_id = p_org
          and scope.student_id = p_person and scope.location_id = any(v_locations))
        for no key update;
    else
      raise exception 'invalid_member_person' using errcode = '22023';
    end if;
    if not found then raise exception 'invalid_member_person' using errcode = '22023'; end if;
  end if;
  v_person := coalesce(p_person, case when v_previous.role = p_role then v_old_person end);

  if v_previous.role = p_role and v_previous.active = p_active and v_old_locations = v_locations
    and v_old_person is not distinct from v_person then
    return;
  end if;

  insert into public.organization_members (organization_id, user_id, role, active)
    values (p_org, p_user, p_role, p_active)
    on conflict (organization_id, user_id) do update set role = excluded.role, active = excluded.active;

  delete from public.member_locations where organization_id = p_org and user_id = p_user;
  insert into public.member_locations (organization_id, location_id, user_id)
    select p_org, l.id, p_user from unnest(v_locations) as l(id);

  if v_old_person is distinct from v_person or v_previous.role is distinct from p_role then
    update public.coach_profiles set user_id = null where organization_id = p_org and user_id = p_user;
    update public.student_profiles set user_id = null where organization_id = p_org and user_id = p_user;
    if p_role = 'coach' and v_person is not null then
      update public.coach_profiles set user_id = p_user where organization_id = p_org and id = v_person;
    elsif p_role = 'student' and v_person is not null then
      update public.student_profiles set user_id = p_user where organization_id = p_org and id = v_person;
    end if;
  end if;

  insert into tennis_private.access_audit (organization_id, actor_user_id, target_user_id, action, previous_access, current_access)
  values (p_org, v_actor, p_user, 'access_changed',
    case when v_previous.user_id is not null then
      jsonb_build_object('role', v_previous.role, 'active', v_previous.active, 'locations', v_old_locations, 'person', v_old_person) end,
    jsonb_build_object('role', p_role, 'active', p_active, 'locations', v_locations, 'person', v_person));
end;
$$;

create function tennis_private.leave_club(p_org uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.club_role;
begin
  if not tennis_private.can_org(p_org) then raise exception 'member_access_denied' using errcode = '42501'; end if;
  update public.organizations set access_revision = access_revision + 1 where id = p_org;
  update public.organization_members set active = false
  where organization_id = p_org and user_id = v_user and active and role <> 'owner'
  returning role into v_role;
  if not found then raise exception 'member_cannot_leave' using errcode = '42501'; end if;
  insert into tennis_private.access_audit (organization_id, actor_user_id, target_user_id, action, previous_access, current_access)
    values (p_org, v_user, v_user, 'membership_left',
      jsonb_build_object('role', v_role, 'active', true), jsonb_build_object('role', v_role, 'active', false));
end;
$$;

create function public.update_my_profile(p_display_name text) returns void
language sql security invoker set search_path = ''
as $$ select tennis_private.update_my_profile(p_display_name); $$;

create function public.club_members(p_org uuid)
returns table (
  user_id uuid, email text, display_name text, role public.club_role, active boolean,
  location_ids uuid[], person_id uuid
) language sql stable security invoker set search_path = ''
as $$ select * from tennis_private.club_members(p_org); $$;

create function public.set_club_member(
  p_org uuid, p_user uuid, p_role public.club_role, p_active boolean, p_locations uuid[], p_person uuid default null
) returns void language sql security invoker set search_path = ''
as $$ select tennis_private.set_club_member(p_org, p_user, p_role, p_active, p_locations, p_person); $$;

create function public.leave_club(p_org uuid) returns void
language sql security invoker set search_path = ''
as $$ select tennis_private.leave_club(p_org); $$;

revoke all on function
  public.update_my_profile(text), tennis_private.update_my_profile(text),
  public.club_members(uuid), tennis_private.club_members(uuid),
  public.set_club_member(uuid, uuid, public.club_role, boolean, uuid[], uuid),
  tennis_private.set_club_member(uuid, uuid, public.club_role, boolean, uuid[], uuid),
  public.leave_club(uuid), tennis_private.leave_club(uuid)
  from public, anon, authenticated;
grant execute on function
  public.update_my_profile(text), tennis_private.update_my_profile(text),
  public.club_members(uuid), tennis_private.club_members(uuid),
  public.set_club_member(uuid, uuid, public.club_role, boolean, uuid[], uuid),
  tennis_private.set_club_member(uuid, uuid, public.club_role, boolean, uuid[], uuid),
  public.leave_club(uuid), tennis_private.leave_club(uuid)
  to authenticated;

commit;
