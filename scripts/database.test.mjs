import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import pg from 'pg';

const url = new URL(process.env.TENNIS_TEST_DATABASE_URL ?? 'postgresql://localhost:54322/postgres');
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local development PostgreSQL instance.');
const connection = {
  host: url.hostname.replace(/[\[\]]/g, ''),
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username) || undefined,
  password: decodeURIComponent(url.password) || undefined,
  connectionTimeoutMillis: 3000,
};
const database = `sam_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({ ...connection, database: 'postgres' });
const clients = [];
let databaseCreated = false;
let db;
let owner;
let otherOwner;
let manager;
let coach;
let student;
let anon;

const id = value => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const org = id(1);
const main = id(11);
const second = id(12);
const court = id(21);
const otherCourt = id(22);
const inactiveCourt = id(23);
const secondCourt = id(24);
const coach1 = id(31);
const coach2 = id(32);
const student1 = id(41);
const student2 = id(42);
const otherOrg = id(101);
const otherLocation = id(111);
const otherOrgCourt = id(121);
const users = { owner: id(201), manager: id(202), coach: id(203), student: id(204), outsider: id(205) };
const now = new Date();
const anchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 5, 30);
const at = (minute, day = 0) => new Date(anchor + (minute + day * 1440) * 60000).toISOString();

async function connect(user, role = 'authenticated') {
  const client = new pg.Client({ ...connection, database, statement_timeout: 10000 });
  await client.connect();
  clients.push(client);
  if (user) {
    await client.query('set role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, role })]);
  } else if (role === 'anon') {
    await client.query('set role anon');
  }
  return client;
}

async function scalar(client, sql, args = []) {
  const { rows } = await client.query(sql, args);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

function reserve(client, {
  organization = org, location = main, targetCourt = court, start = 0, length = 60, day = 0,
  kind = 'rental', request = randomUUID(), name = kind === 'rental' ? 'رزرو آزمایشی' : null,
  trainer = null, learner = null, capacity = null,
} = {}) {
  return scalar(client, 'select public.create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [organization, location, targetCourt, at(start, day), at(start + length, day), kind, request, name, trainer, learner, capacity]);
}

async function collide(first, secondClient, win, challenge, error) {
  await first.query('begin');
  let pending;
  let committed = false;
  try {
    const winner = await win();
    pending = challenge().then(value => ({ value }), failure => ({ failure }));
    let waiting = false;
    for (let check = 0; check < 80 && !waiting; check += 1) {
      waiting = await scalar(db, "select wait_event_type = 'Lock' from pg_stat_activity where pid = $1", [secondClient.processID]);
      if (!waiting) await delay(15);
    }
    assert.equal(waiting, true, 'The second connection reached a real lock wait.');
    await first.query('commit');
    committed = true;
    const outcome = await pending;
    if (error) {
      assert.equal(outcome.failure?.code, error.code, outcome.failure?.message);
      if (error.constraint) assert.equal(outcome.failure.constraint, error.constraint);
      if (error.message) assert.equal(outcome.failure.message, error.message);
    } else {
      assert.ifError(outcome.failure);
      assert.equal(outcome.value, winner);
    }
    return winner;
  } finally {
    if (!committed) await first.query('rollback');
    if (pending) await pending;
  }
}

before(async () => {
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;`);
  await admin.query(`create database ${database} template template0`);
  databaseCreated = true;
  db = await connect();
  await db.query(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
    as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
    try {
      if (file.endsWith('_finance_workflow.sql')) {
        await db.query("insert into public.locations (id,organization_id,name,timezone) values ($1,$2,'شعبهٔ دادهٔ قبلی','Asia/Tehran')",[id(311),id(301)]);
        await db.query("insert into public.invoices (id,organization_id,location_id,currency,total_amount_minor,issued_by) values ($1,$2,$3,'IRR',10000,$4)",
          [id(381),id(301),id(311),users.owner]);
        await db.query("insert into public.payments (id,organization_id,location_id,invoice_id,method,amount_minor,received_by) values ($1,$2,$3,$4,'cash',6000,$5)",
          [id(382),id(301),id(311),id(381),users.owner]);
        await db.query("insert into public.refunds (organization_id,location_id,payment_id,amount_minor,reason,recorded_by) values ($1,$2,$3,2000,'بازپرداخت قدیمی',$4)",
          [id(301),id(311),id(382),users.owner]);
      }
      await db.query(await readFile(new URL(file, migrations), 'utf8'));
      if (file.endsWith('_club_identity.sql')) {
        await db.query("insert into public.organizations (id,name) values ($1,'دادهٔ نسخهٔ قبلی')",[id(301)]);
        await db.query('insert into auth.users (id) values ($1),($2)',[users.coach,users.student]);
        await db.query("insert into public.organization_members (organization_id,user_id,role) values ($1,$2,'coach'),($1,$3,'student')",
          [id(301),users.coach,users.student]);
        await db.query("insert into public.coach_profiles (id,organization_id,user_id,name) values ($1,$2,$3,'مربی قدیمی')",
          [id(331),id(301),users.coach]);
        await db.query("insert into public.student_profiles (id,organization_id,user_id,name) values ($1,$2,$3,'شاگرد قدیمی')",
          [id(341),id(301),users.student]);
      }
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }
  await db.query(await readFile(new URL('../supabase/seeds/club_dev.sql', import.meta.url), 'utf8'));
  await db.query("insert into public.organizations (id, name) values ($1, 'باشگاه دوم')", [otherOrg]);
  await db.query("insert into public.locations (id, organization_id, name) values ($1,$2,'شعبهٔ بیرونی')", [otherLocation, otherOrg]);
  await db.query("insert into public.courts (id, organization_id, location_id, name, surface) values ($1,$2,$3,'زمین دیگر','خاک رس')",
    [otherOrgCourt, otherOrg, otherLocation]);
  await db.query('insert into auth.users (id) select unnest($1::uuid[]) on conflict do nothing', [Object.values(users)]);
  await db.query(`insert into public.organization_members (organization_id,user_id,role) values
    ($1,$2,'owner'),($1,$3,'admin'),($4,$5,'owner')`, [org,users.owner,users.manager,otherOrg,users.outsider]);
  await db.query('insert into public.member_locations (organization_id,location_id,user_id) values ($1,$2,$3)',
    [org,main,users.manager]);

  owner = await connect(users.owner);
  otherOwner = await connect(users.outsider);
  manager = await connect(users.manager);
  coach = await connect(users.coach);
  student = await connect(users.student);
  anon = await connect(null, 'anon');
  console.log(await scalar(db, 'show server_version'));
});

