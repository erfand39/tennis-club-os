import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';

const { SAM_TEST_ORIGIN: origin, SAM_TEST_SETUP_CODE: code, SAM_TEST_DATABASE_URL: databaseUrl } = process.env;
assert(origin && code && databaseUrl, 'Set the three SAM_TEST variables for a fresh disposable local stack.');
for (const url of [origin, databaseUrl]) {
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Test only against loopback services.');
}
assert.equal(new URL(databaseUrl).search, '', 'The test database URL must use the stated host and port.');
const db = new pg.Client({ connectionString: databaseUrl });
const password = `Test-${randomBytes(16).toString('hex')}`;
const ownerEmail = 'owner@sam.example';
const roles = ['admin'];
const identities = new Map();
let owner;
let org;
let branch;
let secondBranch;

function get(path, cookie) {
  return fetch(new URL(path, origin), { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
}
function post(action, fields, cookie, suppliedOrigin = origin) {
  const headers = { Origin: suppliedOrigin, Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return fetch(new URL(`/api/${action}`, origin), {
    method: 'POST', redirect: 'manual', headers, body: new URLSearchParams(fields),
  });
}
function sessionCookie(response) {
  const header = response.headers.get('set-cookie') ?? '';
  assert.match(header, /sam_session=[A-Za-z0-9_-]{43}/);
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=lax/i);
  return header.split(';', 1)[0];
}
function token(link) {
  const parsed = new URL(link);
  assert.equal(parsed.origin, origin);
  return new URLSearchParams(parsed.hash.slice(1)).get('token');
}

before(async () => {
  await db.connect();
  const { rows } = await db.query('select tennis_runtime.is_configured() as configured');
  assert.equal(rows[0].configured, false, 'The integration test needs a fresh disposable installation.');
});
after(async () => db.end());

test('first owner setup, invalid codes, hostile origins and one-time initialization', async () => {
  assert.equal((await get('/api/health')).status, 200);
  assert.equal((await get('/club')).status, 307);
  const values = { email: ownerEmail, password, code, name: 'مالک آزمایشی', timezone: 'Asia/Tehran' };
  assert.equal((await post('setup', values, undefined, 'http://example.test')).status, 403);
  assert.equal((await post('setup', { ...values, code: 'invalid' })).status, 403);
  const created = await post('setup', values);
  assert.equal(created.status, 303, created.status === 303 ? '' : await created.text());
  owner = sessionCookie(created);
  org = new URL(created.headers.get('location')).pathname.split('/').at(-1);
  const { rows } = await db.query('select id from public.locations where organization_id=$1', [org]);
  branch = rows[0].id;
  assert.equal((await post('setup', values)).status, 409);
  const page = await get(`/club/${org}`, owner);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /باشگاه تنیس سام/);
});

test('sign in, signed cookies, and a persisted profile', async () => {
  assert.equal((await post('login', { email: ownerEmail, password: 'wrong password' })).status, 401);
  assert.equal((await get(`/club/${org}`, 'sam_session=' + 'a'.repeat(43))).status, 307);
  const login = await post('login', { email: ownerEmail, password }, owner);
  assert.equal(login.status, 303);
  owner = sessionCookie(login);
  assert.equal((await post('profile', { org, name: 'نام مالک سام' }, owner)).status, 303);
  assert.match(await (await get(`/club/${org}/profile`, owner)).text(), /نام مالک سام/);
});

test('invitation and single-use acceptance for a manager', async () => {
  for (const role of roles) {
    const email = `${role}@sam.example`;
    const invitation = await post('invite', { org, email, role, location: branch }, owner);
    assert.equal(invitation.status, 200, invitation.status === 200 ? '' : await invitation.text());
    const inviteToken = token((await invitation.json()).link);
    assert.ok(inviteToken);
    const accepted = await post('redeem', { mode: 'invite', token: inviteToken, password });
    assert.equal(accepted.status, 200, accepted.status === 200 ? '' : await accepted.text());
    const cookie = sessionCookie(accepted);
    assert.equal((await post('redeem', { mode: 'invite', token: inviteToken, password })).status, 400);
    const { rows } = await db.query('select id from auth.users where email=$1', [email]);
    identities.set(role, { email, cookie, id: rows[0].id });
  }
});

test('manager-only invitations and branch isolation', async () => {
  const {rows:[second]}=await db.query("insert into public.locations (organization_id,name,timezone) values ($1,'شعبهٔ دوم آزمایشی','Asia/Tehran') returning id",[org]);
  secondBranch=second.id;
  for (const role of ['coach','student','receptionist','accountant']) {
    const email=`${role}@sam.example`;
    assert.equal((await post('invite',{org,email,role,location:branch},owner)).status,403);
    const {rows}=await db.query('select id from auth.users where email=$1',[email]);
    assert.equal(rows.length,0);
  }
  const { rows: [other] } = await db.query("insert into public.organizations (name) values ('مجموعهٔ دیگر') returning id");
  for (const [role, { cookie, id }] of identities) {
    const permitted = await get(`/club/${org}`, cookie);
    assert.equal(permitted.status, 200, role);
    const html = await permitted.text();
    assert.match(html, /شعبهٔ مرکزی/, role);
    assert.doesNotMatch(html, /شعبهٔ دوم آزمایشی/, role);
    assert.equal((await get(`/club/${org}/members`, cookie)).status, 404, role);
    assert.equal((await get(`/club/${other.id}`, cookie)).status, 404, role);
    assert.equal((await post('member', { org, user: id, role: 'owner' }, cookie)).status, 403, role);
  }
  assert.match(await (await get(`/club/${org}`, owner)).text(), /شعبهٔ دوم آزمایشی/);
  const { rows: [actor] } = await db.query('select id from auth.users where email=$1', [ownerEmail]);
  assert.equal((await post('member', { org, user: actor.id, role: 'admin', location: branch }, owner)).status, 403);
  const manager = identities.get('admin');
  assert.equal((await post('member', {org,user:manager.id,role:'admin',active:'no',location:branch},owner)).status,303);
  assert.equal((await get(`/club/${org}`,manager.cookie)).status,307);
  assert.equal((await post('login',{email:manager.email,password})).status,403);
  assert.equal((await post('member', {org,user:manager.id,role:'admin',active:'yes',location:branch},owner)).status,303);

});

test('concurrent refresh preserves a single valid local session', async () => {
  const { cookie, id } = identities.get('admin');
  await db.query("update tennis_runtime.web_sessions set access_expires_at=now()-interval '1 second' where user_id=$1", [id]);
  const results = await Promise.all([get(`/club/${org}`, cookie), get(`/club/${org}`, cookie)]);
  assert.deepEqual(results.map(response => response.status), [200, 200]);
  const { rows } = await db.query('select count(*)::int as count from tennis_runtime.web_sessions where user_id=$1 and access_expires_at>now()', [id]);
  assert.equal(rows[0].count, 1);
});

test('recovery and logout revoke prior sessions', async () => {
  const manager = identities.get('admin');
  const response = await post('recovery', { org, user: manager.id }, owner);
  assert.equal(response.status, 200);
  const newPassword = `${password}-next`;
  const recovered = await post('redeem', { mode: 'recovery', token: token((await response.json()).link), password: newPassword });
  assert.equal(recovered.status, 200, recovered.status === 200 ? '' : await recovered.text());
  const cookie = sessionCookie(recovered);
  assert.equal((await get(`/club/${org}`, manager.cookie)).status, 307);
  assert.equal((await post('login', { email: manager.email, password })).status, 401);
  assert.equal((await post('logout', {}, cookie)).status, 303);
  assert.equal((await get(`/club/${org}`, cookie)).status, 307);
  assert.equal((await post('login', { email: manager.email, password: newPassword })).status, 303);
});

test('management screens create, filter, edit and archive local records', async () => {
  const cmd=(action,fields,cookie=owner)=>post(action,{org,request:randomUUID(),...fields},cookie);
  const create=async fields=>{
    const response=await cmd('resource',fields);
    assert.equal(response.status,200,response.status===200?'':await response.text());
    return (await response.json()).next.split('?')[0];
  };
  const court=await create({kind:'courts',name:'زمین آزمایش سام',status:'active',surface:'خاک رس',capacity:'۴',amenities:'نور، رختکن',location:branch});
  const courtId=court.split('/').at(-1);
  const page=await get(court,owner);
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/زمین آزمایش سام/);
  assert.match(html,/تعمیرات و انسداد زمین/);
  assert.match(html,/اشغال امروز/);
  const result=await get(`/club/${org}/resources/courts?q=${encodeURIComponent('آزمایش سام')}`,owner);
  assert.equal(result.status,200);
  assert.match(await result.text(),/زمین آزمایش سام/);
  const edit=await cmd('resource',{kind:'courts',id:courtId,revision:'0',name:'زمین ویرایش سام',status:'active',surface:'هاردکورت',capacity:'6',location:branch});
  assert.equal(edit.status,200);
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const weekday=String(new Date(date+'T00:00Z').getUTCDay()||7);
  for (const [action,fields] of [
    ['resource-hours',{weekday,from:date,start:'08:00',end:'22:00'}],
    ['resource-rate',{from:date,unit_minutes:'60',amount_minor:'۲٬۰۰۰٬۰۰۰',booking_kind:'rental'}],
  ]) {
    const setting=await cmd(action,{kind:'courts',id:courtId,location:branch,...fields});
    assert.equal(setting.status,200,setting.status===200?'':await setting.text());
  }
  const occupancyPage=await (await get(court,owner)).text();
  assert.match(occupancyPage.replaceAll('<!-- -->',''), /۸۴۰ دقیقه قابل رزرو/);
  const future=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  const block=await cmd('resource-block',{kind:'courts',id:courtId,location:branch,starts_at:future+'T10:00',ends_at:future+'T11:00',reason:'تعمیرات آزمایشی'});
  assert.equal(block.status,200,block.status===200?'':await block.text());
  const {rows:[maintenance]}=await db.query('select id from public.court_maintenance_blocks where court_id=$1',[courtId]);
  assert.equal((await cmd('resource-release',{kind:'courts',id:courtId,location:branch,block:maintenance.id})).status,200);
  const coach=await create({kind:'coaches',name:'مربی پرونده‌ای',status:'active',phone:'۰۹۱۲۳۴۵۶۷۸۹',specialty:'کلاس گروهی',location:branch,court_id:courtId});
  const student=await create({kind:'students',name:'شاگرد پرونده‌ای',status:'active',skill_level:'متوسط',location:branch});
  assert.equal((await get(coach,owner)).status,200);
  const studentId=student.split('/').at(-1);
  assert.equal((await cmd('resource',{kind:'students',id:studentId,revision:'0',intent:'archive'})).status,200);
  assert.match(await (await get(student,owner)).text(),/آرشیوشده/);
  const {rows:[person]}=await db.query('select user_id,status from public.student_profiles where id=$1',[studentId]);
  assert.deepEqual(person,{user_id:null,status:'archived'});
  const other=await create({kind:'courts',name:'زمین خارج از حوزه',status:'active',surface:'هاردکورت',capacity:'4',location:secondBranch});
  const managerLogin=await post('login',{email:identities.get('admin').email,password:`${password}-next`});
  assert.equal((await get(other,sessionCookie(managerLogin))).status,404);
});

