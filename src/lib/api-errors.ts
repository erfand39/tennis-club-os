import { InputError } from './input.ts';

const invalidByFamily = {
  booking: 'booking-invalid',
  class: 'attendance-invalid',
  finance: 'finance-invalid',
  'club-finance': 'club-finance-invalid',
  resource: 'resource-invalid',
  general: 'invalid',
} as const;

export function errorCode(failure: unknown, family: keyof typeof invalidByFamily): string {
  const dbError = failure && typeof failure === 'object' ? failure as { code?: string; message?: string } : {};
  return failure instanceof InputError ? failure.code
      : dbError.code === '42501' ? 'denied'
      : dbError.message === 'invalid_member_locations' ? 'branches'
      : dbError.message === 'manager_role_required' ? 'manager-only'
      : dbError.message === 'club_already_configured' ? 'setup-done'
      : dbError.message === 'resource_stale' ? 'resource-stale'
      : dbError.message === 'request_payload_mismatch' ? family === 'resource' ? 'resource-request' : invalidByFamily[family]
      : dbError.message === 'coach_court_scope_invalid' ? 'resource-courts'
      : dbError.message === 'rate_must_follow_latest' ? 'resource-rate'
      : dbError.code === '23P01' ? family === 'resource' ? 'resource-conflict' : invalidByFamily[family]
      : dbError.code === '23505' ? family === 'resource' ? 'resource-duplicate' : invalidByFamily[family]
      : dbError.code === '23514' || dbError.code?.startsWith('22') ? invalidByFamily[family]
      : dbError.code === '40001' || dbError.code === '40P01' || dbError.code === '55P03' ? 'retry' : 'unavailable';
}
