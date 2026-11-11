import Link from 'next/link';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/messages';

export function Brand({ href = '/' }: { href?: string }) {
  return <Link className="local-brand" href={href}><span className="sam-mark" aria-hidden="true" /><span>
    <strong>باشگاه تنیس سام</strong><small dir="ltr">SAM TENNIS CLUB</small>
  </span></Link>;
}

export function AccessShell({ children }: { children: ReactNode }) {
  return <main className="access-shell">
    <section className="access-card"><Brand />{children}</section>
    <aside className="access-image"><div><strong>باشگاه تنیس سام</strong><p>سامانهٔ مدیریت باشگاه</p></div></aside>
  </main>;
}

export function Notice({ error, saved }: { error?: string; saved?: boolean }) {
  const message = errorMessage(error);
  if (message) return <p className="local-notice error" role="alert">{message}</p>;
  return saved ? <p className="local-notice" role="status">تغییرات ذخیره شد.</p> : null;
}

export function Logout() {
  return <form action="/api/logout" method="post"><button className="button subtle">خروج</button></form>;
}
