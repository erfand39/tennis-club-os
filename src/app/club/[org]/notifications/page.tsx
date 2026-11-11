import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound,redirect } from 'next/navigation';
import { branches } from '@/lib/club';
import { deviceIsEnabled,noticeKinds,noticePath,noticeSource,pushCookie,pushPublicKey,readNotices } from '@/lib/notifications';
import { persianDate } from '@/lib/resource-fields';
import { currentUser } from '@/lib/session';
import { Notice } from '@/app/ui';
import { DeviceNotifications } from './device';
import { RefreshInbox } from './refresh';

export default async function NotificationsPage({params,searchParams}:{
  params:Promise<{org:string}>;searchParams:Promise<{branch?:string;page?:string;error?:string}>;
}) {
  const [{org},query,user,jar]=await Promise.all([params,searchParams,currentUser(),cookies()]);
  if (!user) redirect('/');
  const scope=await branches(user.id,org);
  const selected=typeof query.branch==='string'&&query.branch?scope.find(item=>item.id===query.branch):undefined;
  if (query.branch&&!selected) notFound();
  const page=typeof query.page==='string'&&/^\d{1,5}$/.test(query.page)?Math.max(1,Number(query.page)):1;
  const [inbox,enabled]=await Promise.all([
    readNotices(user.id,org,selected?.id??null,page),deviceIsEnabled(jar.get(pushCookie)?.value,user.id,org),
  ]);
  const unread=inbox.notices.some(item=>!item.read_at);
  return <div className="notice-center">
    <RefreshInbox/>
    <header className="local-heading directory-heading"><div><h1>مرکز اعلان‌ها</h1><p>تغییرهای برنامه و موارد نیازمند پیگیری</p></div>
      <Link className="button subtle" href="/install">نصب برنامه</Link>
    </header>
    <DeviceNotifications org={org} publicKey={pushPublicKey()} enabled={enabled}/>
    <section className="panel local-panel">
      <div className="notice-tools">
        <form className="notice-filter" method="get">
          <label className="field"><span>شعبه</span><select name="branch" defaultValue={selected?.id??''}>
            <option value="">همهٔ شعبه‌های مجاز</option>{scope.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
          <button className="button subtle">نمایش</button>
        </form>
        {unread&&<form method="post" action="/api/notice-read">
          <input type="hidden" name="org" value={org}/><input type="hidden" name="event" value="all"/>
          <input type="hidden" name="branch" value={selected?.id??''}/>
          <button className="button subtle">علامت‌گذاری همه به‌عنوان خوانده‌شده</button>
        </form>}
      </div>
      <Notice error={query.error}/>
      {inbox.notices.length?<ul className="notice-list">{inbox.notices.map(row=>{
        const item=noticeKinds[row.kind];
        return <li key={row.id} className={!row.read_at?'notice-unread':undefined}>
          <div className="notice-item"><span className="notice-meta">{row.branch} · {persianDate(row.available_at,row.timezone,true)}</span>
            <h2>{item.title}</h2><p>{item.detail}</p>
            {!row.read_at&&<span className="notice-badge">خوانده‌نشده</span>}
          </div>
          <div className="notice-actions">
            <Link className="button subtle" href={noticeSource(org,row)} prefetch={false}>مشاهدهٔ رکورد</Link>
            {!row.read_at&&<form method="post" action="/api/notice-read">
              <input type="hidden" name="org" value={org}/><input type="hidden" name="event" value={row.id}/>
              <input type="hidden" name="branch" value={selected?.id??''}/>
              <button className="button subtle" aria-label={`خوانده شد، ${item.title}`}>خوانده شد</button>
            </form>}
          </div>
        </li>;
      })}</ul>:<div className="empty-state"><strong>اعلانی در این بخش وجود ندارد.</strong></div>}
      {(page>1||inbox.hasNext)&&<nav className="resource-pagination" aria-label="صفحه‌های اعلان‌ها">
        {page>1&&<Link className="button subtle" href={noticePath(org,selected?.id,page-1)}>قبلی</Link>}
        {inbox.hasNext&&<Link className="button subtle" href={noticePath(org,selected?.id,page+1)}>بعدی</Link>}
      </nav>}
    </section>
  </div>;
}
