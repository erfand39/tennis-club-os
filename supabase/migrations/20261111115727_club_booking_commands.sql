begin;

create function tennis_private.make_slot(p_start timestamptz, p_end timestamptz) returns tstzrange
language plpgsql set search_path = ''
as $$
begin
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
      or p_end <= p_start or extract(second from p_start) <> 0 or extract(second from p_end) <> 0 then
    raise exception 'invalid_slot' using errcode = '22023';
  end if;
  return tstzrange(p_start, p_end, '[)');
end;
$$;

create function tennis_private.lock_location(p_org uuid, p_location uuid, p_active boolean default true)
returns public.locations language plpgsql set search_path = ''
as $$
declare
  v_location public.locations%rowtype;
begin
  update public.locations set schedule_revision = schedule_revision + 1
  where organization_id = p_org and id = p_location and (not p_active or active)
  returning * into v_location;
  if not found then
    raise exception 'location_unavailable' using errcode = '22023';
  end if;
  return v_location;
end;
$$;

create function tennis_private.local_slot(p_slot tstzrange, p_timezone text)
returns table (play_date date, local_minutes int4range) language plpgsql stable set search_path = ''
as $$
declare
  v_start timestamp := timezone(p_timezone, lower(p_slot));
  v_end timestamp := timezone(p_timezone, upper(p_slot));
  v_start_minute integer := extract(hour from v_start)::integer * 60 + extract(minute from v_start)::integer;
  v_end_minute integer := extract(hour from v_end)::integer * 60 + extract(minute from v_end)::integer;
begin
  play_date := v_start::date;
  if v_end::date = play_date + 1 and v_end::time = time '00:00' then
    v_end_minute := 1440;
  elsif v_end::date <> play_date or v_end_minute <= v_start_minute then
    raise exception 'slot_crosses_local_day' using errcode = '22023';
  end if;
  local_minutes := int4range(v_start_minute, v_end_minute, '[)');
  return next;
end;
$$;

create function tennis_private.check_booking_slot(
  p_org uuid, p_location uuid, p_court uuid, p_slot tstzrange, p_timezone text, p_coach uuid
) returns void language plpgsql set search_path = ''
as $$
declare
  v_status public.resource_status;
  v_date date;
  v_minutes int4range;
  v_open int4multirange;
  v_coach_hours int4multirange;
begin
  if lower(p_slot) < date_trunc('minute', statement_timestamp())
      or upper(p_slot) - lower(p_slot) > interval '24 hours' then
    raise exception 'booking_time_unavailable' using errcode = '22023';
  end if;
  select status into v_status from public.courts
    where (organization_id, location_id, id) = (p_org, p_location, p_court) for share;
  if not found or v_status <> 'active' then
    raise exception 'court_unavailable' using errcode = '22023';
  end if;

  select s.play_date, s.local_minutes into strict v_date, v_minutes
    from tennis_private.local_slot(p_slot, p_timezone) as s;
  select range_agg(h.local_minutes) into v_open from public.court_operating_hours as h
    where (h.organization_id, h.location_id, h.court_id) = (p_org, p_location, p_court)
      and h.weekday = extract(isodow from v_date) and h.valid_dates @> v_date;
  if not coalesce(v_open @> v_minutes, false) then
    raise exception 'outside_court_hours' using errcode = '22023';
  end if;
  if exists (select from public.location_closures as c
      where (c.organization_id, c.location_id) = (p_org, p_location) and c.released_at is null and c.slot && p_slot) then
    raise exception 'location_closed' using errcode = '23P01';
  end if;

  if p_coach is not null then
    select c.status into v_status from public.coach_profiles as c
    join public.coach_locations as scope on (scope.organization_id, scope.coach_id) = (c.organization_id, c.id)
    where (scope.organization_id, scope.location_id, scope.coach_id) = (p_org, p_location, p_coach)
    for share of c;
    if not found or v_status <> 'active' then
      raise exception 'coach_unavailable' using errcode = '22023';
    end if;
    select range_agg(h.local_minutes) into v_coach_hours from public.coach_availability as h
    where (h.organization_id, h.location_id, h.coach_id) = (p_org, p_location, p_coach)
      and h.weekday = extract(isodow from v_date) and h.valid_dates @> v_date;
    if not coalesce(v_coach_hours @> v_minutes, false) then
      raise exception 'outside_coach_hours' using errcode = '22023';
    end if;
  end if;
end;
$$;

create function tennis_private.check_student(p_org uuid, p_location uuid, p_student uuid)
returns void language plpgsql set search_path = ''
as $$
declare
  v_status public.resource_status;
