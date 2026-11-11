import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { branches, clubFor, uuid } from '@/lib/club';
import { currentUser } from '@/lib/session';
import {
  attendanceStatuses, bookingKinds, bookingStatuses, faNumber, isResourceKind, persianDate, resourceActions,
  resourceKinds, resourcePath, resourceStatuses,
} from '@/lib/resource-fields';
import { availableCourts, courtSettings, resourceDetail, resourceHours, resourceRecords } from '@/lib/resources';
import { Notice } from '../../../../../ui';
import { ArchiveForm, ResourceForm } from '../../resource-form';
import { CourtSettings, Hours } from '../../resource-settings';

export default async function Details({ params, searchParams }: {
  params: Promise<{ org: string; kind: string; id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { org,kind,id } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  if (!isResourceKind(kind) || (id !== 'new' && !uuid(id)) || !(await clubFor(user.id,org))) notFound();
  const label = resourceKinds[kind].label;
  const [scope,feedback] = await Promise.all([branches(user.id,org),searchParams]);
  const base = resourcePath(org,kind);
  const back = <Link href={base} className="panel-link">‹ بازگشت به {resourceKinds[kind].title}</Link>;
  if (id === 'new') {
    const options = kind === 'coaches' ? (await availableCourts(user.id,org)).options : undefined;
    return <>
      {back}<header className="local-heading"><h1>ثبت {label}</h1></header>
      <section className="panel local-panel resource-editor">
        <Notice error={feedback.error} />
        <ResourceForm org={org} kind={kind} scope={scope} courtOptions={options} />
      </section>
    </>;
  }

  const row = await resourceDetail(user.id,org,kind,id);
  if (!row) notFound();
  const [records,hours,settings,options] = await Promise.all([
    resourceRecords(user.id,org,kind,id),
    kind !== 'students' ? resourceHours(user.id,org,kind,id) : [],
    kind === 'courts' ? courtSettings(user.id,org,id) : null,
    kind === 'coaches' ? availableCourts(user.id,org,id) : null,
  ]);
  const currentScope = scope.filter(branch => row.locations.includes(branch.id));
  const primaryBranch = currentScope[0];
  const currency = settings?.currency === 'IRR' ? 'ریال' : settings?.currency;

  return <>
    {back}
    <header className="local-heading directory-heading">
      <div><h1>{row.name}</h1><p>{row.subtitle || label} · {row.branch_names.join('، ') || 'بدون شعبه'}</p></div>
      <span className={`resource-status is-${row.status}`}><i />{resourceStatuses[row.status]}</span>
    </header>
    <Notice error={feedback.error} saved={feedback.saved === '1'} />
    <div className="resource-overview">
      {kind === 'courts' && <div className="stat-card"><span className="stat-top">ظرفیت</span>
        <strong className="stat-value">{faNumber.format(row.data.capacity ?? 0)}</strong><p>نفر</p></div>}
      {settings && <div className="stat-card"><span className="stat-top">اشغال امروز</span>
        <strong className="stat-value">{settings.occupancy.open_minutes ?
          `${faNumber.format(Math.round(100*settings.occupancy.booked_minutes/settings.occupancy.open_minutes))}٪` : '—'}</strong>
        <p>{faNumber.format(settings.occupancy.booked_minutes)} دقیقه رزرو از {faNumber.format(settings.occupancy.open_minutes)} دقیقه قابل رزرو</p></div>}
      {records.progress && <div className="stat-card"><span className="stat-top">جلسات برگزارشده</span>
        <strong className="stat-value">{faNumber.format(records.progress.completed)}</strong>
        <p>{kind === 'coaches' ? `${faNumber.format(records.progress.minutes)} دقیقه تدریس ثبت‌شده`
          : `${faNumber.format(records.progress.attended)} جلسه با حضور ثبت‌شده`}</p></div>}
      <div className="stat-card"><span className="stat-top">آخرین تغییر</span>
        <strong className="resource-date-stat">{persianDate(row.updated_at,primaryBranch?.timezone)}</strong>
        {row.data.joined_on && <p>از {persianDate(row.data.joined_on)}</p>}</div>
    </div>
    <section className="panel local-panel resource-editor">
      <div className="resource-section-head"><h2>مشخصات پرونده</h2><a href="#resource-calendar" className="panel-link">مشاهدهٔ برنامه و سوابق</a></div>
      {row.data.amenities?.length ? <p>امکانات: {row.data.amenities.join('، ')}</p> : null}
      {row.data.contact_phone && <p>تماس: <bdi dir="ltr">{row.data.contact_phone}</bdi></p>}
      {row.data.notes && <p className="resource-notes">{row.data.notes}</p>}
      <details className="resource-disclosure" open={feedback.error ? true : undefined}>
        <summary>ویرایش مشخصات</summary>
        <ResourceForm org={org} kind={kind} scope={scope} row={row} courtOptions={options?.options} selectedCourts={options?.selected} />
      </details>
      <ArchiveForm org={org} kind={kind} row={row} />
    </section>
    {kind !== 'students' && <Hours org={org} kind={kind} id={id} scope={currentScope} rows={hours} />}
    {settings && primaryBranch && currency && <CourtSettings org={org} id={id} branch={primaryBranch}
      rates={settings.rates} blocks={settings.blocks} currency={settings.currency} />}
    <div className="local-grid">
      <section className="panel local-panel" id="resource-calendar">
        <h2>{kind === 'courts' ? 'برنامه و سوابق سانس' : 'برنامه و سوابق آموزشی'}</h2>
        {!records.calendar.length && <p>سوابق مرتبط با این پرونده در شعبه‌های قابل‌دسترسی خالی است.</p>}
        <ul className="resource-timeline">{records.calendar.map(item => <li key={item.id}>
          <span><strong>{bookingKinds[item.kind]} · {item.branch_name}</strong>
            <small>{persianDate(item.starts_at,item.timezone,true)}</small></span>
          <span className="local-label">{item.attendance ? attendanceStatuses[item.attendance]
            : item.session_status === 'completed' ? 'برگزارشده' : bookingStatuses[item.booking_status]}</span>
        </li>)}</ul>
      </section>
      <section className="panel local-panel"><h2>تاریخچهٔ تغییرات</h2>
        {!records.history.length && <p>تغییری در محدودهٔ دسترسی شما ثبت نشده است.</p>}
        <ul className="resource-timeline">{records.history.map((item,index) => <li key={`${item.occurred_at.toISOString()}-${index}`}>
          <span><strong>{resourceActions[item.action]}</strong>
            <small>{persianDate(item.occurred_at,primaryBranch?.timezone,true)}{item.actor ? ` · ${item.actor}` : ''}</small></span>
          {item.current_status && <span className="local-label">{resourceStatuses[item.current_status]}</span>}
        </li>)}</ul>
      </section>
    </div>
  </>;
}
