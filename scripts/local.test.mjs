import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createECDH, createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import pg from 'pg';

const { SAM_TEST_ORIGIN: origin, SAM_TEST_SETUP_CODE: code, SAM_TEST_DATABASE_URL: databaseUrl } = process.env;
assert(origin && code && databaseUrl, 'Set the three SAM_TEST variables for a fresh disposable local stack.');
for (const url of [origin, databaseUrl]) {
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Test only against loopback services.');
}
assert.equal(new URL(databaseUrl).search, '', 'The test database URL must use the stated host and port.');
const db = new pg.Client({ connectionString: databaseUrl });
const password = process.env.SAM_TEST_OWNER_PASSWORD ?? `Test-${randomBytes(16).toString('hex')}`;
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
function post(action, fields, cookie, suppliedOrigin = origin, fetchSite) {
  const headers = { Origin: suppliedOrigin, Accept: 'application/json' };
  if (fetchSite) headers['Sec-Fetch-Site'] = fetchSite;
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

test('security headers use a fresh CSP nonce and omit HSTS on HTTP', async () => {
  const responses = [
    await get('/'), await get('/'), await get('/club'),
    await post('login',{email:'invalid',password:'wrong'}),
    await get('/pwa/manifest.webmanifest'), await get('/sw.js'),
  ];
  const nonces = [];
  for (const response of responses) {
    const csp = response.headers.get('content-security-policy')
      ?? response.headers.get('content-security-policy-report-only') ?? '';
    assert.match(csp,/frame-ancestors 'none'/);
    assert.match(csp,/object-src 'none'/);
    assert.doesNotMatch(csp,/unsafe-eval/);
    assert.equal(response.headers.get('strict-transport-security'),null);
    assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin');
    assert.match(response.headers.get('permissions-policy') ?? '',/camera=\(\)/);
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    nonces.push(nonce);
  }
  const html = await responses[0].text();
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)];
  assert.ok(scripts.length);
  assert.ok(scripts.every(([tag]) => tag.includes(`nonce="${nonces[0]}"`)));
  assert.equal(new Set(nonces).size, responses.length);
});

