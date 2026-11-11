-- Apply manually to a disposable development database.
begin;

insert into public.organizations (id, name, currency)
values ('10000000-0000-4000-8000-000000000001', 'باشگاه تنیس سام', 'IRR');

insert into public.locations (id, organization_id, name, timezone) values
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'شعبهٔ مرکزی', 'Asia/Tehran'),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'شعبهٔ دوم آزمایشی', 'Asia/Tehran');

insert into public.courts (id, organization_id, location_id, name, surface, status) values
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'زمین ۱', 'خاک رس', 'active'),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'زمین ۲', 'هاردکورت', 'active'),
  ('10000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'زمین ۳', 'خاک رس', 'inactive'),
  ('10000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000012', 'زمین ۱', 'هاردکورت', 'active');

insert into public.coach_profiles (id, organization_id, name, specialty) values
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000001', 'آرمان کیانی', 'تمرین خصوصی'),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000001', 'نیلوفر مرادی', 'آموزش گروهی');

insert into public.student_profiles (id, organization_id, name, skill_level) values
  ('10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000001', 'سارا راد', 'متوسط'),
  ('10000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000001', 'پارسا امینی', 'مقدماتی');

insert into public.coach_locations (organization_id, location_id, coach_id)
select l.organization_id, l.id, c.id from public.locations as l
join public.coach_profiles as c using (organization_id)
where l.organization_id = '10000000-0000-4000-8000-000000000001';

insert into public.student_locations (organization_id, location_id, student_id)
select l.organization_id, l.id, s.id from public.locations as l
join public.student_profiles as s using (organization_id)
where l.organization_id = '10000000-0000-4000-8000-000000000001';

insert into public.court_operating_hours (organization_id, location_id, court_id, weekday, valid_dates, local_minutes)
select c.organization_id, c.location_id, c.id, day, daterange(current_date - 30, null, '[)'), '[480,1320)'::int4range
from public.courts as c cross join generate_series(1, 7) as day
where c.organization_id = '10000000-0000-4000-8000-000000000001';

insert into public.coach_availability (organization_id, location_id, coach_id, weekday, valid_dates, local_minutes)
select c.organization_id, c.location_id, c.coach_id, day, daterange(current_date - 30, null, '[)'), '[480,1320)'::int4range
from public.coach_locations as c cross join generate_series(1, 7) as day
where c.organization_id = '10000000-0000-4000-8000-000000000001';

insert into public.pricing_rules (organization_id, location_id, court_id, kind, effective, unit_minutes, amount_minor)
select c.organization_id, c.location_id, c.id, kind, tstzrange(now() - interval '30 days', null, '[)'), 30,
  case kind when 'rental' then 1800000 when 'private' then 3400000 else 2600000 end
from public.courts as c cross join unnest(enum_range(null::public.booking_kind)) as kind
where c.organization_id = '10000000-0000-4000-8000-000000000001';

commit;