after(async () => {
  await Promise.allSettled(clients.map(client => client.end()));
  try {
    if (databaseCreated) await admin.query(`drop database ${database}`);
  } finally {
    await admin.end();
  }
});

test('migration, grants, RLS and composite organization keys', async () => {
  assert.equal(await scalar(owner, 'select name from public.organizations'), 'باشگاه تنیس سام');
  assert.equal(await scalar(owner, 'select count(*)::int from public.locations'), 2);
  assert.equal(await scalar(manager, 'select count(*)::int from public.locations'), 1);
  assert.equal(await scalar(otherOwner, 'select count(*)::int from public.courts where organization_id = $1', [org]), 0);
  await assert.rejects(anon.query('select * from public.courts'), { code: '42501' });
  await assert.rejects(reserve(anon), { code: '42501' });
  await assert.rejects(reserve(manager, { location: second, targetCourt: secondCourt }), { code: '42501' });
  await assert.rejects(reserve(otherOwner, { organization: otherOrg, location: main }), { code: '42501' });
  await assert.rejects(owner.query("update public.courts set name = 'تغییر مستقیم'"), { code: '42501' });
  await assert.rejects(owner.query('select * from tennis_private.audit_events'), { code: '42501' });
  await assert.rejects(db.query('insert into public.member_locations (organization_id,location_id,user_id) values ($1,$2,$3)',
    [org, otherLocation, users.owner]), { code: '23503' });
  assert.equal(await scalar(db, `select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','tennis_private') and c.relkind='r' and not c.relrowsecurity`), 0);
  assert.equal(await scalar(db, `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef`), 0);
  assert.equal(await scalar(db, `select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','tennis_private') and has_function_privilege('anon',p.oid,'execute')`), 0);
  await assert.rejects(owner.query('select tennis_private.lock_location($1,$2,true)', [org, main]), { code: '42501' });
});

