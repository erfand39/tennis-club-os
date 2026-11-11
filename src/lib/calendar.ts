import 'server-only';
import { type Branch } from './club';
import { asUser } from './db';
import { type bookingKinds } from './resource-fields';

export type BookingKind = keyof typeof bookingKinds;
export type CalendarCourt = { id: string; name: string; surface: string; status: 'active'|'inactive'|'archived' };
export type Booking = {
  id: string; location_id: string; court_id: string; court: string; starts_at: Date; ends_at: Date; timezone: string;
  local_day: string; kind: BookingKind; status: 'confirmed'|'cancelled'; booker_name: string | null;
  coach: string | null; session_id: string|null; session_status: 'scheduled'|'completed'|'cancelled'|null; capacity: number|null;
};
type CalendarDay = { day: string; confirmed: number; completed: number; cancelled: number };
type FreeWindow = { court_id: string; start_at: Date; end_at: Date };
type Person = { id: string; name: string };
const pageSize = 30;
const bookingColumns = ` b.id,b.location_id,b.court_id,c.name as court,b.starts_at,b.ends_at,b.timezone,
    timezone($3,b.starts_at)::date::text as local_day,b.kind,b.status,b.booker_name,
    cp.name as coach,s.id as session_id,s.status as session_status,s.capacity
`;
const bookingTables = `
  from public.bookings b
  join public.courts c on (c.organization_id,c.location_id,c.id)=(b.organization_id,b.location_id,b.court_id)
  left join public.sessions s on (s.organization_id,s.location_id,s.booking_id)=(b.organization_id,b.location_id,b.id)
  left join public.coach_profiles cp on (cp.organization_id,cp.id)=(s.organization_id,s.coach_id)
`;

export function calendarCourts(user: string, org: string, branch: string) {
  return asUser(user, async db => (await db.query<CalendarCourt>(`
    select id,name,surface,status from public.courts where organization_id=$1 and location_id=$2
    order by status='active' desc,name,id
  `,[org,branch])).rows);
}

export function calendarPeriod(user: string, org: string, branch: Branch, court: string | undefined, start: string, end: string, requestedPage: number) {
  return asUser(user, async db => {
    const parameters = [org,branch.id,branch.timezone,start,end,court ?? null];
    const filter = `b.organization_id=$1 and b.location_id=$2
      and b.starts_at >= ($4::date::timestamp at time zone $3)
      and b.starts_at < ($5::date::timestamp at time zone $3)
      and ($6::uuid is null or b.court_id=$6)`;
    const days = (await db.query<CalendarDay>(`
      select timezone($3,b.starts_at)::date::text as day,
        count(*) filter (where b.status='confirmed' and s.status is distinct from 'completed')::int as confirmed,
        count(*) filter (where b.status='confirmed' and s.status='completed')::int as completed,
        count(*) filter (where b.status='cancelled')::int as cancelled
      from public.bookings b
      left join public.sessions s on (s.organization_id,s.location_id,s.booking_id)=(b.organization_id,b.location_id,b.id)
      where ${filter} group by 1 order by 1
    `,parameters)).rows;
    const total = days.reduce((sum,day) => sum + day.confirmed + day.completed + day.cancelled,0);
    const pages = Math.max(1,Math.ceil(total/pageSize));
    const page = Math.max(1,Math.min(requestedPage,pages));
    const rows = (await db.query<Booking>(`
      select ${bookingColumns} ${bookingTables} where ${filter} order by b.starts_at,b.id limit $7 offset $8
    `,[...parameters,pageSize,(page-1)*pageSize])).rows;
    return { days,rows,total,page,pages };
  });
}

