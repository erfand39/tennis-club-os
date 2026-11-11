import 'server-only';
import { asUser } from './db';
import { type AttendanceState, type ClassState } from './class-fields';
import { type Branch } from './club';

export type ClassItem = {
  id:string; booking_id:string; kind:'private'|'group'; status:ClassState;
  capacity:number; enrolled:number; starts_at:Date; ends_at:Date; timezone:string;
  court:string; coach:string|null; actual_start:Date|null; actual_end:Date|null;
};
type ClassDetail = Omit<ClassItem,'enrolled'> & { location_id:string; revision:string; booking_revision:string };
type RosterEntry = { id:string; student_id:string; name:string|null; withdrawn_at:Date|null; status:AttendanceState|null };
type History = { recorded_at:Date; actor:string|null; corrected:boolean; reason:string|null };

const classColumns = `
  s.id,s.booking_id,s.status,s.capacity,b.kind,b.location_id,b.starts_at,b.ends_at,b.timezone,
  lower(s.actual_slot) as actual_start,upper(s.actual_slot) as actual_end,b.revision as booking_revision,s.revision,
  c.name as court,coach.name as coach
`;
const classJoins = `
  join public.sessions s on (s.organization_id,s.location_id,s.booking_id)=(b.organization_id,b.location_id,b.id)
  join public.courts c on (c.organization_id,c.location_id,c.id)=(b.organization_id,b.location_id,b.court_id)
  left join public.coach_profiles coach on (coach.organization_id,coach.id)=(s.organization_id,s.coach_id)
`;

export function classList(user:string,org:string,branch:Branch,from:string,to:string,status:ClassState|null,page:number) {
  const size=24;
  return asUser(user,async db => {
    const rows=(await db.query<ClassItem>(`
      with selected as (
        select ${classColumns}
        from public.bookings b ${classJoins}
        where b.organization_id=$1 and b.location_id=$2
          and b.starts_at>=($4::date::timestamp at time zone $3) and b.starts_at<($5::date::timestamp at time zone $3)
          and ($6::public.session_status is null or s.status=$6)
        order by b.starts_at,s.id limit $7 offset $8
      )
      select x.*,roster.enrolled from selected x cross join lateral (
        select count(*)::int as enrolled from public.session_participants p where p.session_id=x.id and p.withdrawn_at is null
      ) roster order by x.starts_at,x.id
    `,[org,branch.id,branch.timezone,from,to,status,size+1,(page-1)*size])).rows;
    return {rows:rows.slice(0,size),hasNext:rows.length>size};
  });
}

export function classDetail(user:string,org:string,id:string) {
  return asUser(user,async db => {
    const session=(await db.query<ClassDetail>(`
      select ${classColumns}
      from public.bookings b ${classJoins} where s.organization_id=$1 and s.id=$2
    `,[org,id])).rows[0];
    if (!session) return null;
    const roster=(await db.query<RosterEntry>(`
      select p.id,p.student_id,sp.name,p.withdrawn_at,a.status
      from public.session_participants p
      left join public.student_profiles sp on (sp.organization_id,sp.id)=(p.organization_id,p.student_id)
      left join public.attendance_records a on a.participant_id=p.id
      where p.organization_id=$1 and p.location_id=$2 and p.session_id=$3
      order by p.withdrawn_at is not null,sp.name,p.id
    `,[org,session.location_id,id])).rows;
    const students=session.status==='scheduled' && session.kind==='group' ? (await db.query<{id:string;name:string}>(`
      select sp.id,sp.name from public.student_locations sl
      join public.student_profiles sp on (sp.organization_id,sp.id)=(sl.organization_id,sl.student_id)
      where sl.organization_id=$1 and sl.location_id=$2 and sl.active and sp.status='active'
        and not exists (select from public.session_participants p
          where p.session_id=$3 and p.student_id=sp.id and p.withdrawn_at is null)
      order by sp.name,sp.id
    `,[org,session.location_id,id])).rows : [];
    const history=(await db.query<History>('select * from public.class_attendance_history($1,$2,$3)',[org,session.location_id,id])).rows;
    return {session,roster,students,history};
  });
}
