begin;

create function tennis_private.set_resource_hours(
  p_org uuid,p_kind public.club_resource_kind,p_id uuid,p_location uuid,p_weekday integer,
  p_from date,p_start integer,p_end integer,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_payload jsonb := jsonb_build_array('hours',p_kind,p_id,p_location,p_weekday,p_from,p_start,p_end);
  v_timezone text;
  v_today date;
  v_result uuid;
  v_booking record;
begin
  perform tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_result := tennis_private.begin_resource_change(p_org,p_request,v_payload);
  if v_result is not null then return v_result; end if;
  select timezone into v_timezone from tennis_private.lock_location(p_org,p_location);
  v_today := timezone(v_timezone,statement_timestamp())::date;
  if p_kind is null or p_kind not in ('court','coach') or p_id is null
    or p_weekday is null or p_weekday not between 1 and 7 or p_from is null or not isfinite(p_from) or p_from<v_today
    or (p_start is null)<>(p_end is null) or (p_start is not null and (p_start<0 or p_end>1440 or p_start>=p_end)) then
    raise exception 'invalid_weekly_hours' using errcode='22023';
  end if;
  if not p_location=any(tennis_private.resource_locations(p_org,p_kind,p_id)) then
    raise exception 'resource_access_denied' using errcode='42501';
  end if;

  if p_kind='court' then
    delete from public.court_operating_hours where organization_id=p_org and location_id=p_location and court_id=p_id
      and weekday=p_weekday and lower(valid_dates)>=p_from;
    update public.court_operating_hours set valid_dates=daterange(lower(valid_dates),p_from,'[)')
    where organization_id=p_org and location_id=p_location and court_id=p_id and weekday=p_weekday
      and lower(valid_dates)<p_from and valid_dates @> p_from;
    if p_start is not null then
      insert into public.court_operating_hours (organization_id,location_id,court_id,weekday,valid_dates,local_minutes)
      values (p_org,p_location,p_id,p_weekday,daterange(p_from,null,'[)'),int4range(p_start,p_end,'[)'));
    end if;
  else
    delete from public.coach_availability where organization_id=p_org and location_id=p_location and coach_id=p_id
      and weekday=p_weekday and lower(valid_dates)>=p_from;
    update public.coach_availability set valid_dates=daterange(lower(valid_dates),p_from,'[)')
    where organization_id=p_org and location_id=p_location and coach_id=p_id and weekday=p_weekday
      and lower(valid_dates)<p_from and valid_dates @> p_from;
    if p_start is not null then
      insert into public.coach_availability (organization_id,location_id,coach_id,weekday,valid_dates,local_minutes)
      values (p_org,p_location,p_id,p_weekday,daterange(p_from,null,'[)'),int4range(p_start,p_end,'[)'));
    end if;
  end if;

  for v_booking in
    select b.court_id,b.slot,s.coach_id from public.bookings b left join public.sessions s
      on (s.organization_id,s.location_id,s.booking_id)=(b.organization_id,b.location_id,b.id)
    where b.organization_id=p_org and b.location_id=p_location and b.status='confirmed'
      and b.starts_at>=greatest(date_trunc('minute',statement_timestamp()),p_from::timestamp at time zone v_timezone)
      and extract(isodow from timezone(v_timezone,b.starts_at))=p_weekday
      and ((p_kind='court' and b.court_id=p_id) or (p_kind='coach' and s.coach_id=p_id))
  loop
    begin
      perform tennis_private.check_booking_slot(p_org,p_location,v_booking.court_id,v_booking.slot,v_timezone,v_booking.coach_id);
    exception when sqlstate '22023' or exclusion_violation then
      raise exception 'hours_conflict_with_future_booking' using errcode='23P01';
    end;
  end loop;
  return tennis_private.finish_resource_change(p_org,p_kind,p_id,p_request,v_payload,'hours',null,null,array[p_location]);
end;
$$;

create function tennis_private.set_court_rate(
  p_org uuid,p_location uuid,p_court uuid,p_kind public.booking_kind,p_from date,
  p_minutes integer,p_amount bigint,p_request uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_payload jsonb := jsonb_build_array('rate',p_location,p_court,p_kind,p_from,p_minutes,p_amount);
  v_result uuid;
  v_timezone text;
  v_from timestamptz;
  v_previous public.pricing_rules%rowtype;
begin
  perform tennis_private.require_location(p_org,p_location,array['owner','admin']::public.club_role[]);
  v_result := tennis_private.begin_resource_change(p_org,p_request,v_payload);
  if v_result is not null then return v_result; end if;
  select timezone into v_timezone from tennis_private.lock_location(p_org,p_location);
  if p_kind is null or p_from is null or not isfinite(p_from)
    or p_from<timezone(v_timezone,statement_timestamp())::date
    or p_minutes is null or p_minutes not between 1 and 1440 or p_amount is null or p_amount not between 0 and 9999999999999 then
    raise exception 'invalid_court_rate' using errcode='22023';
  end if;
  if not p_location=any(tennis_private.resource_locations(p_org,'court',p_court)) then
    raise exception 'resource_access_denied' using errcode='42501';
  end if;

  v_from := p_from::timestamp at time zone v_timezone;
  select * into v_previous from public.pricing_rules
    where organization_id=p_org and location_id=p_location and court_id=p_court and kind=p_kind
    order by lower(effective) desc limit 1 for no key update;
  if found then
    if v_from<=lower(v_previous.effective) then raise exception 'rate_must_follow_latest' using errcode='22023'; end if;
    if upper_inf(v_previous.effective) or v_previous.effective @> v_from then
      update public.pricing_rules set effective=tstzrange(lower(effective),v_from,'[)') where id=v_previous.id;
    end if;
  end if;
  insert into public.pricing_rules (organization_id,location_id,court_id,kind,effective,unit_minutes,amount_minor)
    values (p_org,p_location,p_court,p_kind,tstzrange(v_from,null,'[)'),p_minutes,p_amount);
  return tennis_private.finish_resource_change(p_org,'court',p_court,p_request,v_payload,'rate',null,null,array[p_location]);
end;
$$;

create function public.set_resource_hours(
  p_org uuid,p_kind public.club_resource_kind,p_id uuid,p_location uuid,p_weekday integer,
  p_from date,p_start integer,p_end integer,p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.set_resource_hours(p_org,p_kind,p_id,p_location,p_weekday,p_from,p_start,p_end,p_request); $$;

create function public.set_court_rate(
  p_org uuid,p_location uuid,p_court uuid,p_kind public.booking_kind,p_from date,p_minutes integer,p_amount bigint,p_request uuid
) returns uuid language sql security invoker set search_path=''
as $$ select tennis_private.set_court_rate(p_org,p_location,p_court,p_kind,p_from,p_minutes,p_amount,p_request); $$;

revoke all on function public.set_resource_hours(uuid,public.club_resource_kind,uuid,uuid,integer,date,integer,integer,uuid),
  tennis_private.set_resource_hours(uuid,public.club_resource_kind,uuid,uuid,integer,date,integer,integer,uuid),
  public.set_court_rate(uuid,uuid,uuid,public.booking_kind,date,integer,bigint,uuid),
  tennis_private.set_court_rate(uuid,uuid,uuid,public.booking_kind,date,integer,bigint,uuid)
  from public,anon,authenticated;
grant execute on function public.set_resource_hours(uuid,public.club_resource_kind,uuid,uuid,integer,date,integer,integer,uuid),
  tennis_private.set_resource_hours(uuid,public.club_resource_kind,uuid,uuid,integer,date,integer,integer,uuid),
  public.set_court_rate(uuid,uuid,uuid,public.booking_kind,date,integer,bigint,uuid),
  tennis_private.set_court_rate(uuid,uuid,uuid,public.booking_kind,date,integer,bigint,uuid) to authenticated;

commit;