test('business hours, active resources and closure boundaries', async () => {
  await assert.rejects(reserve(owner, { start: -120 }), { message: 'outside_court_hours' });
  await assert.rejects(reserve(owner, { targetCourt: inactiveCourt }), { message: 'court_unavailable' });
  await assert.rejects(reserve(owner, { length: 45 }), { message: 'duration_not_a_pricing_multiple' });
  const closure = await scalar(owner, 'select public.close_location($1,$2,$3,$4,$5,$6)',
    [org, main, at(0, 3), at(60, 3), 'تعطیلی آزمایشی', randomUUID()]);
  await assert.rejects(reserve(owner, { day: 3 }), { message: 'location_closed' });
  await scalar(owner, 'select public.release_location_closure($1,$2,$3,$4)', [org, main, closure, randomUUID()]);
  assert.ok(await reserve(owner, { day: 3 }));
});

test('concurrent court bookings, idempotent replay and adjacent range', async () => {
  const sibling = await connect(users.owner);
  const first = { start: 0, request: randomUUID() };
  const booking = await collide(owner, sibling, () => reserve(owner, first),
    () => reserve(sibling, { start: 0 }), { code: '23P01', constraint: 'court_slot_no_overlap' });
  assert.equal(await reserve(owner, first), booking);
  await assert.rejects(reserve(owner, { ...first, start: 60 }), { message: 'request_payload_mismatch' });
  assert.ok(await reserve(owner, { start: 60 }));
  assert.equal(await scalar(db, 'select count(*)::int from public.bookings where court_id=$1 and lower(slot)=$2', [court, at(0)]), 1);
  assert.equal(await scalar(db, 'select count(*)::int from tennis_private.operation_requests where result_id is null'), 0);
});

test('independent coach and student conflicts across branches roll back all rows', async () => {
  const sibling = await connect(users.owner);
  await collide(owner, sibling,
    () => reserve(owner, { start: 120, kind: 'private', trainer: coach1, learner: student1 }),
    () => reserve(sibling, { start: 120, location: second, targetCourt: secondCourt, kind: 'private', trainer: coach1, learner: student2 }),
    { code: '23P01', constraint: 'coach_slot_no_overlap' });
  await collide(owner, sibling,
    () => reserve(owner, { start: 180, kind: 'private', trainer: coach1, learner: student1 }),
    () => reserve(sibling, { start: 180, location: second, targetCourt: secondCourt, kind: 'private', trainer: coach2, learner: student1 }),
    { code: '23P01', constraint: 'student_slot_no_overlap' });
  assert.equal(await scalar(db, 'select count(*)::int from public.bookings where location_id=$1', [second]), 0);
  assert.equal(await scalar(db, 'select count(*)::int from tennis_private.court_allocations where location_id=$1', [second]), 0);
  assert.equal(await scalar(db, 'select count(*)::int from public.booking_prices where location_id=$1', [second]), 0);
});

test('last class seat is protected against concurrent enrollment', async () => {
  const booking = await reserve(owner, { start: 240, kind: 'group', trainer: coach1, capacity: 1 });
  const session = await scalar(db, 'select id from public.sessions where booking_id=$1', [booking]);
  const sibling = await connect(users.owner);
  const add = (client, learner) => scalar(client, 'select public.add_session_participant($1,$2,$3,$4,$5)',
    [org, main, session, learner, randomUUID()]);
  await collide(owner, sibling, () => add(owner, student1), () => add(sibling, student2),
    { code: '23514', message: 'session_at_capacity' });
  assert.equal(await scalar(db, 'select count(*)::int from public.session_participants where session_id=$1', [session]), 1);
});

