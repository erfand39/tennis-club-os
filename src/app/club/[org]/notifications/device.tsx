'use client';

import { useEffect, useState } from 'react';

function applicationKey(value:string) {
  const base64=value.replaceAll('-','+').replaceAll('_','/');
  return Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
}

export function DeviceNotifications({org,publicKey,enabled}:{org:string;publicKey:string|null;enabled:boolean}) {
  const [registration,setRegistration]=useState<ServiceWorkerRegistration|null>(null);
  const [active,setActive]=useState(enabled);
  const [busy,setBusy]=useState(false);
  const [hint,setHint]=useState('');
  const [message,setMessage]=useState('');

  useEffect(()=>{
    if (!publicKey) return;
    const appleMobile=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const standalone=window.matchMedia('(display-mode: standalone)').matches
      ||(navigator as Navigator&{standalone?:boolean}).standalone===true;
    if (appleMobile&&!standalone) {
      setHint('در آیفون و آیپد، برنامه را به صفحهٔ اصلی اضافه و از همان‌جا باز کنید.');
      return;
    }
    if (!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)) {
      setHint('این مرورگر یا اتصال، اعلان دستگاه را پشتیبانی نمی‌کند.');
      return;
    }
    let current=true;
    navigator.serviceWorker.ready.then(worker=>{if (current) setRegistration(worker);});
    return ()=>{current=false;};
  },[publicKey]);

  async function change(enable:boolean) {
    setBusy(true);
    setMessage('');
    try {
      if (enable&&Notification.permission==='denied') {
        setMessage('مجوز اعلان بسته است. آن را در تنظیمات دستگاه یا مرورگر بررسی کنید.');
        return;
      }
      const fields=new URLSearchParams({org});
      if (enable&&registration&&publicKey) {
        const subscription=await registration.pushManager.subscribe({
          userVisibleOnly:true,applicationServerKey:applicationKey(publicKey),
        });
        fields.set('subscription',JSON.stringify(subscription));
      }
      const response=await fetch(enable?'/api/notice-push':'/api/notice-disable',{
        method:'POST',headers:{Accept:'application/json'},body:fields,cache:'no-store',
      });
      if (!response.ok) throw new Error('push save');
      setActive(enable);
      setMessage(enable?'اعلان دستگاه فعال شد.':'اعلان دستگاه غیرفعال شد.');
      if (!enable) {
        const subscription=await registration?.pushManager.getSubscription().catch(()=>null);
        await subscription?.unsubscribe().catch(()=>false);
      }
    } catch {
      setMessage('تغییر ثبت نشد. مجوز اعلان و اتصال به سامانه را بررسی کنید.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel local-panel notice-device">
    <div>
      <h2>اعلان روی این دستگاه</h2>
      <p>{!publicKey?'ارسال اعلان دستگاه هنوز روی رایانهٔ میزبان تنظیم نشده است.':
        hint||'اعلان دستگاه با اجازهٔ شما فعال می‌شود. متن اعلان روی صفحهٔ قفل فقط به وجود یک اعلان جدید اشاره می‌کند.'}</p>
    </div>
    {active||publicKey&&registration?<button type="button" className={active?'button subtle':'button primary'}
      disabled={busy} onClick={()=>change(!active)}>{busy?'در حال ثبت…':active?'غیرفعال کردن اعلان':'فعال کردن اعلان'}</button>:null}
    {message&&<p role="status" className="notice-message">{message}</p>}
  </section>;
}