test('a fresh installation has no preloaded club or user records', async () => {
  const landing = await get('/');
  assert.equal(landing.status, 200);
  const html = await landing.text();
  assert.match(html, /راه‌اندازی باشگاه/);
  assert.match(html, /ساخت حساب مالک/);
  for (const table of [
    'auth.users', 'public.organizations', 'public.locations', 'public.organization_members',
    'public.courts', 'public.coach_profiles', 'public.student_profiles',
    'public.bookings', 'public.sessions', 'public.invoices', 'public.payments', 'public.notification_events',
  ]) {
    const { rows: [{ count }] } = await db.query(`select count(*)::int from ${table}`);
    assert.equal(count, 0, `Unexpected preloaded records in ${table}`);
  }
  for (const path of ['/access.html', '/manage.html', '/finance.html', '/operations.html', '/reports.html', '/notifications.html']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('first owner setup, invalid codes, hostile origins and one-time initialization', async () => {
  assert.equal((await get('/api/health')).status, 200);
  assert.equal((await get('/club')).status, 307);
  const values = { email: ownerEmail, password, code, name: 'مالک آزمایشی', timezone: 'Asia/Tehran' };
  assert.equal((await post('setup', values, undefined, 'http://example.test')).status, 403);
  assert.equal((await post('setup', { ...values, code: 'invalid' })).status, 403);
  const opaqueCrossSite = await post('setup', { ...values, code: 'invalid' }, undefined, 'null', 'cross-site');
  assert.equal(opaqueCrossSite.status, 403);
  assert.deepEqual(await opaqueCrossSite.json(), { error: 'origin' });
  const safariOpaque = await post('setup', { ...values, code: 'invalid' }, undefined, 'null', 'same-origin');
  assert.equal(safariOpaque.status, 403);
  assert.deepEqual(await safariOpaque.json(), { error: 'setup-code' });
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

test('sign-in limits five failures per email, expires, and clears after success', async () => {
  await db.query('delete from tennis_runtime.login_failures');
  const wrong = {email:ownerEmail,password:'incorrect-password'};
  for (let i=0;i<5;i++) assert.equal((await post('login',wrong)).status,401);
  const blocked = await post('login',{email:ownerEmail.toUpperCase(),password});
  assert.equal(blocked.status,429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 55);
  assert.deepEqual(await blocked.json(),{error:'rate'});
  const hash = createHash('sha256').update(ownerEmail).digest('hex');
  const {rows} = await db.query('select email_hash from tennis_runtime.login_failures');
  assert.deepEqual(rows,Array.from({length:5},()=>({email_hash:hash})));
  assert.equal((await post('login',{email:'isolated@sam.example',password:'incorrect-password'})).status,401);
  await db.query(`insert into tennis_runtime.login_failures (email_hash)
    select lpad(i::text,64,'0') from generate_series(1,60) as g(i)`);
  const global = await post('login',{email:ownerEmail,password});
  assert.equal(global.status,429);
  assert.ok(Number(global.headers.get('retry-after')) >= 290);
  await db.query("delete from tennis_runtime.login_failures where email_hash like '0000%'");
  await db.query("update tennis_runtime.login_failures set failed_at=now()-interval '2 minutes' where email_hash=$1",[hash]);
  assert.equal((await post('login',{email:ownerEmail,password})).status,303);
  assert.equal((await db.query('select 1 from tennis_runtime.login_failures where email_hash=$1',[hash])).rowCount,0);
  await db.query('delete from tennis_runtime.login_failures');
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
  const rejected = await post('login',{email:manager.email,password});
  assert.equal(rejected.status,401);
  assert.deepEqual(await rejected.json(),{error:'login'});
  assert.equal((await post('member', {org,user:manager.id,role:'admin',active:'yes',location:branch},owner)).status,303);

});

test('club navigation stays the same across sections for each authorized role', async () => {
  const root = `/club/${org}`;
  const sections = ['', '/calendar', '/classes', '/finance', '/finance/operations', '/reports', '/notifications', '/resources/courts', '/profile'];
  for (const [role, cookie] of [['owner', owner], ['admin', identities.get('admin').cookie]]) {
    let expected;
    for (const section of sections) {
      const response = await get(root + section, cookie);
      assert.equal(response.status, 200, section);
      const html = await response.text();
      const menu = [...html.matchAll(/<nav class="club-nav" aria-label="ناوبری باشگاه">([\s\S]*?)<\/nav>/g)];
      assert.equal(menu.length, 1, section);
      const links = [...menu[0][1].matchAll(/href="([^"]+)"/g)].map(link => link[1]);
      expected ??= links;
      assert.deepEqual(links, expected, section);
      assert.equal(links.includes(root + '/members'), role === 'owner');
      assert.equal([...menu[0][1].matchAll(/aria-current="page"/g)].length, 1, section);
    }
  }
});

test('concurrent refresh preserves a single valid local session', async () => {
  const { cookie, id } = identities.get('admin');
  await db.query("update tennis_runtime.web_sessions set access_expires_at=now()-interval '1 second' where user_id=$1", [id]);
  const results = await Promise.all([get(`/club/${org}`, cookie), get(`/club/${org}`, cookie)]);
  assert.deepEqual(results.map(response => response.status), [200, 200]);
  const { rows } = await db.query('select count(*)::int as count from tennis_runtime.web_sessions where user_id=$1 and access_expires_at>now()', [id]);
  assert.equal(rows[0].count, 1);
});

test('slow Auth keeps refresh connections separate from health checks', {
  skip: !process.env.SAM_TEST_AUTH_PID,
}, async () => {
  const authPid = Number(process.env.SAM_TEST_AUTH_PID);
  assert.ok(Number.isSafeInteger(authPid) && authPid > 1);
  const cookies = [];
  for (let index = 0; index < 5; index++) {
    const response = await post('login', {email:ownerEmail,password});
    assert.equal(response.status,303);
    cookies.push(sessionCookie(response));
  }
  const hashes = cookies.map(cookie => createHash('sha256').update(cookie.split('=')[1]).digest('hex'));
  await db.query("update tennis_runtime.web_sessions set access_expires_at=now()-interval '1 second' where token_hash=any($1)", [hashes]);
  let pending;
  process.kill(authPid,'SIGSTOP');
  try {
    pending = Promise.all(cookies.map(cookie => get(`/club/${org}`, cookie)));
    const deadline = performance.now() + 1800;
    let held = 0;
    while (performance.now() < deadline) {
      const {rows:[row]} = await db.query(`select count(*)::int as count from pg_stat_activity
        where usename='tennis_web' and state='idle in transaction' and query like '%web_sessions%for update%'`);
      held = row.count;
      if (held === 3) break;
      await delay(25);
    }
    assert.equal(held,3);
    const start = performance.now();
    const health = await get('/api/health');
    assert.equal(health.status,503);
    assert.ok(performance.now()-start < 2000);
  } finally {
    process.kill(authPid,'SIGCONT');
    await pending;
  }
  for (const cookie of cookies) assert.equal((await get(`/club/${org}`,cookie)).status,200);
});

test('verified Auth user is reused but manager access and logout take effect immediately', {
  skip: !process.env.SAM_TEST_AUTH_LOG,
}, async () => {
  const authLog = process.env.SAM_TEST_AUTH_LOG;
  const count = async () => (await readFile(authLog,'utf8')).split('\n')
    .filter(line => line.includes('"path":"/user"') && line.includes('"method":"GET"')).length;
  const manager = identities.get('admin');
  const login = await post('login',{email:manager.email,password});
  assert.equal(login.status,303);
  const cookie = sessionCookie(login);
  const before = await count();
  assert.equal((await get(`/club/${org}`,cookie)).status,200);
  assert.equal((await get(`/club/${org}`,cookie)).status,200);
  assert.equal(await count(),before+1);
  try {
    await db.query('update public.organization_members set active=false where user_id=$1',[manager.id]);
    assert.equal((await get(`/club/${org}`,cookie)).status,307);
    assert.equal(await count(),before+1);
  } finally {
    await db.query('update public.organization_members set active=true where user_id=$1',[manager.id]);
  }
  assert.equal((await post('logout',{},cookie)).status,303);
  assert.equal((await get(`/club/${org}`,cookie)).status,307);
});

test('recovery and logout revoke prior sessions', async () => {
  const manager = identities.get('admin');
  const {rows:[{id:ownerId}]} = await db.query('select id from auth.users where email=$1',[ownerEmail]);
  const denied = await post('recovery', {org,user:ownerId}, owner);
  assert.equal(denied.status,403);
  const response = await post('recovery', { org, user: manager.id }, owner);
  assert.equal(response.status, 200);
  const {rows} = await db.query(`select actor_user_id,target_user_id,current_access
    from tennis_private.access_audit where organization_id=$1 and action='recovery_link_issued'`, [org]);
  assert.deepEqual(rows, [{
    actor_user_id:ownerId, target_user_id:manager.id, current_access:{role:'admin',source:'panel'},
  }]);
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

test('CLI owner recovery records a single event before returning the link', {
  skip: !process.env.SAM_AUTH_URL || !process.env.SAM_JWT_SECRET || !process.env.SAM_DATABASE_URL,
}, async () => {
  const {rows:[{id:ownerId}]} = await db.query('select id from auth.users where email=$1',[ownerEmail]);
  const stdout = execFileSync(process.execPath,['scripts/owner-recovery.mjs',ownerEmail],{
    encoding:'utf8',timeout:10000,
  }).trim();
  assert.ok(token(stdout));
  const {rows} = await db.query(`select actor_user_id,target_user_id,current_access
    from tennis_private.access_audit where organization_id=$1 and action='recovery_link_issued' and target_user_id=$2`, [org,ownerId]);
  assert.deepEqual(rows, [{
    actor_user_id:null, target_user_id:ownerId, current_access:{role:'owner',source:'cli'},
  }]);
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

test('class roster and attendance stay consistent with capacity, correction and access', async () => {
  const {rows:[future]}=await db.query(`
    select s.id,s.booking_id,b.court_id,s.coach_id,b.slot
    from public.sessions s join public.bookings b on b.id=s.booking_id join public.courts c on c.id=b.court_id
    where s.organization_id=$1 and s.location_id=$2 and b.kind='group' and c.name='زمین زمان‌بندی سه'
  `,[org,branch]);
  assert(future);
  await db.query('update public.sessions set capacity=1 where id=$1',[future.id]);
  const {rows:people}=await db.query(`
    insert into public.student_profiles (organization_id,name)
    select $1,'شاگرد حضور '||i from generate_series(1,4) i returning id`,[org]);
  for (const person of people) {
    await db.query('insert into public.student_locations (organization_id,location_id,student_id) values ($1,$2,$3)',[org,branch,person.id]);
  }
  const submit=(action,id,values,cookie=owner,scope=branch)=>post('class-'+action,{org,branch:scope,session:id,request:randomUUID(),...values},cookie);
  const path=`/club/${org}/classes/${future.id}`;
  assert.equal((await get(path,owner)).status,200);
  assert.equal((await get(path)).status,307);
  const attempts=await Promise.all(people.slice(0,2).map(person=>submit('enroll',future.id,{student:person.id})));
  assert.deepEqual(attempts.map(result=>result.status).sort(),[200,409]);
  assert.equal((await attempts.find(result=>result.status===409).json()).error,'attendance-full');
  const {rows:[enrolled]}=await db.query('select id,student_id from public.session_participants where session_id=$1',[future.id]);
  const duplicate=await submit('enroll',future.id,{student:enrolled.student_id});
  assert.equal(duplicate.status,409);
  assert.equal((await duplicate.json()).error,'attendance-duplicate');
  const withdrawal={participant:enrolled.id,request:randomUUID()};
  assert.equal((await submit('withdraw',future.id,withdrawal)).status,200);
  assert.equal((await submit('withdraw',future.id,withdrawal)).status,200);
  assert.equal((await db.query('select active from tennis_private.student_allocations where participant_id=$1',[enrolled.id])).rows[0].active,false);
  assert.match(await (await get(path,owner)).text(),/ثبت‌نام‌های لغوشده/);
  assert.equal((await submit('enroll',future.id,{student:enrolled.student_id})).status,200);
  assert.deepEqual((await db.query(`select p.id,p.withdrawn_at,a.active from public.session_participants p
    join tennis_private.student_allocations a on a.participant_id=p.id where p.session_id=$1`,[future.id])).rows,
  [{id:enrolled.id,withdrawn_at:null,active:true}]);

  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const localTimes=[yesterday+'T10:00',yesterday+'T11:00'];
  const {rows:[actor]}=await db.query('select id from auth.users where email=$1',[ownerEmail]);
  const {rows:[historical]}=await db.query(`
    insert into public.bookings (organization_id,location_id,court_id,slot,timezone,kind,created_by)
    values ($1,$2,$3,tstzrange($4::timestamp at time zone 'Asia/Tehran',$5::timestamp at time zone 'Asia/Tehran','[)'),
      'Asia/Tehran','group',$6) returning id`,[org,branch,future.court_id,...localTimes,actor.id]);
  const {rows:[session]}=await db.query(`insert into public.sessions (organization_id,location_id,booking_id,coach_id,capacity)
    values ($1,$2,$3,$4,5) returning id`,[org,branch,historical.id,future.coach_id]);
  const {rows:participants}=await db.query(`insert into public.session_participants (organization_id,location_id,session_id,student_id)
    select $1,$2,$3,id from unnest($4::uuid[]) id returning id`,[org,branch,session.id,people.map(person=>person.id)]);
  const [start,end]=localTimes;
  const marks=Object.fromEntries(participants.map((person,index)=>['attendance.'+person.id,['present','late','absent','excused'][index]]));
  const fields={start,end,revision:'0',booking_revision:'0',...marks,request:randomUUID()};
  const insufficient=await submit('attendance',session.id,{start,end,revision:'0',booking_revision:'0'});
  assert.equal(insufficient.status,400);
  assert.equal((await insufficient.json()).error,'attendance-incomplete');
  const badTime=await submit('attendance',session.id,{...fields,start:yesterday+'T12:00'});
  assert.equal(badTime.status,400);
  assert.equal((await db.query('select status from public.sessions where id=$1',[session.id])).rows[0].status,'scheduled');
  const first=await submit('attendance',session.id,fields);
  assert.equal(first.status,200,await first.text());
  assert.equal((await submit('attendance',session.id,fields)).status,200);
  const stale=await submit('attendance',session.id,{...fields,request:randomUUID(),reason:'اصلاح'});
  assert.equal(stale.status,409);
  assert.equal((await stale.json()).error,'attendance-stale');
  const noReason=await submit('attendance',session.id,{...fields,request:randomUUID(),revision:'1'});
  assert.equal(noReason.status,400);
  assert.equal((await noReason.json()).error,'attendance-reason');
  const correction=await submit('attendance',session.id,{...fields,request:randomUUID(),revision:'1',
    ['attendance.'+participants[0].id]:'late',reason:'اصلاح زمان حضور'});
  assert.equal(correction.status,200,await correction.text());
  const {rows:records}=await db.query('select participant_id,status from public.attendance_records where participant_id=any($1::uuid[])',
    [participants.map(person=>person.id)]);
  assert.equal(records.length,4);
  assert.equal(records.find(record=>record.participant_id===participants[0].id).status,'late');
  const {rows:events}=await db.query(`select details from tennis_private.audit_events where target_id=$1 and action='record_class_attendance' order by id`,[session.id]);
  assert.equal(events.length,2);
  assert.equal(events[1].details.before[participants[0].id],'present');
  assert.equal(events[1].details.after[participants[0].id],'late');
  const page=await get(`/club/${org}/classes/${session.id}`,owner);
  assert.equal(page.status,200);
  assert.match(await page.text(),/اصلاح زمان حضور/);
  assert.match(await (await get(`/club/${org}/classes?branch=${branch}&date=${yesterday}&status=completed`,owner)).text(),/برگزارشده/);
  assert.equal((await submit('attendance',session.id,fields,owner,secondBranch)).status,403);

  const {rows:[cancelled]}=await db.query(`
    update public.sessions set status='cancelled' where id=$1 returning id`,[future.id]);
  const rejected=await submit('attendance',cancelled.id,{start,end,revision:'3',booking_revision:'0'});
  assert.equal(rejected.status,409);
  assert.equal((await rejected.json()).error,'attendance-closed');
});

test('finance issues and reconciles invoices with exact units and durable command results', async () => {
  const {rows:[booking]}=await db.query(`select b.id,p.amount_minor::text as amount from public.bookings b
    join public.booking_prices p on p.booking_id=b.id
    where b.organization_id=$1 and b.location_id=$2 and b.kind='rental' and b.status='confirmed' order by b.starts_at,b.id limit 1`,[org,branch]);
  assert.equal(booking.amount,'1500000');
  const endpoint=(action,values,cookie=owner,location=branch)=>post('finance-'+action,{org,branch:location,request:randomUUID(),...values},cookie);
  const ok=async response=>{
    const result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    return result;
  };
  assert.match(await (await get(`/club/${org}/calendar/${booking.id}`,owner)).text(),/صدور فاکتور/);
  const discount={booking:booking.id,discount:'۱۰٬۰۰۰',unit:'toman',reason:'تخفیف آزمون',request:randomUUID()};
  const issue=await ok(await endpoint('issue',discount));
  const invoice=issue.next.split('?')[0].split('/').at(-1);
  assert.deepEqual(await ok(await endpoint('issue',discount)),issue);
  const duplicate=await endpoint('issue',{...discount,request:randomUUID()});
  assert.equal(duplicate.status,409);
  assert.equal((await duplicate.json()).error,'finance-already-invoiced');
  const {rows:[issued]}=await db.query('select invoice_number,total_amount_minor,discount_minor from public.invoices where id=$1',[invoice]);
  assert.deepEqual([issued.total_amount_minor,issued.discount_minor],['1400000','100000']);
  assert.match(await (await get(issue.next,owner)).text(),/تخفیف آزمون/);

  const payment={invoice,amount:'۹٬۰۰۰',method:'transfer',unit:'minor',reference:'رسید آزمون',request:randomUUID()};
  assert.equal((await endpoint('operation',{command:'finance-payment',request:payment.request})).status,200);
  // Discard the successful response body and recover from the durable server receipt with the same key.
  const ignored=await endpoint('payment',payment);
  assert.equal(ignored.status,200,ignored.status===200?'':await ignored.text());
  await ignored.body?.cancel();
  const recovered=await ok(await endpoint('operation',{command:'finance-payment',request:payment.request}));
  assert.equal(recovered.next,issue.next);
  await ok(await endpoint('payment',payment));
  const wrongPayload=await endpoint('payment',{...payment,amount:'۹۰۰۱'});
  assert.equal(wrongPayload.status,409);
  assert.equal((await wrongPayload.json()).error,'finance-request');
  assert.equal((await db.query('select count(*)::int as n from public.payments where invoice_id=$1',[invoice])).rows[0].n,1);
  await ok(await endpoint('payment',{...payment,request:randomUUID(),unit:'toman'}));
  const {rows:payments}=await db.query('select id,amount_minor from public.payments where invoice_id=$1 order by amount_minor',[invoice]);
  assert.deepEqual(payments.map(item=>item.amount_minor),['9000','90000']);
  const deniedVoid=await endpoint('void',{invoice,reason:'ثبت مجدد'});
  assert.equal(deniedVoid.status,409);
  assert.equal((await deniedVoid.json()).error,'finance-has-receipts');
  const tooMuch=await endpoint('payment',{invoice,amount:'1400000',method:'cash'});
  assert.equal(tooMuch.status,409);
  assert.equal((await tooMuch.json()).error,'finance-due');
  const partial={invoice,payment:payments[1].id,amount:'۳۰٬۰۰۰',reason:'بازپرداخت جزئی',request:randomUUID()};
  await ok(await endpoint('refund',partial));
  assert.equal((await ok(await endpoint('operation',{command:'finance-refund',request:partial.request}))).next,issue.next);
  await ok(await endpoint('refund',partial));
  const above=await endpoint('refund',{...partial,request:randomUUID(),amount:'60001'});
  assert.equal(above.status,409);
  assert.equal((await above.json()).error,'finance-refund-cap');
  const {rows:[partialBalance]}=await db.query('select received_minor,due_minor,status from public.invoice_balances where invoice_id=$1',[invoice]);
  assert.deepEqual(partialBalance,{received_minor:'69000',due_minor:'1331000',status:'partial'});

  const listPath=`/club/${org}/finance?branch=${branch}&number=${issued.invoice_number}`;
  const list=await get(listPath,owner);
  assert.equal(list.status,200);
  const summary=(await list.text()).replaceAll('<!-- -->','');
  for (const label of ['۹۹٬۰۰۰ ریال','۳۰٬۰۰۰ ریال','۶۹٬۰۰۰ ریال','۱٬۳۳۱٬۰۰۰ ریال']) assert(summary.includes(label),label);
  assert.match(summary,/دریافتی خالص به تفکیک زمین/);
  assert.match(summary,/سانس بدون مربی/);
  assert.match(await (await get(issue.next,owner)).text(),/رسید آزمون/);
  await ok(await endpoint('refund',{...partial,request:randomUUID(),amount:'60000'}));
  await ok(await endpoint('refund',{...partial,request:randomUUID(),payment:payments[0].id,amount:'9000'}));
  await ok(await endpoint('void',{invoice,reason:'ثبت دوباره با مبلغ درست'}));
  const {rows:[voided]}=await db.query('select due_minor,received_minor,status from public.invoice_balances where invoice_id=$1',[invoice]);
  assert.deepEqual(voided,{due_minor:'0',received_minor:'0',status:'voided'});
  const afterVoid=await endpoint('payment',{invoice,amount:'1',method:'cash'});
  assert.equal(afterVoid.status,409);
  assert.equal((await afterVoid.json()).error,'finance-closed');
  const reissue=await ok(await endpoint('issue',{booking:booking.id}));
  assert.notEqual(reissue.next,issue.next);
  assert.equal((await db.query('select count(*)::int as n from public.invoice_items where booking_id=$1 and active',[booking.id])).rows[0].n,1);
  const newInvoice=reissue.next.split('?')[0].split('/').at(-1);
  const {rows:[revision]}=await db.query('select revision from public.bookings where id=$1',[booking.id]);
  const cancel=await post('booking-cancel',{org,branch,booking:booking.id,revision:revision.revision,reason:'لغو آزمایشی سانس',request:randomUUID()},owner);
  assert.equal(cancel.status,200,await cancel.text());
  assert.equal((await db.query('select due_minor from public.invoice_balances where invoice_id=$1',[newInvoice])).rows[0].due_minor,'1500000');
  await ok(await endpoint('void',{invoice:newInvoice,reason:'سانس لغو شد'}));
  const issueCancelled=await endpoint('issue',{booking:booking.id});
  assert.equal(issueCancelled.status,409);
  assert.equal((await issueCancelled.json()).error,'finance-not-invoiceable');

  const managerLogin=await post('login',{email:identities.get('admin').email,password:`${password}-next`});
  const manager=sessionCookie(managerLogin);
  assert.equal((await get(`/club/${org}/finance?branch=${secondBranch}`,manager)).status,404);
  assert.equal((await endpoint('operation',{command:'finance-payment',request:payment.request},manager,secondBranch)).status,403);
  const otherActor=await ok(await endpoint('operation',{command:'finance-payment',request:payment.request},manager));
  assert.equal(otherActor.status,'unconfirmed');
  assert.equal((await endpoint('payment',{...payment,request:randomUUID()},manager,secondBranch)).status,403);
});

test('training credit, expenses, coach settlement and special rates reconcile against their source records', async () => {
  const command=(name,values={},location=branch)=>post('finance-'+name,{org,branch:location,request:randomUUID(),...values},owner);
  const ok=async response=>{
    const body=await response.json();
    assert.equal(response.status,200,JSON.stringify(body));
    return body;
  };
  const error=async (response,code,status=409)=>{
    assert.equal(response.status,status,response.status===status?'':await response.text());
    assert.equal((await response.json()).error,code);
  };
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const {rows:[attended]}=await db.query(`
    select p.id,p.student_id,p.session_id,s.revision,b.revision as booking_revision,s.coach_id,b.court_id,
      timezone(b.timezone,lower(s.actual_slot))::date::text as day
    from public.session_participants p join public.attendance_records a on a.participant_id=p.id
    join public.sessions s on s.id=p.session_id join public.bookings b on b.id=s.booking_id
    where p.organization_id=$1 and p.location_id=$2 and a.status='late' and s.status='completed' order by p.id limit 1
  `,[org,branch]);
  assert(attended);
  const issueKey=randomUUID();
  const packageLink=await ok(await command('training-issue',{
    student:attended.student_id,title:'بستهٔ یک‌جلسه‌ای آزمون',sessions:'۱',from:attended.day,until:today,amount:'۱۲۳۴',unit:'toman',request:issueKey,
  }));
  assert.deepEqual(await ok(await command('operation',{command:'finance-training-issue',request:issueKey})),packageLink);
  const packageId=new URL(packageLink.next,origin).searchParams.get('package');
  const {rows:[invoice]}=await db.query('select invoice_id,amount_minor from public.invoice_items where package_id=$1',[packageId]);
  assert.equal(invoice.amount_minor,'12340');
  assert.match(await (await get(`/club/${org}/finance/${invoice.invoice_id}`,owner)).text(),/بستهٔ یک‌جلسه‌ای آزمون/);
  await error(await command('void',{invoice:invoice.invoice_id,reason:'تست'}),'training-cancel-first');

  const credit={target:packageId,participant:attended.id,request:randomUUID()};
  const consumption=await ok(await command('training-redeem',credit));
  assert.deepEqual(await ok(await command('training-redeem',credit)),consumption);
  await error(await command('training-redeem',{...credit,request:randomUUID()}),'training-duplicate');
  await error(await command('training-status',{target:packageId,status:'cancelled',reason:'تست'}),'training-used');
  const {rows:roster}=await db.query(`select p.id,a.status from public.session_participants p
    join public.attendance_records a on a.participant_id=p.id where p.session_id=$1`,[attended.session_id]);
  const marks=Object.fromEntries(roster.map(item=>['attendance.'+item.id,item.id===attended.id?'absent':item.status]));
  const correction=await post('class-attendance',{org,branch,session:attended.session_id,request:randomUUID(),
    revision:attended.revision,booking_revision:attended.booking_revision,start:attended.day+'T10:00',end:attended.day+'T11:00',reason:'اصلاح حضور و برگشت اعتبار',...marks},owner);
  assert.equal(correction.status,200,await correction.text());
  const {rows:[used]}=await db.query('select reversed_at,reversal_reason from public.training_uses where package_id=$1',[packageId]);
  assert(used.reversed_at);
  assert.equal(used.reversal_reason,'اصلاح وضعیت حضور');
  await error(await command('training-redeem',{...credit,request:randomUUID()}),'training-ineligible');
  await ok(await command('training-status',{target:packageId,status:'cancelled',reason:'اتمام آزمون'}));
  await ok(await command('void',{invoice:invoice.invoice_id,reason:'ابطال فاکتور بسته'}));
  assert.match(await (await get(packageLink.next,owner)).text(),/اعتبار برگشت/);
  const member=await ok(await command('training-issue',{student:attended.student_id,title:'عضویت زمانی',from:attended.day,until:today}));
  assert.match(await (await get(member.next,owner)).text(),/بدون سقف جلسه/);
  await error(await command('training-issue',{student:attended.student_id,title:'خارج از شعبه',from:today,until:today},secondBranch),'booking-student-unavailable',400);

  const expenseKey=randomUUID();
  const expenseLink=await ok(await command('expense-record',{title:'تجهیزات آزمون',category:'equipment',method:'card',day:today,amount:'۹٬۰۰۰',unit:'toman',request:expenseKey}));
  assert.deepEqual(await ok(await command('operation',{command:'finance-expense-record',request:expenseKey})),expenseLink);
  const {rows:[expense]}=await db.query("select id,amount_minor from public.club_expenses where title='تجهیزات آزمون'");
  assert.equal(expense.amount_minor,'90000');
  assert.match(await (await get(expenseLink.next,owner)).text(),/تجهیزات آزمون/);

  const {rows:[existingPayable]}=await db.query('select id,status from public.coach_payables where session_id=$1',[attended.session_id]);
  assert.equal(existingPayable.status,'pending');
  await ok(await command('coach-adjust',{target:existingPayable.id,amount:'۲۰٬۰۰۰',unit:'toman',reason:'توافق ثبت‌شده'}));
  await error(await command('coach-approve',{target:existingPayable.id,amount:'199999'}),'coach-estimate-changed');
  const approved=await ok(await command('coach-approve',{target:existingPayable.id,amount:'200000'}));
  assert.match(await (await get(approved.next,owner)).text(),/تأییدشده/);
  const payKey=randomUUID();
  const payment={target:existingPayable.id,amount:'200000',method:'transfer',reference:'آزمون',request:payKey};
  await ok(await command('coach-pay',payment));
  await ok(await command('coach-pay',payment));
  await ok(await command('coach-correct',{target:existingPayable.id,amount:'175000',expected:'200000',reason:'اصلاح ثبت دستمزد'}));
  await error(await command('coach-correct',{target:existingPayable.id,amount:'165000',expected:'200000',reason:'اصلاح قدیمی'}),'coach-estimate-changed');
  const {rows:[payable]}=await db.query(`select p.status,p.amount_minor,a.delta_minor from public.coach_payables p
    join public.coach_payment_adjustments a on a.payable_id=p.id where p.id=$1`,[existingPayable.id]);
  assert.deepEqual(payable,{status:'paid',amount_minor:'200000',delta_minor:'-25000'});

  const day=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
  const weekday=new Date(day+'T00:00Z').getUTCDay()||7;
  const {rows:[rate]}=await db.query(`select r.id,r.court_id from public.pricing_rules r join public.courts c on c.id=r.court_id
    where r.organization_id=$1 and r.location_id=$2 and r.kind='rental' and c.name='زمین زمان‌بندی دو'`,[org,branch]);
  const special={target:rate.id,weekday:String(weekday),start:'۱۹:۰۰',end:'۲۱:۰۰',minimum:'60',maximum:'60',amount:'۱۸۰٬۰۰۰',unit:'toman'};
  await ok(await command('rate-special',special));
  await error(await command('rate-special',special),'rate-special-conflict');
  const draft={org,branch,court:rate.court_id,start:day+'T19:00',minutes:'60',kind:'rental',booker:'آزمون تعرفهٔ ویژه',request:randomUUID()};
  const quote=await ok(await post('booking-quote',draft,owner));
  assert.deepEqual(quote.price,{amount:'1800000',currency:'IRR'});
  const longer=await ok(await post('booking-quote',{...draft,minutes:'120'},owner));
  assert.equal(longer.price.amount,'3000000');
  const booking=await ok(await post('booking-create',{...draft,...quote.price},owner));
  const bookingId=booking.next.split('?')[0].split('/').at(-1);
  const {rows:[rule]}=await db.query('select id from public.pricing_specials where rate_id=$1',[rate.id]);
  await ok(await command('rate-retire',{target:rule.id,reason:'پایان نرخ آزمایشی'}));
  assert.equal((await ok(await post('booking-quote',draft,owner))).price.amount,'1500000');
  assert.equal((await db.query('select amount_minor from public.booking_prices where booking_id=$1',[bookingId])).rows[0].amount_minor,'1800000');

  const finance=await get(`/club/${org}/finance?branch=${branch}&from=${today}&to=${today}`,owner);
  assert.equal(finance.status,200);
  const summary=(await finance.text()).replaceAll('<!-- -->','');
  assert.match(summary,/۹۰٬۰۰۰ ریال/);
  assert.match(summary,/۱۷۵٬۰۰۰ ریال/);
  await ok(await command('expense-void',{target:expense.id,reason:'اصلاح هزینه'}));
  assert.match(await (await get(expenseLink.next,owner)).text(),/اصلاح هزینه/);
});

test('coach revenue share snapshots terms and private credits exclude duplicate billing', async () => {
  const cmd=(name,values)=>post('finance-'+name,{org,branch,request:randomUUID(),...values},owner);
  const ok=async response=>{
    const data=await response.json();
    assert.equal(response.status,200,JSON.stringify(data));
    return data;
  };
  const {rows:[member]}=await db.query(`select id,student_id,valid_from::text as day from public.training_packages
    where organization_id=$1 and location_id=$2 and title='عضویت زمانی'`,[org,branch]);
  const {rows:[source]}=await db.query(`
    select b.court_id,b.created_by,s.coach_id,p.pricing_rule_id,p.unit_minutes,p.unit_amount_minor
    from public.bookings b join public.sessions s on s.booking_id=b.id join public.booking_prices p on p.booking_id=b.id
    where b.organization_id=$1 and b.location_id=$2 and b.kind='private' order by b.starts_at limit 1
  `,[org,branch]);
  await db.query("update public.coach_profiles set pay_basis='revenue_share',pay_amount_minor=25 where id=$1",[source.coach_id]);
  const {rows:[booking]}=await db.query(`
    insert into public.bookings (organization_id,location_id,court_id,slot,timezone,kind,created_by)
    values ($1,$2,$3,tstzrange($4::timestamp at time zone 'Asia/Tehran',$5::timestamp at time zone 'Asia/Tehran','[)'),
      'Asia/Tehran','private',$6) returning id`,[org,branch,source.court_id,member.day+'T12:00',member.day+'T13:00',source.created_by]);
  await db.query(`
    insert into public.booking_prices(booking_id,organization_id,location_id,court_id,kind,pricing_rule_id,currency,unit_minutes,
      booked_minutes,unit_amount_minor,amount_minor)
    values ($1,$2,$3,$4,'private',$5,'IRR',$6,$6,$7,$7)
  `,[booking.id,org,branch,source.court_id,source.pricing_rule_id,source.unit_minutes,source.unit_amount_minor]);
  const {rows:[session]}=await db.query(`
    insert into public.sessions(organization_id,location_id,booking_id,coach_id,capacity)
    values ($1,$2,$3,$4,1) returning id,pay_rate_snapshot`,[org,branch,booking.id,source.coach_id]);
  assert.equal(session.pay_rate_snapshot,'25');
  await db.query('update public.coach_profiles set pay_amount_minor=75 where id=$1',[source.coach_id]);
  const {rows:[participant]}=await db.query(`insert into public.session_participants(organization_id,location_id,session_id,student_id)
    values ($1,$2,$3,$4) returning id`,[org,branch,session.id,member.student_id]);
  assert.equal((await post('class-attendance',{org,branch,session:session.id,request:randomUUID(),revision:'0',booking_revision:'0',
    start:member.day+'T12:00',end:member.day+'T13:00',['attendance.'+participant.id]:'present'},owner)).status,200);
  const issued=await ok(await cmd('issue',{booking:booking.id}));
  const invoice=issued.next.split('?')[0].split('/').at(-1);
  await ok(await cmd('payment',{invoice,method:'cash',amount:'300000'}));
  const {rows:[payable]}=await db.query('select id,status from public.coach_payables where session_id=$1',[session.id]);
  assert.equal(payable.status,'ready');
  await ok(await cmd('coach-approve',{target:payable.id,amount:'75000'}));
  const {rows:[receipt]}=await db.query('select id from public.payments where invoice_id=$1',[invoice]);
  await ok(await cmd('refund',{invoice,payment:receipt.id,amount:'100000',reason:'بازپرداخت آزمون درصد'}));
  assert.deepEqual((await db.query('select basis_minor,amount_minor from public.coach_payables where id=$1',[payable.id])).rows[0],
    {basis_minor:'300000',amount_minor:'75000'});
  const redemption={target:member.id,participant:participant.id};
  const blocked=await cmd('training-redeem',redemption);
  assert.equal(blocked.status,409);
  assert.equal((await blocked.json()).error,'training-private-invoiced');
  await ok(await cmd('refund',{invoice,payment:receipt.id,amount:'200000',reason:'اصلاح دریافت'}));
  await ok(await cmd('void',{invoice,reason:'مصرف اعتبار بسته'}));

  const contenders=await Promise.all([cmd('training-redeem',redemption),cmd('issue',{booking:booking.id})]);
  assert.deepEqual(contenders.map(r=>r.status).sort(),[200,409]);
  if (contenders[1].ok) {
    const winner=(await contenders[1].json()).next.split('?')[0].split('/').at(-1);
    await ok(await cmd('void',{invoice:winner,reason:'اعمال بستهٔ ثبت‌شده'}));
    await ok(await cmd('training-redeem',redemption));
  }
  const after=await cmd('issue',{booking:booking.id});
  assert.equal(after.status,409);
  assert.equal((await after.json()).error,'training-private-covered');
  const calendar=await get(`/club/${org}/calendar/${booking.id}`,owner);
  assert.equal(calendar.status,200);
  assert.match(await calendar.text(),/با اعتبار بسته پوشش داده شده است/);
});

test('reports reconcile local periods, capacity, attendance, movements and export against source records', async () => {
  const date='2024-03-20';
  const next='2024-03-21';
  const previous='2024-03-19';
  const {rows:[actor]}=await db.query('select id from auth.users where email=$1',[ownerEmail]);
  await db.query("update public.locations set timezone='America/New_York' where id=$1",[secondBranch]);
  const one=async (sql,values)=>(await db.query(sql,values)).rows[0];
  const court=(await one(`insert into public.courts(organization_id,location_id,name,surface)
    values ($1,$2,'زمین گزارش مرجع','هارد') returning id`,[org,branch])).id;
  const otherCourt=(await one(`insert into public.courts(organization_id,location_id,name,surface)
    values ($1,$2,'زمین خارج از دسترسی گزارش','هارد') returning id`,[org,secondBranch])).id;
  await db.query(`insert into public.court_operating_hours(organization_id,location_id,court_id,weekday,valid_dates,local_minutes)
    values ($1,$2,$3,3,'[2024-03-20,2024-03-21)','[0,720)')`,[org,branch,court]);
  const coach=(await one("insert into public.coach_profiles(organization_id,name) values ($1,'مربی گزارش مرجع') returning id",[org])).id;
  await db.query(`insert into public.coach_locations(organization_id,location_id,coach_id)
    values ($1,$2,$3),($1,$4,$3)`,[org,branch,coach,secondBranch]);
  await db.query(`insert into public.coach_availability(organization_id,location_id,coach_id,weekday,valid_dates,local_minutes)
    values ($1,$2,$3,3,'[2024-03-20,2024-03-21)','[480,720)')`,[org,branch,coach]);
  const student=(await one(`insert into public.student_profiles(organization_id,name,skill_level,created_at)
    values ($1,'شاگرد گزارش مرجع','مقدماتی','2024-03-20 03:00Z') returning id`,[org])).id;
  const absent=(await one(`insert into public.student_profiles(organization_id,name,created_at)
    values ($1,'شاگرد غایب مرجع','2024-03-18 03:00Z') returning id`,[org])).id;
  await db.query('insert into public.student_locations(organization_id,location_id,student_id) values ($1,$2,$3),($1,$2,$4)',[org,branch,student,absent]);
  await db.query("update public.student_profiles set skill_level='متوسط' where id=$1",[student]);
  assert.deepEqual(await one('select previous_level,current_level from public.student_level_changes where student_id=$1',[student]),
    {previous_level:'مقدماتی',current_level:'متوسط'});
  await db.query("update public.student_level_changes set effective_at='2024-03-20 07:00Z' where student_id=$1",[student]);
  const block=(table,location,starts,ends,extra)=>db.query(`insert into public.${table}(organization_id,location_id,slot,reason${extra?',court_id':''})
    values ($1,$2,tstzrange($3,$4,'[)'),'انسداد مرجع'${extra?',$5':''})`,[org,location,starts,ends,...(extra?[extra]:[])]);
  await block('location_closures',branch,date+'T10:00+03:30',date+'T11:00+03:30');
  await block('court_maintenance_blocks',branch,date+'T10:30+03:30',date+'T11:30+03:30',court);
  const booking=async (location,id,from,to,kind='rental',cancelled=false,zone='Asia/Tehran')=>(await one(`
    insert into public.bookings(organization_id,location_id,court_id,slot,timezone,kind,created_by,booker_name,status,cancelled_at,cancellation_reason)
    values ($1,$2,$3,tstzrange($4,$5,'[)'),$6,$7::public.booking_kind,$8,case when $7::public.booking_kind='rental' then 'رزرو مرجع' end,
      case when $9 then 'cancelled' else 'confirmed' end::public.booking_status,
      case when $9 then $4::timestamptz-interval '1 hour' end,case when $9 then 'لغو آزمایشی' end) returning id`,
    [org,location,id,from,to,zone,kind,actor.id,cancelled])).id;
  const lesson=await booking(branch,court,date+'T09:00+03:30',date+'T10:00+03:30','group');
  const crossing=await booking(branch,court,previous+'T23:30+03:30',date+'T00:30+03:30');
  const cancelled=await booking(branch,court,date+'T08:00+03:30',date+'T09:00+03:30','rental',true);
  await booking(secondBranch,otherCourt,date+'T02:00Z',date+'T03:00Z','rental',false,'America/New_York');
  await booking(secondBranch,otherCourt,date+'T04:00Z',date+'T05:00Z','rental',false,'America/New_York');
  const session=(await one(`insert into public.sessions(organization_id,location_id,booking_id,coach_id,capacity,status,actual_slot)
    values ($1,$2,$3,$4,4,'completed','[2024-03-20 05:30Z,2024-03-20 06:20Z)') returning id`,[org,branch,lesson,coach])).id;
  for (const [id,status] of [[student,'late'],[absent,'absent']]) {
    const participant=(await one(`insert into public.session_participants(organization_id,location_id,session_id,student_id)
      values ($1,$2,$3,$4) returning id`,[org,branch,session,id])).id;
    await db.query('insert into public.attendance_records(organization_id,location_id,participant_id,status,recorded_by) values ($1,$2,$3,$4,$5)',
      [org,branch,participant,status,actor.id]);
  }
  const invoice=(await one(`insert into public.invoices(organization_id,location_id,currency,total_amount_minor,issued_by,issued_at)
    values ($1,$2,'IRR',2000,$3,'2024-03-20 05:00Z') returning id`,[org,branch,actor.id])).id;
  await db.query('insert into public.invoice_items(organization_id,location_id,invoice_id,booking_id,amount_minor) values ($1,$2,$3,$4,2000)',
    [org,branch,invoice,lesson]);
  const receipt=(await one(`insert into public.payments(organization_id,location_id,invoice_id,method,amount_minor,received_by,effective_at)
    values ($1,$2,$3,'cash',1000,$4,'2024-03-20 10:00Z') returning id`,[org,branch,invoice,actor.id])).id;
  await db.query(`insert into public.refunds(organization_id,location_id,payment_id,amount_minor,reason,recorded_by,effective_at)
    values ($1,$2,$3,300,'آزمون مرزی',$4,'2024-03-20 20:30Z')`,[org,branch,receipt,actor.id]);
  const packageId=(await one(`insert into public.training_packages(organization_id,location_id,student_id,title,sessions,valid_from,valid_until,created_at)
    values ($1,$2,$3,'=بسته مرجع',8,'2024-03-20','2024-04-20','2024-03-20 05:30Z') returning id`,[org,branch,student])).id;
  const packInvoice=(await one(`insert into public.invoices(organization_id,location_id,currency,total_amount_minor,issued_by,issued_at)
    values ($1,$2,'IRR',500,$3,'2024-03-20 05:00Z') returning id`,[org,branch,actor.id])).id;
  await db.query('insert into public.invoice_items(organization_id,location_id,invoice_id,package_id,amount_minor) values ($1,$2,$3,$4,500)',
    [org,branch,packInvoice,packageId]);
  await db.query(`insert into public.payments(organization_id,location_id,invoice_id,method,amount_minor,received_by,effective_at)
    values ($1,$2,$3,'cash',450,$4,'2024-03-20 10:00Z')`,[org,branch,packInvoice,actor.id]);
  await db.query(`insert into public.club_expenses(organization_id,location_id,title,category,currency,amount_minor,method,effective_on,created_by)
    values ($1,$2,'هزینه مرجع','equipment','IRR',150,'card','2024-03-20',$3)`,[org,branch,actor.id]);

  const path=(filters={},file=false)=>`/club/${org}/reports${file?'/excel':''}?`+new URLSearchParams({
    period:'day',anchor:date,branch,...filters,
  });
  const read=async (filters={},cookie=owner)=>{
    const response=await get(path(filters),cookie);
    const html=await response.text();
    assert.equal(response.status,200,html.slice(0,500));
    assert.doesNotMatch(html,/Application error|NEXT_HTTP_ERROR_FALLBACK;500/);
    return html.replaceAll('<!-- -->','').replaceAll('\u200e','');
  };
  const metric=(html,label,value)=>{
    const start=html.indexOf('>'+label+'</span><strong>');
    assert.notEqual(start,-1,label);
    assert.ok(html.slice(start,start+250).startsWith('>'+label+'</span><strong>'+value+'</strong>'),html.slice(start,start+250));
  };
  const report=await read({scope:'court',entity:court,compare:'1',detail:'capacity'});
  metric(report,'رزروهای معتبر','۱');
  metric(report,'زمان رزروشده','۱٫۵ ساعت');
  metric(report,'ظرفیت قابل استفاده','۱۰٫۵ ساعت');
  metric(report,'نرخ اشغال رزروشده','۱۴٫۳٪');
  metric(report,'استفادهٔ واقعی ثبت‌شده','۰٫۸۳ ساعت');
  metric(report,'تعطیلی و تعمیرات','۱٫۵ ساعت');
  metric(report,'نرخ حضور','۵۰٪');
  metric(report,'دریافتی خالص منتسب','۱٬۰۰۰ ریال');
  metric(report,'ماندهٔ فاکتور در پایان دوره','۱٬۰۰۰ ریال');
  assert.match(report,/<td>630<\/td><td>90<\/td><td>50<\/td><td>90<\/td>/);
  assert.match(report,/۱۴۰۳\/۰۱\/۰۱/);
  const traced=await read({scope:'court',entity:court,detail:'bookings'});
  for (const id of [lesson,crossing,cancelled]) assert.ok(traced.includes('/calendar/'+id));
  assert.match(traced,/لغوشده/);
  const followup=await read({scope:'court',entity:court,anchor:next,detail:'money'});
  metric(followup,'دریافتی خالص منتسب','−۳۰۰ ریال');
  metric(followup,'ماندهٔ فاکتور در پایان دوره','۱٬۳۰۰ ریال');
  assert.ok(followup.includes('/finance/'+invoice));
  const total=await read({branch:''});
  metric(total,'رزروهای معتبر','۲');
  metric(total,'دریافتی خالص','۱٬۴۵۰ ریال');
  metric(total,'پرونده‌های جدید شاگردان','۱');
  metric(total,'هزینه‌های ثبت‌شده','۱۵۰ ریال');
  const teacher=await read({scope:'coach',entity:coach,detail:'attendance'});
  metric(teacher,'زمان واقعی تدریس','۰٫۸۳ ساعت');
  metric(teacher,'ظرفیت کاری مربی','۳ ساعت');
  metric(teacher,'استفاده از ظرفیت کاری','۲۷٫۸٪');
  assert.ok(teacher.includes('/classes/'+session));
  const hours=await read({scope:'coach',entity:coach,detail:'coach-time'});
  assert.match(hours,/<td>تدریس در ساعات کاری<\/td><td>[^<]+<\/td><td>[^<]+<\/td><td>50<\/td>/);
  const pupil=await read({scope:'student',entity:student,detail:'levels'});
  metric(pupil,'نرخ حضور','۱۰۰٪');
  metric(pupil,'دریافتی خالص منتسب','۴۵۰ ریال');
  assert.match(pupil,/<td>مقدماتی<\/td><td>متوسط<\/td>/);
  const roster=await read({scope:'student',entity:student,detail:'attendance'});
  assert.ok(roster.includes('<td>شاگرد گزارش مرجع</td>'));
  assert.ok(!roster.includes('<td>شاگرد غایب مرجع</td>'));
  const month=await read({scope:'court',entity:court,period:'month',anchor:'2024-03-24',compare:'1'});
  assert.match(month,/۱۴۰۳\/۰۱\/۰۱ تا ۱۴۰۳\/۰۱\/۳۱/);
  const year=await read({scope:'court',entity:court,period:'year',anchor:'2024-12-01',compare:'1'});
  assert.match(year,/۱۴۰۳\/۰۱\/۰۱ تا ۱۴۰۳\/۱۲\/۳۰/);
  const week=await read({scope:'court',entity:court,period:'week'});
  assert.match(week,/۱۴۰۲\/۱۲\/۲۶ تا ۱۴۰۳\/۰۱\/۰۳/);
  const custom=await read({scope:'court',entity:court,period:'custom',from:date,to:next});
  metric(custom,'دریافتی خالص منتسب','۷۰۰ ریال');
  assert.match(await read({anchor:'2005-01-01',scope:'court',entity:court}),/داده‌ای برای بازهٔ انتخاب‌شده پیدا نشد/);
  assert.match(await read({period:'custom',from:next,to:date}),/ترتیب تاریخ‌ها و طول بازه را بررسی کنید/);
  const login=await post('login',{email:identities.get('admin').email,password:`${password}-next`});
  const manager=sessionCookie(login);
  assert.doesNotMatch(await read({branch:''},manager),/شعبهٔ دوم آزمایشی|زمین خارج از دسترسی گزارش/);
  assert.equal((await get(path({branch:secondBranch}),manager)).status,404);
  assert.equal((await get(path({branch:'',scope:'court',entity:otherCourt},true),manager)).status,404);
  assert.equal((await get(path({},true))).status,307);

  const exportResponse=await get(path({scope:'student',entity:student,compare:'1'},true),owner);
  assert.equal(exportResponse.status,200);
  assert.match(exportResponse.headers.get('content-type'),/spreadsheetml/);
  assert.match(exportResponse.headers.get('content-disposition'),/sam-report-student-2024-03-20-2024-03-20.xlsx/);
  const archive=Buffer.from(await exportResponse.arrayBuffer());
  let offset=0;
  const parts=new Map();
  while (archive.readUInt32LE(offset)===0x04034b50) {
    const size=archive.readUInt32LE(offset+18);
    const nameLength=archive.readUInt16LE(offset+26);
    const start=offset+30+nameLength+archive.readUInt16LE(offset+28);
    const name=archive.subarray(offset+30,offset+30+nameLength).toString();
    parts.set(name,inflateRawSync(archive.subarray(start,start+size)).toString());
    offset=start+size;
  }
  assert.match(parts.get('xl/workbook.xml'),/ریز گردش و ماندهٔ مالی/);
  assert.match(parts.get('xl/worksheets/sheet2.xml'),/دوره قبل/);
  const xml=[...parts.values()].join('');
  assert.ok(!xml.includes(receipt));
  assert.match(xml,/دریافتی خالص منتسب/);
  assert.match(xml,/<v>450<\/v>/);
  assert.match(xml,/<t xml:space="preserve">=بسته مرجع<\/t>/);
  assert.doesNotMatch(xml,/<f[ >]/);

  await db.query(`update public.courts set status='inactive' where id=$1`,[court]);
  await db.query(`insert into tennis_private.resource_changes
    (organization_id,kind,resource_id,actor_id,request_id,payload_hash,action,previous_status,current_status,branch_ids,occurred_at)
    values ($1,'court',$2,$3,$4,sha256('test'::bytea),'edited','active','inactive',array[$5::uuid],'2024-03-20 05:30Z')`,
    [org,court,actor.id,randomUUID(),branch]);
  const archived=await read({scope:'court',entity:court,detail:'capacity'});
  metric(archived,'ظرفیت قابل استفاده','۹ ساعت');
  metric(archived,'خارج از بهره‌برداری','۳ ساعت');
  metric(archived,'نرخ اشغال رزروشده','۵٫۶٪');
});

test('installable shell is public while private pages and API responses stay no-store',async ()=>{
  const home=await get('/');
  const html=await home.text();
  assert.match(html,/rel="manifest" href="\/pwa\/manifest.webmanifest"/);
  assert.match(home.headers.get('cache-control'),/no-store/);
  const chunk=html.match(/src="(\/_next\/static\/[^"]+\.js)"/)?.[1];
  assert.ok(chunk);
  const script=await get(chunk);
  assert.equal(script.status,200);
  assert.match(script.headers.get('cache-control'),/public.*immutable/);
  const manifest=await get('/pwa/manifest.webmanifest');
  assert.match(manifest.headers.get('content-type'),/application\/manifest\+json/);
  const data=await manifest.json();
  assert.equal(data.display,'standalone');
  assert.equal(data.dir,'rtl');
  for (const icon of data.icons) {
    const response=await get('/pwa/'+icon.src);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    const png=Buffer.from(await response.arrayBuffer());
    const [width,height]=icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16),width);
    assert.equal(png.readUInt32BE(20),height);
  }
  const sw=await get('/sw.js');
  assert.equal(sw.status,200);
  assert.equal(sw.headers.get('service-worker-allowed'),'/');
  assert.match(sw.headers.get('content-type'),/javascript/);
  assert.match(sw.headers.get('cache-control'),/no-store/);
  assert.match(await (await get('/pwa/offline.html')).text(),/اتصال به سامانه برقرار نیست/);
  assert.equal((await get('/pwa/reports.json')).status,404);
  assert.match((await get(`/club/${org}/notifications`,owner)).headers.get('cache-control'),/no-store/);
  for (const path of ['/.local/secrets.env','/.local/backups/club.dump','/local/restore-verify.sql']) {
    const response=await get(path,owner);
    assert.equal(response.status,404,path);
    await response.body?.cancel();
  }
  const unsupportedBody=new FormData();
  unsupportedBody.set('attachment',new Blob(['synthetic fixture']),'fixture.txt');
  const unsupported=await fetch(origin+'/api/resource',{
    method:'POST',headers:{Origin:origin,Accept:'application/json',Cookie:owner},body:unsupportedBody,
  });
  assert.equal(unsupported.status,400);
  assert.equal((await unsupported.json()).error,'invalid');
});

test('manager notifications respect branch scope, transactional reminders, read state and push leases',async ()=>{
  const manager=identities.get('admin');
  const managerCookie=sessionCookie(await post('login',{email:manager.email,password:`${password}-next`}));
  const {rows:[actor]}=await db.query('select id from auth.users where email=$1',[ownerEmail]);
  const one=async (sql,args)=>(await db.query(sql,args)).rows[0];
  const court=await one('select id from public.courts where (organization_id,location_id)=($1,$2) limit 1',[org,branch]);
  const otherCourt=await one('select id from public.courts where (organization_id,location_id)=($1,$2) limit 1',[org,secondBranch]);
  const makeLesson=async (location,id)=>one(`
    insert into public.bookings(organization_id,location_id,court_id,slot,timezone,kind,created_by)
    values ($1,$2,$3,tstzrange(now()+interval '30 minutes',now()+interval '90 minutes','[)'),'Asia/Tehran','group',$4)
    returning id`,[org,location,id,actor.id]);
  const ec=createECDH('prime256v1');
  ec.generateKeys();
  const keys={p256dh:ec.getPublicKey('base64url','uncompressed'),auth:randomBytes(16).toString('base64url')};
  const endpoint='https://fcm.googleapis.com/fcm/send/'+randomUUID();
  const pushCookieResponse=await post('notice-push',{org,subscription:JSON.stringify({endpoint,keys})},managerCookie);
  let device;
  if (process.env.SAM_PUSH_PUBLIC_KEY) {
    assert.equal(pushCookieResponse.status,200,await pushCookieResponse.text());
    assert.match(pushCookieResponse.headers.get('set-cookie'),/sam_push_device=.+HttpOnly/);
    device=await one('select id from tennis_runtime.push_devices where endpoint=$1',[endpoint]);
    const invalid=await post('notice-push',{org,subscription:JSON.stringify({endpoint:'https://127.0.0.1/test',keys})},managerCookie);
    assert.equal(invalid.status,400);
  } else {
    assert.equal(pushCookieResponse.status,503);
    device=await one(`insert into tennis_runtime.push_devices(organization_id,user_id,endpoint,p256dh,auth_key)
      values ($1,$2,$3,$4,$5) returning id`,[org,manager.id,endpoint,keys.p256dh,keys.auth]);
  }
  const sessionDevice=managerCookie+'; sam_push_device='+device.id;
  const loan=await makeLesson(branch,court.id);
  const other=await makeLesson(secondBranch,otherCourt.id);
  const event=await one("select id from public.notification_events where source_id=$1 and kind='lesson_reminder'",[loan.id]);
  const foreign=await one("select id from public.notification_events where source_id=$1 and kind='lesson_reminder'",[other.id]);
  const path=`/club/${org}/notifications`;
  const html=await (await get(path,managerCookie)).text();
  assert.match(html,/یادآوری جلسه/);
  assert.ok(html.includes('/calendar/'+loan.id));
  assert.ok(!html.includes('/calendar/'+other.id));
  assert.equal((await get(path+'?branch='+secondBranch,managerCookie)).status,404);
  assert.equal((await get(path,undefined)).status,307);
  assert.equal((await post('notice-read',{org,event:foreign.id},managerCookie)).status,404);
  assert.equal((await post('notice-read',{org,event:event.id},managerCookie,'http://example.test')).status,403);
  for (let index=0;index<2;index++) assert.equal((await post('notice-read',{org,event:event.id},managerCookie)).status,200);
  assert.deepEqual(await one('select count(*)::int as marks from public.notification_reads where event_id=$1 and user_id=$2',[event.id,manager.id]),{marks:1});
  assert.ok(!(await (await get(path,managerCookie)).text()).includes('name="event" value="'+event.id+'"'));
  assert.ok((await (await get(path,owner)).text()).includes('name="event" value="'+event.id+'"'));

  const otherConnection=new pg.Client({connectionString:databaseUrl});
  await otherConnection.connect();
  try {
    await otherConnection.query('set role tennis_web');
    const claims=await Promise.all([
      db.query('select * from tennis_runtime.claim_push_deliveries(4)'),
      otherConnection.query('select * from tennis_runtime.claim_push_deliveries(4)'),
    ]);
    const claimed=claims.flatMap(result=>result.rows).filter(row=>row.device_id===device.id);
    assert.deepEqual(claimed.map(row=>row.event_id),[event.id]);
    assert.equal(claimed[0].attempts,1);
    assert.equal((await one("select tennis_runtime.finish_push_delivery($1,$2,$3,'sent') as done",[event.id,device.id,randomUUID()])).done,false);
    assert.equal((await one("select tennis_runtime.finish_push_delivery($1,$2,$3,'sent') as done",[event.id,device.id,claimed[0].lease])).done,true);
    assert.equal((await db.query('select * from tennis_runtime.claim_push_deliveries(4)')).rows.some(row=>row.event_id===event.id),false);
  } finally {
    await otherConnection.end();
  }

  await db.query(`update public.bookings set slot=tstzrange(lower(slot)+interval '10 minutes',upper(slot)+interval '10 minutes','[)')
    where id=$1`,[loan.id]);
  assert.ok((await one('select invalidated_at from public.notification_events where id=$1',[event.id])).invalidated_at);
  const cancel=`update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason='آزمون اعلان' where id=$1`;
  await db.query(cancel,[loan.id]);
  await db.query(cancel,[loan.id]);
  assert.equal((await one("select count(*)::int as count from public.notification_events where source_id=$1 and kind='booking_cancelled'",[loan.id])).count,1);
  assert.equal((await one("select count(*)::int as count from public.notification_events where source_id=$1 and kind='lesson_reminder' and invalidated_at is null",[loan.id])).count,0);

  const invoice=await one(`insert into public.invoices(organization_id,location_id,currency,total_amount_minor,issued_by,issued_at)
    values ($1,$2,'IRR',1000,$3,now()-interval '8 days') returning id`,[org,branch,actor.id]);
  assert.ok((await (await get(path,managerCookie)).text()).includes('/finance/'+invoice.id));
  await db.query(`insert into public.payments(organization_id,location_id,invoice_id,method,amount_minor,received_by)
    values ($1,$2,$3,'cash',1000,$4)`,[org,branch,invoice.id,actor.id]);
  assert.ok(!(await (await get(path,managerCookie)).text()).includes('/finance/'+invoice.id));
  assert.equal((await post('notice-disable',{org},sessionDevice)).status,200);
  assert.equal(await one('select id from tennis_runtime.push_devices where id=$1',[device.id]),undefined);

  const reenabled=await one(`insert into tennis_runtime.push_devices(organization_id,user_id,endpoint,p256dh,auth_key)
    values ($1,$2,$3,$4,$5) returning id`,[org,manager.id,endpoint,keys.p256dh,keys.auth]);
  assert.equal((await post('logout',{},managerCookie+'; sam_push_device='+reenabled.id)).status,303);
  assert.equal(await one('select id from tennis_runtime.push_devices where id=$1',[reenabled.id]),undefined);
});

test('release workflow reconciles one class from resources and booking to attendance, settlement and reports', async t => {
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const shift=(day,offset)=>new Date(Date.parse(day+'T00:00Z')+offset*86400000).toISOString().slice(0,10);
  const future=shift(today,2),past=shift(future,-14);
  const weekday=String(new Date(future+'T00:00Z').getUTCDay()||7);
  const one=async (sql,args)=>(await db.query(sql,args)).rows[0];
  const command=async (name,fields)=>{
    const result=await post(name,{org,branch,request:randomUUID(),...fields},owner);
    const body=await result.json();
    assert.equal(result.status,200,name+' '+JSON.stringify(body));
    return body;
  };
  const target=({next})=>next.split('?')[0].split('/').at(-1);
  const create=(kind,fields)=>command('resource',{kind,status:'active',location:branch,...fields});
  const court=target(await create('courts',{name:'زمین آزمون انتشار',surface:'هاردکورت',capacity:'۴'}));
  await create('courts',{name:'زمین پشتیبان آزمون انتشار',surface:'خاک رس',capacity:'۴'});
  const coach=target(await create('coaches',{name:'مربی آزمون انتشار',pay_basis:'hourly',pay_amount_minor:'۴۰۰۰۰۰',court_id:court}));
  const student=target(await create('students',{name:'شاگرد آزمون انتشار',skill_level:'متوسط'}));
  const otherStudent=target(await create('students',{name:'شاگرد دوم آزمون انتشار'}));
  const hours={location:branch,weekday,from:future,start:'08:00',end:'22:00'};
  await command('resource-hours',{...hours,kind:'courts',id:court});
  await command('resource-hours',{...hours,kind:'coaches',id:coach});
  await command('resource-rate',{kind:'courts',id:court,location:branch,booking_kind:'group',from:future,unit_minutes:'60',amount_minor:'1200000'});
  assert.deepEqual(await one(`select c.name,c.status,p.amount_minor from public.courts c
    join public.pricing_rules p on p.court_id=c.id where c.id=$1`,[court]),{name:'زمین آزمون انتشار',status:'active',amount_minor:'1200000'});
  assert.equal((await one('select count(*)::int as n from public.coach_availability where coach_id=$1',[coach])).n,1);

  const bookingFields={court,coach,capacity:'۲',kind:'group',start:future+'T10:00',minutes:'۶۰'};
  const quote=await command('booking-quote',bookingFields);
  assert.deepEqual(quote.price,{amount:'1200000',currency:'IRR'});
  const booking=target(await command('booking-create',{...bookingFields,...quote.price}));
  const {id:session}=await one('select id from public.sessions where booking_id=$1',[booking]);
  await command('class-enroll',{session,student});
  await command('class-enroll',{session,student:otherStudent});
  const {rows:roster}=await db.query('select id,student_id from public.session_participants where session_id=$1',[session]);
  assert.equal(roster.length,2);
  const marks=Object.fromEntries(roster.map(row=>['attendance.'+row.id,row.student_id===student?'present':'absent']));
  const futureAttendance=await post('class-attendance',{org,branch,session,request:randomUUID(),start:future+'T10:00',
    end:future+'T11:00',revision:'2',booking_revision:'0',...marks},owner);
  assert.equal(futureAttendance.status,400);
  assert.equal((await futureAttendance.json()).error,'attendance-time');

  // Advance the disposable booking and all allocations by two weeks without waiting for real time.
  await db.query('begin');
  try {
    for (const [table,key,value] of [
      ['public.bookings','id',booking],['tennis_private.court_allocations','booking_id',booking],
      ['tennis_private.coach_allocations','session_id',session],
    ]) await db.query(`update ${table} set slot=tstzrange(lower(slot)-interval '14 days',upper(slot)-interval '14 days','[)') where ${key}=$1`,[value]);
    await db.query(`update tennis_private.student_allocations
      set slot=tstzrange(lower(slot)-interval '14 days',upper(slot)-interval '14 days','[)')
      where participant_id=any($1::uuid[])`,[roster.map(row=>row.id)]);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
  const current=await one(`select b.revision as booking_revision,s.revision from public.sessions s
    join public.bookings b on b.id=s.booking_id where s.id=$1`,[session]);
  await command('class-attendance',{session,start:past+'T10:00',end:past+'T11:00',...current,...marks});
  const {rows:marksInDb}=await db.query(`select a.status from public.attendance_records a
    join public.session_participants p on p.id=a.participant_id where p.session_id=$1 order by a.status::text`,[session]);
  assert.deepEqual(marksInDb,[{status:'absent'},{status:'present'}]);

  const invoice=target(await command('finance-issue',{booking}));
  const paymentFields={invoice,amount:'1200000',method:'cash',reference:'آزمون انتشار',request:randomUUID()};
  await command('finance-payment',paymentFields);
  await command('finance-payment',paymentFields);
  const receipt=await one('select id from public.payments where invoice_id=$1',[invoice]);
  await command('finance-refund',{invoice,payment:receipt.id,amount:'300000',reason:'اصلاح آزمون انتشار'});
  assert.deepEqual(await one('select due_minor,received_minor,status from public.invoice_balances where invoice_id=$1',[invoice]),
    {due_minor:'300000',received_minor:'900000',status:'partial'});
  assert.equal((await one('select count(*)::int as n from public.payments where invoice_id=$1',[invoice])).n,1);
  const payable=await one('select id from public.coach_payables where session_id=$1',[session]);
  await command('finance-coach-approve',{target:payable.id,amount:'400000'});
  await command('finance-coach-pay',{target:payable.id,amount:'400000',method:'transfer'});
  assert.deepEqual(await one('select status,amount_minor from public.coach_payables where id=$1',[payable.id]),
    {status:'paid',amount_minor:'400000'});

  const query=new URLSearchParams({branch,period:'custom',from:past,to:today});
  const reports=`/club/${org}/reports`;
  const samples=[
    [`${reports}?${query}&scope=court&entity=${court}&detail=money`,['۹۰۰٬۰۰۰ ریال','۳۰۰٬۰۰۰ ریال','/finance/'+invoice]],
    [`${reports}?${query}&scope=coach&entity=${coach}&detail=attendance`,['۴۰۰٬۰۰۰ ریال','۵۰٪','/classes/'+session]],
    [`${reports}?${query}&scope=student&entity=${student}&detail=attendance`,['۱۰۰٪','شاگرد آزمون انتشار']],
    [`${reports}?${query}&detail=money`,['/finance/'+invoice,'ریز گردش و ماندهٔ مالی']],
  ];
  const latencies=await Promise.all([...samples,...samples].map(async ([path,terms])=>{
    const start=performance.now();
    const response=await get(path,owner);
    assert.equal(response.status,200);
    const html=(await response.text()).replaceAll('<!-- -->','');
    for (const term of terms) assert.ok(html.includes(term),term);
    return performance.now()-start;
  }));
  t.diagnostic(`8 concurrent report requests, client elapsed ${Math.round(Math.min(...latencies))}–${Math.round(Math.max(...latencies))} ms`);
  const xlsx=await get(`${reports}/excel?${query}&scope=court&entity=${court}`,owner);
  assert.match(xlsx.headers.get('content-type'),/spreadsheetml/);
  assert.equal(Buffer.from(await xlsx.arrayBuffer()).readUInt32LE(0),0x04034b50);
});

test('leaving preserves the audit trail and removes club access', async () => {
  const manager=identities.get('admin');
  const login=await post('login',{email:manager.email,password:`${password}-next`});
  const cookie=sessionCookie(login);
  assert.equal((await post('leave',{org},cookie)).status,303);
  assert.equal((await get(`/club/${org}`,cookie)).status,307);
  const {rows}=await db.query("select action from tennis_private.access_audit where organization_id=$1 and target_user_id=$2 order by id",[org,manager.id]);
  assert.deepEqual(rows.map(row=>row.action),['access_changed','access_changed','access_changed','recovery_link_issued','membership_left']);
});
