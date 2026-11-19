import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { branches, clubFor } from '@/lib/club';
import { currentUser } from '@/lib/session';
import { faNumber, isResourceKind, persianDate, resourceKinds, resourcePath, resourceStatuses } from '@/lib/resource-fields';
import { parseFilters, resourceList } from '@/lib/resources';

export default async function Directory({ params, searchParams }: {
  params: Promise<{ org: string; kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org, kind } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  if (!isResourceKind(kind) || !(await clubFor(user.id, org))) notFound();
  const scope = await branches(user.id, org);
  const filters = parseFilters(await searchParams, scope);
  const result = await resourceList(user.id, org, kind, filters);
  const label = resourceKinds[kind];
  const href = (page: number) => `${resourcePath(org,kind)}?${new URLSearchParams({
    q: filters.q, status: filters.status, branch: filters.branch, sort: filters.sort, inactiveDays: String(filters.inactiveDays || ''), page: String(page),
  })}`;

  return <>
    <header className="local-heading directory-heading">
      <div><h1>{label.title}</h1><p>{faNumber.format(result.total)} پرونده در این فهرست</p></div>
      <Link href={resourcePath(org,kind,'new')} className="button primary"><span aria-hidden="true">＋</span> ثبت {label.label}</Link>
    </header>
    <section className="panel local-panel directory-panel" aria-label={label.title}>
      <form className={`resource-filters ${kind === 'students' ? 'student-filters' : ''}`} method="get">
        <label className="field"><span>جست‌وجو</span><input type="search" name="q" placeholder={label.search} defaultValue={filters.q} maxLength={100} /></label>
        <label className="field"><span>وضعیت</span><select name="status" defaultValue={filters.status}>
          <option value="">همهٔ وضعیت‌ها</option>{Object.entries(resourceStatuses).map(([value,text]) => <option value={value} key={value}>{text}</option>)}
        </select></label>
        <label className="field"><span>شعبه</span><select name="branch" defaultValue={filters.branch}>
          <option value="">همهٔ شعبه‌های مجاز</option>{scope.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
        </select></label>
        <label className="field"><span>مرتب‌سازی</span><select name="sort" defaultValue={filters.sort}>
          <option value="name">نام</option><option value="newest">آخرین تغییر</option><option value="status">وضعیت</option>
        </select></label>
        {kind === 'students' && <label className="field"><span>عدم فعالیت طی چند روز</span>
          <input name="inactiveDays" type="number" min="1" max="730" placeholder="مثلاً ۳۰" defaultValue={filters.inactiveDays || ''} /></label>}
        <button className="button subtle">نمایش</button>
      </form>
      {!result.rows.length ? <div className="empty-state">
        <strong>{filters.q || filters.status || filters.branch || filters.inactiveDays ? 'نتیجه‌ای پیدا نشد' : 'هنوز پرونده‌ای ثبت نشده است'}</strong>
        {filters.q || filters.status || filters.branch || filters.inactiveDays ? <Link className="panel-link" href={resourcePath(org,kind)}>پاک‌کردن فیلترها</Link>
          : <Link className="panel-link" href={resourcePath(org,kind,'new')}>ثبت اولین پرونده</Link>}
      </div> : <ul className="resource-list">
        {result.rows.map(row => <li key={row.id}><Link href={resourcePath(org,kind,row.id)} className="resource-row">
          <span className="resource-avatar" aria-hidden="true">{Array.from(row.name)[0]}</span>
          <span className="resource-name"><strong>{row.name}</strong><small>{row.subtitle || '—'}</small></span>
          <span className="resource-branch">{row.branch_names.join('، ') || 'بدون شعبه'}</span>
          <span className={`resource-status is-${row.status}`}><i />{resourceStatuses[row.status]}</span>
          <small className="resource-updated">{persianDate(row.updated_at)}</small>
          <span className="resource-arrow" aria-hidden="true">‹</span>
        </Link></li>)}
      </ul>}
      {result.pages > 1 && <nav className="resource-pagination" aria-label="صفحه‌بندی">
        {result.page > 1 && <Link href={href(result.page-1)} className="button subtle">صفحهٔ قبل</Link>}
        <span>صفحهٔ {faNumber.format(result.page)} از {faNumber.format(result.pages)}</span>
        {result.page < result.pages && <Link href={href(result.page+1)} className="button subtle">صفحهٔ بعد</Link>}
      </nav>}
    </section>
  </>;
}
