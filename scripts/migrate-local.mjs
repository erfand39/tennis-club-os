import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for local migrations.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query('select pg_advisory_lock(9053002)');
  await client.query(`
    create schema if not exists tennis_install;
    revoke all on schema tennis_install from public;
    create table if not exists tennis_install.migrations (
      path text primary key, sha256 text not null, applied_at timestamptz not null default now()
    );
  `);
  for (const relative of ['supabase/migrations/', 'local/migrations/']) {
    const directory = new URL(`../${relative}`, import.meta.url);
    for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const path = relative + file;
      const sql = await readFile(new URL(file, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('select sha256 from tennis_install.migrations where path = $1', [path]);
      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== checksum) throw new Error(`Migration checksum changed: ${path}`);
        continue;
      }
      await client.query('begin');
      try {
        const body = sql.replace(/^\s*begin;\s*/i, '').replace(/\s*commit;\s*$/i, '');
        await client.query(body);
        await client.query('insert into tennis_install.migrations (path, sha256) values ($1,$2)', [path, checksum]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Could not apply ${path}: ${error.message}`, { cause: error });
      }
      console.log(`Applied ${path}`);
    }
  }
} finally {
  await client.end();
}
