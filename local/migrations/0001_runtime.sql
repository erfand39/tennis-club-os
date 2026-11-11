create schema tennis_runtime;
revoke all on schema tennis_runtime from public, anon, authenticated;
grant usage on schema tennis_runtime to tennis_web;

create table tennis_runtime.web_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  credentials text not null,
  access_expires_at timestamptz not null,
  expires_at timestamptz not null
);
create index web_sessions_user_idx on tennis_runtime.web_sessions (user_id);
create index web_sessions_expiry_idx on tennis_runtime.web_sessions (expires_at);
alter table tennis_runtime.web_sessions enable row level security;
create policy web_session_service on tennis_runtime.web_sessions for all to tennis_web using (true) with check (true);
revoke all on tennis_runtime.web_sessions from public, anon, authenticated;
grant select, insert, update, delete on tennis_runtime.web_sessions to tennis_web;

create function tennis_runtime.is_configured() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select from public.organization_members where role = 'owner'); $$;

create function tennis_runtime.bootstrap_club(p_user uuid, p_name text, p_timezone text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  perform pg_advisory_xact_lock(9053001);
  if tennis_runtime.is_configured() then
    raise exception 'club_already_configured' using errcode = '23505';
  end if;
  insert into public.organizations (name) values ('باشگاه تنیس سام') returning id into v_org;
  insert into public.locations (organization_id, name, timezone) values (v_org, 'شعبهٔ مرکزی', p_timezone);
  insert into public.organization_members (organization_id, user_id, role) values (v_org, p_user, 'owner');
  insert into public.profiles (user_id, display_name) values (p_user, btrim(p_name))
    on conflict (user_id) do update set display_name = excluded.display_name;
  insert into tennis_private.access_audit (organization_id, actor_user_id, target_user_id, action, current_access)
    values (v_org, p_user, p_user, 'club_created', jsonb_build_object('role', 'owner', 'active', true));
  return v_org;
end;
$$;

create function tennis_runtime.owner_email(p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select from public.organization_members m join auth.users u on u.id = m.user_id
    where lower(u.email) = lower(p_email) and m.role = 'owner' and m.active
  );
$$;

revoke all on all functions in schema tennis_runtime from public, anon, authenticated;
grant execute on function tennis_runtime.is_configured(), tennis_runtime.bootstrap_club(uuid, text, text),
  tennis_runtime.owner_email(text) to tennis_web;
