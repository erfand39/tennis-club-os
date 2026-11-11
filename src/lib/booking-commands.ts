import 'server-only';
import { type PoolClient } from 'pg';
import { uuid } from './club';
import { asUser } from './db';
import { InputError } from './input';
import { asciiDigits, bookingKinds } from './resource-fields';
import { calendarDateTime, calendarPath } from './calendar-dates';

const actions = ['booking-quote','booking-create','booking-move','booking-cancel'] as const;
type BookingAction = typeof actions[number];
type Price = { amount: string; currency: string };

export function isBookingAction(action: string): action is BookingAction {
  return actions.some(item => item === action);
}
function identifier(form: URLSearchParams, key: string, optional = false) {
  const value = form.get(key) ?? '';
  if (optional && !value) return null;
  if (!uuid(value)) throw new InputError('booking-invalid');
  return value;
}
function integer(form: URLSearchParams, key: string, min: number, max: number) {
  const value = asciiDigits((form.get(key) ?? '').trim());
  if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)<min || Number(value)>max) {
    throw new InputError('booking-invalid');
  }
  return Number(value);
}

async function startAt(db: PoolClient, org: string, location: string, form: URLSearchParams) {
  const value = calendarDateTime(form.get('start') ?? '');
  if (!value) throw new InputError('booking-time');
  const { rows } = await db.query<{ time: Date; valid: boolean }>(`
    select $3::timestamp at time zone timezone as time,
      (($3::timestamp at time zone timezone) at time zone timezone)=$3::timestamp as valid
    from public.locations where organization_id=$1 and id=$2 and active
  `,[org,location,value]);
  if (!rows[0]) throw new InputError('denied',403);
  if (!rows[0].valid) throw new InputError('booking-time');
  return rows[0].time;
}

async function readDraft(db: PoolClient, org: string, branch: string, form: URLSearchParams) {
  const court = identifier(form,'court');
  const kind = form.get('kind') ?? '';
  if (!Object.hasOwn(bookingKinds,kind)) throw new InputError('booking-invalid');
  const start = await startAt(db,org,branch,form);
  const minutes = integer(form,'minutes',1,1440);
  const end = new Date(start.getTime()+minutes*60000);
  const name = (form.get('booker') ?? '').trim();
  const coach = identifier(form,'coach',true);
  const student = identifier(form,'student',true);
  const capacity = kind === 'group' ? integer(form,'capacity',1,100) : null;
  if (kind === 'rental' ? (!name || name.length>120 || coach || student) : (name || !coach || (kind==='private' && !student))) {
    throw new InputError('booking-parties');
  }
  return { court,kind,start,end,minutes,name:name || null,coach,student,capacity };
}

export function bookingError(failure: { code?: string; message?: string; constraint?: string }) {
  if (failure.code === '42501') return new InputError('denied',403);
  if (failure.code === '40001' || failure.code === '40P01') return new InputError('booking-retry',409);
  const errors: Record<string,string> = {
    court_slot_no_overlap: 'booking-court-conflict',
    coach_slot_no_overlap: 'booking-coach-conflict',
    student_slot_no_overlap: 'booking-student-conflict',
    location_closed: 'booking-closure',
    court_unavailable: 'booking-court-unavailable',
    coach_unavailable: 'booking-coach-unavailable',
    coach_court_not_allowed: 'booking-coach-unavailable',
    student_unavailable: 'booking-student-unavailable',
    outside_court_hours: 'booking-court-hours',
    outside_coach_hours: 'booking-coach-hours',
    booking_time_unavailable: 'booking-time',
    slot_crosses_local_day: 'booking-day',
    invalid_slot: 'booking-time',
    pricing_rule_unavailable: 'booking-no-rate',
    duration_not_a_pricing_multiple: 'booking-duration',
    booking_amount_out_of_range: 'booking-amount',
    invalid_booking_parties: 'booking-parties',
    booking_stale: 'booking-stale',
    booking_not_editable: 'booking-locked',
    booking_not_cancellable: 'booking-locked',
    session_not_editable: 'booking-locked',
    session_already_completed: 'booking-locked',
    request_payload_mismatch: 'booking-request',
  };
  const code = errors[failure.constraint ?? ''] ?? errors[failure.message ?? ''];
  if (code) return new InputError(code,failure.code==='23P01' || code==='booking-stale' || code==='booking-locked' ? 409 : 400);
  if (failure.code==='23P01') return new InputError('resource-conflict',409);
  if (failure.code==='23514' || failure.code?.startsWith('22')) return new InputError('booking-invalid');
}

