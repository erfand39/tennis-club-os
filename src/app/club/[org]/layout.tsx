import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { branches, clubFor, displayName } from '@/lib/club';
import { roles } from '@/lib/roles';
import { resourcePath } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { Brand, Logout } from '../../ui';
import { ClubNav } from './nav';
import { BottomNav } from '@/app/components/bottom-nav';

export const dynamic = 'force-dynamic';

export default async function ClubLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();
  const name = await displayName(user.id);
  const branchList = await branches(user.id, org);
  const activeBranch = branchList.find(b => b.active) ?? branchList[0];
  const activeBranchName = activeBranch ? activeBranch.name : club.name;

  return <div className="local-shell">
    <header className="mobile-header" aria-label="هدر همراه باشگاه">
      <Brand href={`/club/${org}`} />
      <div className="mobile-header-meta">
        <span className="mobile-branch-badge">{activeBranchName}</span>
        <span className="mobile-pwa-badge" title="سامانه ابری-محلی PWA فعال است">
          <span className="pwa-dot" aria-hidden="true" />
          <span>PWA محلی</span>
        </span>
      </div>
    </header>

    <aside className="local-sidebar">
      <Brand href={`/club/${org}`} />
      <ClubNav links={[
        { href: `/club/${org}`, label: 'نمای کلی', icon: 'court' },
        { href: `/club/${org}/calendar`, label: 'تقویم سانس‌ها', icon: 'calendar' },
        { href: `/club/${org}/classes`, label: 'کلاس‌ها و حضور', icon: 'users' },
        { href: `/club/${org}/finance`, label: 'امور مالی', icon: 'credit-card' },
        { href: `/club/${org}/reports`, label: 'گزارش‌ها', icon: 'clock' },
        { href: `/club/${org}/notifications`, label: 'اعلان‌ها', icon: 'bell' },
        { href: resourcePath(org,'courts'), label: 'زمین‌ها', icon: 'court' },
        { href: resourcePath(org,'coaches'), label: 'مربیان', icon: 'user' },
        { href: resourcePath(org,'students'), label: 'شاگردان', icon: 'users' },
        ...(club.role === 'owner' ? [{ href: `/club/${org}/members`, label: 'مدیران و دسترسی', icon: 'users' as const }] : []),
        { href: `/club/${org}/profile`, label: 'پروفایل من', icon: 'user' },
      ]} />
      <div className="local-account"><strong>{name || 'حساب باشگاه'}</strong><small>{roles[club.role]}</small><Logout /></div>
    </aside>

    <main className="local-content">{children}</main>

    <BottomNav
      org={org}
      userName={name || 'حساب باشگاه'}
      roleTitle={roles[club.role]}
      isOwner={club.role === 'owner'}
    />
  </div>;
}
