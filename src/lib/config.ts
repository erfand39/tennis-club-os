import 'server-only';
import { localOrigin } from './local-origin';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3030';
const DEFAULT_AUTH_URL = 'http://127.0.0.1:9999';
function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32 || /^0+$/.test(value)) throw new Error(`Invalid configuration: ${name}.`);
  return value;
}

export const isDatabaseConfigured = () => Boolean(process.env.SAM_DATABASE_URL || process.env.DATABASE_URL);
export const isAuthConfigured = () => Boolean(process.env.SAM_AUTH_URL);

export const appOrigin = () => {
  const value = process.env.SAM_ORIGIN;
  if (!value) return DEFAULT_ORIGIN;
  try {
    return localOrigin(value);
  } catch {
    return new URL(value).origin;
  }
};

export const authUrl = () => process.env.SAM_AUTH_URL || DEFAULT_AUTH_URL;
export const authSecret = () => requiredSecret('SAM_JWT_SECRET');
export const setupCode = () => process.env.SAM_SETUP_CODE || '';
export const databaseUrl = () => process.env.SAM_DATABASE_URL || process.env.DATABASE_URL || '';
export function sessionKey(): Buffer {
  const key = requiredSecret('SAM_SESSION_KEY');
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('SAM_SESSION_KEY must contain 32 hex-encoded bytes.');
  return Buffer.from(key, 'hex');
}