begin
  select s.status into v_status from public.student_profiles as s
  join public.student_locations as scope on (scope.organization_id, scope.student_id) = (s.organization_id, s.id)
  where (scope.organization_id, scope.location_id, scope.student_id) = (p_org, p_location, p_student)
  for share of s;
  if not found or v_status <> 'active' then
    raise exception 'student_unavailable' using errcode = '22023';
  end if;
end;
$$;

create function tennis_private.insert_participant(
  p_org uuid, p_location uuid, p_session uuid, p_student uuid, p_slot tstzrange
) returns uuid language plpgsql set search_path = ''
as $$
declare
  v_participant uuid;
begin
  perform tennis_private.check_student(p_org, p_location, p_student);
  insert into public.session_participants (organization_id, location_id, session_id, student_id)
  values (p_org, p_location, p_session, p_student) returning id into v_participant;
  insert into tennis_private.student_allocations (participant_id, organization_id, location_id, student_id, slot)
  values (v_participant, p_org, p_location, p_student, p_slot);
  return v_participant;
end;
$$;

create function tennis_private.create_booking(
  p_org uuid, p_location uuid, p_court uuid, p_start timestamptz, p_end timestamptz,
  p_kind public.booking_kind, p_request uuid, p_booker_name text,
  p_coach uuid, p_student uuid, p_capacity integer
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'create_booking';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin','receptionist']::public.club_role[]);
  v_slot tstzrange := tennis_private.make_slot(p_start, p_end);
  v_name text := nullif(btrim(p_booker_name), '');
  v_capacity integer := coalesce(p_capacity, 1);
  v_result uuid;
  v_timezone text;
  v_rule public.pricing_rules%rowtype;
  v_currency text;
  v_minutes integer;
  v_price numeric;
  v_session uuid;
begin
  if p_kind is null or (p_kind = 'rental' and
      (v_name is null or length(v_name) > 120 or p_coach is not null or p_student is not null or p_capacity is not null))
      or (p_kind <> 'rental' and (v_name is not null or p_coach is null or v_capacity not between 1 and 100))
      or (p_kind = 'private' and (v_capacity <> 1 or p_student is null)) then
    raise exception 'invalid_booking_parties' using errcode = '22023';
  end if;

  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(p_court, extract(epoch from p_start), extract(epoch from p_end),
      p_kind, v_name, p_coach, p_student, v_capacity));
  if v_result is not null then return v_result; end if;

  select timezone into v_timezone from tennis_private.lock_location(p_org, p_location);
  perform tennis_private.check_booking_slot(p_org, p_location, p_court, v_slot, v_timezone, p_coach);

  select r.* into v_rule from public.pricing_rules as r
  where (r.organization_id, r.location_id, r.court_id, r.kind) = (p_org, p_location, p_court, p_kind)
    and r.effective @> v_slot for share;
  if not found then raise exception 'pricing_rule_unavailable' using errcode = '22023'; end if;

  v_minutes := (extract(epoch from (p_end - p_start)) / 60)::integer;
  if mod(v_minutes, v_rule.unit_minutes::integer) <> 0 then
    raise exception 'duration_not_a_pricing_multiple' using errcode = '22023';
  end if;
  v_price := v_rule.amount_minor::numeric * (v_minutes / v_rule.unit_minutes);
  if v_price > 9999999999999 then raise exception 'booking_amount_out_of_range' using errcode = '22003'; end if;
  select currency into strict v_currency from public.organizations where id = p_org for share;

  insert into public.bookings (organization_id, location_id, court_id, slot, timezone, kind, booker_name, created_by)
  values (p_org, p_location, p_court, v_slot, v_timezone, p_kind, v_name, v_actor)
  returning id into v_result;

  insert into public.booking_prices (booking_id, organization_id, location_id, court_id, kind, pricing_rule_id,
    currency, unit_minutes, booked_minutes, unit_amount_minor, amount_minor)
  values (v_result, p_org, p_location, p_court, p_kind, v_rule.id,
    v_currency, v_rule.unit_minutes, v_minutes, v_rule.amount_minor, v_price::bigint);

  insert into tennis_private.court_allocations (organization_id, location_id, court_id, booking_id, slot)
  values (p_org, p_location, p_court, v_result, v_slot);

  if p_kind <> 'rental' then
    insert into public.sessions (organization_id, location_id, booking_id, coach_id, capacity)
    values (p_org, p_location, v_result, p_coach, v_capacity) returning id into v_session;
    insert into tennis_private.coach_allocations (session_id, organization_id, location_id, coach_id, slot)
    values (v_session, p_org, p_location, p_coach, v_slot);
    if p_student is not null then
      perform tennis_private.insert_participant(p_org, p_location, v_session, p_student, v_slot);
    end if;
  end if;

  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result);
