import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { branches, clubFor } from '@/lib/club';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { roles } from '@/lib/roles';
import { Icon } from '@/app/components/icon';

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();

  const [scope, counts] = await Promise.all([
    branches(user.id, org),
    asUser(user.id, async db => (await db.query<{
      courts: number; bookings: number; coaches: number; students: number;
    }>(`select
      (select count(*)::int from public.courts where organization_id=$1 and status='active') as courts,
      (select count(*)::int from public.bookings where organization_id=$1 and status='confirmed' and starts_at>=now()) as bookings,
      (select count(*)::int from public.coach_profiles where organization_id=$1 and status='active') as coaches,
      (select count(*)::int from public.student_profiles where organization_id=$1 and status='active') as students`, [org])).rows[0]),
  ]);
  const number = new Intl.NumberFormat('fa-IR');
  return <>
    <header className="local-heading"><div><h1>نمای کلی</h1><p>{club.name}</p></div>
      <span className="local-label">{roles[club.role]}</span></header>
    <section className="local-hero"><div><h2>{club.name}</h2><p>{scope.length ? scope.map(branch => branch.name).join('، ') : 'شعبه‌ای برای حساب شما فعال نشده است.'}</p>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <Link className="hero-link" href={`/club/${org}/calendar`}>مشاهدهٔ تقویم و رزرو</Link>
        <Link className="hero-link" href={`/club/${org}/classes`}>کلاس‌ها و حضور</Link>
        <Link className="hero-link" href={`/club/${org}/finance`}>امور مالی</Link>
        {club.role === 'owner' && <Link className="hero-link" href={`/club/${org}/members`}>مدیریت دسترسی‌ها</Link>}
      </div>
    </div></section>
    <div className="stats" aria-label="شاخص‌های محدودهٔ دسترسی">
      {[
        { label: 'زمین‌های فعال', value: counts.courts, icon: 'court' as const },
        { label: 'سانس‌های پیش رو', value: counts.bookings, icon: 'calendar' as const },
        { label: 'مربیان قابل‌مشاهده', value: counts.coaches, icon: 'user' as const },
        { label: 'شاگردان قابل‌مشاهده', value: counts.students, icon: 'users' as const },
      ].map(({ label, value, icon }) => (
        <article className="stat-card" key={label}>
          <div className="stat-top">
            <span>{label}</span>
            <Icon name={icon} size={18} aria-hidden />
          </div>
          <strong className="stat-value">{number.format(value)}</strong>
        </article>
      ))}
    </div>
    <section className="panel local-panel"><h2>شعبه‌های قابل‌دسترسی</h2>
      {scope.length ? <ul className="local-branches">{scope.map(branch => <li key={branch.id}>
        <strong>{branch.name}</strong><small dir="ltr">{branch.timezone}</small><span className="local-label">{branch.active ? 'فعال' : 'غیرفعال'}</span>
      </li>)}</ul> : <p>در این حساب شعبه‌ای نمایش داده نمی‌شود.</p>}
    </section>
  </>;
}
