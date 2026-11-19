import 'server-only';
import pg, { type PoolClient } from 'pg';
import { cache } from 'react';
import { databaseUrl, isDatabaseConfigured } from './config';

let pool: pg.Pool | undefined;

export function database(): pg.Pool {
  if (!isDatabaseConfigured()) {
    throw new Error('Local PostgreSQL is not configured.');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: databaseUrl(),
      max: 15,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 4000,
      statement_timeout: 12000,
    });
    pool.on('error', () => console.warn('Local PostgreSQL connection closed.'));
  }
  return pool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>, consistentRead = false): Promise<T> {
  const client = await database().connect();
  try {
    await client.query(consistentRead ? 'begin isolation level repeatable read read only' : 'begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function asUser<T>(userId: string, work: (client: PoolClient) => Promise<T>, consistentRead = false): Promise<T> {
  return transaction(async client => {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    return work(client);
  }, consistentRead);
}

export async function isConfigured(): Promise<boolean | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const { rows } = await database().query<{ configured: boolean }>('select tennis_runtime.is_configured() as configured');
    return rows[0]?.configured ?? null;
  } catch {
    return null;
  }
}

export const hasManagerAccess = cache(async (userId: string): Promise<boolean> => {
  if (!isDatabaseConfigured()) return false;
  try {
    return await asUser(userId, async client => {
      const { rows } = await client.query<{ allowed: boolean }>(`
        select exists (select from public.organization_members
          where user_id=$1 and active and role in ('owner','admin')) as allowed
      `, [userId]);
      return Boolean(rows[0]?.allowed);
    });
  } catch {
    return false;
  }
});
