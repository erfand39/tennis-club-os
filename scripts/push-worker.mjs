import pg from 'pg';
import {setTimeout as sleep} from 'node:timers/promises';
import {dispatchPush} from '../local/push.mjs';
import {pushSettings} from '../local/push-config.mjs';

const settings=pushSettings();
if (!settings||!process.env.SAM_DATABASE_URL) throw new Error('Local push configuration is missing.');
const db=new pg.Pool({connectionString:process.env.SAM_DATABASE_URL,max:2,connectionTimeoutMillis:5000,statement_timeout:10000});
db.on('error',()=>console.warn('Push worker lost its database connection.'));
const stopped=new AbortController();
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>stopped.abort());

try {
  while (!stopped.signal.aborted) {
    let next=15000;
    try {
      const {rows}=await db.query('select * from tennis_runtime.claim_push_deliveries(4)');
      for (const job of rows) {
        const outcome=await dispatchPush(job,settings);
        await db.query('select tennis_runtime.finish_push_delivery($1,$2,$3,$4)',[job.event_id,job.device_id,job.lease,outcome]);
      }
      if (rows.length===4) next=1000;
    } catch {
      console.warn('Push delivery will resume when the local database is available.');
    }
    await sleep(next,undefined,{signal:stopped.signal}).catch(error=>{if (error.name!=='AbortError') throw error;});
  }
} finally {
  await db.end();
}
