import 'server-only';
import pg, { type PoolClient } from 'pg';
import { databaseUrl } from './config';

let pool: pg.Pool | undefined;
let refreshPool: pg.Pool | undefined;

function createPool(max: number): pg.Pool {
  const instance = new pg.Pool({ connectionString: databaseUrl(), max, connectionTimeoutMillis: 4000, statement_timeout: 12000 });
  instance.on('error', () => console.warn('Local PostgreSQL connection closed.'));
  return instance;
}

export function database(): pg.Pool {
  return pool ??= createPool(10);
}

export function refreshDatabase(): pg.Pool {
  return refreshPool ??= createPool(3);
}

export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
  consistentRead = false,
  connectionPool = database(),
): Promise<T> {
  const client = await connectionPool.connect();
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
  },consistentRead);
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
