import { createHmac } from 'node:crypto';
import { AuthClient } from '@supabase/auth-js';

/** @param {string} secret */
function serviceToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', iss: 'sam-tennis-local', iat: now, exp: now + 300 })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** @param {string} url @param {string} [secret] */
export function makeAuthClient(url, secret) {
  return new AuthClient({
    url,
    headers: secret ? { Authorization: `Bearer ${serviceToken(secret)}` } : {},
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
  });
}