test('failed reschedule preserves the original slot and cancellation releases it', async () => {
  const booking = await reserve(owner, { start: 300 });
  const move = start => scalar(owner, 'select public.reschedule_booking($1,$2,$3,$4,$5)', [org, main, booking, at(start), randomUUID()]);
  await assert.rejects(move(0), { constraint: 'court_slot_no_overlap' });
  assert.equal(await scalar(db, 'select lower(slot) = $2 from public.bookings where id=$1', [booking, at(300)]), true);
  await move(360);
  assert.ok(await reserve(owner, { start: 300 }));
  await scalar(owner, 'select public.cancel_booking($1,$2,$3,$4,$5)', [org, main, booking, 'آزمون لغو', randomUUID()]);
  assert.ok(await reserve(owner, { start: 360 }));
  assert.equal(await scalar(db, 'select status from public.bookings where id=$1', [booking]), 'cancelled');
});

test('maintenance shares the same exclusion constraint with bookings', async () => {
  const block = (start, length) => scalar(owner, 'select public.block_court($1,$2,$3,$4,$5,$6,$7)',
    [org, main, court, at(start), at(start + length), 'تعمیرات آزمایشی', randomUUID()]);
  await assert.rejects(block(0, 30), { constraint: 'court_slot_no_overlap' });
  const blocked = await block(420, 60);
  await assert.rejects(reserve(owner, { start: 420 }), { constraint: 'court_slot_no_overlap' });
  await scalar(owner, 'select public.release_court_block($1,$2,$3,$4)', [org, main, blocked, randomUUID()]);
  assert.ok(await reserve(owner, { start: 420 }));
});

test('same-key concurrent retry returns one booking and audit event', async () => {
  const sibling = await connect(users.owner);
  const draft = { start: 480, request: randomUUID() };
  const booking = await collide(owner, sibling, () => reserve(owner, draft), () => reserve(sibling, draft));
  assert.equal(await scalar(db, "select count(*)::int from tennis_private.audit_events where target_id=$1 and action='create_booking'", [booking]), 1);
});

test('financial snapshot, concurrent payments and refunds, and restricted access', async () => {
  const booking = await reserve(owner, { start: 540 });
  const invoiceKey = randomUUID();
  const issue = () => scalar(owner, 'select public.issue_booking_invoice($1,$2,$3,$4)', [org, main, booking, invoiceKey]);
  await db.query("update public.pricing_rules set amount_minor=1900000 where court_id=$1 and kind='rental'", [court]);
  const invoice = await issue();
  assert.equal(await issue(), invoice);
  assert.equal(await scalar(owner, 'select total_amount_minor from public.invoices where id=$1', [invoice]), '3600000');
  assert.equal(await scalar(otherOwner, 'select count(*)::int from public.invoice_balances where invoice_id=$1', [invoice]), 0);
  assert.equal(await scalar(coach, 'select count(*)::int from public.booking_prices'), 0);
  await assert.rejects(scalar(coach, 'select public.record_payment($1,$2,$3,100,$4,$5)', [org, main, invoice, 'cash', randomUUID()]), { code: '42501' });

  const sibling = await connect(users.owner);
  const pay = (client, request) => scalar(client, 'select public.record_payment($1,$2,$3,2500000,$4,$5)',
    [org, main, invoice, 'cash', request]);
  const payKey = randomUUID();
  const payment = await collide(owner, sibling, () => pay(owner, payKey), () => pay(sibling, randomUUID()),
    { code: '23514', message: 'payment_exceeds_due' });
  assert.equal(await pay(owner, payKey), payment);
  const refund = (client, request) => scalar(client, 'select public.record_refund($1,$2,$3,1500000,$4,$5)',
    [org, main, payment, 'اصلاح دریافت آزمایشی', request]);
  const refundKey = randomUUID();
  const refunded = await collide(owner, sibling, () => refund(owner, refundKey), () => refund(sibling, randomUUID()),
    { code: '23514', message: 'refund_exceeds_payment' });
  assert.equal(await refund(owner, refundKey), refunded);
  await assert.rejects(refund(coach, randomUUID()), { code: '42501' });
  const { rows: [balance] } = await owner.query('select due_minor, received_minor, status from public.invoice_balances where invoice_id=$1', [invoice]);
  assert.deepEqual(balance, { due_minor: '2600000', received_minor: '1000000', status: 'partial' });
  await sibling.query('begin isolation level repeatable read');
  try {
    assert.equal(await scalar(sibling, 'select due_minor from public.invoice_balances where invoice_id=$1', [invoice]), '2600000');
    await collide(owner, sibling, () => pay(owner, randomUUID()), () => pay(sibling, randomUUID()), { code: '40001' });
  } finally {
    await sibling.query('rollback');
  }
  assert.equal(await scalar(owner, 'select due_minor from public.invoice_balances where invoice_id=$1', [invoice]), '100000');
});

