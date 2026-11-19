import type { ReactNode } from 'react';
import type { Club } from '@/lib/club';
import { roles } from '@/lib/roles';
import { resourcePath } from '@/lib/resource-fields';
import { Brand, Logout } from '../../ui';
import { ClubNav } from './nav';
import { ClubSearch } from './search';
import { ClubPageMotion } from '../../motion-ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { BottomNav } from '@/app/components/bottom-nav';

export function ClubShell({ children, org, club, name, activeBranchName }: {
  children: ReactNode; org: string; club: Club; name: string; activeBranchName: string;
}) {
  return <div className="local-shell">
    <a className="skip-link" href="#club-main">رفتن به محتوای اصلی</a>
    <header className="mobile-header" aria-label="هدر همراه باشگاه">
      <Brand href={`/club/${org}`} />
      <div className="mobile-header-meta">
        <span className="mobile-branch-badge">{activeBranchName}</span>
      </div>
    </header>

    <aside className="local-sidebar">
      <Brand href={`/club/${org}`} />
      <div className="sidebar-section-label">میز کار مدیریت</div>
      <ClubSearch org={org} />
      <ClubNav links={[
        { href: `/club/${org}`, label: 'میز کار', icon: 'court', group: 'روزانه' },
        { href: `/club/${org}/calendar`, label: 'تقویم سانس‌ها', icon: 'calendar', group: 'روزانه' },
        { href: `/club/${org}/classes`, label: 'کلاس‌ها و حضور', icon: 'users', group: 'روزانه' },
        { href: `/club/${org}/finance`, label: 'امور مالی', icon: 'credit-card', group: 'روزانه' },
        { href: `/club/${org}/reports`, label: 'گزارش‌ها', icon: 'dollar', group: 'روزانه' },
        { href: resourcePath(org,'courts'), label: 'زمین‌ها', icon: 'court', group: 'باشگاه' },
        { href: resourcePath(org,'coaches'), label: 'مربیان', icon: 'user', group: 'باشگاه' },
        { href: resourcePath(org,'students'), label: 'شاگردان', icon: 'users', group: 'باشگاه' },
        ...(club.role === 'owner' ? [{ href: `/club/${org}/members`, label: 'مدیران و دسترسی', icon: 'users' as const, group: 'مدیریت' }] : []),
        { href: `/club/${org}/notifications`, label: 'اعلان‌ها', icon: 'bell', group: 'مدیریت' },
        { href: `/club/${org}/profile`, label: 'پروفایل من', icon: 'user', group: 'مدیریت' },
      ]} />
      <div className="local-sidebar-footer">
        <ThemeToggle />
        <div className="local-account"><div><strong>{name || 'حساب باشگاه'}</strong><small>{roles[club.role]}</small></div><Logout /></div>
      </div>
    </aside>

    <main id="club-main" tabIndex={-1} className="local-content"><ClubPageMotion>{children}</ClubPageMotion></main>

    <BottomNav
      org={org}
      userName={name || 'حساب باشگاه'}
      roleTitle={roles[club.role]}
      tools={<><ClubSearch org={org} /><ThemeToggle /></>}
      isOwner={club.role === 'owner'}
    />
  </div>;
}
