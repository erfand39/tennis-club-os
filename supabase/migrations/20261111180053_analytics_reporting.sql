begin;

create table public.student_level_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  previous_level text,
  current_level text,
  effective_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id,student_id) references public.student_profiles(organization_id,id),
  check (previous_level is distinct from current_level)
);
create index student_level_changes_period_idx
  on public.student_level_changes(organization_id,student_id,effective_at,id);
alter table public.student_level_changes enable row level security;
revoke all on public.student_level_changes from public,anon,authenticated;
grant select on public.student_level_changes to authenticated;
create policy managers_read_student_level_changes on public.student_level_changes
for select to authenticated using (
  exists (select from public.student_profiles s
    where (s.organization_id,s.id)=(student_level_changes.organization_id,student_level_changes.student_id))
  and tennis_private.can_org(organization_id,array['owner','admin']::public.club_role[])
);

create function tennis_private.record_student_level_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.student_level_changes(organization_id,student_id,previous_level,current_level)
  values (new.organization_id,new.id,old.skill_level,new.skill_level);
  return new;
end;
$$;
revoke all on function tennis_private.record_student_level_change() from public,anon,authenticated;
create trigger record_student_level_change after update of skill_level on public.student_profiles
for each row when (old.skill_level is distinct from new.skill_level)
execute function tennis_private.record_student_level_change();

-- Only return the active time ranges of the one court the caller can report on.
create function tennis_private.report_court_active(p_org uuid,p_location uuid,p_court uuid,p_span tstzrange)
returns tstzmultirange language sql stable security definer set search_path=''
as $$
  with court as (
    select status from public.courts
    where (organization_id,location_id,id)=(p_org,p_location,p_court)
      and tennis_private.can_location(p_org,p_location,array['owner','admin']::public.club_role[])
  ), changes as (
    select h.id,h.occurred_at,h.previous_status,h.current_status
    from tennis_private.resource_changes h cross join court
    where (h.organization_id,h.kind,h.resource_id)=(p_org,'court',p_court)
      and h.previous_status is distinct from h.current_status
  ), spans as (
    select tstzrange(occurred_at,lead(occurred_at) over (order by occurred_at,id),'[)') as span,current_status as status
    from changes
    union all
    select tstzrange(null,first_change.occurred_at,'[)'),
      case when first_change.id is null then court.status else first_change.previous_status end
    from court left join lateral (select * from changes order by occurred_at,id limit 1) first_change on true
  )
  select coalesce(range_agg(span * p_span),'{}'::tstzmultirange) from spans where status='active';
$$;
revoke all on function tennis_private.report_court_active(uuid,uuid,uuid,tstzrange) from public,anon,authenticated;
grant execute on function tennis_private.report_court_active(uuid,uuid,uuid,tstzrange) to authenticated;

create function tennis_private.report_minutes(p_spans tstzmultirange)
returns numeric language sql immutable strict set search_path=''
as $$
  select coalesce(sum(extract(epoch from (upper(span)-lower(span)))),0) / 60
  from unnest(p_spans) as times(span);
$$;
revoke all on function tennis_private.report_minutes(tstzmultirange) from public,anon,authenticated;
grant execute on function tennis_private.report_minutes(tstzmultirange) to authenticated;

create index sessions_report_actual_idx on public.sessions using gist (organization_id,location_id,actual_slot)
  where status='completed';
create index court_maintenance_report_idx on public.court_maintenance_blocks using gist (court_id,slot)
  where released_at is null;

commit;
