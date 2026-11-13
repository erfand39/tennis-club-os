import { randomUUID,timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { appOrigin, authUrl, setupCode } from '@/lib/config';
import { asUser, database, hasManagerAccess, isConfigured } from '@/lib/db';
import { clubFor, members, uuid } from '@/lib/club';
import { type ClubRole, roles } from '@/lib/roles';
import { isBookingAction, runBookingAction } from '@/lib/booking-commands';
import { isClassAction, runClassAction } from '@/lib/class-commands';
import { classesPath } from '@/lib/class-fields';
import { calendarPath } from '@/lib/calendar-dates';
import { isFinanceAction,runFinanceAction } from '@/lib/finance-commands';
import { financePath } from '@/lib/finance-fields';
import { InputError } from '@/lib/input';
import { disableDevice,enableDevice,markNotices,noticePath,pushCookie,setPushCookie } from '@/lib/notifications';
import { isResourceCommand, runResourceCommand } from '@/lib/resource-commands';
import { isResourceKind, resourcePath } from '@/lib/resource-fields';
import {
  adminAuth, clearSessionCookie, cookieName, createWebSession, identify, publicAuth, removeSession, setSessionCookie,
} from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function go(path: string, problem?: string): NextResponse {
  const url = new URL(path, appOrigin());
  if (problem) url.searchParams.set('error', problem);
  return NextResponse.redirect(url, 303);
}

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && b.length >= 32 && timingSafeEqual(a, b);
}

function hasTrustedOrigin(request: NextRequest): boolean {
  const expected = appOrigin();
  const origin = request.headers.get('origin');
  if (origin === expected) return true;
  if (origin !== 'null') return false;

  // Safari can serialize an opaque document origin as "null" on form navigation.
  // Accept it only when Fetch Metadata confirms same-origin and Host matches this install.
  return request.headers.get('sec-fetch-site') === 'same-origin'
    && request.headers.get('host') === new URL(expected).host;
}

async function form(request: NextRequest): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    throw new InputError('invalid');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('invalid');
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new InputError('invalid', 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return new URLSearchParams(body + decoder.decode());
}

function emailOf(values: URLSearchParams): string {
  const email = (values.get('email') ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('email');
  return email;
}
function passwordOf(values: URLSearchParams, isNew = true): string {
  const password = values.get('password') ?? '';
  if (!password || Buffer.byteLength(password) > 72 || (isNew && password.length < 12)) throw new InputError('password');
  return password;
}
function nameOf(values: URLSearchParams): string {
  const name = (values.get('name') ?? '').trim();
  if (!name || name.length > 120) throw new InputError('name');
  return name;
}
function idOf(values: URLSearchParams, key: string): string {
  const id = values.get(key) ?? '';
  if (!uuid(id)) throw new InputError('invalid');
  return id;
}
function accessOf(values: URLSearchParams) {
  const role = values.get('role') ?? '';
  const locations = values.getAll('location');
  const active = values.get('active') !== 'no';
  if (!Object.hasOwn(roles, role)) throw new InputError('manager-only', 403);
  if (locations.some(id => !uuid(id)) || locations.length > 100) throw new InputError('access');
  if (role !== 'owner' && active && !locations.length) throw new InputError('branches');
  return { role: role as ClubRole, locations: role === 'owner' ? [] : locations, active };
}

async function signIn(email: string, password: string) {
  const { data, error } = await publicAuth().signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error?.status === 429) throw new InputError('rate', 429);
    if (error && (!error.status || error.status >= 500)) throw new InputError('unavailable', 503);
    throw new InputError('login', 401);
  }
  return data.session;
}

function redeemUrl(mode: 'invite' | 'recovery', token: string): string {
  const link = new URL(`/redeem?mode=${mode}`, appOrigin());
  link.hash = new URLSearchParams({ token }).toString();
  return link.toString();
}

