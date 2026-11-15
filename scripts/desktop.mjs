import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const platform = process.platform;
const extension = platform === 'win32' ? '.exe' : '';
const defaultData = platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Sam Tennis')
  : platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Sam Tennis')
    : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'sam-tennis');
const data = path.resolve(process.env.SAM_DESKTOP_DATA_DIR || defaultData);
const pgData = path.join(data, 'postgres');
const settingsPath = path.join(data, 'settings.json');
const activePath = path.join(data, 'active-database.json');
const host = '127.0.0.1';
const hex = () => randomBytes(32).toString('hex');

let tools;
let pgProcess;
let pgPort;
let pg;
let authProcess;
let appProcess;
let operationLock;
let installation;
const interrupted = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => interrupted.abort());
}

async function exists(file) {
  return access(file).then(() => true, () => false);
}

async function atomicJson(file, value) {
  const temp = file + '.' + randomBytes(8).toString('hex');
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

async function settings() {
  if (!await exists(settingsPath)) {
    if (await exists(pgData)) throw new Error('Original settings.json is missing. Restore into a new data directory.');
    await atomicJson(settingsPath, { db: hex(), auth: hex(), web: hex(), jwt: hex(), session: hex(), setup: hex() });
  }
  const values = JSON.parse(await readFile(settingsPath, 'utf8'));
  for (const key of ['db', 'auth', 'web', 'jwt', 'session', 'setup']) {
    if (typeof values[key] !== 'string' || !/^[a-f0-9]{64}$/.test(values[key])) {
      throw new Error('Invalid local installation settings.');
    }
  }
  return values;
}

async function findPostgres() {
  const official = platform === 'win32' ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL', '17', 'bin'),
  ] : ['/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin'];
  const directories = process.env.SAM_PG_BIN
    ? [path.resolve(process.env.SAM_PG_BIN)]
    : [...official, ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)];
  for (const directory of directories) {
    const binaries = Object.fromEntries(['initdb', 'postgres', 'pg_ctl', 'pg_dump', 'pg_restore'].map(command =>
      [command, path.join(directory, command + extension)]));
    if (!(await Promise.all(Object.values(binaries).map(exists))).every(Boolean)) continue;
    const version = spawnSync(binaries.postgres, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (version.status === 0 && /PostgreSQL\) 17\./.test(version.stdout)) return binaries;
  }
  throw new Error('PostgreSQL 17 tools are required. See docs/desktop.md or set SAM_PG_BIN to the PostgreSQL 17 bin directory.');
}

function child(command, args, options = {}) {
  const process = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  const done = new Promise(resolve => {
    process.once('error', error => resolve({ error }));
    process.once('close', (code, signal) => resolve({ code, signal }));
  });
  return { process, done };
}

async function run(command, args, options) {
  const { done } = child(command, args, options);
  const result = await done;
  if (result.error) throw result.error;
  if (result.code !== 0) throw new Error(path.basename(command) + ' failed (' + (result.code ?? result.signal) + ').');
}

async function shutdown(service) {
  if (!service || !service.process.pid || service.process.exitCode !== null || service.process.signalCode !== null) return;
  service.process.kill('SIGTERM');
  if (!await Promise.race([service.done.then(() => true), delay(5000, false, { ref: false })])) {
    service.process.kill('SIGKILL');
    await service.done;
  }
}

function url(database, user, password) {
  return 'postgresql://' + user + ':' + password + '@' + host + ':' + pgPort + '/' + database;
}

