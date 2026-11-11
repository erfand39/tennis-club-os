export const resourceKinds = {
  courts: { db: 'court', title: 'زمین‌ها', label: 'زمین', search: 'نام یا نوع سطح' },
  coaches: { db: 'coach', title: 'مربیان', label: 'مربی', search: 'نام یا تخصص' },
  students: { db: 'student', title: 'شاگردان', label: 'شاگرد', search: 'نام یا سطح مهارت' },
} as const;
export type ResourceKind = keyof typeof resourceKinds;
export type ResourceStatus = keyof typeof resourceStatuses;
export const resourceStatuses = { active: 'فعال', inactive: 'غیرفعال', archived: 'آرشیوشده' } as const;
export const weekdays = [
  [6, 'شنبه'], [7, 'یکشنبه'], [1, 'دوشنبه'], [2, 'سه‌شنبه'], [3, 'چهارشنبه'], [4, 'پنجشنبه'], [5, 'جمعه'],
] as const;
export const bookingKinds = { rental: 'اجارهٔ زمین', private: 'تمرین خصوصی', group: 'کلاس گروهی' } as const;
export const bookingStatuses = { confirmed: 'تأییدشده', cancelled: 'لغوشده' } as const;
export const attendanceStatuses = { present: 'حاضر', late: 'با تأخیر', absent: 'غایب', excused: 'موجه' } as const;
export const resourceActions = { created: 'ثبت پرونده', edited: 'ویرایش پرونده', archived: 'آرشیو', hours: 'تغییر ساعات هفتگی', rate: 'ثبت تعرفه' } as const;

export const resourcePath = (org: string, kind: ResourceKind, id?: string) =>
  `/club/${org}/resources/${kind}${id ? `/${id}` : ''}`;
export const isResourceKind = (kind: string): kind is ResourceKind => Object.hasOwn(resourceKinds, kind);
export const faNumber = new Intl.NumberFormat('fa-IR');
export function asciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
}
export function minutesLabel(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function localDate(zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const { year, month, day } = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${year}-${month}-${day}`;
}
export function persianDate(value: string | Date, zone = 'Asia/Tehran', time = false): string {
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: dateOnly ? 'UTC' : zone, dateStyle: 'medium', ...(time ? { timeStyle: 'short' } : {}),
  }).format(dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value));
}
