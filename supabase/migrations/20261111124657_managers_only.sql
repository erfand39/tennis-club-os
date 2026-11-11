begin;

alter table tennis_private.access_audit alter column actor_user_id drop not null;
alter table tennis_private.access_audit drop constraint access_audit_action_check;
alter table tennis_private.access_audit add constraint access_audit_action_check
  check (action in ('access_changed', 'membership_left', 'club_created', 'non_manager_access_retired'));

insert into tennis_private.access_audit (organization_id,target_user_id,action,previous_access,current_access)
select organization_id,user_id,'non_manager_access_retired',
  jsonb_build_object('role',role,'active',true),jsonb_build_object('role',role,'active',false)
from public.organization_members where active and role not in ('owner','admin');

update public.organization_members set active=false where active and role not in ('owner','admin');
alter table public.organization_members add constraint active_manager_only
  check (not active or role in ('owner','admin'));

-- Directory records keep their primary keys and all historical references.
update public.coach_profiles set user_id=null where user_id is not null;
update public.student_profiles set user_id=null where user_id is not null;
alter table public.coach_profiles add constraint coach_directory_only check (user_id is null);
alter table public.student_profiles add constraint student_directory_only check (user_id is null);

create or replace function tennis_private.club_members(p_org uuid)
returns table (
  user_id uuid, email text, display_name text, role public.club_role, active boolean,
  location_ids uuid[], person_id uuid
) language plpgsql stable security definer set search_path = ''
as $$
begin
  if not tennis_private.can_org(p_org, array['owner']::public.club_role[]) then
    raise exception 'member_access_denied' using errcode='42501';
  end if;
  return query
    select m.user_id,u.email::text,p.display_name,m.role,m.active,
      array(select s.location_id from public.member_locations as s
        where s.organization_id=p_org and s.user_id=m.user_id order by s.location_id),
      null::uuid
    from public.organization_members as m join auth.users as u on u.id=m.user_id
    left join public.profiles as p on p.user_id=m.user_id
    where m.organization_id=p_org and m.role in ('owner','admin')
    order by coalesce(p.display_name,u.email::text),m.user_id;
end;
$$;

create or replace function tennis_private.set_club_member(
  p_org uuid, p_user uuid, p_role public.club_role, p_active boolean, p_locations uuid[], p_person uuid
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_previous public.organization_members%rowtype;
  v_old_locations uuid[];
  v_locations uuid[];
begin
  if not tennis_private.can_org(p_org, array['owner']::public.club_role[]) or v_actor=p_user then
    raise exception 'member_access_denied' using errcode='42501';
  end if;
  if p_role is null or p_role not in ('owner','admin') or p_person is not null then
    raise exception 'manager_role_required' using errcode='22023';
  end if;
  if p_user is null or p_active is null or p_locations is null or array_position(p_locations,null) is not null then
    raise exception 'invalid_member_access' using errcode='22023';
  end if;
  update public.organizations set access_revision=access_revision+1 where id=p_org;
  if not tennis_private.can_org(p_org,array['owner']::public.club_role[]) then
    raise exception 'member_access_denied' using errcode='42501';
  end if;

  select array(select distinct unnest(p_locations) order by 1) into v_locations;
  if (p_role='owner' and cardinality(v_locations)<>0)
    or (p_role='admin' and p_active and cardinality(v_locations)=0)
    or exists (select from unnest(v_locations) as a(id)
      left join public.locations as l on l.organization_id=p_org and l.id=a.id where l.id is null) then
    raise exception 'invalid_member_locations' using errcode='22023';
  end if;

  select * into v_previous from public.organization_members where organization_id=p_org and user_id=p_user;
  select array(select location_id from public.member_locations
    where organization_id=p_org and user_id=p_user order by location_id) into v_old_locations;
  if v_previous.role=p_role and v_previous.active=p_active and v_old_locations=v_locations then return; end if;

  insert into public.organization_members (organization_id,user_id,role,active)
  values (p_org,p_user,p_role,p_active)
  on conflict (organization_id,user_id) do update set role=excluded.role,active=excluded.active;
  delete from public.member_locations where organization_id=p_org and user_id=p_user;
  insert into public.member_locations (organization_id,location_id,user_id)
    select p_org,a.id,p_user from unnest(v_locations) as a(id);

  insert into tennis_private.access_audit (organization_id,actor_user_id,target_user_id,action,previous_access,current_access)
  values (p_org,v_actor,p_user,'access_changed',
    case when v_previous.user_id is not null then jsonb_build_object(
      'role',v_previous.role,'active',v_previous.active,'locations',v_old_locations) end,
    jsonb_build_object('role',p_role,'active',p_active,'locations',v_locations));
end;
$$;

commit;
