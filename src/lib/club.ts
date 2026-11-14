import 'server-only';
import { asUser } from './db';
import type { bookingKinds } from './resource-fields';
import type { ClubRole } from './roles';

export type Club = { id: string; name: string; role: ClubRole };
export type Branch = { id: string; name: string; timezone: string; active: boolean };
export type Member = {
  user_id: string; email: string | null; display_name: string | null; role: ClubRole;
  active: boolean; location_ids: string[];
};
export type TodaySessionItem = {
  id: string;
  location_id: string;
  branch_name: string;
  court_name: string;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  kind: keyof typeof bookingKinds;
  status: 'confirmed' | 'cancelled';
  booker_name: string | null;
  coach_name: string | null;
  total_today: number;
  session_id: string | null;
  session_status: 'scheduled' | 'completed' | 'cancelled' | null;
};
export const uuid = (id: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);

export async function clubs(userId: string): Promise<Club[]> {
  return asUser(userId, async db => (await db.query<Club>(`
    select o.id,o.name,m.role from public.organizations as o
    join public.organization_members as m on m.organization_id=o.id
    where m.user_id=$1 and m.active and m.role in ('owner','admin') order by o.name,o.id`, [userId])).rows);
}

export async function clubFor(userId: string, org: string): Promise<Club | null> {
  if (!uuid(org)) return null;
  return (await clubs(userId)).find(club => club.id === org) ?? null;
}

export async function branches(userId: string, org: string): Promise<Branch[]> {
  return asUser(userId, async db => (await db.query<Branch>(
    'select id,name,timezone,active from public.locations where organization_id=$1 order by name', [org])).rows);
}

export async function members(userId: string, org: string): Promise<Member[]> {
  return asUser(userId, async db => (await db.query<Member>('select * from public.club_members($1)', [org])).rows);
}

export async function displayName(userId: string): Promise<string> {
  return asUser(userId, async db => (await db.query<{ display_name: string }>(
    'select display_name from public.profiles where user_id=$1', [userId])).rows[0]?.display_name ?? '');
}

export async function clubCurrency(userId: string, org: string): Promise<string | null> {
  return asUser(userId, async db => (await db.query<{ currency: string }>(
    'select currency from public.organizations where id=$1', [org])).rows[0]?.currency ?? null);
}

export async function clubOverviewCounts(userId: string, org: string) {
  return asUser(userId, async db => (await db.query<{
    courts: number; bookings: number; coaches: number; students: number;
  }>(`select
    (select count(*)::int from public.courts where organization_id=$1 and status='active') as courts,
    (select count(*)::int from public.bookings where organization_id=$1 and status='confirmed' and starts_at>=now()) as bookings,
    (select count(*)::int from public.coach_profiles where organization_id=$1 and status='active') as coaches,
    (select count(*)::int from public.student_profiles where organization_id=$1 and status='active') as students`, [org])).rows[0]);
}

export async function clubTodaySessions(userId: string, org: string, scope: Branch[]): Promise<TodaySessionItem[]> {
  if (!scope.length) return [];
  const branchIds = scope.map(branch => branch.id);
  return asUser(userId, async db => (await db.query<TodaySessionItem>(`
    select b.id, b.location_id, l.name as branch_name, c.name as court_name,
      b.starts_at, b.ends_at, b.timezone, b.kind, b.status, b.booker_name,
      cp.name as coach_name, s.id as session_id, s.status as session_status,
      count(*) over ()::int as total_today
    from public.bookings b
    join public.locations l on (l.organization_id, l.id) = (b.organization_id, b.location_id)
    join public.courts c on (c.organization_id, c.location_id, c.id) = (b.organization_id, b.location_id, b.court_id)
    left join public.sessions s on (s.organization_id, s.location_id, s.booking_id) = (b.organization_id, b.location_id, b.id)
    left join public.coach_profiles cp on (cp.organization_id, cp.id) = (s.organization_id, s.coach_id)
    where b.organization_id = $1
      and b.location_id = any($2::uuid[])
      and timezone(l.timezone, b.starts_at)::date = timezone(l.timezone, now())::date
    order by b.starts_at asc, b.id asc
    limit 12
  `, [org, branchIds])).rows);
}
