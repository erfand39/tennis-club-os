import 'server-only';
import pg, { type PoolClient } from 'pg';
import { databaseUrl } from './config';

let pool: pg.Pool | undefined;

export function database(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl(), max: 10, connectionTimeoutMillis: 4000, statement_timeout: 12000 });
    pool.on('error', () => console.warn('Local PostgreSQL connection closed.'));
  }
  return pool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query('begin');
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

export function asUser<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  return transaction(async client => {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    return work(client);
  });
}

export async function isConfigured(): Promise<boolean> {
  const { rows } = await database().query<{ configured: boolean }>('select tennis_runtime.is_configured() as configured');
  return rows[0].configured;
}

export function hasManagerAccess(userId: string): Promise<boolean> {
  return asUser(userId, async client => (await client.query<{ allowed: boolean }>(`
    select exists (select from public.organization_members
      where user_id=$1 and active and role in ('owner','admin')) as allowed
  `, [userId])).rows[0].allowed);
}
