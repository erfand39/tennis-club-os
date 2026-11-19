'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/app/components/confirm-dialog';
import { errorMessage } from '@/lib/messages';

export function ResourceCommand({ action, children, label, danger = false }: {
  action: string; children: ReactNode; label: string; danger?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmFields, setConfirmFields] = useState<URLSearchParams | null>(null);

  async function execute(fields: URLSearchParams) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/${action}`, { method: 'POST', headers: { Accept: 'application/json' }, body: fields });
      const data = await response.json();
      if (response.ok && typeof data.next === 'string' && data.next.startsWith('/club/')) {
        router.push(data.next);
        router.refresh();
        return;
      }
      setError(errorMessage(data.error ?? 'unavailable'));
    } catch {
      setError(errorMessage('unavailable'));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!event.currentTarget.reportValidity()) return;
    const fields = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, name) => fields.append(name, String(value)));
    if (danger) {
      setConfirmFields(fields);
      return;
    }
    void execute(fields);
  }

  return <>
    <form className="local-form resource-command" method="post" action={`/api/${action}`} onSubmit={submit}>
      {children}
      {error && <p className="local-notice error" role="alert">{error}</p>}
      <button className={`button ${danger ? 'danger-quiet' : 'primary'}`} disabled={pending}>{pending ? 'در حال ذخیره…' : label}</button>
    </form>
    {danger && (
      <ConfirmDialog
        isOpen={Boolean(confirmFields)}
        isDestructive
        title={label}
        message="آیا از انجام این عملیات اطمینان دارید؟ این تغییر در سوابق باشگاه ثبت می‌شود."
        confirmLabel={label}
        cancelLabel="انصراف"
        onConfirm={() => {
          const fields = confirmFields;
          setConfirmFields(null);
          if (fields) void execute(fields);
        }}
        onCancel={() => setConfirmFields(null)}
      />
    )}
  </>;
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