export function courtFreeWindows(user: string, org: string, branch: Branch, day: string, court?: string) {
  if (!branch.active) return Promise.resolve([]);
  return asUser(user, async db => (await db.query<FreeWindow>(`
    with bounds as (
      select tstzrange($4::date::timestamp at time zone $3,($4::date+1)::timestamp at time zone $3,'[)') as span
    ), hours as (
      select c.id, range_agg(tstzrange(
        ($4::date+lower(h.local_minutes)*interval '1 minute') at time zone $3,
        ($4::date+upper(h.local_minutes)*interval '1 minute') at time zone $3,'[)')) as ranges
      from public.courts c join public.court_operating_hours h
        on (h.organization_id,h.location_id,h.court_id)=(c.organization_id,c.location_id,c.id)
      where c.organization_id=$1 and c.location_id=$2 and c.status='active' and ($5::uuid is null or c.id=$5)
        and h.weekday=extract(isodow from $4::date) and h.valid_dates @> $4::date
      group by c.id
    )
    select h.id as court_id,lower(free.slot) as start_at,upper(free.slot) as end_at
    from hours h cross join bounds x
    cross join lateral (
      select coalesce(range_agg(busy.slot),'{}'::tstzmultirange) as slots from (
        select b.slot from public.bookings b where b.organization_id=$1 and b.location_id=$2
          and b.court_id=h.id and b.status='confirmed' and b.slot && x.span
        union all
        select b.slot from public.court_maintenance_blocks b where b.organization_id=$1 and b.location_id=$2
          and b.court_id=h.id and b.released_at is null and b.slot && x.span
        union all
        select l.slot from public.location_closures l where l.organization_id=$1 and l.location_id=$2
          and l.released_at is null and l.slot && x.span
      ) busy
    ) unavailable
    cross join lateral unnest((h.ranges-unavailable.slots)*tstzmultirange(
      tstzrange(date_trunc('minute',statement_timestamp()),null,'[)'))) free(slot)
    order by h.id,lower(free.slot)
  `,[org,branch.id,branch.timezone,day,court ?? null])).rows);
}

export function calendarBookingOptions(user: string, org: string, branch: string) {
  return asUser(user, async db => {
    const coaches = (await db.query<Person>(`
      select p.id,p.name as name from public.coach_profiles p join public.coach_locations l
        on (l.organization_id,l.coach_id)=(p.organization_id,p.id)
      where p.organization_id=$1 and l.location_id=$2 and p.status='active' and l.active order by p.name,p.id
    `,[org,branch])).rows;
    const students = (await db.query<Person>(`
      select p.id,p.name as name from public.student_profiles p join public.student_locations l
        on (l.organization_id,l.student_id)=(p.organization_id,p.id)
      where p.organization_id=$1 and l.location_id=$2 and p.status='active' and l.active order by p.name,p.id
    `,[org,branch])).rows;
    return { coaches,students };
  });
}

type BookingDetail = Booking & {
  revision: string; active_invoice_id: string|null; covered_by_training: boolean; amount: string|null; currency: string|null; cancellation_reason: string|null; cancelled_at: Date|null;
};
type History = { action: string; created_at: Date; old_start: Date|null; new_start: Date|null };
export function calendarBooking(user: string, org: string, branches: Branch[], id: string) {
  return asUser(user, async db => {
    const location = (await db.query<{ location_id: string }>(
      'select location_id from public.bookings where organization_id=$1 and id=$2',[org,id])).rows[0]?.location_id;
    const branch = branches.find(item => item.id === location);
    if (!branch) return null;
    const detail = (await db.query<BookingDetail>(`
      select ${bookingColumns},b.revision,b.cancellation_reason,b.cancelled_at,p.amount_minor as amount,p.currency,i.invoice_id as active_invoice_id,
        (b.kind='private' and exists(select from public.session_participants pp join public.training_uses u on u.participant_id=pp.id
          where pp.session_id=s.id and u.reversed_at is null)) as covered_by_training
      ${bookingTables}
      left join public.booking_prices p on (p.organization_id,p.location_id,p.booking_id)=(b.organization_id,b.location_id,b.id)
      left join public.invoice_items i on (i.organization_id,i.location_id,i.booking_id)=(b.organization_id,b.location_id,b.id) and i.active
      where b.organization_id=$1 and b.location_id=$2 and b.id=$4
    `,[org,branch.id,branch.timezone,id])).rows[0];
    if (!detail) return null;
    const students = (await db.query<Person>(`
      select p.id,p.name as name from public.session_participants j
      join public.sessions s on (s.organization_id,s.location_id,s.id)=(j.organization_id,j.location_id,j.session_id)
      join public.student_profiles p on (p.organization_id,p.id)=(j.organization_id,j.student_id)
      where s.organization_id=$1 and s.location_id=$2 and s.booking_id=$3 and j.withdrawn_at is null order by p.name,p.id
    `,[org,branch.id,id])).rows;
    const history = (await db.query<History>('select * from public.calendar_booking_history($1,$2,$3)',[org,branch.id,id])).rows;
    return { detail,branch,students,history };
  });
}