async function query(database, secrets, work) {
  const client = new pg.Client({ connectionString: url(database, 'postgres', secrets.db), connectionTimeoutMillis: 1500 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function findPort(preferred = 0) {
  const server = net.createServer();
  try {
    return await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(preferred, host, () => {
        const port = server.address().port;
        server.close(error => error ? reject(error) : resolve(port));
      });
    });
  } catch (error) {
    if (preferred && error.code === 'EADDRINUSE') return null;
    throw error;
  }
}

async function waitFor(service, condition, name) {
  for (let attempt = 0; attempt < 180; attempt++) {
    interrupted.signal.throwIfAborted();
    const result = await Promise.race([service.done, delay(400, null)]);
    if (result) throw new Error(name + ' stopped before it was ready. Check the log above.');
    if (await condition().catch(() => false)) return;
  }
  throw new Error(name + ' did not become ready.');
}

async function initPostgres(secrets) {
  if (await exists(pgData)) {
    if (!await exists(path.join(pgData, 'PG_VERSION'))) throw new Error('The installed PostgreSQL data directory is incomplete.');
    return;
  }
  const staging = await mkdtemp(path.join(data, 'init-'));
  try {
    const passfile = path.join(staging, 'password');
    const cluster = path.join(staging, 'cluster');
    await writeFile(passfile, secrets.db + '\n', { mode: 0o600 });
    await run(tools.initdb, [
      '-D', cluster, '--username=postgres', '--encoding=UTF8', '--locale=C',
      '--auth=scram-sha-256', '--pwfile=' + passfile,
    ]);
    await rename(cluster, pgData);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function startPostgres(secrets) {
  await initPostgres(secrets);
  pgPort = await findPort();
  pgProcess = child(tools.postgres, ['-D', pgData, '-h', host, '-p', String(pgPort), '-c', 'unix_socket_directories=']);
  await waitFor(pgProcess, () => query('postgres', secrets, () => true), 'PostgreSQL');
  await query('postgres', secrets, async client => {
    if ((await client.query("select 1 from pg_roles where rolname='tennis_web'")).rowCount) return;
    // Same roles and privileges as the Docker installation.
    const roles = (await readFile(path.join(root, 'local', 'init-roles.sql'), 'utf8'))
      .replace(":'auth_password'", "'" + secrets.auth + "'")
      .replace(":'web_password'", "'" + secrets.web + "'");
    await client.query('begin;\n' + roles + '\ncommit;');
  });
}

function validDatabase(database) {
  return database === 'postgres' || (typeof database === 'string' && /^sam_import_[a-f0-9]{24}$/.test(database));
}

async function activeDatabase() {
  if (!await exists(activePath)) return { database: 'postgres' };
  const selection = JSON.parse(await readFile(activePath, 'utf8'));
  if (!validDatabase(selection.database) || !validDatabase(selection.previous)) {
    throw new Error('Invalid active database selection.');
  }
  return selection;
}

async function acquireOperationLock() {
  const canonical = await realpath(data);
  const hash = createHash('sha256').update(platform === 'win32' ? canonical.toLowerCase() : canonical).digest();
  const port = 20000 + hash.readUInt32BE() % 10000;
  const server = net.createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host, exclusive: true }, resolve);
  }).catch(error => {
    if (error.code === 'EADDRINUSE') throw new Error('This installation is already in use. Close Sam Tennis before starting another operation.');
    throw error;
  });
  return server;
}

async function waitForHttp(service, address, name) {
  await waitFor(service, async () => (await fetch(address, { signal: AbortSignal.timeout(1500) })).ok, name);
}

async function startAuth(database, secrets, origin) {
  const executable = process.env.SAM_AUTH_BIN || path.join(root, 'runtime', 'auth' + extension);
  if (!await exists(executable)) throw new Error('Supabase Auth is missing. Use the native release package or set SAM_AUTH_BIN.');
  const port = await findPort();
  const authUrl = 'http://' + host + ':' + port;
  authProcess = child(executable, [], { cwd: data, env: {
    ...process.env,
    API_EXTERNAL_URL: origin,
    GOTRUE_SITE_URL: origin,
    GOTRUE_API_HOST: host,
    GOTRUE_API_PORT: String(port),
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_NAMESPACE: 'auth',
    GOTRUE_DB_DATABASE_URL: url(database, 'supabase_auth_admin', secrets.auth) + '?search_path=auth&sslmode=disable',
    GOTRUE_JWT_SECRET: secrets.jwt,
    GOTRUE_JWT_EXP: '900',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'false',
    GOTRUE_MAILER_OTP_EXP: '3600',
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '10',
  } });
  await waitForHttp(authProcess, authUrl + '/health', 'Supabase Auth');
  return authUrl;
}

