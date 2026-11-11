import { notFound, redirect } from 'next/navigation';
import { clubFor, displayName } from '@/lib/club';
import { currentUser } from '@/lib/session';
import { Notice } from '../../../ui';

export default async function Profile({ params, searchParams }: {
  params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();
  const name = await displayName(user.id);
  const feedback = await searchParams;
  return <>
    <header className="local-heading"><h1>پروفایل من</h1></header>
    <section className="panel local-panel narrow">
      <Notice error={feedback.error} saved={feedback.saved === '1'} />
      <form className="local-form" method="post" action="/api/profile">
        <input type="hidden" name="org" value={org} />
        <label className="field"><span>نام نمایشی</span><input name="name" required maxLength={120} defaultValue={name} /></label>
        <label className="field"><span>ایمیل حساب</span><input dir="ltr" type="email" value={user.email} readOnly /></label>
        <button className="button primary">ذخیرهٔ پروفایل</button>
      </form>
    </section>
    {club.role !== 'owner' && <details className="panel local-panel narrow"><summary>خروج از عضویت باشگاه</summary>
      <p>با تأیید این گزینه، دسترسی شما به شعبه‌ها و برنامه‌های این مجموعه غیرفعال می‌شود.</p>
      <form action="/api/leave" method="post"><input type="hidden" name="org" value={org} /><button className="button danger-quiet">تأیید خروج از عضویت</button></form>
    </details>}
  </>;
}
