begin;

alter table public.bookings add column revision bigint not null default 0;

create function tennis_private.bump_booking_revision() returns trigger
language plpgsql set search_path=''
as $$
begin
  if old.slot is distinct from new.slot or old.status is distinct from new.status then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

create trigger booking_revision before update of slot,status on public.bookings
for each row execute function tennis_private.bump_booking_revision();

create function tennis_private.edit_calendar_booking(
  p_org uuid, p_location uuid, p_booking uuid, p_revision bigint,
  p_start timestamptz, p_reason text, p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_action constant text := 'edit_calendar_booking';
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_result uuid;
  v_revision bigint;
begin
  if p_revision is null or p_revision<0 or (p_start is null)=(p_reason is null) then
    raise exception 'invalid_calendar_edit' using errcode='22023';
  end if;
  v_result := tennis_private.begin_operation(p_org,p_location,v_actor,v_action,p_request,
    jsonb_build_array(p_booking,p_revision,extract(epoch from p_start),p_reason));
  if v_result is not null then return v_result; end if;

  -- Take the same branch lock as the underlying commands before checking the revision.
  perform 1 from public.locations where organization_id=p_org and id=p_location for no key update;
  select b.revision into v_revision from public.bookings b
    where (b.organization_id,b.location_id,b.id)=(p_org,p_location,p_booking) for no key update;
  if not found then raise exception 'booking_access_denied' using errcode='42501'; end if;
  if v_revision<>p_revision then raise exception 'booking_stale' using errcode='22023'; end if;

  -- The existing command writes the audit event and all dependent rows in this transaction.
  if p_start is null then
    v_result := tennis_private.cancel_booking(p_org,p_location,p_booking,p_reason,gen_random_uuid());
  else
    v_result := tennis_private.reschedule_booking(p_org,p_location,p_booking,p_start,gen_random_uuid());
  end if;
  update tennis_private.operation_requests set result_id=v_result
    where organization_id=p_org and location_id=p_location and actor_user_id=v_actor
      and command=v_action and request_id=p_request;
  return v_result;
end;
$$;

create function public.edit_calendar_booking(
  p_org uuid, p_location uuid, p_booking uuid, p_revision bigint,
  p_start timestamptz, p_reason text, p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$
  select tennis_private.edit_calendar_booking(p_org,p_location,p_booking,p_revision,p_start,p_reason,p_request);
$$;

create index audit_events_booking_history_idx on tennis_private.audit_events (organization_id,location_id,target_id,id desc)
  where action in ('create_booking','reschedule_booking','cancel_booking');

create function tennis_private.calendar_booking_history(p_org uuid,p_location uuid,p_booking uuid)
returns table (action text, created_at timestamptz, old_start timestamptz, new_start timestamptz)
language sql stable security definer set search_path=''
as $$
  select a.action,a.created_at,lower((a.details->>'old_slot')::tstzrange),lower((a.details->>'new_slot')::tstzrange)
  from tennis_private.audit_events a
  where a.organization_id=p_org and a.location_id=p_location and a.target_id=p_booking
    and tennis_private.can_location(p_org,p_location,array['owner','admin']::public.club_role[])
    and a.action in ('create_booking','reschedule_booking','cancel_booking')
  order by a.id desc limit 50
$$;

create function public.calendar_booking_history(p_org uuid,p_location uuid,p_booking uuid)
returns table (action text, created_at timestamptz, old_start timestamptz, new_start timestamptz)
language sql stable security invoker set search_path=''
as $$ select * from tennis_private.calendar_booking_history(p_org,p_location,p_booking); $$;

revoke all on function tennis_private.bump_booking_revision() from public,anon,authenticated;
revoke all on function
  tennis_private.edit_calendar_booking(uuid,uuid,uuid,bigint,timestamptz,text,uuid),
  public.edit_calendar_booking(uuid,uuid,uuid,bigint,timestamptz,text,uuid),
  tennis_private.calendar_booking_history(uuid,uuid,uuid),
  public.calendar_booking_history(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function
  tennis_private.edit_calendar_booking(uuid,uuid,uuid,bigint,timestamptz,text,uuid),
  public.edit_calendar_booking(uuid,uuid,uuid,bigint,timestamptz,text,uuid),
  tennis_private.calendar_booking_history(uuid,uuid,uuid),
  public.calendar_booking_history(uuid,uuid,uuid) to authenticated;

commit;