test('finance upgrade numbers an existing invoice and preserves its reconciled balance', async () => {
  const {rows:[record]}=await db.query(`select i.invoice_number,i.discount_minor,i.voided_at,b.received_minor,b.due_minor,b.status
    from public.invoices i join public.invoice_balances b on b.invoice_id=i.id where i.id=$1`,[id(381)]);
  assert(BigInt(record.invoice_number)>0n);
  assert.deepEqual([record.discount_minor,record.voided_at,record.received_minor,record.due_minor,record.status],
    ['0',null,'4000','6000','partial']);
});

test('schedule version prevents stale decisions at repeatable read', async () => {
  const sibling = await connect(users.owner);
  const draft = { start: 660, request: randomUUID() };
  await sibling.query('begin isolation level repeatable read');
  try {
    await scalar(sibling, 'select count(*)::int from public.locations');
    await collide(owner, sibling, () => reserve(owner, { start: 600 }), () => reserve(sibling, draft), { code: '40001' });
  } finally {
    await sibling.query('rollback');
  }
  assert.ok(await reserve(sibling, draft));
});

test('legacy coach and student accounts are retired and their records are preserved', async () => {
  assert.equal(await scalar(coach,'select count(*)::int from public.organizations'),0);
  assert.equal(await scalar(student,'select count(*)::int from public.student_profiles'),0);
  assert.equal(await scalar(db,"select name from public.coach_profiles where id=$1 and user_id is null",[id(331)]),'مربی قدیمی');
  assert.equal(await scalar(db,"select name from public.student_profiles where id=$1 and user_id is null",[id(341)]),'شاگرد قدیمی');
  assert.equal(await scalar(db,"select count(*)::int from tennis_private.access_audit where organization_id=$1 and action='non_manager_access_retired'",[id(301)]),2);
  await assert.rejects(scalar(owner,"select public.set_club_member($1,$2,'coach',true,$3)",[org,users.coach,[main]]), {message:'manager_role_required'});
  await assert.rejects(db.query("insert into public.organization_members (organization_id,user_id,role) values ($1,$2,'student')",
    [org,users.student]),{code:'23514'});
});

function saveResource(client, kind, target, revision, locations, values, key=randomUUID()) {
  return scalar(client,'select public.save_club_resource($1,$2,$3,$4,$5,$6,$7)',[org,kind,target,revision,locations,values,key]);
}