end;
$$;

create function tennis_private.reschedule_booking(
  p_org uuid, p_location uuid, p_booking uuid, p_start timestamptz, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'reschedule_booking';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin','receptionist']::public.club_role[]);
  v_result uuid;
  v_timezone text;
  v_booking public.bookings%rowtype;
  v_session public.sessions%rowtype;
  v_slot tstzrange;
  v_student uuid;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(p_booking, extract(epoch from p_start)));
  if v_result is not null then return v_result; end if;
  select timezone into v_timezone from tennis_private.lock_location(p_org, p_location);

  select * into v_booking from public.bookings
  where (organization_id, location_id, id) = (p_org, p_location, p_booking) for no key update;
  if not found or v_booking.status <> 'confirmed' or lower(v_booking.slot) < date_trunc('minute', statement_timestamp()) then
    raise exception 'booking_not_editable' using errcode = '22023';
  end if;

  select * into v_session from public.sessions where (organization_id, location_id, booking_id) = (p_org, p_location, p_booking);
  if v_session.id is not null and v_session.status <> 'scheduled' then
    raise exception 'session_not_editable' using errcode = '22023';
  end if;

  v_slot := tennis_private.make_slot(p_start, p_start + (upper(v_booking.slot) - lower(v_booking.slot)));
  perform tennis_private.check_booking_slot(p_org, p_location, v_booking.court_id, v_slot, v_timezone, v_session.coach_id);

  update public.bookings set slot = v_slot, timezone = v_timezone where id = p_booking;
  update tennis_private.court_allocations set slot = v_slot where booking_id = p_booking and active;
  if v_session.id is not null then
    update tennis_private.coach_allocations set slot = v_slot where session_id = v_session.id and active;
    for v_student in select student_id from public.session_participants where session_id = v_session.id order by student_id loop
      perform tennis_private.check_student(p_org, p_location, v_student);
    end loop;
    update tennis_private.student_allocations as a set slot = v_slot
    from public.session_participants as p where a.participant_id = p.id and p.session_id = v_session.id and a.active;
  end if;

  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, p_booking,
    jsonb_build_object('old_slot', v_booking.slot, 'new_slot', v_slot));
end;
$$;

create function tennis_private.cancel_booking(
  p_org uuid, p_location uuid, p_booking uuid, p_reason text, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'cancel_booking';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin','receptionist']::public.club_role[]);
  v_reason text := nullif(btrim(p_reason), '');
  v_result uuid;
  v_session uuid;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request, jsonb_build_array(p_booking, v_reason));
  if v_result is not null then return v_result; end if;
  if v_reason is null or length(v_reason) > 250 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  perform tennis_private.lock_location(p_org, p_location, false);
  if exists (select from public.sessions
    where (organization_id, location_id, booking_id) = (p_org, p_location, p_booking) and status = 'completed') then
    raise exception 'session_already_completed' using errcode = '22023';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason
  where (organization_id, location_id, id) = (p_org, p_location, p_booking) and status = 'confirmed'
    and lower(slot) >= date_trunc('minute', statement_timestamp());
  if not found then raise exception 'booking_not_cancellable' using errcode = '22023'; end if;

  update tennis_private.court_allocations set active = false where booking_id = p_booking;
  update public.sessions set status = 'cancelled'
  where (organization_id, location_id, booking_id) = (p_org, p_location, p_booking)
  returning id into v_session;
  if v_session is not null then
    update tennis_private.coach_allocations set active = false where session_id = v_session;
    update tennis_private.student_allocations as a set active = false
    from public.session_participants as p where a.participant_id = p.id and p.session_id = v_session;
  end if;
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, p_booking);
end;
$$;

