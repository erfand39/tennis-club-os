import { randomUUID } from 'node:crypto';
import type { Branch } from '@/lib/club';
import { type ResourceKind, resourceKinds } from '@/lib/resource-fields';
import type { CourtOption, ResourceDetail } from '@/lib/resources';
import { ResourceCommand } from './command';

export function CommandFields({ org, kind, id, branch }: { org: string; kind: ResourceKind; id?: string; branch?: string }) {
  return <>
    <input type="hidden" name="org" value={org} /><input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="request" value={randomUUID()} />
    {id && <input type="hidden" name="id" value={id} />}
    {branch && <input type="hidden" name="location" value={branch} />}
  </>;
}

export function ResourceForm({ org, kind, scope, row, courtOptions = [], selectedCourts = [] }: {
  org: string; kind: ResourceKind; scope: Branch[]; row?: ResourceDetail;
  courtOptions?: CourtOption[]; selectedCourts?: string[];
}) {
  const choices = scope.filter(branch => branch.active || row?.locations.includes(branch.id));
  if (!choices.length) return <p className="local-notice">برای ثبت پرونده ابتدا یک شعبهٔ فعال لازم است.</p>;
  const data = row?.data;
  const label = resourceKinds[kind].label;
  return <ResourceCommand action="resource" label={row ? 'ذخیرهٔ پرونده' : `ثبت ${label}`}>
    <CommandFields org={org} kind={kind} id={row?.id} />
    {row && <input type="hidden" name="revision" value={row.revision} />}
    <div className="resource-form-grid">
      <label className="field"><span>نام {label}</span><input name="name" defaultValue={row?.name} required maxLength={kind === 'courts' ? 100 : 120} /></label>
      <label className="field"><span>وضعیت</span><select name="status" defaultValue={row?.status ?? 'active'}>
        <option value="active">فعال</option><option value="inactive">غیرفعال</option>
        {row?.status === 'archived' && <option value="archived">آرشیوشده</option>}
      </select></label>
      {kind === 'courts' ? <>
        {row ? <label className="field"><span>شعبه</span><input value={row.branch_names[0]} readOnly />
          <input type="hidden" name="location" value={row.locations[0]} /></label>
          : <label className="field"><span>شعبه</span><select name="location" required>{choices.map(branch =>
            <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>}
        <label className="field"><span>نوع سطح</span><input name="surface" defaultValue={data?.surface} placeholder="مثلاً خاک رس" required maxLength={60} /></label>
        <label className="field"><span>ظرفیت نفر</span><input name="capacity" inputMode="numeric" dir="ltr" defaultValue={data?.capacity ?? 4} required maxLength={3} /></label>
        <label className="field"><span>امکانات</span><input name="amenities" defaultValue={data?.amenities?.join('، ')} placeholder="مثلاً نور، رختکن" maxLength={600} /></label>
      </> : <>
        <label className="field"><span>شمارهٔ تماس</span><input name="phone" type="tel" dir="ltr" defaultValue={data?.contact_phone ?? ''} maxLength={35} /></label>
        <label className="field"><span>ایمیل تماس</span><input name="email" type="email" dir="ltr" defaultValue={data?.contact_email ?? ''} maxLength={254} /></label>
        <label className="field"><span>{kind === 'coaches' ? 'تاریخ شروع همکاری' : 'تاریخ عضویت'}</span>
          <input name="joined_on" type="date" dir="ltr" defaultValue={data?.joined_on ?? ''} /></label>
        {kind === 'coaches' ? <>
          <label className="field"><span>تخصص و سطح مربیگری</span><input name="specialty" defaultValue={data?.specialty ?? ''} maxLength={120} /></label>
          <label className="field"><span>مدرک یا گواهی مربیگری</span><input name="qualification" defaultValue={data?.qualification ?? ''} maxLength={240} /></label>
          <label className="field"><span>مبنای دستمزد</span><select name="pay_basis" defaultValue={data?.pay_basis ?? ''}>
            <option value="">تعریف نشده</option><option value="hourly">ساعتی</option><option value="per_session">به‌ازای جلسه</option>
          </select></label>
          <label className="field"><span>مبلغ دستمزد در واحد پایهٔ مجموعه</span><input name="pay_amount_minor" inputMode="numeric" dir="ltr" defaultValue={data?.pay_amount_minor ?? ''} maxLength={20} /></label>
        </> : <label className="field"><span>سطح مهارت</span><input name="skill_level" defaultValue={data?.skill_level ?? ''} placeholder="مثلاً متوسط" maxLength={100} /></label>}
        <fieldset className="branch-fields resource-full"><legend>شعبه‌های پرونده</legend>
          {choices.map(branch => <label key={branch.id}><input type="checkbox" name="location" value={branch.id}
            defaultChecked={row ? row.locations.includes(branch.id) : choices.length === 1} /> {branch.name}</label>)}
        </fieldset>
        {kind === 'coaches' && courtOptions.length > 0 && <fieldset className="branch-fields resource-full">
          <legend>زمین‌های مجاز مربی</legend>
          {choices.filter(branch => courtOptions.some(court => court.location_id === branch.id)).map(branch => <div key={branch.id} className="resource-court-choice">
            <strong>{branch.name}</strong>{courtOptions.filter(court => court.location_id === branch.id).map(court => <label key={court.id}>
              <input name="court_id" type="checkbox" value={court.id} defaultChecked={selectedCourts.includes(court.id)} />{court.name}</label>)}</div>)}
          <small>اگر در یک شعبه زمینی انتخاب نشود، همهٔ زمین‌های فعال همان شعبه مجازند.</small>
        </fieldset>}
      </>}
      <label className="field resource-full"><span>یادداشت داخلی</span><textarea name="notes" defaultValue={data?.notes ?? ''} rows={3} maxLength={2000} /></label>
    </div>
  </ResourceCommand>;
}

export function ArchiveForm({ org, kind, row }: { org: string; kind: ResourceKind; row: ResourceDetail }) {
  if (row.status === 'archived') return null;
  return <details className="resource-disclosure">
    <summary>آرشیو پرونده</summary>
    <p>پرونده از استفادهٔ فعال خارج می‌شود و سوابق آن در دسترس می‌مانند.</p>
    <ResourceCommand action="resource" label="تأیید آرشیو" danger>
      <CommandFields org={org} kind={kind} id={row.id} />
      <input name="revision" type="hidden" value={row.revision} /><input name="intent" type="hidden" value="archive" />
    </ResourceCommand>
  </details>;
}
