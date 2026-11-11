import 'server-only';
import { bookingError } from './booking-commands';
import { calendarDateTime } from './calendar-dates';
import { attendanceStates, classesPath } from './class-fields';
import { uuid } from './club';
import { asUser } from './db';
import { InputError } from './input';

type ClassAction = 'class-enroll'|'class-withdraw'|'class-attendance';
export function isClassAction(action:string): action is ClassAction {
  return action==='class-enroll' || action==='class-withdraw' || action==='class-attendance';
}
function id(values:URLSearchParams,key:string) {
  const value=values.get(key) ?? '';
  if (!uuid(value)) throw new InputError('attendance-invalid');
  return value;
}
function revision(values:URLSearchParams,key:string) {
  const value=values.get(key) ?? '';
  if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InputError('attendance-invalid');
  return value;
}
function attendanceFrom(values:URLSearchParams) {
  const statuses:Record<string,string>={};
  for (const [key,value] of values) {
    if (!key.startsWith('attendance.')) continue;
    const participant=key.slice('attendance.'.length);
    if (!uuid(participant) || Object.hasOwn(statuses,participant) || !Object.hasOwn(attendanceStates,value)) {
      throw new InputError('attendance-incomplete');
    }
    statuses[participant]=value;
  }
  if (Object.keys(statuses).length>100) throw new InputError('attendance-invalid');
  return statuses;
}

export async function runClassAction(action:ClassAction,form:URLSearchParams,user:string,org:string) {
  const session=id(form,'session');
  const branch=id(form,'branch');
  const request=id(form,'request');
  try {
    await asUser(user,async db => {
      const exists=await db.query('select 1 from public.sessions where organization_id=$1 and location_id=$2 and id=$3',[org,branch,session]);
      if (!exists.rowCount) throw new InputError('denied',403);
      if (action==='class-enroll') {
        await db.query('select public.add_session_participant($1,$2,$3,$4,$5)',[org,branch,session,id(form,'student'),request]);
        return;
      }
      if (action==='class-withdraw') {
        await db.query('select public.withdraw_session_participant($1,$2,$3,$4,$5)',[org,branch,session,id(form,'participant'),request]);
        return;
      }
      const start=calendarDateTime(form.get('start') ?? '');
      const end=calendarDateTime(form.get('end') ?? '');
      if (!start || !end) throw new InputError('attendance-time');
      const {rows:[actual]}=await db.query<{starts_at:Date;ends_at:Date;valid:boolean}>(`
        select $4::timestamp at time zone b.timezone as starts_at,$5::timestamp at time zone b.timezone as ends_at,
          (($4::timestamp at time zone b.timezone) at time zone b.timezone)=$4::timestamp and
          (($5::timestamp at time zone b.timezone) at time zone b.timezone)=$5::timestamp as valid
        from public.sessions s join public.bookings b
          on (b.organization_id,b.location_id,b.id)=(s.organization_id,s.location_id,s.booking_id)
        where s.organization_id=$1 and s.location_id=$2 and s.id=$3
      `,[org,branch,session,start,end]);
      if (!actual?.valid) throw new InputError('attendance-time');
      await db.query('select public.record_class_attendance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [org,branch,session,revision(form,'revision'),revision(form,'booking_revision'),actual.starts_at,actual.ends_at,
          attendanceFrom(form),(form.get('reason') ?? '').trim() || null,request]);
    });
    return classesPath(org,session,{saved:'1'});
  } catch (failure) {
    if (failure instanceof InputError) throw failure;
    const db=failure as Parameters<typeof bookingError>[0];
    const errors:Record<string,[string,number?]> = {
      participant_already_enrolled:['attendance-duplicate',409], session_at_capacity:['attendance-full',409],
      session_not_open:['attendance-closed',409], participant_not_active:['attendance-closed',409],
      attendance_stale:['attendance-stale',409], attendance_invalid:['attendance-invalid'],
      attendance_reason_required:['attendance-reason'], attendance_roster_incomplete:['attendance-incomplete'],
      attendance_actual_invalid:['attendance-time'], invalid_slot:['attendance-time'], slot_crosses_local_day:['attendance-time'],
    };
    const match=errors[db.message ?? ''];
    throw match ? new InputError(...match) : bookingError(db) ?? failure;
  }
}
