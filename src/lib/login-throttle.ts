import 'server-only';
import { createHash } from 'node:crypto';
import { database } from './db';
import { InputError } from './input';

const key = (email: string) => createHash('sha256').update(email.toLowerCase()).digest('hex');
export const redeemThrottleKey = 'redeem';

export class LoginThrottled extends InputError {
  constructor(readonly retryAfter: number) { super('rate', 429); }
}

export async function loginDelay(email: string): Promise<number> {
  const {rows:[result]} = await database().query<{count:number; elapsed:number|null; global_delay:number}>(
    `select count(*)::int as count,
      floor(extract(epoch from (statement_timestamp() - max(failed_at))))::int as elapsed,
      coalesce((select greatest(0,ceil(extract(epoch from
        (failed_at + interval '5 minutes' - statement_timestamp())))::int)
        from tennis_runtime.login_failures where failed_at > statement_timestamp() - interval '5 minutes'
        order by failed_at desc offset 59 limit 1),0) as global_delay
    from tennis_runtime.login_failures
    where email_hash=$1 and failed_at > statement_timestamp() - interval '30 minutes'`, [key(email)]);
  const localDelay = result.count < 5 ? 0 : Math.min(900, 60 * 2 ** (result.count - 5)) - (result.elapsed ?? 0);
  return Math.max(localDelay, result.global_delay, 0);
}

export async function recordLoginFailure(email: string): Promise<void> {
  await database().query(`with expired as (
    delete from tennis_runtime.login_failures where failed_at < statement_timestamp() - interval '24 hours'
  ) insert into tennis_runtime.login_failures (email_hash) values ($1)`, [key(email)]);
}

export async function clearLoginFailures(email: string): Promise<void> {
  await database().query('delete from tennis_runtime.login_failures where email_hash=$1', [key(email)]);
}
