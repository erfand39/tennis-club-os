import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { clubFor, displayName } from '@/lib/club';
import { roles } from '@/lib/roles';
import { currentUser } from '@/lib/session';
import { Brand, Logout } from '../../ui';

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
      <nav aria-label="ناوبری باشگاه">
        <Link href={`/club/${org}`}>نمای کلی</Link>
        {club.role === 'owner' && <Link href={`/club/${org}/members`}>کاربران و دسترسی</Link>}
        <Link href={`/club/${org}/profile`}>پروفایل من</Link>
      </nav>
      <div className="local-account"><strong>{name || 'حساب باشگاه'}</strong><small>{roles[club.role]}</small><Logout /></div>
    </aside>
    <main className="local-content">{children}</main>
  </div>;
}
