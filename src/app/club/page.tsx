import Link from 'next/link';
import { redirect } from 'next/navigation';
import { clubs } from '@/lib/club';
import { roles } from '@/lib/roles';
import { currentUser } from '@/lib/session';
import { AccessShell, Logout } from '../ui';

export const dynamic = 'force-dynamic';

export default async function Clubs() {
  const user = await currentUser();
  if (!user) redirect('/');
  const available = await clubs(user.id);
  if (available.length === 1) redirect(`/club/${available[0].id}`);
  return <AccessShell><div className="access-heading"><h1>{available.length ? 'انتخاب باشگاه' : 'عضویت فعال ندارید'}</h1>
    {!available.length && <p>برای فعال‌سازی دسترسی با مالک باشگاه تماس بگیرید.</p>}</div>
    <div className="local-form">
      {available.map(club => <Link className="button subtle" key={club.id} href={`/club/${club.id}`}>{club.name} · {roles[club.role]}</Link>)}
      <Logout />
    </div>
  </AccessShell>;
}
