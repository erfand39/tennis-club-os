import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Local runtime is missing ${name}.`);
  return value;
}

export function appOrigin(): string {
  const origin = new URL(required('SAM_ORIGIN'));
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error('SAM_ORIGIN must be a loopback HTTP origin.');
  }
  return origin.origin;
}

export const authUrl = () => required('SAM_AUTH_URL');
export const authSecret = () => required('SAM_JWT_SECRET');
export const setupCode = () => required('SAM_SETUP_CODE');
export const databaseUrl = () => required('SAM_DATABASE_URL');
export function sessionKey(): Buffer {
  const key = required('SAM_SESSION_KEY');
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('SAM_SESSION_KEY must contain 32 hex-encoded bytes.');
  return Buffer.from(key, 'hex');
}