export async function runBookingAction(action: BookingAction, form: URLSearchParams, user: string, org: string) {
  const branch = identifier(form,'branch')!;
  try {
    return await asUser(user, async db => {
      if (action==='booking-move' || action==='booking-cancel') {
        const booking = identifier(form,'booking')!;
        const request = identifier(form,'request');
        const revision = integer(form,'revision',0,Number.MAX_SAFE_INTEGER);
        const start = action==='booking-move' ? await startAt(db,org,branch,form) : null;
        const reason = action==='booking-cancel' ? (form.get('reason') ?? '').trim() : null;
        if (reason!==null && (!reason || reason.length>250)) throw new InputError('booking-reason');
        await db.query('select public.edit_calendar_booking($1,$2,$3,$4,$5,$6,$7)',[org,branch,booking,revision,start,reason,request]);
        return { next: calendarPath(org,{ booking }) + '?saved=1' };
      }
      const draft = await readDraft(db,org,branch,form);
      if (action==='booking-quote') {
        const { rows } = await db.query<Price & { unit: number; whole_units: boolean }>(`
          select (tennis_private.booking_unit_rate(r.id,tstzrange($5,$6,'[)'),l.timezone,$7)::numeric*($7::int/r.unit_minutes))::text as amount,o.currency,r.unit_minutes as unit,
            mod($7::int,r.unit_minutes)=0 as whole_units
          from public.pricing_rules r join public.organizations o on o.id=r.organization_id
          join public.courts c on (c.organization_id,c.location_id,c.id)=(r.organization_id,r.location_id,r.court_id)
          join public.locations l on (l.organization_id,l.id)=(r.organization_id,r.location_id)
          where (r.organization_id,r.location_id,r.court_id,r.kind)=($1,$2,$3,$4) and c.status='active'
            and r.effective @> tstzrange($5,$6,'[)')
        `,[org,branch,draft.court,draft.kind,draft.start,draft.end,draft.minutes]);
        const price = rows[0];
        if (!price) throw new InputError('booking-no-rate');
        if (!price.whole_units) throw new InputError('booking-duration');
        if (BigInt(price.amount)>9999999999999n) throw new InputError('booking-amount');
        return { price: { amount:price.amount,currency:price.currency } };
      }
      const expected = integer(form,'amount',0,9999999999999);
      const currency = form.get('currency') ?? '';
      if (!/^[A-Z]{3}$/.test(currency)) throw new InputError('booking-invalid');
      const request = identifier(form,'request');
      const { rows:[booking] } = await db.query<{ id: string }>('select public.create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as id',
        [org,branch,draft.court,draft.start,draft.end,draft.kind,request,draft.name,draft.coach,draft.student,draft.capacity]);
      const { rows:[price] } = await db.query<Price>('select amount_minor::text as amount,currency from public.booking_prices where organization_id=$1 and location_id=$2 and booking_id=$3',
        [org,branch,booking.id]);
      if (price?.amount!==String(expected) || price.currency!==currency) throw new InputError('booking-price-changed',409);
      return { next: calendarPath(org,{booking:booking.id})+'?saved=1' };
    });
  } catch (failure) {
    if (failure instanceof InputError) throw failure;
    throw bookingError(failure as Parameters<typeof bookingError>[0]) ?? failure;
  }
}
