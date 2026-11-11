'use client';

import { useEffect, useState } from 'react';

export function PwaStatus() {
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  const [available,setAvailable]=useState(true);
  const [checking,setChecking]=useState(false);
  const [updating,setUpdating]=useState(false);

  async function check() {
    setChecking(true);
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),4000);
    try {
      const response=await fetch('/api/health',{cache:'no-store',signal:controller.signal});
      setAvailable(response.ok);
    } catch {
      setAvailable(false);
    } finally {
      window.clearTimeout(timeout);
      setChecking(false);
    }
  }

  useEffect(()=>{
    const refresh=()=>{if (document.visibilityState==='visible') void check();};
    const timer=window.setInterval(refresh,45000);
    window.addEventListener('online',refresh);
    window.addEventListener('offline',refresh);
    document.addEventListener('visibilitychange',refresh);
    if (!navigator.onLine) refresh();
    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener('online',refresh);
      window.removeEventListener('offline',refresh);
      document.removeEventListener('visibilitychange',refresh);
    };
  },[]);

  useEffect(()=>{
    if (!('serviceWorker' in navigator)||!window.isSecureContext) return;
    let active=true;
    let registration:ServiceWorkerRegistration|undefined;
    let installing:ServiceWorker|null=null;
    const onState=()=>{if (active&&registration?.waiting&&navigator.serviceWorker.controller) setWaiting(registration.waiting);};
    const onUpdate=()=>{
      installing?.removeEventListener('statechange',onState);
      installing=registration?.installing??null;
      installing?.addEventListener('statechange',onState);
    };
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(worker=>{
      if (!active) return;
      registration=worker;
      onState();
      onUpdate();
      worker.addEventListener('updatefound',onUpdate);
    }).catch(()=>{});
    return ()=>{
      active=false;
      registration?.removeEventListener('updatefound',onUpdate);
      installing?.removeEventListener('statechange',onState);
    };
  },[]);

  function installUpdate() {
    if (!waiting) return;
    setUpdating(true);
    navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});
    waiting.postMessage('activate-sam-update');
  }

  return <>
    {!available&&<aside className="pwa-status" role="status">
      <span>اتصال به سامانه برقرار نیست. وضعیت ثبت‌های اخیر را بعد از اتصال بررسی کنید.</span>
      <button type="button" disabled={checking} onClick={check}>{checking?'در حال بررسی…':'بررسی اتصال'}</button>
    </aside>}
    {waiting&&<aside className="pwa-status pwa-update" role="status">
      <span>نسخهٔ جدید آماده است. پس از تکمیل فرم باز، برنامه را به‌روز کنید.</span>
      <button type="button" disabled={updating} onClick={installUpdate}>{updating?'در حال به‌روزرسانی…':'به‌روزرسانی و بارگذاری'}</button>
    </aside>}
  </>;
}