create function tennis_private.add_session_participant(
  p_org uuid, p_location uuid, p_session uuid, p_student uuid, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'add_session_participant';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin','receptionist']::public.club_role[]);
  v_result uuid;
  v_session public.sessions%rowtype;
  v_slot tstzrange;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request, jsonb_build_array(p_session, p_student));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org, p_location);
  select * into v_session from public.sessions
  where (organization_id, location_id, id) = (p_org, p_location, p_session) for no key update;
  if not found or v_session.status <> 'scheduled' then
    raise exception 'session_not_open' using errcode = '22023';
  end if;
  select slot into v_slot from public.bookings where id = v_session.booking_id and status = 'confirmed';
  if not found or lower(v_slot) < date_trunc('minute', statement_timestamp()) then
    raise exception 'session_not_open' using errcode = '22023';
  end if;
  if (select count(*) from public.session_participants where session_id = p_session) >= v_session.capacity then
    raise exception 'session_at_capacity' using errcode = '23514';
  end if;
  v_result := tennis_private.insert_participant(p_org, p_location, p_session, p_student, v_slot);
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result,
    jsonb_build_object('session_id', p_session));
end;
$$;

create function tennis_private.block_court(
  p_org uuid, p_location uuid, p_court uuid, p_start timestamptz, p_end timestamptz, p_reason text, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'block_court';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin']::public.club_role[]);
  v_slot tstzrange := tennis_private.make_slot(p_start, p_end);
  v_result uuid;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(p_court, extract(epoch from p_start), extract(epoch from p_end), btrim(p_reason)));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org, p_location);
  if lower(v_slot) < date_trunc('minute', statement_timestamp()) then
    raise exception 'block_starts_in_past' using errcode = '22023';
  end if;
  insert into public.court_maintenance_blocks (organization_id, location_id, court_id, slot, reason)
  values (p_org, p_location, p_court, v_slot, btrim(p_reason)) returning id into v_result;
  insert into tennis_private.court_allocations (organization_id, location_id, court_id, maintenance_id, slot)
  values (p_org, p_location, p_court, v_result, v_slot);
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result);
end;
$$;

create function tennis_private.release_court_block(
  p_org uuid, p_location uuid, p_block uuid, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'release_court_block';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin']::public.club_role[]);
  v_result uuid;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request, jsonb_build_array(p_block));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org, p_location, false);
  update public.court_maintenance_blocks set released_at = now()
  where (organization_id, location_id, id) = (p_org, p_location, p_block) and released_at is null
    and lower(slot) >= date_trunc('minute', statement_timestamp());
  if not found then raise exception 'block_not_releasable' using errcode = '22023'; end if;
  update tennis_private.court_allocations set active = false where maintenance_id = p_block;
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, p_block);
end;
$$;

create function tennis_private.close_location(
  p_org uuid, p_location uuid, p_start timestamptz, p_end timestamptz, p_reason text, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'close_location';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin']::public.club_role[]);
  v_slot tstzrange := tennis_private.make_slot(p_start, p_end);
  v_result uuid;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request,
    jsonb_build_array(extract(epoch from p_start), extract(epoch from p_end), btrim(p_reason)));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org, p_location);
  if lower(v_slot) < date_trunc('minute', statement_timestamp()) then
    raise exception 'closure_starts_in_past' using errcode = '22023';
  end if;
  if exists (select from public.bookings
      where (organization_id, location_id) = (p_org, p_location) and status = 'confirmed' and slot && v_slot) then
    raise exception 'closure_conflicts_with_booking' using errcode = '23P01';
  end if;
  insert into public.location_closures (organization_id, location_id, slot, reason)
  values (p_org, p_location, v_slot, btrim(p_reason)) returning id into v_result;
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result);
end;
$$;

create function tennis_private.release_location_closure(
  p_org uuid, p_location uuid, p_closure uuid, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'release_location_closure';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin']::public.club_role[]);
  v_result uuid;
begin
  v_result := tennis_private.begin_operation(p_org, p_location, v_actor, v_action, p_request, jsonb_build_array(p_closure));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org, p_location, false);
  update public.location_closures set released_at = now()
  where (organization_id, location_id, id) = (p_org, p_location, p_closure) and released_at is null
    and lower(slot) >= date_trunc('minute', statement_timestamp());
  if not found then raise exception 'closure_not_releasable' using errcode = '22023'; end if;
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, p_closure);
end;
$$;

revoke all on function
  tennis_private.make_slot(timestamptz, timestamptz),
  tennis_private.lock_location(uuid, uuid, boolean),
  tennis_private.local_slot(tstzrange, text),
  tennis_private.check_booking_slot(uuid, uuid, uuid, tstzrange, text, uuid),
  tennis_private.check_student(uuid, uuid, uuid),
  tennis_private.insert_participant(uuid, uuid, uuid, uuid, tstzrange)
  from public, anon, authenticated;

