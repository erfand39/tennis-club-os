'use client';

import { type FormEvent, useRef, useState } from 'react';
import { type BookingKind, type CalendarCourt } from '@/lib/calendar';
import { errorMessage } from '@/lib/messages';
import { bookingKinds } from '@/lib/resource-fields';
import { displayPrice } from './booking-ui';

type Person = { id: string; name: string };
type Price = { amount: string; currency: string };

export function CreateBookingForm({ org, branch, court, start, minStart, request, courts, coaches, students }: {
  org: string; branch: string; court: string; start: string; minStart: string; request: string;
  courts: CalendarCourt[]; coaches: Person[]; students: Person[];
}) {
  const [kind,setKind] = useState<BookingKind>('rental');
  const [price,setPrice] = useState<Price>();
  const [error,setError] = useState<string>();
  const [pending,setPending] = useState(false);
  const busy = useRef(false);
  const rental = kind==='rental';
  const peopleMissing = !rental && (!coaches.length || (kind==='private' && !students.length));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || peopleMissing) return;
    const fields = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value,key) => fields.append(key,String(value)));
    if (price) {
      fields.set('amount',price.amount);
      fields.set('currency',price.currency);
    }
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(price ? '/api/booking-create' : '/api/booking-quote',{
        method:'POST',headers:{Accept:'application/json'},body:fields,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(errorMessage(result.error ?? 'unavailable'));
        if (result.error==='booking-price-changed' || result.error==='booking-no-rate' || result.error==='booking-duration') setPrice(undefined);
      } else if (price && typeof result.next==='string' && result.next.startsWith('/club/')) {
        location.assign(result.next);
      } else if (!price && result.price) {
        setPrice(result.price);
      } else setError(errorMessage('unavailable'));
    } catch {
      setError(errorMessage('unavailable'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <form className="local-form calendar-booking-form" action="/api/booking-create" method="post" onSubmit={submit}
    onChange={() => { setPrice(undefined); setError(undefined); }}>
    <input type="hidden" name="org" value={org} /><input type="hidden" name="branch" value={branch} />
    <input type="hidden" name="request" value={request} />
    <fieldset className="resource-form-grid calendar-inputs" disabled={pending}>
      <label className="field"><span>زمین</span><select name="court" defaultValue={court} required>
        {courts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.surface}</option>)}
      </select></label>
      <label className="field"><span>نوع سانس</span><select name="kind" value={kind} onChange={event => setKind(event.currentTarget.value as BookingKind)}>
        {Object.entries(bookingKinds).map(([id,name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label className="field"><span>شروع به وقت شعبه</span><input type="datetime-local" name="start" min={minStart} dir="ltr" defaultValue={start} required /></label>
      <label className="field"><span>مدت به دقیقه</span><input inputMode="numeric" dir="ltr" name="minutes" defaultValue="60" maxLength={4} required /></label>
      {rental ? <label className="field resource-full"><span>نام رزروکننده</span><input name="booker" maxLength={120} required /></label> : <>
        <label className="field"><span>مربی</span><select name="coach" required>
          <option value="">انتخاب مربی</option>{coaches.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
        <label className="field"><span>شاگرد{kind==='group'?' (اختیاری)':''}</span><select name="student" required={kind==='private'}>
          <option value="">انتخاب شاگرد</option>{students.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
        {kind==='group' && <label className="field"><span>ظرفیت کلاس</span><input name="capacity" inputMode="numeric" dir="ltr" defaultValue="6" maxLength={3} required /></label>}
      </>}
    </fieldset>
    {peopleMissing && <p className="local-notice">برای این نوع سانس، پروندهٔ فعال مربی و در تمرین خصوصی پروندهٔ فعال شاگرد را در همین شعبه ثبت کنید.</p>}
    {price && <div className="calendar-quote" role="status"><span>مبلغ سانس</span><strong>{displayPrice(price.amount,price.currency)}</strong></div>}
    {error && <p className="local-notice error" role="alert">{error}</p>}
    <button className="button primary" disabled={pending || peopleMissing}>
      {pending ? 'در حال بررسی…' : price ? 'تأیید و ثبت سانس' : 'بررسی مبلغ سانس'}
    </button>
  </form>;
}
