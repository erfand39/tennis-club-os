import { AmountFields } from '../finance/actions';
import type { Branch } from '@/lib/club';
import { bookingKinds, faNumber, localDate, minutesLabel, persianDate, weekdays } from '@/lib/resource-fields';
import type { CourtBlock, CourtRate, HoursEntry } from '@/lib/resources';
import { ResourceCommand, WeeklyTimes } from './command';
import { CommandFields } from './resource-form';

export function Hours({ org, kind, id, scope, rows }: { org: string; kind: 'courts' | 'coaches'; id: string; scope: Branch[]; rows: HoursEntry[] }) {
  return <section className="panel local-panel" id="resource-hours">
    <h2>{kind === 'courts' ? 'ساعات کاری زمین' : 'دسترس‌پذیری مربی'}</h2>
    {!scope.length && <p>برای تعیین ساعت، ابتدا پرونده را به یک شعبه متصل کنید.</p>}
    {scope.map(branch => {
      const current = rows.filter(row => row.location_id === branch.id);
      const today = localDate(branch.timezone);
      return <div className="resource-schedule" key={branch.id}>
        <h3>{branch.name}</h3>
        <div className="resource-week">
          {weekdays.map(([day,label]) => {
            const planned = current.filter(row => row.weekday === day && row.from_date <= today && (!row.until_date || row.until_date > today));
            return <div key={day}><strong>{label}</strong>
              <span>{planned.length ? planned.map(entry => <bdi dir="ltr" key={entry.id}>{minutesLabel(entry.starts)}–{minutesLabel(entry.ends)}</bdi>) : '—'}</span>
            </div>;
          })}
        </div>
        {current.some(entry => entry.from_date > today) && <ul className="resource-timeline">
          {current.filter(entry => entry.from_date > today).map(entry => <li key={entry.id}>
            <strong>{weekdays.find(([day]) => day === entry.weekday)?.[1]} · {persianDate(entry.from_date)}</strong>
            <bdi dir="ltr">{minutesLabel(entry.starts)}–{minutesLabel(entry.ends)}</bdi>
          </li>)}</ul>}
        {branch.active && <details className="resource-disclosure">
          <summary>تنظیم برنامهٔ یک روز هفته</summary>
          <p>برنامهٔ این روز از تاریخ انتخابی اعمال می‌شود. برنامهٔ گذشته حفظ می‌شود.</p>
          <ResourceCommand action="resource-hours" label="ذخیرهٔ ساعات">
            <CommandFields org={org} kind={kind} id={id} branch={branch.id} />
            <div className="resource-form-grid">
              <label className="field"><span>روز هفته</span><select name="weekday">{weekdays.map(([day,label]) =>
                <option key={day} value={day}>{label}</option>)}</select></label>
              <label className="field"><span>تاریخ شروع اثر</span><input name="from" type="date" dir="ltr" defaultValue={today} min={today} required /></label>
            </div>
            <WeeklyTimes />
          </ResourceCommand>
        </details>}
      </div>;
    })}
  </section>;
}

export function CourtSettings({ org,id,branch,rates,blocks,currency }: {
  org: string; id: string; branch: Branch; rates: CourtRate[]; blocks: CourtBlock[]; currency: string;
}) {
  const today = localDate(branch.timezone);
  const unit = currency === 'IRR' ? 'ریال' : currency;
  return <>
    <section className="panel local-panel"><h2>تعرفه‌های زمین</h2>
      {!rates.length && <p>هنوز تعرفه‌ای برای این زمین تعریف نشده است.</p>}
      <ul className="resource-timeline">{rates.map(rate => <li key={rate.id}>
        <span><strong>{bookingKinds[rate.kind]}</strong><small>{persianDate(rate.from_time,branch.timezone)}{rate.until_time ? ` تا ${persianDate(rate.until_time,branch.timezone)}` : ' به بعد'}</small></span>
        <span>{faNumber.format(Number(rate.amount_minor))} {unit} / {faNumber.format(rate.unit_minutes)} دقیقه</span>
        {rate.current && <span className="resource-status is-active"><i />جاری</span>}
      </li>)}</ul>
      {branch.active && <details className="resource-disclosure"><summary>ثبت تعرفهٔ جدید</summary>
        <p>مبلغ ثبت‌شدهٔ رزروهای قبلی حفظ می‌شود.</p>
        <ResourceCommand action="resource-rate" label="ثبت تعرفه">
          <CommandFields org={org} kind="courts" id={id} branch={branch.id} />
          <div className="resource-form-grid">
            <label className="field"><span>نوع سانس</span><select name="booking_kind">{Object.entries(bookingKinds).map(([key,label]) =>
              <option value={key} key={key}>{label}</option>)}</select></label>
            <label className="field"><span>تاریخ شروع اثر</span><input name="from" type="date" dir="ltr" defaultValue={today} min={today} required /></label>
            <label className="field"><span>مدت واحد به دقیقه</span><input name="unit_minutes" dir="ltr" inputMode="numeric" defaultValue="60" maxLength={4} required /></label>
            <div className="resource-full"><AmountFields currency={currency} name="amount_minor" label="مبلغ هر واحد" /></div>
          </div>
        </ResourceCommand>
      </details>}
    </section>
    <section className="panel local-panel"><h2>تعمیرات و انسداد زمین</h2>
      {!blocks.length && <p>هنوز بازهٔ مسدودی ثبت نشده است.</p>}
      <ul className="resource-timeline">{blocks.map(block => <li key={block.id}>
        <span><strong>{block.reason}</strong><small>{persianDate(block.starts_at,branch.timezone,true)} تا {persianDate(block.ends_at,branch.timezone,true)}</small></span>
        {block.released_at ? <span className="local-label">آزادشده</span>
          : block.releasable ? <details className="resource-disclosure compact"><summary>آزادسازی</summary>
            <ResourceCommand action="resource-release" label="تأیید آزادسازی">
              <CommandFields org={org} kind="courts" id={id} branch={branch.id} />
              <input name="block" type="hidden" value={block.id} />
            </ResourceCommand></details>
          : <span className="local-label">{block.ends_at < new Date() ? 'پایان‌یافته' : 'در حال اجرا'}</span>}
      </li>)}</ul>
      {branch.active && <details className="resource-disclosure"><summary>مسدود کردن بازه</summary>
        <p>تاریخ و ساعت را به وقت شعبه وارد کنید.</p>
        <ResourceCommand action="resource-block" label="ثبت انسداد">
          <CommandFields org={org} kind="courts" id={id} branch={branch.id} />
          <div className="resource-form-grid">
            <label className="field"><span>شروع بازه</span><input type="datetime-local" name="starts_at" dir="ltr" required /></label>
            <label className="field"><span>پایان بازه</span><input type="datetime-local" name="ends_at" dir="ltr" required /></label>
            <label className="field resource-full"><span>علت</span><input name="reason" required maxLength={250} /></label>
          </div>
        </ResourceCommand>
      </details>}
    </section>
  </>;
}
