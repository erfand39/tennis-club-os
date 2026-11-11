begin;

alter table public.sessions add column revision bigint not null default 0;
alter table public.session_participants add column withdrawn_at timestamptz;

create or replace function tennis_private.insert_participant(
  p_org uuid, p_location uuid, p_session uuid, p_student uuid, p_slot tstzrange
) returns uuid language plpgsql set search_path = ''
as $$
declare
  v_participant uuid;
begin
  perform tennis_private.check_student(p_org, p_location, p_student);
  insert into public.session_participants (organization_id, location_id, session_id, student_id)
  values (p_org, p_location, p_session, p_student)
  on conflict (organization_id,location_id,session_id,student_id) do update
    set withdrawn_at=null, registered_at=statement_timestamp()
    where session_participants.withdrawn_at is not null
  returning id into v_participant;
  if v_participant is null then raise exception 'participant_already_enrolled' using errcode='23505'; end if;
  insert into tennis_private.student_allocations (participant_id, organization_id, location_id, student_id, slot)
  values (v_participant, p_org, p_location, p_student, p_slot)
  on conflict (participant_id) do update set active=true, slot=excluded.slot;
  update public.sessions set revision=revision+1 where id=p_session;
  return v_participant;
end;
$$;

create or replace function tennis_private.add_session_participant(
  p_org uuid, p_location uuid, p_session uuid, p_student uuid, p_request uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_action constant text := 'add_session_participant';
  v_actor uuid := tennis_private.require_location(p_org, p_location, array['owner','admin']::public.club_role[]);
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
  if exists (select from public.session_participants where session_id=p_session and student_id=p_student and withdrawn_at is null) then
    raise exception 'participant_already_enrolled' using errcode='23505';
  end if;
  if (select count(*) from public.session_participants where session_id = p_session and withdrawn_at is null) >= v_session.capacity then
    raise exception 'session_at_capacity' using errcode = '23514';
  end if;
  v_result := tennis_private.insert_participant(p_org, p_location, p_session, p_student, v_slot);
  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, v_result,
    jsonb_build_object('session_id', p_session));
end;
$$;