create function public.create_booking(
  p_org uuid, p_location uuid, p_court uuid,
  p_start timestamptz, p_end timestamptz, p_kind public.booking_kind,
  p_request uuid, p_booker_name text default null, p_coach uuid default null,
  p_student uuid default null, p_capacity integer default null
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.create_booking(p_org, p_location, p_court, p_start, p_end, p_kind, p_request, p_booker_name, p_coach, p_student, p_capacity);
$$;

revoke all on function
  public.create_booking(uuid, uuid, uuid, timestamptz, timestamptz, public.booking_kind, uuid, text, uuid, uuid, integer),
  tennis_private.create_booking(uuid, uuid, uuid, timestamptz, timestamptz, public.booking_kind, uuid, text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function
  public.create_booking(uuid, uuid, uuid, timestamptz, timestamptz, public.booking_kind, uuid, text, uuid, uuid, integer),
  tennis_private.create_booking(uuid, uuid, uuid, timestamptz, timestamptz, public.booking_kind, uuid, text, uuid, uuid, integer) to authenticated;

create function public.reschedule_booking(
  p_org uuid, p_location uuid, p_booking uuid,
  p_start timestamptz, p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.reschedule_booking(p_org, p_location, p_booking, p_start, p_request);
$$;

revoke all on function
  public.reschedule_booking(uuid, uuid, uuid, timestamptz, uuid),
  tennis_private.reschedule_booking(uuid, uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function
  public.reschedule_booking(uuid, uuid, uuid, timestamptz, uuid),
  tennis_private.reschedule_booking(uuid, uuid, uuid, timestamptz, uuid) to authenticated;

create function public.cancel_booking(
  p_org uuid, p_location uuid, p_booking uuid,
  p_reason text, p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.cancel_booking(p_org, p_location, p_booking, p_reason, p_request);
$$;

revoke all on function
  public.cancel_booking(uuid, uuid, uuid, text, uuid),
  tennis_private.cancel_booking(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function
  public.cancel_booking(uuid, uuid, uuid, text, uuid),
  tennis_private.cancel_booking(uuid, uuid, uuid, text, uuid) to authenticated;

create function public.add_session_participant(
  p_org uuid, p_location uuid, p_session uuid,
  p_student uuid, p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.add_session_participant(p_org, p_location, p_session, p_student, p_request);
$$;

revoke all on function
  public.add_session_participant(uuid, uuid, uuid, uuid, uuid),
  tennis_private.add_session_participant(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.add_session_participant(uuid, uuid, uuid, uuid, uuid),
  tennis_private.add_session_participant(uuid, uuid, uuid, uuid, uuid) to authenticated;

create function public.block_court(
  p_org uuid, p_location uuid, p_court uuid,
  p_start timestamptz, p_end timestamptz, p_reason text,
  p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.block_court(p_org, p_location, p_court, p_start, p_end, p_reason, p_request);
$$;

revoke all on function
  public.block_court(uuid, uuid, uuid, timestamptz, timestamptz, text, uuid),
  tennis_private.block_court(uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function
  public.block_court(uuid, uuid, uuid, timestamptz, timestamptz, text, uuid),
  tennis_private.block_court(uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) to authenticated;

create function public.release_court_block(
  p_org uuid, p_location uuid, p_block uuid,
  p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.release_court_block(p_org, p_location, p_block, p_request);
$$;

revoke all on function
  public.release_court_block(uuid, uuid, uuid, uuid),
  tennis_private.release_court_block(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.release_court_block(uuid, uuid, uuid, uuid),
  tennis_private.release_court_block(uuid, uuid, uuid, uuid) to authenticated;

create function public.close_location(
  p_org uuid, p_location uuid, p_start timestamptz,
  p_end timestamptz, p_reason text, p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.close_location(p_org, p_location, p_start, p_end, p_reason, p_request);
$$;

revoke all on function
  public.close_location(uuid, uuid, timestamptz, timestamptz, text, uuid),
  tennis_private.close_location(uuid, uuid, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function
  public.close_location(uuid, uuid, timestamptz, timestamptz, text, uuid),
  tennis_private.close_location(uuid, uuid, timestamptz, timestamptz, text, uuid) to authenticated;

create function public.release_location_closure(
  p_org uuid, p_location uuid, p_closure uuid,
  p_request uuid
) returns uuid language sql security invoker set search_path = ''
as $$
  select tennis_private.release_location_closure(p_org, p_location, p_closure, p_request);
$$;

revoke all on function
  public.release_location_closure(uuid, uuid, uuid, uuid),
  tennis_private.release_location_closure(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.release_location_closure(uuid, uuid, uuid, uuid),
  tennis_private.release_location_closure(uuid, uuid, uuid, uuid) to authenticated;

commit;