export async function GET(_: NextRequest, context: { params: Promise<{ action: string }> }) {
  if ((await context.params).action !== 'health') return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const [, auth] = await Promise.all([isConfigured(), fetch(new URL('/health', authUrl()), { cache: 'no-store', signal: AbortSignal.timeout(1500) })]);
    return NextResponse.json({ ok: auth.ok }, { status: auth.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });

  const currentToken = request.cookies.get(cookieName)?.value;
  let errorPath = '/';
  try {
    const fields = await form(request);
    if (action === 'logout') {
      const device=request.cookies.get(pushCookie)?.value;
      await removeSession(currentToken,device&&uuid(device)?device:undefined);
      const response = go('/');
      clearSessionCookie(response);
      setPushCookie(response,'',0);
      return response;
    }
    if (action === 'login') {
      const session = await signIn(emailOf(fields), passwordOf(fields, false));
      if (!(await hasManagerAccess(session.user.id))) throw new InputError('manager-only', 403);
      const response = go('/club');
      setSessionCookie(response, await createWebSession(session, currentToken));
      return response;
    }
    if (action === 'setup') {
      if (await isConfigured()) throw new InputError('setup-done', 409);
      if (!equalSecret(fields.get('code') ?? '', setupCode())) throw new InputError('setup-code', 403);
      const email = emailOf(fields);
      const password = passwordOf(fields);
      const name = nameOf(fields);
      const timezone = (fields.get('timezone') ?? 'Asia/Tehran').trim();
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new InputError('timezone'); }
      const result = await adminAuth().admin.createUser({ email, password, email_confirm: true });
      if (result.error && !['email_exists', 'user_already_exists'].includes(result.error.code ?? '')) {
        throw new InputError('setup-failed', 503);
      }
      const session = await signIn(email, password);
      const { rows } = await database().query<{ id: string }>(
        'select tennis_runtime.bootstrap_club($1,$2,$3) as id', [session.user.id, name, timezone]);
      const response = go(`/club/${rows[0].id}`);
      setSessionCookie(response, await createWebSession(session, currentToken));
      return response;
    }
    if (action === 'redeem') {
      const mode = fields.get('mode');
      if (mode !== 'invite' && mode !== 'recovery') throw new InputError('link');
      errorPath = `/redeem?mode=${mode}`;
      const token = fields.get('token') ?? '';
      if (!/^[A-Za-z0-9_-]{30,160}$/.test(token)) throw new InputError('link');
      const password = passwordOf(fields);
      const auth = publicAuth();
      const result = await auth.verifyOtp({ type: mode, token_hash: token });
      if (result.error || !result.data.session) throw new InputError('link');
      if (!(await hasManagerAccess(result.data.session.user.id))) throw new InputError('manager-only', 403);
      const changed = await auth.updateUser({ password });
      if (changed.error || !changed.data.user) throw new InputError('password-update');
      // Sign in with the new password so the local session uses fresh tokens.
      const session = await signIn(changed.data.user.email ?? '', password);
      const response = wantsJson ? NextResponse.json({ next: '/club' }) : go('/club');
      setSessionCookie(response, await createWebSession(session, currentToken, true));
      return response;
    }

    const user = await identify(currentToken);
    if (!user) throw new InputError('session', 401);
    const org = idOf(fields, 'org');
    const club = await clubFor(user.id, org);
    if (!club) throw new InputError('denied', 403);

    if (action==='notice-read') {
      const branch=fields.get('branch')?idOf(fields,'branch'):null;
      errorPath=noticePath(org,branch??undefined);
      const event=fields.get('event')==='all'?null:idOf(fields,'event');
      await markNotices(user.id,org,branch,event);
      return wantsJson?NextResponse.json({ok:true}):go(errorPath);
    }
    if (action==='notice-push' || action==='notice-disable') {
      const previous=request.cookies.get(pushCookie)?.value;
      const response=NextResponse.json({ok:true});
      if (action==='notice-push') {
        setPushCookie(response,await enableDevice(user.id,org,fields.get('subscription')??'',previous));
      } else {
        await disableDevice(previous,user.id,org);
        setPushCookie(response,'',0);
      }
      return response;
    }
    if (action === 'profile') {
      errorPath = `/club/${org}/profile`;
      await asUser(user.id, db => db.query('select public.update_my_profile($1)', [nameOf(fields)]));
      return go(`${errorPath}?saved=1`);
    }
    if (action === 'leave') {
      errorPath = `/club/${org}/profile`;
      await asUser(user.id, db => db.query('select public.leave_club($1)', [org]));
      return go('/club');
    }
    if (isFinanceAction(action)) {
      const invoice=fields.get('invoice') ?? '';
      const booking=fields.get('booking') ?? '';
      errorPath=action==='finance-issue' && uuid(booking) ? calendarPath(org,{booking}) : financePath(org,uuid(invoice)?invoice:undefined);
      const result=await runFinanceAction(action,fields,user.id,org);
      return !wantsJson && result.next ? go(result.next) : NextResponse.json(result);
    }
    if (isClassAction(action)) {
      const session = fields.get('session') ?? '';
      errorPath = classesPath(org,uuid(session) ? session : undefined);
      const next = await runClassAction(action,fields,user.id,org);
      return wantsJson ? NextResponse.json({ next }) : go(next);
    }
    if (isBookingAction(action)) {
      const booking = fields.get('booking') ?? '';
      const branch = fields.get('branch') ?? '';
      errorPath = calendarPath(org, { booking: uuid(booking) ? booking : 'new', branch: uuid(branch) ? branch : undefined });
      const result = await runBookingAction(action,fields,user.id,org);
      return !wantsJson && result.next ? go(result.next) : NextResponse.json(result);
    }
    if (isResourceCommand(action)) {
      const kind = fields.get('kind') ?? '';
      if (!isResourceKind(kind)) throw new InputError('resource-invalid');
      const target = fields.get('id') ?? '';
      errorPath = resourcePath(org, kind, uuid(target) ? target : 'new');
      const next = await runResourceCommand(action, fields, user.id, org);
      return wantsJson ? NextResponse.json({ next }) : go(next);
    }
    if (club.role !== 'owner') throw new InputError('denied', 403);
    errorPath = `/club/${org}/members`;

    if (action === 'member') {
      const target = idOf(fields, 'user');
      const access = accessOf(fields);
      await asUser(user.id, db => db.query('select public.set_club_member($1,$2,$3,$4,$5)',
        [org, target, access.role, access.active, access.locations]));
      return go(`${errorPath}?saved=1`);
    }
    if (action === 'invite') {
      fields.set('active', 'yes');
      const email = emailOf(fields);
      const access = accessOf(fields);
      const result = await adminAuth().admin.generateLink({ type: 'invite', email });
      if (result.error || !result.data.properties?.hashed_token || !result.data.user?.id) throw new InputError('invite');
      await asUser(user.id, db => db.query('select public.set_club_member($1,$2,$3,$4,$5)',
        [org, result.data.user.id, access.role, true, access.locations]));
      return NextResponse.json({ link: redeemUrl('invite', result.data.properties.hashed_token) });
    }
    if (action === 'recovery') {
      const target = idOf(fields, 'user');
      if (target === user.id) throw new InputError('denied', 403);
      const member = (await members(user.id, org)).find(row => row.user_id === target && row.active);
      if (!member?.email) throw new InputError('denied', 403);
      const { data, error } = await adminAuth().admin.generateLink({ type: 'recovery', email: member.email });
      if (error || !data.properties?.hashed_token) throw new InputError('recovery');
      try {
        await asUser(user.id, db => db.query('select public.record_member_recovery($1,$2)', [org, target]));
      } catch {
        throw new InputError('unavailable', 503);
      }
      return NextResponse.json({ link: redeemUrl('recovery', data.properties.hashed_token) });
    }
    return NextResponse.json({ error: 'missing' }, { status: 404 });
  } catch (failure) {
    const dbError = failure as { code?: string; message?: string };
    const code = failure instanceof InputError ? failure.code
      : dbError.code === '42501' ? 'denied'
      : dbError.message === 'invalid_member_locations' ? 'branches'
      : dbError.message === 'manager_role_required' ? 'manager-only'
      : dbError.message === 'club_already_configured' ? 'setup-done'
      : dbError.message === 'resource_stale' ? 'resource-stale'
      : dbError.message === 'request_payload_mismatch' ? 'resource-request'
      : dbError.message === 'coach_court_scope_invalid' ? 'resource-courts'
      : dbError.message === 'rate_must_follow_latest' ? 'resource-rate'
      : dbError.code === '23P01' ? 'resource-conflict'
      : dbError.code === '23505' ? 'resource-duplicate'
      : dbError.code === '23514' || dbError.code?.startsWith('22') ? 'resource-invalid'
      : dbError.code === '40001' || dbError.code === '40P01' || dbError.code === '55P03' ? 'retry' : 'unavailable';
    const status = failure instanceof InputError ? failure.status : code === 'unavailable' ? 503 : code === 'denied' ? 403 : 400;
    const response=wantsJson ? NextResponse.json({ error: code }, { status }) : go(errorPath, code);
    if (code==='unavailable') {
      const trace=randomUUID();
      console.error(JSON.stringify({event:'local_api_unavailable',trace}));
      response.headers.set('X-Sam-Trace',trace);
    }
    return response;
  }
}
