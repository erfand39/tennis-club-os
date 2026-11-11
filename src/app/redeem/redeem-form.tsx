'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/messages';

export function RedeemForm({ mode }: { mode: 'invite' | 'recovery' }) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || pending) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password'));
    if (password !== values.get('confirm')) {
      setMessage('تکرار گذرواژه با مقدار اول یکسان نیست.');
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/redeem', { method: 'POST', headers: { Accept: 'application/json' },
        body: new URLSearchParams({ mode, token, password }) });
      const data = await response.json();
      if (!response.ok) setMessage(errorMessage(data.error));
      else {
        history.replaceState(null, '', location.pathname);
        location.replace('/club');
      }
    } catch {
      setMessage(errorMessage('unavailable'));
    } finally {
      setPending(false);
    }
  }

  if (token === null) return <p role="status">در حال بررسی پیوند…</p>;
  if (!token) return <p className="local-notice error" role="alert">{errorMessage('link')}</p>;
  return <form onSubmit={submit} className="local-form">
    {message && <p className="local-notice error" role="alert">{message}</p>}
    <label className="field"><span>گذرواژهٔ جدید</span><input dir="ltr" name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
    <label className="field"><span>تکرار گذرواژه</span><input dir="ltr" name="confirm" type="password" autoComplete="new-password" required minLength={12} /></label>
    <button className="button primary" disabled={pending}>{pending ? 'در حال ثبت…' : 'ثبت گذرواژه و ورود'}</button>
  </form>;
}
