begin;

alter table tennis_private.access_audit drop constraint access_audit_action_check;
alter table tennis_private.access_audit add constraint access_audit_action_check
  check (action in ('access_changed', 'membership_left', 'club_created',
    'non_manager_access_retired', 'recovery_link_issued'));

create function tennis_private.record_member_recovery(p_org uuid, p_target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.club_role;
begin
  if v_actor is null or v_actor = p_target
    or not tennis_private.can_org(p_org, array['owner']::public.club_role[]) then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;

  perform 1 from public.organizations where id = p_org for share;
  if not tennis_private.can_org(p_org, array['owner']::public.club_role[]) then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;
  select role into v_role from public.organization_members
    where organization_id = p_org and user_id = p_target and active
    for share;
  if not found then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;

  insert into tennis_private.access_audit
    (organization_id, actor_user_id, target_user_id, action, current_access)
  values (p_org, v_actor, p_target, 'recovery_link_issued',
    jsonb_build_object('role', v_role, 'source', 'panel'));
end;
$$;

revoke all on function tennis_private.record_member_recovery(uuid, uuid) from public, anon;
grant execute on function tennis_private.record_member_recovery(uuid, uuid) to authenticated;

create function public.record_member_recovery(p_org uuid, p_target uuid) returns void
language sql security invoker set search_path = ''
as $$ select tennis_private.record_member_recovery(p_org, p_target); $$;

revoke all on function public.record_member_recovery(uuid, uuid) from public, anon;
grant execute on function public.record_member_recovery(uuid, uuid) to authenticated;

commit;
