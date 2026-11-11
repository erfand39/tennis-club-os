import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {cp,mkdir,mkdtemp,open,rm,symlink,truncate,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {after,before,test} from 'node:test';
import pg from 'pg';

const repo=fileURLToPath(new URL('..',import.meta.url));
const sourceUrl=new URL(process.env.SAM_RECOVERY_SOURCE_URL);
assert(['127.0.0.1','localhost','[::1]'].includes(sourceUrl.hostname),'Use the disposable fixture stack on loopback.');
const source=new pg.Client({connectionString:sourceUrl.toString()});
const ownerEmail='owner@sam.example';
const work=await mkdtemp(join(tmpdir(),'sam-release-recovery-'));
const archive=join(work,'club.dump');
const data=join(work,'restored');
const dbPassword=randomBytes(24).toString('hex');
const authPassword=process.env.SAM_AUTH_DB_PASSWORD??randomBytes(24).toString('hex');
const webPassword=process.env.SAM_WEB_DB_PASSWORD??randomBytes(24).toString('hex');
let restored,restoredUrl,owner,sourceFingerprint,serverStarted=false;
const env={...process.env,SAM_DB_PASSWORD:dbPassword,SAM_AUTH_DB_PASSWORD:authPassword,SAM_WEB_DB_PASSWORD:webPassword};
const fingerprintTables=[
  'public.organizations','public.locations','public.courts','public.coach_profiles','public.student_profiles',
  'public.bookings','public.sessions','public.session_participants','public.attendance_records','public.invoices',
  'public.invoice_items','public.payments','public.refunds','public.training_packages','public.training_uses',
  'public.coach_payables','public.notification_events','public.notification_reads','auth.users',
  'tennis_private.audit_events','tennis_private.operation_requests','tennis_install.migrations',
];

function run(bin,args,options={}) {
  const result=spawnSync(bin,args,{encoding:'utf8',timeout:45000,...options});
  if (result.error) throw result.error;
  return result;
}
function success(result) {
  assert.equal(result.status,0,result.stderr||result.stdout);
  return result.stdout;
}
async function fingerprint(db) {
  const results=[];
  for (const table of fingerprintTables) {
    const {rows:[row]}=await db.query(`select count(*)::int as count,
      md5(coalesce(string_agg(digest,'' order by digest),'')) as digest
      from (select md5(to_jsonb(t)::text) as digest from ${table} t) rows`);
    results.push([table,row]);
  }
  return results;
}
async function restore(mode,file,dir) {
  const stream=await open(file,'r');
  try {
    return run('sh',[join(repo,'local/restore-archive.sh'),mode],{
      env:{...env,PGDATA:dir,PGPORT:String(await port())},stdio:[stream.fd,'pipe','pipe'],
    });
  } finally {
    await stream.close();
  }
}
async function port() {
  const probe=createServer();
  return await new Promise((resolve,reject)=>{
    probe.once('error',reject);
    probe.listen(0,'127.0.0.1',()=>{const {port}=probe.address();probe.close(()=>resolve(port));});
  });
}
async function waitFor(url) {
  for (let attempt=0;attempt<65;attempt++) {
    try { if ((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok) return; } catch {}
    await delay(160);
  }
  assert.fail('Restored service did not become healthy.');
}
function launched(bin,args,extra) {
  return spawn(bin,args,{cwd:repo,env:{...process.env,...extra},stdio:'ignore'});
}
async function stop(child) {
  if (child.exitCode!==null || child.signalCode!==null) return;
  const exited=new Promise(resolve=>child.once('exit',resolve));
  child.kill();
  await exited;
}

before(async ()=>{
  await source.connect();
  const result=await source.query(`select m.organization_id,m.user_id from auth.users u
    join public.organization_members m on m.user_id=u.id where u.email=$1 and m.role='owner' and m.active`,[ownerEmail]);
  assert.equal(result.rowCount,1,'Recovery testing expects the synthetic owner created by test:local.');
  owner=result.rows[0];
  sourceFingerprint=await fingerprint(source);
  assert.ok(sourceFingerprint.every(([,record])=>record.digest.length===32));
  const dumpEnv={...process.env,PGHOST:sourceUrl.hostname.replace(/[\[\]]/g,''),PGPORT:sourceUrl.port||'5432',
    PGUSER:decodeURIComponent(sourceUrl.username),PGPASSWORD:decodeURIComponent(sourceUrl.password),
    PGDATABASE:decodeURIComponent(sourceUrl.pathname.slice(1))};
  success(run('pg_dump',['--format=custom','--file',archive],{env:dumpEnv}));
});
after(async ()=>{
  await restored?.end();
  await source.end();
  if (serverStarted) success(run('pg_ctl',['-D',data,'-m','fast','-w','stop']));
  await rm(work,{recursive:true,force:true});
});

test('backup check restores and rejects a truncated archive without touching the fixture source',async ()=>{
  const report=success(await restore('check',archive,join(work,'checked')));
  assert.match(report,/organizations.+branches.+bookings/);
  const broken=join(work,'incomplete.dump');
  await cp(archive,broken);
  await truncate(broken,45);
  assert.notEqual((await restore('check',broken,join(work,'broken'))).status,0);
  assert.deepEqual(await fingerprint(source),sourceFingerprint);
});

test('staged backup preserves application and auth rows, while resetting device and web sessions',async ()=>{
  success(await restore('stage',archive,data));
  const dbPort=await port();
  success(run('pg_ctl',['-D',data,'-l',join(work,'restored.log'),'-o',`-h 127.0.0.1 -c unix_socket_directories='' -p ${dbPort}`,'-w','start']));
  serverStarted=true;
  restoredUrl=`postgresql://postgres:${dbPassword}@127.0.0.1:${dbPort}/postgres`;
  restored=new pg.Client({connectionString:restoredUrl});
  await restored.connect();
  assert.deepEqual(await fingerprint(restored),sourceFingerprint);
  assert.deepEqual((await restored.query(`select
    (select count(*)::int from tennis_runtime.web_sessions) as sessions,
    (select count(*)::int from tennis_runtime.push_devices) as devices`)).rows[0],{sessions:0,devices:0});
  const web=new pg.Client({connectionString:`postgresql://tennis_web:${webPassword}@127.0.0.1:${dbPort}/postgres`});
  await web.connect();
  try {
    assert.equal((await web.query('select tennis_runtime.is_configured() as ready')).rows[0].ready,true);
    await web.query('set role authenticated');
    await web.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.user_id,role:'authenticated'})]);
    assert.ok((await web.query('select count(*)::int as n from public.bookings where organization_id=$1',[owner.organization_id])).rows[0].n>0);
    await web.query("select set_config('request.jwt.claims','{}',false)");
    assert.equal((await web.query('select count(*)::int as n from public.bookings')).rows[0].n,0);
  } finally {
    await web.end();
  }
  assert.deepEqual(await fingerprint(source),sourceFingerprint);
});

