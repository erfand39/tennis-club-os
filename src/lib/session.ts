import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Session } from '@supabase/auth-js';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { cache } from 'react';
import { makeAuthClient } from '../../local/auth-client.mjs';
import { authSecret, authUrl, sessionKey } from './config';
import { database, hasManagerAccess, transaction } from './db';

export const cookieName = 'sam_session';
const lifetimeSeconds = 12 * 60 * 60;
type Credentials = { access: string; refresh: string };
export type WebUser = { id: string; email: string };
type StoredSession = {
  user_id: string;
  email: string;
  credentials: string;
  access_expires_at: Date;
};

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const validToken = (value: string | undefined): value is string => !!value && /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: false, path: '/' };

export const publicAuth = () => makeAuthClient(authUrl());
export const adminAuth = () => makeAuthClient(authUrl(), authSecret());

function seal(tokens: Credentials, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(bytes => bytes.toString('base64url')).join('.');
}

function open(row: StoredSession): Credentials {
  const [iv, tag, bytes] = row.credentials.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', sessionKey(), iv);
  cipher.setAAD(Buffer.from(row.user_id));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString()) as Credentials;
}

function tokensFrom(session: Session): Credentials {
  return { access: session.access_token, refresh: session.refresh_token };
}

export async function createWebSession(session: Session, replace?: string, revokeOthers = false): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await transaction(async client => {
    if (revokeOthers) await client.query('delete from tennis_runtime.web_sessions where user_id=$1', [session.user.id]);
    else if (validToken(replace)) await client.query('delete from tennis_runtime.web_sessions where token_hash=$1', [digest(replace)]);
    await client.query('delete from tennis_runtime.web_sessions where expires_at <= now()');
    await client.query(`insert into tennis_runtime.web_sessions
      (token_hash,user_id,email,credentials,access_expires_at,expires_at)
      values ($1,$2,$3,$4,to_timestamp($5),now()+make_interval(secs=>$6))`, [
      digest(token), session.user.id, session.user.email ?? '', seal(tokensFrom(session), session.user.id),
      session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in, lifetimeSeconds,
    ]);
  });
  return token;
}

export function setSessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(cookieName, value, { ...cookieOptions, maxAge: lifetimeSeconds });
}
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(cookieName, '', { ...cookieOptions, maxAge: 0 });
}

function needRefresh(row: StoredSession): boolean {
  return row.access_expires_at.valueOf() - Date.now() < 30_000;
}

const sessionSql = `select user_id,email,credentials,access_expires_at from tennis_runtime.web_sessions
  where token_hash=$1 and expires_at > now()`;

async function refresh(hash: string): Promise<StoredSession | null> {
  return transaction(async client => {
    const { rows: [row] } = await client.query<StoredSession>(`${sessionSql} for update`, [hash]);
    if (!row) return null;
    if (!needRefresh(row)) return row;

    const result = await publicAuth().refreshSession({ refresh_token: open(row).refresh });
    if (!result.data.session || result.error || result.data.session.user.id !== row.user_id) {
      if (!result.error?.status || result.error.status >= 500) throw new Error('Local Auth is unavailable.');
      await client.query('delete from tennis_runtime.web_sessions where token_hash=$1', [hash]);
      return null;
    }
    const session = result.data.session;
    const encrypted = seal(tokensFrom(session), row.user_id);
    const email = session.user.email ?? row.email;
    const accessExpiry = session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in;
    await client.query('update tennis_runtime.web_sessions set credentials=$2,email=$3,access_expires_at=to_timestamp($4) where token_hash=$1',
      [hash, encrypted, email, accessExpiry]);
    return { ...row, email, credentials: encrypted, access_expires_at: new Date(accessExpiry * 1000) };
  });
}

export async function identify(value: string | undefined): Promise<WebUser | null> {
  if (!validToken(value)) return null;
  const hash = digest(value);
  const { rows } = await database().query<StoredSession>(sessionSql, [hash]);
  if (!rows[0]) return null;
  const row = needRefresh(rows[0]) ? await refresh(hash) : rows[0];
  if (!row) return null;
  const { data, error } = await publicAuth().getUser(open(row).access);
  if (error || !data.user || data.user.id !== row.user_id) {
    if (error && (!error.status || error.status >= 500)) throw new Error('Local Auth is unavailable.');
    return null;
  }
  if (!(await hasManagerAccess(row.user_id))) return null;
  return { id: row.user_id, email: data.user.email ?? row.email };
}

export const currentUser = cache(async () => identify((await cookies()).get(cookieName)?.value));

export async function removeSession(value: string | undefined): Promise<void> {
  if (!validToken(value)) return;
  const { rows: [row] } = await database().query<StoredSession>(
    'delete from tennis_runtime.web_sessions where token_hash=$1 returning user_id,email,credentials,access_expires_at', [digest(value)],
  );
  if (row) await adminAuth().admin.signOut(open(row).access, 'local').catch(() => {});
}
