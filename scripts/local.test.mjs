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

test('leaving preserves the audit trail and removes club access', async () => {
  const manager=identities.get('admin');
  const login=await post('login',{email:manager.email,password:`${password}-next`});
  const cookie=sessionCookie(login);
  assert.equal((await post('leave',{org},cookie)).status,303);
  assert.equal((await get(`/club/${org}`,cookie)).status,307);
  const {rows}=await db.query("select action from tennis_private.access_audit where organization_id=$1 and target_user_id=$2 order by id",[org,manager.id]);
  assert.deepEqual(rows.map(row=>row.action),['access_changed','access_changed','access_changed','membership_left']);
});
