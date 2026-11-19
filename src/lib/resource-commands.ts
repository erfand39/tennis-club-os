import 'server-only';
import { type PoolClient } from 'pg';
import { uuid } from './club';
import { asUser } from './db';
import { parseMinor } from './money';
import { InputError } from './input';
import { asciiDigits, bookingKinds, isResourceKind, resourceKinds, resourcePath } from './resource-fields';

export const resourceCommands = ['resource', 'resource-hours', 'resource-rate', 'resource-block', 'resource-release'] as const;
export type ResourceCommand = typeof resourceCommands[number];
export function isResourceCommand(action: string): action is ResourceCommand {
  return resourceCommands.some(item => item === action);
}

function field(values: URLSearchParams, key: string, max: number, required = false): string {
  const value = (values.get(key) ?? '').trim();
  if (value.length > max || (required && !value)) throw new InputError('resource-invalid');
  return value;
}
function id(values: URLSearchParams, key: string): string {
  const value = values.get(key) ?? '';
  if (!uuid(value)) throw new InputError('resource-invalid');
  return value;
}
function ids(values: URLSearchParams, key: string): string[] {
  const selected = [...new Set(values.getAll(key))].sort();
  if (selected.length > 100 || selected.some(value => !uuid(value))) throw new InputError('resource-invalid');
  return selected;
}
function numeric(value: string, min: number, max: number): number {
  const normalized = asciiDigits(value.trim()).replace(/٬/g, ',');
  const result = Number(normalized.replace(/,/g, ''));
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized) || !Number.isSafeInteger(result) || result < min || result > max) throw new InputError('resource-number');
  return result;
}
function date(value: string, optional = false): string | null {
  const cleaned = asciiDigits(value);
  if (!cleaned && optional) return null;
  const parsed = new Date(`${cleaned}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== cleaned) {
    throw new InputError('resource-date');
  }
  return cleaned;
}
function time(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(asciiDigits(value.trim()));
  if (!match || +match[1] > 24 || +match[2] > 59 || (+match[1] === 24 && +match[2] !== 0)) {
    throw new InputError('resource-time');
  }
  return +match[1] * 60 + +match[2];
}

function readProfile(values: URLSearchParams, type: 'coaches' | 'students') {
  const phone = asciiDigits(field(values, 'phone', 35));
  const email = field(values, 'email', 254).toLowerCase();
  if (phone && !/^[+0-9() -]{3,35}$/.test(phone)) throw new InputError('resource-phone');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('email');
  const person = { phone, email, joined_on: date(field(values, 'joined_on', 10), true) };
  if (type === 'students') return { ...person, skill_level: field(values, 'skill_level', 100) };
  const basis = field(values, 'pay_basis', 20);
  const raw = field(values, 'pay_amount_minor', 20);
  if ((basis && !['hourly','per_session','revenue_share','agreement'].includes(basis)) || Boolean(basis) !== Boolean(raw)) throw new InputError('resource-pay');
  return {
    ...person,
    specialty: field(values, 'specialty', 120),
    qualification: field(values, 'qualification', 240),
    pay_basis: basis,
    pay_amount_minor: raw ? numeric(raw, 0, basis==='revenue_share'?100:9999999999999) : null,
    court_ids: ids(values, 'court_id'),
  };
}

function resourceValues(values: URLSearchParams, type: keyof typeof resourceKinds, target?: string) {
  if (values.get('intent') === 'archive') {
    if (!target) throw new InputError('resource-invalid');
    return { locations: [], payload: { action: 'archive' } };
  }
  const status = values.get('status');
  if (status !== 'active' && status !== 'inactive' && status !== 'archived') throw new InputError('resource-invalid');
  const locations = ids(values, 'location');
  if (!locations.length) throw new InputError('resource-location');
  const common = { name: field(values, 'name', type === 'courts' ? 100 : 120, true), status, notes: field(values, 'notes', 2000) };
  if (type === 'courts') {
    const amenities = [...new Set(field(values, 'amenities', 600).split(/[،,\n]/).map(value => value.trim()).filter(Boolean))];
    if (amenities.length > 15 || amenities.some(item => item.length > 70)) throw new InputError('resource-invalid');
    return { locations, payload: { ...common, surface: field(values, 'surface', 60, true),
      capacity: numeric(field(values, 'capacity', 5), 1, 100), amenities } };
  }
  return { locations, payload: { ...common, ...readProfile(values, type) } };
}

async function branchTimestamps(db: PoolClient, org: string, branch: string, start: string, end: string): Promise<[Date, Date]> {
  const pattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
  for (const value of [start,end]) {
    const match = pattern.exec(value);
    if (!match) throw new InputError('resource-date');
    date(match[1]);
    if (time(match[2]) >= 1440) throw new InputError('resource-time');
  }
  const { rows } = await db.query<{ start_at: Date; end_at: Date; matches: boolean }>(`
    select $3::timestamp at time zone l.timezone as start_at, $4::timestamp at time zone l.timezone as end_at,
      ($3::timestamp at time zone l.timezone) at time zone l.timezone=$3::timestamp
      and ($4::timestamp at time zone l.timezone) at time zone l.timezone=$4::timestamp as matches
    from public.locations l where l.organization_id=$1 and l.id=$2 and l.active
  `, [org,branch,start,end]);
  if (!rows[0]?.matches || rows[0].start_at >= rows[0].end_at) throw new InputError('resource-time');
  return [rows[0].start_at, rows[0].end_at];
}

export async function runResourceCommand(action: ResourceCommand, values: URLSearchParams, user: string, org: string): Promise<string> {
  const kind = values.get('kind') ?? '';
  if (!isResourceKind(kind)) throw new InputError('resource-invalid');
  const dbKind = resourceKinds[kind].db;
  const request = id(values, 'request');
  if (action === 'resource') {
    const target = values.get('id') ? id(values, 'id') : undefined;
    const revision = target ? numeric(field(values,'revision',20),0,Number.MAX_SAFE_INTEGER) : null;
    const { locations, payload } = resourceValues(values, kind, target);
    const result = await asUser(user, async db => (await db.query<{ id: string }>(
      'select public.save_club_resource($1,$2,$3,$4,$5,$6,$7) as id', [org,dbKind,target ?? null,revision,locations,payload,request])).rows[0].id);
    return `${resourcePath(org,kind,result)}?saved=1`;
  }
  const target = id(values, 'id');
  const location = id(values, 'location');
  if (action === 'resource-hours' && kind !== 'students') {
    const weekday = numeric(field(values,'weekday',2),1,7);
    const from = date(field(values,'from',10,true));
    const closed = values.get('closed') === 'yes';
    const start = closed ? null : time(field(values,'start',8,true));
    const end = closed ? null : time(field(values,'end',8,true));
    if (start !== null && end !== null && start >= end) throw new InputError('resource-time');
    await asUser(user, db => db.query('select public.set_resource_hours($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [org,dbKind,target,location,weekday,from,start,end,request]));
  } else if (action === 'resource-rate' && kind === 'courts') {
    const booking = field(values,'booking_kind',15,true);
    if (!Object.hasOwn(bookingKinds,booking)) throw new InputError('resource-invalid');
    const from = date(field(values,'from',10,true));
    const unit = numeric(field(values,'unit_minutes',8),1,1440);
    await asUser(user, async db=>{
      const {rows:[club]}=await db.query<{currency:string}>('select currency from public.organizations where id=$1',[org]);
      const amount=parseMinor(field(values,'amount_minor',24,true),values.get('unit') ?? 'minor',club?.currency ?? '');
      if (amount===null) throw new InputError('finance-amount');
      return db.query('select public.set_court_rate($1,$2,$3,$4,$5,$6,$7,$8)',
        [org,location,target,booking,from,unit,amount.toString(),request]);
    });
  } else if (action === 'resource-block' && kind === 'courts') {
    const from = asciiDigits(field(values,'starts_at',16,true));
    const to = asciiDigits(field(values,'ends_at',16,true));
    await asUser(user, async db => {
      const [start,end] = await branchTimestamps(db,org,location,from,to);
      return db.query('select public.block_court($1,$2,$3,$4,$5,$6,$7)',
        [org,location,target,start,end,field(values,'reason',250,true),request]);
    });
  } else if (action === 'resource-release' && kind === 'courts') {
    const block = id(values,'block');
    await asUser(user, async db => {
      const found = await db.query('select 1 from public.court_maintenance_blocks where organization_id=$1 and location_id=$2 and court_id=$3 and id=$4',
        [org,location,target,block]);
      if (!found.rowCount) throw new InputError('denied',403);
      return db.query('select public.release_court_block($1,$2,$3,$4)',[org,location,block,request]);
    });
  } else throw new InputError('resource-invalid');
  return `${resourcePath(org,kind,target)}?saved=1`;
}
