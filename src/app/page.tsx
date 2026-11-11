import { redirect } from 'next/navigation';
import { isConfigured } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { AccessShell, Notice } from './ui';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect('/club');
  const configured = await isConfigured();
  const { error } = await searchParams;
  return <AccessShell>
    <div className="access-heading">
      <h1>{configured ? 'ورود به پنل باشگاه' : 'راه‌اندازی باشگاه'}</h1>
      <p>{configured ? 'با حساب ثبت‌شدهٔ خود وارد شوید.' : 'حساب مالک و شعبهٔ مرکزی را روی همین سیستم بسازید.'}</p>
    </div>
    <Notice error={error} />
    <form className="local-form" action={configured ? '/api/login' : '/api/setup'} method="post">
      {!configured && <label className="field"><span>کد نصب</span><input name="code" dir="ltr" required maxLength={100} autoComplete="off" />
        <small>از دستور <code dir="ltr">./scripts/local.sh setup-code</code> استفاده کنید.</small></label>}
      {!configured && <label className="field"><span>نام نمایشی مالک</span><input name="name" required maxLength={120} autoComplete="name" /></label>}
      <label className="field"><span>ایمیل</span><input type="email" name="email" dir="ltr" required maxLength={254} autoComplete="username" /></label>
      <label className="field"><span>گذرواژه</span><input type="password" name="password" dir="ltr" required
        minLength={configured ? undefined : 12} autoComplete={configured ? 'current-password' : 'new-password'} /></label>
      {!configured && <label className="field"><span>منطقهٔ زمانی شعبه</span><input name="timezone" dir="ltr" required defaultValue="Asia/Tehran" maxLength={80} /></label>}
      <button className="button primary">{configured ? 'ورود به پنل' : 'ساخت حساب مالک'}</button>
    </form>
    {configured && <details className="access-help"><summary>بازیابی گذرواژه</summary>
      <p>برای حساب کارکنان از مالک پیوند بازیابی بگیرید. مالک می‌تواند با دستور <code dir="ltr">./scripts/local.sh recover OWNER_EMAIL</code> پیوند بسازد.</p></details>}
  </AccessShell>;
}