test('restored data starts the real application and accepts the original owner login', {
  skip:!process.env.SAM_RECOVERY_AUTH_BIN||!process.env.SAM_RECOVERY_AUTH_MIGRATIONS||!process.env.SAM_TEST_OWNER_PASSWORD,
},async ()=>{
  assert.ok(restoredUrl);
  const [authPort,appPort]=[await port(),await port()];
  const origin=`http://127.0.0.1:${appPort}`;
  const authUrl=`http://127.0.0.1:${authPort}`;
  const dbHost=new URL(restoredUrl).host;
  const auth=launched(process.env.SAM_RECOVERY_AUTH_BIN,[],{
    API_EXTERNAL_URL:origin,GOTRUE_SITE_URL:origin,GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:String(authPort),
    GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_NAMESPACE:'auth',
    GOTRUE_DB_DATABASE_URL:`postgresql://supabase_auth_admin:${authPassword}@${dbHost}/postgres?search_path=auth`,
    GOTRUE_DB_MIGRATIONS_PATH:process.env.SAM_RECOVERY_AUTH_MIGRATIONS,GOTRUE_JWT_SECRET:process.env.SAM_JWT_SECRET,
    GOTRUE_JWT_EXP:'900',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
    GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',
  });
  let app;
  try {
    await waitFor(authUrl+'/health');
    app=launched(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{
      SAM_ORIGIN:origin,SAM_AUTH_URL:authUrl,SAM_DATABASE_URL:`postgresql://tennis_web:${webPassword}@${dbHost}/postgres`,
    });
    await waitFor(origin+'/api/health');
    const login=await fetch(origin+'/api/login',{
      method:'POST',redirect:'manual',headers:{Origin:origin,Accept:'application/json'},
      body:new URLSearchParams({email:ownerEmail,password:process.env.SAM_TEST_OWNER_PASSWORD}),
    });
    assert.equal(login.status,303);
    const cookie=login.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie,/^sam_session=/);
    const {rows:[invoice]}=await restored.query(`select id from public.invoices where organization_id=$1
      and voided_at is null order by issued_at desc limit 1`,[owner.organization_id]);
    const view=await fetch(`${origin}/club/${owner.organization_id}/finance/${invoice.id}`,{headers:{Cookie:cookie}});
    assert.equal(view.status,200);
    assert.match(await view.text(),/فاکتور/);
  } finally {
    if (app) await stop(app);
    await stop(auth);
  }
});

test('migration preflight stops an older or modified source and rolls back a failed migration',async ()=>{
  const project=join(work,'migration-rehearsal');
  for (const dir of ['scripts','supabase','local']) await mkdir(join(project,dir),{recursive:true});
  await symlink(join(repo,'node_modules'),join(project,'node_modules'));
  await cp(join(repo,'scripts/migrate-local.mjs'),join(project,'scripts/migrate-local.mjs'));
  await cp(join(repo,'supabase/migrations'),join(project,'supabase/migrations'),{recursive:true});
  await cp(join(repo,'local/migrations'),join(project,'local/migrations'),{recursive:true});
  const migrate=()=>run(process.execPath,[join(project,'scripts/migrate-local.mjs')],{env:{...env,DATABASE_URL:restoredUrl}});
  assert.equal(success(migrate()),'');
  const pending=join(project,'local/migrations/9999_rehearsal.sql');
  await writeFile(pending,'create table public.sam_release_probe(id int); select 1/0;\n');
  const failed=migrate();
  assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/division by zero/);
  const absent=await restored.query("select to_regclass('public.sam_release_probe') as probe");
  assert.equal(absent.rows[0].probe,null);
  assert.equal((await restored.query("select from tennis_install.migrations where path like '%9999_rehearsal.sql'")).rowCount,0);
  await writeFile(pending,'create table public.sam_release_probe(id int);\n');
  assert.match(success(migrate()),/Applied local\/migrations\/9999_rehearsal.sql/);
  assert.equal(success(migrate()),'');
  await writeFile(pending,'create table public.sam_release_probe(id bigint);\n');
  assert.match(migrate().stderr,/Migration checksum changed/);
  await rm(pending);
  assert.match(migrate().stderr,/migrations outside this application version/);
});
