import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
const roles = ['admin', 'receptionist', 'coach', 'accountant', 'student'];
const identities = new Map();
let owner;
let org;
let branch;

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

test('invitation and single-use acceptance for every club role', async () => {
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

test('server-side role enforcement and branch isolation across all roles', async () => {
  await db.query("insert into public.locations (organization_id,name,timezone) values ($1,'شعبهٔ دوم آزمایشی','Asia/Tehran')", [org]);
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
  assert.equal((await post('member', { org, user: actor.id, role: 'receptionist', location: branch }, owner)).status, 403);
  const reception = identities.get('receptionist');
  assert.equal((await post('member', { org, user: reception.id, role: 'receptionist', active: 'no', location: branch }, owner)).status, 303);
  assert.equal((await get(`/club/${org}`, reception.cookie)).status, 404);
});

test('concurrent refresh preserves a single valid local session', async () => {
  const { cookie, id } = identities.get('coach');
  await db.query("update tennis_runtime.web_sessions set access_expires_at=now()-interval '1 second' where user_id=$1", [id]);
  const results = await Promise.all([get(`/club/${org}`, cookie), get(`/club/${org}`, cookie)]);
  assert.deepEqual(results.map(response => response.status), [200, 200]);
  const { rows } = await db.query('select count(*)::int as count from tennis_runtime.web_sessions where user_id=$1 and access_expires_at>now()', [id]);
  assert.equal(rows[0].count, 1);
});

test('recovery and logout revoke prior sessions', async () => {
  const coach = identities.get('coach');
  const response = await post('recovery', { org, user: coach.id }, owner);
  assert.equal(response.status, 200);
  const newPassword = `${password}-next`;
  const recovered = await post('redeem', { mode: 'recovery', token: token((await response.json()).link), password: newPassword });
  assert.equal(recovered.status, 200, recovered.status === 200 ? '' : await recovered.text());
  const cookie = sessionCookie(recovered);
  assert.equal((await get(`/club/${org}`, coach.cookie)).status, 307);
  assert.equal((await post('login', { email: coach.email, password })).status, 401);
  assert.equal((await post('logout', {}, cookie)).status, 303);
  assert.equal((await get(`/club/${org}`, cookie)).status, 307);
  assert.equal((await post('login', { email: coach.email, password: newPassword })).status, 303);
});

test('leaving preserves the audit trail and removes club access', async () => {
  const student = identities.get('student');
  assert.equal((await post('leave', { org }, student.cookie)).status, 303);
  assert.equal((await get(`/club/${org}`, student.cookie)).status, 404);
  const { rows } = await db.query("select action from tennis_private.access_audit where organization_id=$1 and target_user_id=$2 order by id", [org, student.id]);
  assert.deepEqual(rows.map(row => row.action), ['access_changed', 'membership_left']);
});
