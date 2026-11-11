import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for local migrations.');
const sections = ['supabase/migrations/', 'local/migrations/'];
const files = [];
for (const section of sections) {
  const directory = new URL(`../${section}`, import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    files.push({section,path:section+name,sql,sha256:createHash('sha256').update(sql).digest('hex')});
  }
}

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
  const {rows}=await client.query('select path,sha256 from tennis_install.migrations');
  const byPath=new Map(files.map(file=>[file.path,file]));
  const applied=new Set();
  for (const row of rows) {
    const file=byPath.get(row.path);
    if (!file) throw new Error('The database contains migrations outside this application version.');
    if (file.sha256!==row.sha256) throw new Error(`Migration checksum changed: ${file.path}`);
    applied.add(file.path);
  }
  for (const section of sections) {
    let pending=false;
    for (const file of files.filter(item=>item.section===section)) {
      if (!applied.has(file.path)) pending=true;
      else if (pending) throw new Error(`Missing migration before applied migration: ${file.path}`);
    }
  }
  for (const {path,sql,sha256} of files) {
    if (applied.has(path)) continue;
    await client.query('begin');
    try {
      const body = sql.replace(/^\s*begin;\s*/i, '').replace(/\s*commit;\s*$/i, '');
      await client.query(body);
      await client.query('insert into tennis_install.migrations (path, sha256) values ($1,$2)', [path, sha256]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Could not apply ${path}: ${error.message}`, { cause: error });
    }
    console.log(`Applied ${path}`);
  }
} finally {
  await client.end();
}
