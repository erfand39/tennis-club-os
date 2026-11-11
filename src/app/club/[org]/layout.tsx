import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { clubFor, displayName } from '@/lib/club';
import { roles } from '@/lib/roles';
import { resourcePath } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { Brand, Logout } from '../../ui';
import { ClubNav } from './nav';

export const dynamic = 'force-dynamic';

export default async function ClubLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();
  const name = await displayName(user.id);
  return <div className="local-shell">
    <aside className="local-sidebar">
      <Brand href={`/club/${org}`} />
      <ClubNav links={[
        { href: `/club/${org}`, label: 'نمای کلی' },
        { href: `/club/${org}/calendar`, label: 'تقویم سانس‌ها' },
        { href: `/club/${org}/classes`, label: 'کلاس‌ها و حضور' },
        { href: `/club/${org}/finance`, label: 'امور مالی' },
        { href: `/club/${org}/reports`, label: 'گزارش‌ها' },
        { href: resourcePath(org,'courts'), label: 'زمین‌ها' },
        { href: resourcePath(org,'coaches'), label: 'مربیان' },
        { href: resourcePath(org,'students'), label: 'شاگردان' },
        ...(club.role === 'owner' ? [{ href: `/club/${org}/members`, label: 'مدیران و دسترسی' }] : []),
        { href: `/club/${org}/profile`, label: 'پروفایل من' },
      ]} />
      <div className="local-account"><strong>{name || 'حساب باشگاه'}</strong><small>{roles[club.role]}</small><Logout /></div>
    </aside>
    <main className="local-content">{children}</main>
  </div>;
}
