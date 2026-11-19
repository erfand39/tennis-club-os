import 'server-only';
import { uuid } from './club';
import { InputError } from './input';
import { asciiDigits } from './resource-fields';

export type SafeIntOptions = {
  min?: number;
  max?: number;
  maxDigits?: number;
  allowGrouping?: boolean;
};

export interface PgErrorLike {
  code?: string;
  message?: string;
  constraint?: string;
}

export function requireUuid(raw: string | null | undefined, code = 'invalid'): string {
  const value = (raw ?? '').trim();
  if (!uuid(value)) throw new InputError(code);
  return value;
}

export function optionalUuid(raw: string | null | undefined, code = 'invalid'): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (!uuid(value)) throw new InputError(code);
  return value;
}

export function requireSafeInt(
  raw: string | null | undefined,
  code: string,
  options: SafeIntOptions = {},
): number {
  const {
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    maxDigits = 16,
    allowGrouping = false,
  } = options;
  const trimmed = asciiDigits((raw ?? '').trim());
  const normalized = allowGrouping ? trimmed.replace(/٬/g, ',') : trimmed;
  const pattern = allowGrouping ? /^(?:\d+|\d{1,3}(?:,\d{3})+)$/ : new RegExp(`^\\d{1,${maxDigits}}$`);
  const plain = allowGrouping ? normalized.replace(/,/g, '') : normalized;
  const result = Number(plain);
  if (!pattern.test(normalized) || plain.length > maxDigits || !Number.isSafeInteger(result) || result < min || result > max) {
    throw new InputError(code);
  }
  return result;
}

export function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === 'object' && error !== null;
}