async function migrate(database, secrets) {
  await run(process.execPath, ['scripts/migrate-local.mjs'], {
    env: { ...process.env, DATABASE_URL: url(database, 'postgres', secrets.db) },
  });
}

async function verify(database, secrets) {
  const verification = await readFile(path.join(root, 'local', 'restore-verify.sql'), 'utf8');
  return query(database, secrets, async client => (await client.query(verification)).at(-1).rows[0]);
}

function openBrowser(origin) {
  const program = platform === 'darwin' ? 'open' : platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', origin] : [origin];
  const browser = spawn(program, args, { stdio: 'ignore', windowsHide: true });
  browser.on('error', () => {});
  browser.unref();
}

async function start(database, secrets) {
  const port = await findPort(3030) ?? await findPort(3031);
  if (!port) throw new Error('Both local ports 3030 and 3031 are in use.');
  const origin = 'http://' + host + ':' + port;
  await query(database, secrets, async client => {
    if ((await client.query("select to_regnamespace('auth') as schema")).rows[0].schema) return;
    const bootstrap = await readFile(path.join(root, 'local', 'init-db.sql'), 'utf8');
    await client.query('begin;\n' + bootstrap + '\ncommit;');
  });
  const authUrl = await startAuth(database, secrets, origin);
  await migrate(database, secrets);
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    SAM_ORIGIN: origin,
    SAM_AUTH_URL: authUrl,
    SAM_DATABASE_URL: url(database, 'tennis_web', secrets.web),
    SAM_JWT_SECRET: secrets.jwt,
    SAM_SESSION_KEY: secrets.session,
    SAM_SETUP_CODE: secrets.setup,
  };
  appProcess = child(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', host, '--port', String(port)], { env });
  await waitForHttp(appProcess, origin + '/api/health', 'Sam Tennis');
  console.log('باشگاه تنیس سام — ' + origin);
  console.log('داده‌ها: ' + data);
  const configured = await query(database, secrets, async client =>
    (await client.query('select tennis_runtime.is_configured() as configured')).rows[0].configured);
  if (!configured) console.log('کد راه‌اندازی اولیه: ' + secrets.setup);
  if (process.env.SAM_DESKTOP_NO_BROWSER !== '1') openBrowser(origin);
  await Promise.race([
    interrupted.signal.aborted ? Promise.resolve() : new Promise(resolve =>
      interrupted.signal.addEventListener('abort', resolve, { once: true })),
    ...[appProcess, authProcess, pgProcess].map(service => service.done.then(result => {
      if (!interrupted.signal.aborted) throw new Error('A required service stopped (' + (result.code ?? result.signal ?? 'unknown') + ').');
    })),
  ]);
}

