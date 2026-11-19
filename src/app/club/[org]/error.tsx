'use client';

import Link from 'next/link';

export default function ClubError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="panel local-panel">
      <header className="local-heading">
        <h1>امکان نمایش این بخش فراهم نشد</h1>
        <p>در خواندن اطلاعات این صفحه مشکلی پیش آمد.</p>
      </header>
      <p className="local-notice error" role="alert">خطای موقت در پردازش درخواست. دوباره تلاش کنید.</p>
      <div className="finance-shortcuts">
        <button type="button" className="button primary" onClick={() => reset()}>
          تلاش دوباره
        </button>
        <Link className="button subtle" href="/club">
          بازگشت به میز کار
        </Link>
      </div>
    </section>
  );
}