create or replace function tennis_private.reschedule_booking(
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
    for v_student in select student_id from public.session_participants where session_id = v_session.id and withdrawn_at is null order by student_id loop
      perform tennis_private.check_student(p_org, p_location, v_student);
    end loop;
    update tennis_private.student_allocations as a set slot = v_slot
    from public.session_participants as p where a.participant_id = p.id and p.session_id = v_session.id and a.active;
  end if;

  return tennis_private.finish_operation(p_org, p_location, v_actor, v_action, p_request, p_booking,
    jsonb_build_object('old_slot', v_booking.slot, 'new_slot', v_slot));
end;
$$;

create function tennis_private.withdraw_session_participant(
  p_org uuid,p_location uuid,p_session uuid,p_participant uuid,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_action constant text := 'withdraw_session_participant';
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_result uuid;
  v_booking uuid;
begin
  v_result := tennis_private.begin_operation(p_org,p_location,v_actor,v_action,p_request,jsonb_build_array(p_session,p_participant));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org,p_location);
  select s.booking_id into v_booking from public.sessions s
  where (s.organization_id,s.location_id,s.id)=(p_org,p_location,p_session) and s.status='scheduled' for no key update;
  if not found or not exists (select from public.bookings where id=v_booking and kind='group' and status='confirmed'
    and starts_at>=date_trunc('minute',statement_timestamp())) then
    raise exception 'session_not_open' using errcode='22023';
  end if;
  update public.session_participants set withdrawn_at=statement_timestamp()
  where (organization_id,location_id,session_id,id)=(p_org,p_location,p_session,p_participant) and withdrawn_at is null;
  if not found then raise exception 'participant_not_active' using errcode='22023'; end if;
  update tennis_private.student_allocations set active=false where participant_id=p_participant and active;
  update public.sessions set revision=revision+1 where id=p_session;
  return tennis_private.finish_operation(p_org,p_location,v_actor,v_action,p_request,p_participant,jsonb_build_object('session_id',p_session));
end;
$$;

create function tennis_private.record_class_attendance(
  p_org uuid,p_location uuid,p_session uuid,p_revision bigint,p_booking_revision bigint,
  p_start timestamptz,p_end timestamptz,p_attendance jsonb,p_reason text,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_action constant text := 'record_class_attendance';
  v_actor uuid := tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_actual tstzrange := tennis_private.make_slot(p_start,p_end);
  v_reason text := nullif(btrim(p_reason),'');
  v_result uuid;
  v_session public.sessions%rowtype;
  v_booking public.bookings%rowtype;
  v_before jsonb;
  v_correcting boolean;
begin
  if p_revision is null or p_booking_revision is null or jsonb_typeof(p_attendance) is distinct from 'object' then
    raise exception 'attendance_invalid' using errcode='22023';
  end if;
  v_result := tennis_private.begin_operation(p_org,p_location,v_actor,v_action,p_request,
    jsonb_build_array(p_session,p_revision,p_booking_revision,extract(epoch from p_start),extract(epoch from p_end),p_attendance,v_reason));
  if v_result is not null then return v_result; end if;
  perform tennis_private.lock_location(p_org,p_location,false);
  select s.* into v_session from public.sessions s
    where (s.organization_id,s.location_id,s.id)=(p_org,p_location,p_session) for no key update;
  if not found then raise exception 'session_access_denied' using errcode='42501'; end if;
  select b.* into strict v_booking from public.bookings b where b.id=v_session.booking_id;
  if v_session.status='cancelled' or v_booking.status<>'confirmed' then
    raise exception 'session_not_open' using errcode='22023';
  end if;
  if p_revision<>v_session.revision or p_booking_revision<>v_booking.revision then
    raise exception 'attendance_stale' using errcode='22023';
  end if;
  v_correcting := v_session.status='completed';
  if (v_correcting and v_reason is null) or length(v_reason)>250 then
    raise exception 'attendance_reason_required' using errcode='22023';
  end if;
  if p_end>statement_timestamp() or v_booking.starts_at>statement_timestamp() or p_end-p_start>interval '24 hours'
    or timezone(v_booking.timezone,p_start)::date<>timezone(v_booking.timezone,v_booking.starts_at)::date then
    raise exception 'attendance_actual_invalid' using errcode='22023';
  end if;
  perform tennis_private.local_slot(v_actual,v_booking.timezone);

  if (select count(*) from jsonb_each(p_attendance))<>(select count(*) from public.session_participants
      where session_id=p_session and withdrawn_at is null)
    or exists (select from public.session_participants sp where sp.session_id=p_session and sp.withdrawn_at is null
      and coalesce(p_attendance->>sp.id::text,'') not in ('present','late','absent','excused')) then
    raise exception 'attendance_roster_incomplete' using errcode='22023';
  end if;
  select coalesce(jsonb_object_agg(sp.id::text,ar.status) filter (where ar.status is not null),'{}'::jsonb)
    into v_before from public.session_participants sp
    left join public.attendance_records ar on ar.participant_id=sp.id
    where sp.session_id=p_session and sp.withdrawn_at is null;

  insert into public.attendance_records (participant_id,organization_id,location_id,status,recorded_by,recorded_at)
  select sp.id,p_org,p_location,(p_attendance->>sp.id::text)::public.attendance_status,v_actor,statement_timestamp()
    from public.session_participants sp where sp.session_id=p_session and sp.withdrawn_at is null
  on conflict (participant_id) do update set status=excluded.status, recorded_by=excluded.recorded_by, recorded_at=excluded.recorded_at
    where attendance_records.status is distinct from excluded.status;
  update public.sessions set status='completed',actual_slot=v_actual,revision=revision+1 where id=p_session;
  return tennis_private.finish_operation(p_org,p_location,v_actor,v_action,p_request,p_session,
    jsonb_build_object('corrected',v_correcting,'reason',v_reason,'old_slot',v_session.actual_slot,
      'new_slot',v_actual,'before',v_before,'after',p_attendance));
end;
$$;

create index audit_events_class_attendance_idx on tennis_private.audit_events(organization_id,location_id,target_id,id desc)
  where action='record_class_attendance';

create function tennis_private.class_attendance_history(p_org uuid,p_location uuid,p_session uuid)
returns table (recorded_at timestamptz,actor text,corrected boolean,reason text)
language sql stable security definer set search_path=''
as $$
  select a.created_at,p.display_name,(a.details->>'corrected')::boolean,a.details->>'reason'
  from tennis_private.audit_events a left join public.profiles p on p.user_id=a.actor_user_id
  where (a.organization_id,a.location_id,a.target_id)=(p_org,p_location,p_session) and a.action='record_class_attendance'
    and tennis_private.can_location(p_org,p_location,array['owner','admin']::public.club_role[])
  order by a.id desc limit 30;
$$;

create function public.withdraw_session_participant(p_org uuid,p_location uuid,p_session uuid,p_participant uuid,p_request uuid)
returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.withdraw_session_participant(p_org,p_location,p_session,p_participant,p_request); $$;

create function public.record_class_attendance(
  p_org uuid,p_location uuid,p_session uuid,p_revision bigint,p_booking_revision bigint,
  p_start timestamptz,p_end timestamptz,p_attendance jsonb,p_reason text,p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.record_class_attendance(p_org,p_location,p_session,p_revision,p_booking_revision,p_start,p_end,p_attendance,p_reason,p_request); $$;

create function public.class_attendance_history(p_org uuid,p_location uuid,p_session uuid)
returns table (recorded_at timestamptz,actor text,corrected boolean,reason text)
language sql stable security invoker set search_path=''
as $$ select * from tennis_private.class_attendance_history(p_org,p_location,p_session); $$;

revoke all on function
  public.withdraw_session_participant(uuid,uuid,uuid,uuid,uuid),tennis_private.withdraw_session_participant(uuid,uuid,uuid,uuid,uuid),
  public.record_class_attendance(uuid,uuid,uuid,bigint,bigint,timestamptz,timestamptz,jsonb,text,uuid),
  tennis_private.record_class_attendance(uuid,uuid,uuid,bigint,bigint,timestamptz,timestamptz,jsonb,text,uuid),
  public.class_attendance_history(uuid,uuid,uuid),tennis_private.class_attendance_history(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function
  public.withdraw_session_participant(uuid,uuid,uuid,uuid,uuid),tennis_private.withdraw_session_participant(uuid,uuid,uuid,uuid,uuid),
  public.record_class_attendance(uuid,uuid,uuid,bigint,bigint,timestamptz,timestamptz,jsonb,text,uuid),
  tennis_private.record_class_attendance(uuid,uuid,uuid,bigint,bigint,timestamptz,timestamptz,jsonb,text,uuid),
  public.class_attendance_history(uuid,uuid,uuid),tennis_private.class_attendance_history(uuid,uuid,uuid)
  to authenticated;

commit;
