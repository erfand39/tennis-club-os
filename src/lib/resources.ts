import 'server-only';
import { asUser } from './db';
import { type ResourceKind, type ResourceStatus, asciiDigits, resourceKinds, resourceStatuses } from './resource-fields';
import type { Branch } from './club';

export type ResourceRow = {
  id: string;
  name: string;
  status: ResourceStatus;
  updated_at: Date;
  subtitle: string | null;
  branch_names: string[];
};
type DetailData = {
  notes: string | null; capacity?: number; amenities?: string[]; surface?: string;
  contact_phone?: string | null; contact_email?: string | null; specialty?: string | null; qualification?: string | null;
  skill_level?: string | null; joined_on?: string | null; pay_basis?: 'hourly' | 'per_session' | null;
  pay_amount_minor?: number | null;
};
export type ResourceDetail = ResourceRow & { revision: string; locations: string[]; data: DetailData };
export type ResourceFilters = { q: string; status: string; branch: string; sort: string; page: number; inactiveDays: number };
const pageSize = 12;
const orders = { name: 'name,id', newest: 'updated_at desc,id', status: 'status,name,id' } as const;

const base = {
  courts: `select c.id,c.name,c.status,c.updated_at,c.revision::text,c.surface as subtitle,
      array[c.location_id] as locations,array[l.name] as branch_names,
      jsonb_build_object('surface',c.surface,'capacity',c.capacity,'amenities',c.amenities,'notes',c.notes) as data
    from public.courts c join public.locations l on l.organization_id=c.organization_id and l.id=c.location_id
    where c.organization_id=$1`,
  coaches: `select p.id,p.name,p.status,p.updated_at,p.revision::text,p.specialty as subtitle,
      x.locations,x.branch_names,jsonb_build_object('specialty',p.specialty,'qualification',p.qualification,
        'contact_phone',p.contact_phone,'contact_email',p.contact_email,'joined_on',p.joined_on,'notes',p.notes,
        'pay_basis',p.pay_basis,'pay_amount_minor',p.pay_amount_minor) as data
    from public.coach_profiles p cross join lateral (
      select coalesce(array_agg(l.id order by l.name,l.id),'{}'::uuid[]) as locations,
        coalesce(array_agg(l.name order by l.name,l.id),'{}'::text[]) as branch_names
      from public.coach_locations cl join public.locations l on (l.organization_id,l.id)=(cl.organization_id,cl.location_id)
      where cl.organization_id=p.organization_id and cl.coach_id=p.id and cl.active
    ) x where p.organization_id=$1`,
  students: `select p.id,p.name,p.status,p.updated_at,p.revision::text,p.skill_level as subtitle,
      x.locations,x.branch_names,jsonb_build_object('skill_level',p.skill_level,'contact_phone',p.contact_phone,
        'contact_email',p.contact_email,'joined_on',p.joined_on,'created_at',p.created_at,'notes',p.notes) as data
    from public.student_profiles p cross join lateral (
      select coalesce(array_agg(l.id order by l.name,l.id),'{}'::uuid[]) as locations,
        coalesce(array_agg(l.name order by l.name,l.id),'{}'::text[]) as branch_names
      from public.student_locations sl join public.locations l on (l.organization_id,l.id)=(sl.organization_id,sl.location_id)
      where sl.organization_id=p.organization_id and sl.student_id=p.id and sl.active
    ) x where p.organization_id=$1`,
} as const;

