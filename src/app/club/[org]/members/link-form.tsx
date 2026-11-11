'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { errorMessage } from '@/lib/messages';

export function LinkForm({ action, children, label }: { action: 'invite' | 'recovery'; children: ReactNode; label: string }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => fields.append(key, String(value)));
    setPending(true);
    setError(undefined);
    setLink('');
    setCopied(false);
    try {
      const response = await fetch(`/api/${action}`, {
        method: 'POST', body: fields, headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) setError(errorMessage(data.error));
      else setLink(String(data.link));
    } catch {
      setError(errorMessage('unavailable'));
    } finally {
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="local-form">
    {children}
    {error && <p className="local-notice error" role="alert">{error}</p>}
    <button className={action === 'invite' ? 'button primary' : 'button subtle'} disabled={pending}>
      {pending ? 'در حال ساخت پیوند…' : label}
    </button>
    {link && <div className="link-result">
      <label className="field"><span>پیوند یک‌بارمصرف برای همین سیستم</span>
        <input aria-label="پیوند یک‌بارمصرف" dir="ltr" value={link} readOnly onFocus={event => event.currentTarget.select()} /></label>
      <button type="button" className="button subtle" onClick={async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
      }}>{copied ? 'کپی شد' : 'کپی پیوند'}</button>
    </div>}
  </form>;
}
