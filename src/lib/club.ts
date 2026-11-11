import 'server-only';
import { asUser } from './db';
import type { ClubRole } from './roles';

export type Club = { id: string; name: string; role: ClubRole };
export type Branch = { id: string; name: string; timezone: string; active: boolean };
export type Member = {
  user_id: string; email: string | null; display_name: string | null; role: ClubRole;
  active: boolean; location_ids: string[]; person_id: string | null;
};
export const uuid = (id: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);

export async function clubs(userId: string): Promise<Club[]> {
  return asUser(userId, async db => (await db.query<Club>(`
    select o.id,o.name,m.role from public.organizations as o
    join public.organization_members as m on m.organization_id=o.id
    where m.user_id=$1 and m.active order by o.name,o.id`, [userId])).rows);
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
