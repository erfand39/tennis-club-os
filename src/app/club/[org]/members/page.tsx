import { notFound, redirect } from 'next/navigation';
import { type Branch, type Member, branches, clubFor, members } from '@/lib/club';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { roles } from '@/lib/roles';
import { Notice } from '../../../ui';
import { LinkForm } from './link-form';

type Person = { id: string; name: string; kind: 'coach' | 'student' };
function AccessFields({ scope, people, member }: { scope: Branch[]; people: Person[]; member?: Member }) {
  return <>
    <label className="field"><span>نقش</span><select name="role" defaultValue={member?.role ?? 'receptionist'}>
      {Object.entries(roles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {member && <label className="field"><span>وضعیت عضویت</span><select name="active" defaultValue={member.active ? 'yes' : 'no'}>
      <option value="yes">فعال</option><option value="no">غیرفعال</option></select></label>}
    <fieldset className="branch-fields"><legend>شعبه‌های مجاز</legend>
      {scope.map(branch => <label key={branch.id}><input type="checkbox" name="location" value={branch.id}
        defaultChecked={member?.location_ids.includes(branch.id) ?? (scope.length === 1)} /> {branch.name}</label>)}
      <small>مالک به همهٔ شعبه‌های مجموعه دسترسی دارد.</small>
    </fieldset>
    {people.length > 0 && <label className="field"><span>پیوند به پروندهٔ مربی یا شاگرد</span>
      <select name="person" defaultValue={member?.person_id ?? ''}>
        <option value="">بدون انتخاب پروندهٔ جدید</option>
        {people.map(person => <option key={person.id} value={person.id}>{person.name} · {roles[person.kind]}</option>)}
      </select></label>}
  </>;
}

export default async function Members({ params, searchParams }: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ role?: string; status?: string; saved?: string; error?: string }>;
}) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club || club.role !== 'owner') notFound();
  const filters = await searchParams;
  const [scope, all, people] = await Promise.all([
    branches(user.id, org),
    members(user.id, org),
    asUser(user.id, async db => (await db.query<Person>(`
      select id,name,'coach' as kind from public.coach_profiles where organization_id=$1 and status='active'
      union all select id,name,'student' as kind from public.student_profiles where organization_id=$1 and status='active'
      order by name`, [org])).rows),
  ]);
  const shown = all.filter(member => (!filters.role || member.role === filters.role)
    && (!filters.status || member.active === (filters.status === 'active')));
  return <>
    <header className="local-heading"><div><h1>کاربران و دسترسی</h1><p>{club.name}</p></div></header>
    <Notice error={filters.error} saved={filters.saved === '1'} />
    <div className="local-grid">
      <section className="panel local-panel">
        <h2>اعضای مجموعه</h2>
        <form className="local-filters" method="get">
          <label className="field"><span>نقش</span><select name="role" defaultValue={filters.role ?? ''}>
            <option value="">همهٔ نقش‌ها</option>{Object.entries(roles).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select></label>
          <label className="field"><span>وضعیت</span><select name="status" defaultValue={filters.status ?? ''}>
            <option value="">همهٔ وضعیت‌ها</option><option value="active">فعال</option><option value="inactive">غیرفعال</option>
          </select></label>
          <button className="button subtle">اعمال فیلتر</button>
        </form>
        {!shown.length && <p className="local-notice">عضوی با این فیلتر پیدا نشد.</p>}
        <div className="member-list">{shown.map(member => <details key={member.user_id} className="member-row">
          <summary><span><strong>{member.display_name || (member.user_id === user.id ? 'حساب من' : roles[member.role])}</strong>
            <small dir="ltr">{member.email}</small></span>
            <span className="local-label">{roles[member.role]} · {member.active ? 'فعال' : 'غیرفعال'}</span></summary>
          <div className="member-details">
            {member.user_id !== user.id && <form className="local-form" method="post" action="/api/member">
              <input type="hidden" name="org" value={org} /><input type="hidden" name="user" value={member.user_id} />
              <AccessFields scope={scope} people={people} member={member} />
              <button className="button primary">ذخیرهٔ دسترسی</button>
            </form>}
            {member.active && member.email && <LinkForm action="recovery" label="ساخت پیوند بازیابی">
              <input type="hidden" name="org" value={org} /><input type="hidden" name="user" value={member.user_id} />
            </LinkForm>}
          </div>
        </details>)}</div>
      </section>
      <section className="panel local-panel"><h2>دعوت کاربر</h2>
        <p>برای کاربر تازه، پیوند یک‌بارمصرف بسازید و آن را مستقیم در اختیار او بگذارید.</p>
        <LinkForm action="invite" label="ساخت پیوند دعوت">
          <input type="hidden" name="org" value={org} />
          <label className="field"><span>ایمیل کاربر</span><input name="email" dir="ltr" type="email" required maxLength={254} /></label>
          <AccessFields scope={scope} people={people} />
        </LinkForm>
      </section>
    </div>
  </>;
}
