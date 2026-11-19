'use client';

import { useEffect, useState } from 'react';

export function PwaStatus() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [available, setAvailable] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  async function check() {
    setChecking(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
      setAvailable(response.ok);
    } catch {
      setAvailable(false);
    } finally {
      window.clearTimeout(timeout);
      setChecking(false);
    }
  }

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void check(); };
    const timer = window.setInterval(refresh, 45000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);
    if (!navigator.onLine) refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  // Service Worker registration & updates
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const onState = () => {
      if (active && registration?.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
    };
    const onUpdate = () => {
      installing?.removeEventListener('statechange', onState);
      installing = registration?.installing ?? null;
      installing?.addEventListener('statechange', onState);
    };
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(worker => {
      if (!active) return;
      registration = worker;
      onState();
      onUpdate();
      worker.addEventListener('updatefound', onUpdate);
    }).catch(() => {});
    return () => {
      active = false;
      registration?.removeEventListener('updatefound', onUpdate);
      installing?.removeEventListener('statechange', onState);
    };
  }, []);

  // 1-Click PWA Installation Hook
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setShowInstallBanner(false);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  function installUpdate() {
    if (!waiting) return;
    setUpdating(true);
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage('activate-sam-update');
  }

  async function triggerInstall() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
    } catch {
      // Ignored
    } finally {
      setInstallPrompt(null);
    }
  }

  return <>
    {!available && <aside className="pwa-status" role="status">
      <span>اتصال به سامانه برقرار نیست. وضعیت ثبت‌های اخیر را بعد از اتصال بررسی کنید.</span>
      <button type="button" disabled={checking} onClick={check}>{checking ? 'در حال بررسی…' : 'بررسی اتصال'}</button>
    </aside>}
    {waiting && <aside className="pwa-status pwa-update" role="status">
      <span>نسخهٔ جدید آماده است. پس از تکمیل فرم باز، برنامه را به‌روز کنید.</span>
      <button type="button" disabled={updating} onClick={installUpdate}>{updating ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی و بارگذاری'}</button>
    </aside>}
    {showInstallBanner && installPrompt && (
      <aside className="pwa-status pwa-install-banner" role="status">
        <span>نصب آسان سامانهٔ باشگاه تنیس سام روی دستگاه شما</span>
        <button type="button" onClick={triggerInstall}>
          نصب برنامه
        </button>
      </aside>
    )}
  </>;
}
