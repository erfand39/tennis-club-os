/**
 * Pure Jalali (Persian Shamsi) <-> Gregorian calendar conversion helpers.
 * No server-only or path-alias imports so Node unit tests can import directly.
 */

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند',
] as const;

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function gregorianToJalali(dateStr: string): JalaliDate {
  const candidate = dateStr.slice(0, 10);
  const d = ISO_DATE_RE.test(candidate) ? new Date(`${candidate}T12:00:00Z`) : new Date(NaN);
  const valid = Number.isFinite(d.getTime()) ? d : new Date();
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(valid);

  const y = parts.find(p => p.type === 'year')?.value ?? '1404';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const day = parts.find(p => p.type === 'day')?.value ?? '01';

  return {
    year: parseInt(y, 10),
    month: parseInt(m, 10),
    day: parseInt(day, 10),
  };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy: number;
  let remYear = jy;
  if (remYear > 979) {
    gy = 1600;
    remYear -= 979;
  } else {
    gy = 621;
  }
  let days =
    365 * remYear +
    Math.floor(remYear / 33) * 8 +
    Math.floor(((remYear % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const salA = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm: number;
  for (gm = 0; gm < 13 && gd > salA[gm]; gm++) gd -= salA[gm];
  return { gy, gm, gd };
}

export function toIsoDate(gy: number, gm: number, gd: number): string {
  const m = String(gm).padStart(2, '0');
  const d = String(gd).padStart(2, '0');
  return `${gy}-${m}-${d}`;
}

export function getJalaliMonthDays(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  if (jm === 12) {
    const { gy, gm, gd } = jalaliToGregorian(jy, 12, 30);
    const roundTrip = gregorianToJalali(toIsoDate(gy, gm, gd));
    return roundTrip.year === jy && roundTrip.month === 12 && roundTrip.day === 30 ? 30 : 29;
  }
  return 30;
}

export function formatToPersianDigits(n: number | string): string {
  const f = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/[0-9]/g, d => f[+d]);
}

export function clampIsoDate(iso: string, min?: string, max?: string): string {
  const minDate = min ? min.slice(0, 10) : '';
  const maxDate = max ? max.slice(0, 10) : '';
  let next = iso.slice(0, 10);
  if (ISO_DATE_RE.test(minDate) && next < minDate) next = minDate;
  if (ISO_DATE_RE.test(maxDate) && next > maxDate) next = maxDate;
  return next;
}
