'use client';

import Link from 'next/link';
import { AccessShell } from '@/app/ui';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AccessShell>
      <div className="access-heading">
        <h1>بروز خطای غیرمنتظره</h1>
        <p>در بارگذاری این صفحه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.</p>
      </div>
      <p className="local-notice error" role="alert">ارتباط یا پردازش این درخواست با خطا روبه‌رو شد.</p>
      <div className="local-form">
        <button type="button" className="button primary" onClick={() => reset()}>
          تلاش دوباره
        </button>
        <Link className="button subtle" href="/">
          بازگشت به صفحهٔ نخست
        </Link>
      </div>
    </AccessShell>
  );
}
