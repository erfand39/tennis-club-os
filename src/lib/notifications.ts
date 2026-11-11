import 'server-only';
import type { NextResponse } from 'next/server';
import { asUser,database } from './db';
import { appOrigin } from './config';
import { calendarPath } from './calendar-dates';
import { classesPath } from './class-fields';
import { financePath } from './finance-fields';
import { resourcePath } from './resource-fields';
import { uuid } from './club';
import { InputError } from './input';
import { parsePushSubscription,pushSettings } from '../../local/push-config.mjs';

export const noticeKinds={
  lesson_reminder:{title:'یادآوری جلسه',detail:'تا شروع این جلسه کمتر از یک ساعت باقی مانده است.'},
  booking_moved:{title:'تغییر برنامهٔ سانس',detail:'زمان یا زمین سانس تغییر کرده است.'},
  booking_cancelled:{title:'لغو سانس',detail:'این سانس از برنامه خارج شده است.'},
  roster_changed:{title:'تغییر فهرست شاگردان کلاس',detail:'ثبت‌نام یا انصراف یکی از شاگردان در کلاس ثبت شده است.'},
  coach_availability:{title:'تغییر ساعت کاری مربی',detail:'ساعت‌های در دسترس مربی تغییر کرده است.'},
  payment_reminder:{title:'پیگیری پرداخت',detail:'از صدور فاکتور دست‌کم هفت روز گذشته و هنوز مانده دارد.'},
  schedule_block:{title:'انسداد برنامهٔ شعبه',detail:'تعطیلی شعبه یا تعمیرات زمین در برنامه ثبت شده است.'},
} as const;
export type NoticeKind=keyof typeof noticeKinds;
type Notice={
  id:string;kind:NoticeKind;source_id:string;location_id:string;branch:string;timezone:string;available_at:Date;read_at:Date|null;
};
export const pushCookie='sam_push_device';

export function noticePath(org:string,branch?:string,page?:number) {
  const query=new URLSearchParams();
  if (branch) query.set('branch',branch);
  if (page&&page>1) query.set('page',String(page));
  return `/club/${org}/notifications${query.size?'?'+query:''}`;
}
export function noticeSource(org:string,row:Notice) {
  switch (row.kind) {
    case 'payment_reminder': return financePath(org,row.source_id);
    case 'coach_availability': return resourcePath(org,'coaches',row.source_id);
    case 'roster_changed': return classesPath(org,row.source_id);
    case 'schedule_block': return calendarPath(org,{branch:row.location_id});
    default:return calendarPath(org,{booking:row.source_id});
  }
}
export function readNotices(user:string,org:string,branch:string|null,page:number) {
  const size=24;
  return asUser(user,async db=>{
    const {rows}=await db.query<Notice>(`
      select e.id,e.kind,e.source_id,e.location_id,l.name as branch,l.timezone,e.available_at,r.read_at
      from public.notification_events e join public.locations l on l.id=e.location_id
      left join public.notification_reads r on r.event_id=e.id and r.user_id=$1
      where e.organization_id=$2 and ($3::uuid is null or e.location_id=$3)
      order by e.available_at desc,e.id limit $4 offset $5`,[user,org,branch,size+1,(page-1)*size]);
    return {notices:rows.slice(0,size),hasNext:rows.length>size};
  },true);
}
export function markNotices(user:string,org:string,branch:string|null,event:string|null) {
  return asUser(user,async db=>{
    if (event) {
      const result=await db.query('select from public.notification_events where organization_id=$1 and id=$2',[org,event]);
      if (!result.rowCount) throw new InputError('denied',404);
    }
    await db.query(`insert into public.notification_reads(user_id,event_id)
      select $1,e.id from public.notification_events e where e.organization_id=$2
        and ($3::uuid is null or e.location_id=$3) and ($4::uuid is null or e.id=$4)
      on conflict (user_id,event_id) do nothing`,[user,org,event?null:branch,event]);
  });
}
export const pushPublicKey=()=>pushSettings()?.publicKey??null;
export async function deviceIsEnabled(device:string|undefined,user:string,org:string) {
  if (!device||!uuid(device)) return false;
  const {rowCount}=await database().query('select from tennis_runtime.push_devices where (id,user_id,organization_id)=($1,$2,$3)',[device,user,org]);
  return !!rowCount;
}
export async function enableDevice(user:string,org:string,value:string,previous:string|undefined) {
  if (!pushPublicKey()) throw new InputError('push-config',503);
  let input;
  try { input=JSON.parse(value); } catch { throw new InputError('invalid'); }
  const subscription=parsePushSubscription(input);
  if (!subscription) throw new InputError('invalid');
  const {endpoint,keys}=subscription;
  const { rows:[device] }=await database().query<{id:string}>(`
    with replaced as (
      delete from tennis_runtime.push_devices where id=$6 and user_id=$2 and endpoint<>$3
    )
    insert into tennis_runtime.push_devices(organization_id,user_id,endpoint,p256dh,auth_key)
    values ($1,$2,$3,$4,$5)
    on conflict (endpoint) do update set organization_id=excluded.organization_id,user_id=excluded.user_id,
      p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      id=case when (push_devices.organization_id,push_devices.user_id)=(excluded.organization_id,excluded.user_id)
        then push_devices.id else gen_random_uuid() end,
      subscribed_at=case when (push_devices.organization_id,push_devices.user_id)=(excluded.organization_id,excluded.user_id)
        then push_devices.subscribed_at else now() end
    returning id`,[org,user,endpoint,keys.p256dh,keys.auth,previous&&uuid(previous)?previous:null]);
  return device.id;
}
export async function disableDevice(device:string|undefined,user:string,org:string) {
  if (device&&uuid(device)) await database().query(
    'delete from tennis_runtime.push_devices where (id,user_id,organization_id)=($1,$2,$3)',[device,user,org]);
}
export function setPushCookie(response:NextResponse,device:string,maxAge=365*86400) {
  response.cookies.set(pushCookie,device,{httpOnly:true,sameSite:'lax',secure:appOrigin().startsWith('https:'),path:'/',maxAge});
}