function pgArchiveEnvironment(secrets) {
  return { ...process.env, PGPASSWORD: secrets.db, PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5' };
}

function connectionArgs(database) {
  return ['--host', host, '--port', String(pgPort), '--username', 'postgres', '--dbname', database, '--no-password'];
}

async function exportArchive(database, secrets, requested) {
  await verify(database, secrets);
  const dir = path.join(data, 'backups');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = requested ? path.resolve(requested) : path.join(dir,
    'sam-tennis-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex') + '.dump');
  const tempDir = await mkdtemp(path.join(path.dirname(target), '.sam-export-'));
  const temp = path.join(tempDir, 'backup.dump');
  try {
    await run(tools.pg_dump, [
      ...connectionArgs(database), '--format=custom', '--exclude-table-data=tennis_runtime.web_sessions', '--file', temp,
    ], { env: pgArchiveEnvironment(secrets) });
    await copyFile(temp, target, constants.COPYFILE_EXCL);
    console.log('فایل انتقال: ' + target);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function importArchive(previous, secrets, archive) {
  const file = path.resolve(archive);
  if (!(await stat(file)).isFile()) throw new Error('Choose a PostgreSQL .dump file created by Sam Tennis.');
  const database = 'sam_import_' + randomBytes(12).toString('hex');
  await query('postgres', secrets, client => client.query('create database ' + database + ' template template0'));
  let activated = false;
  try {
    await run(tools.pg_restore, [
      ...connectionArgs(database), '--format=custom', '--exit-on-error', '--single-transaction', file,
    ], { env: pgArchiveEnvironment(secrets) });
    // The restored database is separate from the active database throughout validation.
    await verify(database, secrets);
    await startAuth(database, secrets, 'http://' + host + ':3030');
    await migrate(database, secrets);
    await shutdown(authProcess);
    authProcess = undefined;
    const result = await verify(database, secrets);
    await query(database, secrets, client => client.query(`
      begin;
      delete from tennis_runtime.web_sessions;
      delete from tennis_runtime.push_devices;
      delete from auth.sessions;
      delete from auth.refresh_tokens;
      commit;
    `));
    await atomicJson(activePath, { database, previous });
    activated = true;
    console.log('انتقال انجام شد. برنامه را اجرا و دوباره وارد شوید.');
    console.table(result);
  } finally {
    if (!activated) {
      await shutdown(authProcess);
      authProcess = undefined;
      await query('postgres', secrets, client => client.query('drop database ' + database + ' with (force)'));
    }
  }
}

async function menu() {
  if (!process.stdin.isTTY) return ['start'];
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const selection = (await input.question('باشگاه تنیس سام\n۱) اجرا  ۲) خروجی اطلاعات  ۳) ورود اطلاعات\nانتخاب [۱]: ')).trim();
    if (selection === '' || selection === '1' || selection === '۱') return ['start'];
    if (selection === '2' || selection === '۲') return ['export'];
    if (selection === '3' || selection === '۳') {
      const file = (await input.question('مسیر فایل پشتیبان را وارد کنید: ')).trim();
      return ['import', file.replace(/^(["'])(.*)\1$/, '$2')];
    }
    throw new Error('یکی از گزینه‌های اجرا، خروجی یا ورود را انتخاب کنید.');
  } finally {
    input.close();
  }
}

async function main() {
  const [command, file] = process.argv.length > 2 ? process.argv.slice(2) : await menu();
  if (!['start', 'export', 'import', 'rollback'].includes(command) || (command === 'import' && !file)) {
    throw new Error('Usage: Start-Sam-Tennis start | export [FILE.dump] | import FILE.dump | rollback');
  }
  await mkdir(data, { recursive: true, mode: 0o700 });
  operationLock = await acquireOperationLock();
  tools = await findPostgres();
  if (!await exists(path.join(root, 'node_modules', 'pg', 'package.json'))) {
    throw new Error('Application dependencies are missing. Use the release package or run npm ci from source.');
  }
  if (command === 'start' && !await exists(path.join(root, '.next', 'BUILD_ID'))) {
    throw new Error('Application build is missing. Use the release package or run npm run build from source.');
  }
  pg = (await import('pg')).default;
  installation = await settings();
  await startPostgres(installation);
  const { database, previous } = await activeDatabase();
  if (command === 'import') await importArchive(database, installation, file);
  else if (command === 'export') await exportArchive(database, installation, file);
  else if (command === 'rollback') {
    if (!previous) throw new Error('There is no previous installation to restore.');
    await verify(previous, installation);
    await atomicJson(activePath, { database: previous, previous: database });
    console.log('دیتابیس قبلی فعال شد.');
  } else await start(database, installation);
}

try {
  await main();
} catch (error) {
  if (!interrupted.signal.aborted) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  await shutdown(appProcess);
  await shutdown(authProcess);
  if (pgProcess?.process.pid && pgProcess.process.exitCode === null && pgProcess.process.signalCode === null) {
    // Only stop the postmaster started by this process, never another installation.
    if (!await query('postgres', installation, () => true).catch(() => false)) await shutdown(pgProcess);
    else {
      try {
        await run(tools.pg_ctl, ['-D', pgData, '-m', 'fast', '-w', 'stop']);
        await pgProcess.done;
      } catch {
        await shutdown(pgProcess);
        process.exitCode = 1;
      }
    }
  }
  if (operationLock) await new Promise(resolve => operationLock.close(resolve));
}