test('directory saves are idempotent, versioned, branch-scoped and audited', async () => {
  const draft={name:'زمین جدید',surface:'خاک رس',status:'active',capacity:4,amenities:['نور']};
  const key=randomUUID();
  const created=await saveResource(manager,'court',null,null,[main],draft,key);
  assert.equal(await saveResource(manager,'court',null,null,[main],draft,key),created);
  await assert.rejects(saveResource(manager,'court',null,null,[second],draft),{code:'42501'});
  await assert.rejects(saveResource(coach,'court',null,null,[main],draft),{code:'42501'});
  await assert.rejects(saveResource(manager,'court',null,null,[main],{...draft,name:'نام دیگر'},key),{message:'request_payload_mismatch'});
  await saveResource(manager,'court',created,0,[main],{...draft,name:'زمین ویرایش‌شده'});
  await assert.rejects(saveResource(manager,'court',created,0,[main],draft),{message:'resource_stale'});
  await saveResource(manager,'court',created,1,[],{action:'archive'});
  assert.equal(await scalar(owner,'select status from public.courts where id=$1',[created]),'archived');
  const {rows}=await manager.query("select action from public.resource_history($1,'court',$2)",[org,created]);
  assert.deepEqual(rows.map(row=>row.action),['archived','edited','created']);
});

test('availability and court restrictions protect existing and future reservations', async () => {
  const tomorrow=at(0).slice(0,10);
  const weekday=new Date(tomorrow+'T00:00Z').getUTCDay() || 7;
  await assert.rejects(saveResource(owner,'court',court,0,[],{action:'archive'}),{message:'resource_has_future_booking'});
  await assert.rejects(scalar(owner,"select public.set_resource_hours($1,'court',$2,$3,$4,$5,780,1320,$6)",
    [org,court,main,weekday,tomorrow,randomUUID()]),{message:'hours_conflict_with_future_booking'});
  await saveResource(owner,'coach',coach1,0,[main,second],{name:'آرمان کیانی',status:'active',court_ids:[court]});
  await assert.rejects(reserve(owner,{targetCourt:otherCourt,day:4,start:0,kind:'private',trainer:coach1,learner:student1}),
    {message:'coach_court_not_allowed'});
  assert.ok(await reserve(owner,{targetCourt:court,day:4,start:0,kind:'private',trainer:coach1,learner:student1}));
  await assert.rejects(saveResource(manager,'coach',coach1,1,[main],{name:'ویرایش شعبه',status:'active'}),{code:'42501'});
});

test('dated tariff preserves an earlier booking snapshot', async () => {
  const from=at(0,2).slice(0,10);
  const previous=await scalar(owner,"select booking_id from public.booking_prices where court_id=$1 and amount_minor=3600000 limit 1",[court]);
  assert.ok(previous);
  await scalar(owner,"select public.set_court_rate($1,$2,$3,'rental',$4,30,2500000,$5)",[org,main,court,from,randomUUID()]);
  const booking=await reserve(owner,{day:2,start:0});
  assert.equal(await scalar(owner,'select amount_minor from public.booking_prices where booking_id=$1',[booking]),'5000000');
  assert.equal(await scalar(owner,'select amount_minor from public.booking_prices where booking_id=$1',[previous]),'3600000');
});

test('calendar query uses the scope and start-time index on 2400 historical rows', async () => {
  await db.query(`insert into public.bookings
    (organization_id, location_id, court_id, slot, timezone, kind, booker_name, created_by)
    select $1, $2, $3, tstzrange(t, t + interval '30 minutes', '[)'), 'Asia/Tehran', 'rental', 'دادهٔ سنجش', $4
    from generate_series(1, 2400) as n
    cross join lateral (select now() - n * interval '1 day' as t) as days`, [org, main, otherCourt, users.owner]);
  await db.query('analyze public.bookings');
  const explain = await scalar(owner, `explain (analyze, buffers, format json)
    select id from public.bookings where organization_id=$1 and location_id=$2
      and starts_at >= $3 and starts_at < $4 order by starts_at, id limit 40`,
    [org, main, at(0), at(0, 1)]);
  assert.ok(JSON.stringify(explain[0].Plan).includes('bookings_calendar_idx'), JSON.stringify(explain[0].Plan));
  console.log(`calendar plan: ${explain[0]['Execution Time']} ms with 2400 historical rows`);
});