test('local calendar, price review and concurrent reservation use persisted branch data', async () => {
  const day=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
  const weekday=new Date(day+'T00:00Z').getUTCDay()||7;
  const {rows:courts}=await db.query(`
    insert into public.courts (organization_id,location_id,name,surface)
    values ($1,$2,'زمین زمان‌بندی یک','خاک رس'),($1,$2,'زمین زمان‌بندی دو','خاک رس'),($1,$2,'زمین زمان‌بندی سه','خاک رس')
    returning id,name
  `,[org,branch]);
  for (const {id} of courts) {
    await db.query(`insert into public.court_operating_hours (organization_id,location_id,court_id,weekday,valid_dates,local_minutes)
      values ($1,$2,$3,$4,daterange($5,null,'[)'),'[480,1320)')`,[org,branch,id,weekday,day]);
    await db.query(`insert into public.pricing_rules (organization_id,location_id,court_id,kind,effective,unit_minutes,amount_minor)
      select $1,$2,$3,k,tstzrange(($4::date::timestamp at time zone 'Asia/Tehran'),null,'[)'),60,1500000
      from unnest(array['rental','private','group']::public.booking_kind[]) k`,[org,branch,id,day]);
  }
  const setup=(court,values={})=>({org,branch,court,start:day+'T10:00',minutes:'۶۰',kind:'rental',booker:'رزروکنندهٔ آزمایشی',request:randomUUID(),...values});
  const cmd=(action,fields,cookie=owner)=>post('booking-'+action,fields,cookie);
  const ok=async response=>{
    const data=await response.json();
    assert.equal(response.status,200,JSON.stringify(data));
    return data;
  };
  const calendar=`/club/${org}/calendar?branch=${branch}&date=${day}`;
  const sample=setup(courts[0].id);
  assert.equal((await get(`/club/${org}/calendar?court=bad`,owner)).status,404);
  assert.equal((await get(`/club/${org}/calendar/new?branch=${branch}&date=${day}`,owner)).status,200);
  const page=await get(calendar,owner);
  assert.equal(page.status,200);
  assert.match(await page.text(),/زمان‌های آزاد زمین/);
  const block=await post('resource-block',{org,request:randomUUID(),location:branch,kind:'courts',id:courts[0].id,
    starts_at:day+'T15:00',ends_at:day+'T16:00',reason:'تعمیرات در تقویم'},owner);
  assert.equal(block.status,200);
  await db.query(`insert into public.location_closures (organization_id,location_id,slot,reason)
    values ($1,$2,tstzrange($3::timestamp at time zone 'Asia/Tehran',$4::timestamp at time zone 'Asia/Tehran','[)'),
      'تعطیلی در تقویم')`,[org,branch,day+'T17:00',day+'T18:00']);
  const courtView=await get(calendar+'&court='+courts[0].id,owner);
  assert.equal(courtView.status,200);
  const free=(await courtView.text()).replaceAll('<!-- -->','');
  assert.match(free,/08:00–15:00/);
  assert.match(free,/16:00–17:00/);
  assert.match(free,/18:00–22:00/);
  const {price}=await ok(await cmd('quote',sample));
  assert.deepEqual(price,{amount:'1500000',currency:'IRR'});
  const duringClosure=await cmd('create',{...sample,start:day+'T17:00',...price});
  assert.equal(duringClosure.status,409);
  assert.equal((await duringClosure.json()).error,'booking-closure');
  const wrong=await cmd('create',{...sample,amount:'1400000',currency:'IRR'});
  assert.equal(wrong.status,409);
  assert.equal((await wrong.json()).error,'booking-price-changed');
  assert.equal((await db.query('select 1 from public.bookings where court_id=$1',[courts[0].id])).rowCount,0);

  const attempts=await Promise.all([cmd('create',{...sample,...price}),cmd('create',{...sample,...price,request:randomUUID()})]);
  assert.deepEqual(attempts.map(response=>response.status).sort(),[200,409]);
  const winner=attempts.findIndex(response=>response.ok);
  const {next}=await ok(attempts[winner]);
  const busy=await attempts[1-winner].json();
  assert.equal(busy.error,'booking-court-conflict');
  const booking=next.split('?')[0].split('/').at(-1);
  const reference=await db.query('select starts_at,status from public.bookings where id=$1',[booking]);
  assert.equal(reference.rows[0].starts_at.toISOString(),day+'T06:30:00.000Z');
  const replayDraft=setup(courts[0].id,{start:day+'T11:00',...price});
  const first=await ok(await cmd('create',replayDraft));
  assert.deepEqual(await ok(await cmd('create',replayDraft)),first);

  for (const view of ['day','week','month']) {
    const response=await get(calendar+'&view='+view,owner);
    assert.equal(response.status,200,view);
    assert.match(await response.text(),/رزروکنندهٔ آزمایشی/);
  }
  const wrongMove=await cmd('move',{org,branch,booking,revision:'0',start:day+'T11:00',request:randomUUID()});
  assert.equal(wrongMove.status,409);
  assert.equal((await wrongMove.json()).error,'booking-court-conflict');
  assert.deepEqual((await db.query('select starts_at,status from public.bookings where id=$1',[booking])).rows,reference.rows);
  const move={org,branch,booking,revision:'0',start:day+'T12:00',request:randomUUID()};
  const moved=await ok(await cmd('move',move));
  assert.deepEqual(await ok(await cmd('move',move)),moved);
  const cancel={org,branch,booking,reason:'لغو آزمایشی مدیر',request:randomUUID()};
  const stale=await cmd('cancel',{...cancel,revision:'0'});
  assert.equal(stale.status,409);
  assert.equal((await stale.json()).error,'booking-stale');
  assert.equal((await cmd('cancel',{...cancel,revision:'1',reason:''})).status,400);
  const cancelled=await ok(await cmd('cancel',{...cancel,revision:'1'}));
  assert.deepEqual(await ok(await cmd('cancel',{...cancel,revision:'1'})),cancelled);
  const detail=await get(next,owner);
  assert.equal(detail.status,200);
  const rendered=await detail.text();
  for (const label of ['تاریخچهٔ سانس','لغو آزمایشی مدیر','۱٬۵۰۰٬۰۰۰ ریال','جابه‌جایی سانس']) assert(rendered.includes(label),label);
  assert.equal((await db.query('select status,revision from public.bookings where id=$1',[booking])).rows[0].revision,'2');
  await ok(await cmd('create',setup(courts[0].id,{start:day+'T12:00',...price})));

  const managerLogin=await post('login',{email:identities.get('admin').email,password:`${password}-next`});
  const manager=sessionCookie(managerLogin);
  assert.equal((await get(`/club/${org}/calendar?branch=${secondBranch}`,manager)).status,404);
  assert.equal((await cmd('quote',{...sample,branch:secondBranch},manager)).status,403);
  assert.equal((await get(next)).status,307);

  const {rows:coaches}=await db.query(`insert into public.coach_profiles (organization_id,name)
    values ($1,'مربی تقویم یک'),($1,'مربی تقویم دو') returning id`,[org]);
  for (const {id} of coaches) {
    await db.query('insert into public.coach_locations (organization_id,location_id,coach_id) values ($1,$2,$3)',[org,branch,id]);
    await db.query(`insert into public.coach_availability (organization_id,location_id,coach_id,weekday,valid_dates,local_minutes)
      values ($1,$2,$3,$4,daterange($5,null,'[)'),'[480,1320)')`,[org,branch,id,weekday,day]);
  }
  const {rows:[student]}=await db.query("insert into public.student_profiles (organization_id,name) values ($1,'شاگرد تقویم') returning id",[org]);
  await db.query('insert into public.student_locations (organization_id,location_id,student_id) values ($1,$2,$3)',[org,branch,student.id]);
  const lesson=setup(courts[1].id,{...price,kind:'private',booker:'',coach:coaches[0].id,student:student.id});
  const lessonResult=await ok(await cmd('create',lesson));
  assert.match(await (await get(lessonResult.next,owner)).text(),/شاگرد تقویم/);
  const anotherCourt={...lesson,court:courts[2].id,request:randomUUID()};
  const coachBusy=await cmd('create',anotherCourt);
  assert.equal(coachBusy.status,409);
  assert.equal((await coachBusy.json()).error,'booking-coach-conflict');
  const studentBusy=await cmd('create',{...anotherCourt,coach:coaches[1].id});
  assert.equal(studentBusy.status,409);
  assert.equal((await studentBusy.json()).error,'booking-student-conflict');
  const group=setup(courts[2].id,{...price,kind:'group',booker:'',coach:coaches[1].id,capacity:'۸'});
  const groupPage=await get((await ok(await cmd('create',group))).next,owner);
  assert.equal(groupPage.status,200);
  assert.match((await groupPage.text()).replaceAll('<!-- -->',''),/۸ نفر/);
});

test('leaving preserves the audit trail and removes club access', async () => {
  const manager=identities.get('admin');
  const login=await post('login',{email:manager.email,password:`${password}-next`});
  const cookie=sessionCookie(login);
  assert.equal((await post('leave',{org},cookie)).status,303);
  assert.equal((await get(`/club/${org}`,cookie)).status,307);
  const {rows}=await db.query("select action from tennis_private.access_audit where organization_id=$1 and target_user_id=$2 order by id",[org,manager.id]);
  assert.deepEqual(rows.map(row=>row.action),['access_changed','access_changed','access_changed','membership_left']);
});
