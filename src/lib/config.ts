import 'server-only';
import { localOrigin } from './local-origin';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Local runtime is missing ${name}.`);
  return value;
}

export const appOrigin = () => localOrigin(required('SAM_ORIGIN'));

export const authUrl = () => required('SAM_AUTH_URL');
export const authSecret = () => required('SAM_JWT_SECRET');
export const setupCode = () => required('SAM_SETUP_CODE');
export const databaseUrl = () => required('SAM_DATABASE_URL');
export function sessionKey(): Buffer {
  const key = required('SAM_SESSION_KEY');
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('SAM_SESSION_KEY must contain 32 hex-encoded bytes.');
  return Buffer.from(key, 'hex');
}
