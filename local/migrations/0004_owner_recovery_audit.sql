create function tennis_runtime.record_owner_recovery(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_members
    where user_id = p_user and role = 'owner' and active
    order by organization_id limit 1 for share;
  if not found then
    raise exception 'member_access_denied' using errcode = '42501';
  end if;

  insert into tennis_private.access_audit
    (organization_id, actor_user_id, target_user_id, action, current_access)
  values (v_org, null, p_user, 'recovery_link_issued',
    jsonb_build_object('role', 'owner', 'source', 'cli'));
end;
$$;

revoke all on function tennis_runtime.record_owner_recovery(uuid) from public, anon, authenticated;
grant execute on function tennis_runtime.record_owner_recovery(uuid) to tennis_web;
