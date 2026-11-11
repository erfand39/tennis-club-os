'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { errorMessage } from '@/lib/messages';

export function ResourceCommand({ action, children, label, danger = false }: {
  action: string; children: ReactNode; label: string; danger?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, name) => fields.append(name, String(value)));
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/${action}`, { method: 'POST', headers: { Accept: 'application/json' }, body: fields });
      const data = await response.json();
      if (response.ok && typeof data.next === 'string' && data.next.startsWith('/club/')) {
        location.assign(data.next);
        return;
      }
      setError(errorMessage(data.error ?? 'unavailable'));
    } catch {
      setError(errorMessage('unavailable'));
    } finally {
      setPending(false);
    }
  }

  return <form className="local-form resource-command" method="post" action={`/api/${action}`} onSubmit={submit}>
    {children}
    {error && <p className="local-notice error" role="alert">{error}</p>}
    <button className={`button ${danger ? 'danger-quiet' : 'primary'}`} disabled={pending}>{pending ? 'در حال ذخیره…' : label}</button>
  </form>;
}

export function WeeklyTimes() {
  const [closed, setClosed] = useState(false);
  return <>
    <label className="resource-check"><input type="checkbox" name="closed" value="yes" checked={closed}
      onChange={event => setClosed(event.currentTarget.checked)} /> تعطیل یا خارج از برنامه در این روز</label>
    <div className="resource-form-grid">
      <label className="field"><span>شروع</span><input name="start" placeholder="08:00" defaultValue="08:00" dir="ltr" maxLength={5}
        required={!closed} disabled={closed} /></label>
      <label className="field"><span>پایان</span><input name="end" placeholder="22:00" defaultValue="22:00" dir="ltr" maxLength={5}
        required={!closed} disabled={closed} /></label>
    </div>
  </>;
}
