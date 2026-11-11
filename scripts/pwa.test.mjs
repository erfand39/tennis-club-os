import assert from 'node:assert/strict';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {parsePushSubscription} from '../local/push-config.mjs';
import {dispatchPush} from '../local/push.mjs';
import {localOrigin} from '../src/lib/local-origin.ts';

const worker=await readFile(new URL('../prototype/sw.js',import.meta.url),'utf8');
function harness() {
  const events=new Map(),cached=[],deleted=[],system=[];
  let claimed=false,skipped=false,fetches=0;
  const origin='https://sam.example.test';
  const cache={
    addAll:async urls=>cached.push(...urls),
    match:async request=>(typeof request==='string'?request:new URL(request.url).pathname)==='/pwa/offline.html'
      ?new Response('public offline guide'):undefined,
  };
  const context={
    URL,Response,
    fetch:async ()=>{fetches++;throw new Error('offline');},
    caches:{
      open:async ()=>cache,
      keys:async ()=>['sam-tennis-shell-old','sam-tennis-shell-9.1','unrelated-cache'],
      delete:async key=>deleted.push(key),
    },
    self:{
      location:{origin},registration:{showNotification:async (...args)=>system.push(args)},
      clients:{claim:async ()=>{claimed=true;},matchAll:async ()=>[],openWindow:async url=>system.push(url)},
      skipWaiting:async ()=>{skipped=true;},
      addEventListener:(name,action)=>events.set(name,action),
    },
  };
  vm.runInNewContext(worker,context);
  function fire(name,fields={}) {
    let promise;
    const attach=value=>{promise=value;};
    events.get(name)({...fields,waitUntil:attach,respondWith:attach});
    return promise;
  }
  return {fire,cached,deleted,system,origin,state:()=>({claimed,skipped,fetches})};
}

test('worker precaches only the public shell and updates after a deliberate request',async ()=>{
  const h=harness();
  await h.fire('install');
  assert.equal(h.cached.length,6);
  assert.ok(h.cached.every(url=>url.startsWith('/pwa/')));
  assert.equal(h.state().skipped,false);
  await h.fire('message',{data:'unrelated'});
  assert.equal(h.state().skipped,false);
  await h.fire('message',{data:'activate-sam-update'});
  await h.fire('activate');
  assert.deepEqual(h.deleted,['sam-tennis-shell-old']);
  assert.deepEqual(h.state(),{claimed:true,skipped:true,fetches:0});
});
test('offline navigation shows a public guide and private fetches or writes receive no cached response',async ()=>{
  const h=harness();
  const request=(path,method='GET',mode='navigate')=>({url:h.origin+path,method,mode});
  const response=await h.fire('fetch',{request:request('/club/private/calendar')});
  assert.equal(await response.text(),'public offline guide');
  for (const item of [
    request('/api/finance-payment','POST','cors'),request('/api/booking-create','POST'),
    request('/api/health'),request('/club/private/reports/excel'),request('/club/private?_rsc=secret','GET','cors'),
    request('/pwa/offline.html?private=1','GET','cors'),
  ]) assert.equal(h.fire('fetch',{request:item}),undefined);
  assert.equal(h.state().fetches,1);
});
test('push worker uses a fixed local route, generic text and stable notification tags',async ()=>{
  const h=harness(),id=randomUUID(),org=randomUUID();
  const path='/club/'+org+'/notifications';
  await h.fire('push',{data:{json:()=>({id,path:'https://wrong.example/'})}});
  assert.equal(h.system.length,0);
  await h.fire('push',{data:{json:()=>({id,path,body:'ignored private text'})}});
  assert.equal(h.system[0][0],'باشگاه تنیس سام');
  assert.equal(h.system[0][1].tag,'sam-notice-'+id);
  assert.doesNotMatch(h.system[0][1].body,/ignored/);
  await h.fire('notificationclick',{notification:{close(){},data:{path}}});
  assert.equal(h.system[1],h.origin+path);
});

test('push transport validates endpoint hosts and returns a retry or terminal outcome',async ()=>{
  const ec=createECDH('prime256v1');
  ec.generateKeys();
  const p256dh=ec.getPublicKey('base64url','uncompressed');
  const auth=randomBytes(16).toString('base64url');
  const row={endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh,auth_key:auth,event_id:randomUUID(),organization_id:randomUUID()};
  for (const endpoint of ['http://fcm.googleapis.com/path','https://fcm.googleapis.com.attacker.test/path',
    'https://127.0.0.1/path','https://fcm.googleapis.com:8443/path','https://fcm.googleapis.com@private.test/path']) {
    assert.equal(parsePushSubscription({endpoint,keys:{p256dh,auth}}),null);
  }
  assert.equal(await dispatchPush(row,{},async (device,body,options)=>{
    assert.deepEqual(JSON.parse(body),{id:row.event_id,path:'/club/'+row.organization_id+'/notifications'});
    assert.equal(device.endpoint,row.endpoint);
    assert.equal(options.topic.length,32);
  }),'sent');
  for (const [statusCode,outcome] of [[410,'gone'],[429,'retry'],[503,'retry'],[400,'failed']]) {
    assert.equal(await dispatchPush(row,{},async ()=>{throw {statusCode};}),outcome);
  }
});

test('local HTTPS admits private LAN origins and preserves the default loopback boundary',()=>{
  for (const origin of ['http://127.0.0.1:3030','http://localhost:3030','https://sam-mac.local:8443','https://192.168.0.4:8443','https://172.16.0.4','https://10.2.3.4']) {
    assert.equal(localOrigin(origin),origin);
  }
  for (const origin of ['http://192.168.0.4','https://192.169.0.4','https://172.15.0.4','https://sam-mac.local.example.com','https://user@sam-mac.local','https://sam-mac.local/path','https://sam-mac.local?query=1']) {
    assert.throws(()=>localOrigin(origin));
  }
});