export function parseFilters(raw: Record<string, string | string[] | undefined>, scope: Branch[]): ResourceFilters {
  const read = (key: string) => typeof raw[key] === 'string' ? raw[key] : '';
  const status = read('status');
  const sort = read('sort');
  const requestedPage = Number(read('page'));
  const inactiveDays = Number(asciiDigits(read('inactiveDays')));
  return {
    q: read('q').trim().slice(0, 100),
    status: Object.hasOwn(resourceStatuses,status) ? status : '',
    branch: scope.some(branch => branch.id === read('branch')) ? read('branch') : '',
    sort: Object.hasOwn(orders,sort) ? sort : 'name',
    inactiveDays: Number.isInteger(inactiveDays) && inactiveDays>=1 && inactiveDays<=730 ? inactiveDays : 0,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function resourceList(user: string, org: string, kind: ResourceKind, filters: ResourceFilters) {
  const query = `with resource as (${base[kind]}), filtered as (
    select * from resource
    where ($2='' or strpos(translate(lower(name||' '||coalesce(subtitle,'')),'يك','یک'),translate(lower($2),'يك','یک'))>0)
      and ($3='' or status::text=$3) and ($4='' or nullif($4,'')::uuid=any(locations))
      and ($5::int=0 or (${kind === 'students' ? `
        coalesce((data->>'joined_on')::date,(data->>'created_at')::timestamptz::date) <= current_date-$5::int
        and not exists (
          select from public.session_participants sp join public.sessions s on s.id=sp.session_id
          where sp.organization_id=$1 and sp.student_id=resource.id and s.status='completed'
            and lower(s.actual_slot) >= now()-make_interval(days=>$5::int)
        )
      ` : 'true'}))
  )`;
  const params = [org,filters.q,filters.status,filters.branch,filters.inactiveDays];
  const order = orders[filters.sort as keyof typeof orders] ?? orders.name;
  return asUser(user, async db => {
    const total = (await db.query<{ total: number }>(`${query} select count(*)::int as total from filtered`, params)).rows[0].total;
    const pages = Math.max(1,Math.ceil(total/pageSize));
    const page = Math.min(filters.page,pages);
    const { rows } = await db.query<ResourceRow>(`${query}
      select id,name,status,updated_at,subtitle,branch_names from filtered order by ${order} limit $6 offset $7`,
    [...params,pageSize,(page-1)*pageSize]);
    return { rows,total,pages,page };
  });
}

export function resourceDetail(user: string, org: string, kind: ResourceKind, id: string) {
  return asUser(user, async db => (await db.query<ResourceDetail>(`select * from (${base[kind]}) r where id=$2`, [org,id])).rows[0]);
}

export type ResourceEvent = {
  occurred_at: Date; action: 'created' | 'edited' | 'archived' | 'hours' | 'rate';
  actor: string | null; previous_status: ResourceStatus | null; current_status: ResourceStatus | null;
};
export type CalendarEntry = {
  id: string; starts_at: Date; ends_at: Date; kind: 'rental' | 'private' | 'group';
  booking_status: 'confirmed' | 'cancelled'; branch_name: string; timezone: string;
  session_status: 'scheduled' | 'completed' | 'cancelled' | null; attendance: 'present' | 'late' | 'absent' | 'excused' | null;
};
const calendarJoins = {
  courts: { join: 'left join public.sessions s on s.booking_id=b.id', filter: 'b.court_id=$2', attendance: 'null::text' },
  coaches: { join: 'join public.sessions s on s.booking_id=b.id', filter: 's.coach_id=$2', attendance: 'null::text' },
  students: { join: `join public.sessions s on s.booking_id=b.id
    join public.session_participants sp on sp.session_id=s.id
    left join public.attendance_records ar on ar.participant_id=sp.id`,
    filter: 'sp.student_id=$2', attendance: 'ar.status::text' },
} as const;

export function resourceRecords(user: string, org: string, kind: ResourceKind, id: string) {
  const config = calendarJoins[kind];
  return asUser(user, async db => {
    const history = (await db.query<ResourceEvent>('select * from public.resource_history($1,$2,$3)',[org,resourceKinds[kind].db,id])).rows;
    const calendar = (await db.query<CalendarEntry>(`
      select b.id,b.starts_at,b.ends_at,b.kind,b.status as booking_status,l.name as branch_name,b.timezone,
        s.status as session_status,${config.attendance} as attendance
      from public.bookings b join public.locations l on l.organization_id=b.organization_id and l.id=b.location_id
      ${config.join} where b.organization_id=$1 and ${config.filter}
      order by (b.starts_at >= now()) desc,
        case when b.starts_at>=now() then b.starts_at end,
        case when b.starts_at<now() then b.starts_at end desc limit 12
    `,[org,id])).rows;
    const progress = kind === 'courts' ? null : (await db.query<{
      completed: number; minutes: number; attended: number;
    }>(`
      select count(*) filter (where s.status='completed')::int as completed,
        coalesce(sum(extract(epoch from (upper(s.actual_slot)-lower(s.actual_slot)))/60) filter (where s.status='completed'),0)::int as minutes,
        count(*) filter (where s.status='completed' and (${config.attendance}) in ('present','late'))::int as attended
      from public.bookings b ${config.join}
      where b.organization_id=$1 and ${config.filter}
    `,[org,id])).rows[0];
    return { history,calendar,progress };
  });
}

export type HoursEntry = { id: string; location_id: string; weekday: number; from_date: string; until_date: string | null; starts: number; ends: number };
export type CourtRate = { id: string; kind: 'rental' | 'private' | 'group'; from_time: Date; until_time: Date | null; unit_minutes: number; amount_minor: string; current: boolean };
export type CourtBlock = { id: string; starts_at: Date; ends_at: Date; reason: string; released_at: Date | null; releasable: boolean };
export type CourtOption = { id: string; location_id: string; name: string };

export function availableCourts(user: string, org: string, coach?: string) {
  return asUser(user, async db => {
    const options = (await db.query<CourtOption>(
      'select id,location_id,name from public.courts where organization_id=$1 order by location_id,name,id', [org])).rows;
    const selected = coach ? (await db.query<{ court_id: string }>(
      'select court_id from public.coach_courts where organization_id=$1 and coach_id=$2', [org,coach])).rows.map(row => row.court_id) : [];
    return { options,selected };
  });
}

export function resourceHours(user: string, org: string, kind: 'courts' | 'coaches', id: string) {
  const table = kind === 'courts' ? 'court_operating_hours' : 'coach_availability';
  const column = kind === 'courts' ? 'court_id' : 'coach_id';
  return asUser(user, async db => (await db.query<HoursEntry>(`
    select h.id,h.location_id,h.weekday,lower(h.valid_dates)::text as from_date,upper(h.valid_dates)::text as until_date,
      lower(h.local_minutes) as starts,upper(h.local_minutes) as ends
    from public.${table} h join public.locations l on (l.organization_id,l.id)=(h.organization_id,h.location_id)
    where h.organization_id=$1 and h.${column}=$2
      and (upper_inf(h.valid_dates) or upper(h.valid_dates)>timezone(l.timezone,now())::date)
    order by h.location_id, h.weekday, lower(h.valid_dates),lower(h.local_minutes) limit 150
  `,[org,id])).rows);
}

export function courtSettings(user: string, org: string, id: string) {
  return asUser(user, async db => {
    const rates = (await db.query<CourtRate>(`
      select id,kind,lower(effective) as from_time,upper(effective) as until_time,unit_minutes,amount_minor,effective @> now() as current
      from public.pricing_rules where organization_id=$1 and court_id=$2 order by lower(effective) desc,id limit 20`,[org,id])).rows;
    const blocks = (await db.query<CourtBlock>(`
      select id,lower(slot) as starts_at,upper(slot) as ends_at,reason,released_at,
        released_at is null and lower(slot)>=date_trunc('minute',statement_timestamp()) as releasable
      from public.court_maintenance_blocks where organization_id=$1 and court_id=$2 order by lower(slot) desc,id limit 20`,[org,id])).rows;
    const occupancy = (await db.query<{ open_minutes: number; booked_minutes: number }>(`
      with context as (
        select c.status,c.location_id,l.timezone,timezone(l.timezone,now())::date as day
        from public.courts c join public.locations l on (l.organization_id,l.id)=(c.organization_id,c.location_id)
        where c.organization_id=$1 and c.id=$2
      ), day_window as (
        select *,tstzrange(day::timestamp at time zone timezone,(day+1)::timestamp at time zone timezone,'[)') as span
        from context
      ), work as (
        select coalesce(range_agg(tstzrange(
          (x.day+lower(h.local_minutes)*interval '1 minute') at time zone x.timezone,
          (x.day+upper(h.local_minutes)*interval '1 minute') at time zone x.timezone,'[)')),'{}'::tstzmultirange) as slots
        from context x join public.court_operating_hours h on h.location_id=x.location_id
        where h.organization_id=$1 and h.court_id=$2 and x.status='active'
          and h.valid_dates @> x.day and h.weekday=extract(isodow from x.day)
      ), disabled as (
        select coalesce(range_agg(slot),'{}'::tstzmultirange) as slots from (
          select cb.slot from public.court_maintenance_blocks cb cross join day_window x
          where cb.organization_id=$1 and cb.court_id=$2 and cb.released_at is null and cb.slot && x.span
          union all
          select lc.slot from public.location_closures lc join day_window x on x.location_id=lc.location_id
          where lc.organization_id=$1 and lc.released_at is null and lc.slot && x.span
        ) d
      ), available as (
        select work.slots-disabled.slots as slots from work,disabled
      ), reserved as (
        select coalesce(range_agg(slot),'{}'::tstzmultirange) as slots
        from public.bookings cross join day_window x
        where organization_id=$1 and court_id=$2 and public.bookings.status='confirmed' and slot && x.span
      )
      select
        coalesce((select sum(extract(epoch from (upper(s)-lower(s)))/60)::int from unnest(a.slots) s),0) as open_minutes,
        coalesce((select sum(extract(epoch from (upper(s)-lower(s)))/60)::int from unnest(a.slots*r.slots) s),0) as booked_minutes
      from available a,reserved r
    `,[org,id])).rows[0];
    const currency = (await db.query<{ currency: string }>('select currency from public.organizations where id=$1',[org])).rows[0]?.currency ?? 'IRR';
    return { rates,blocks,occupancy,currency };
  });
}
