import { asciiDigits } from './resource-fields';

export const calendarViews = { day: 'روزانه', week: 'هفتگی', month: 'ماهانه' } as const;
export type CalendarView = keyof typeof calendarViews;
const persianDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', weekday:'long', day:'numeric', month:'long', year:'numeric' });
const persianMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', year: 'numeric', month: 'long' });
const persianDay = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', day: 'numeric' });
const weekDay = new Intl.DateTimeFormat('fa-IR', { timeZone: 'UTC', weekday: 'short' });
export const numberFa = new Intl.NumberFormat('fa-IR');
export const weekLabels = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];

const fromDate = (day: string) => new Date(day + 'T00:00:00Z');
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0002-01-01' || value > '9998-12-31') return false;
  const date = fromDate(value);
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === value;
}
export function addDays(day: string, step: number) {
  const date = fromDate(day);
  date.setUTCDate(date.getUTCDate() + step);
  return date.toISOString().slice(0,10);
}
export function saturdayIndex(day: string) {
  return (fromDate(day).getUTCDay() + 1) % 7;
}
function parts(formatter: Intl.DateTimeFormat,date: string) {
  return Object.fromEntries(formatter.formatToParts(fromDate(date)).map(part => [part.type,part.value]));
}
export function longDay(date: string) {
  const { weekday,day,month,year } = parts(persianDate,date);
  return `${weekday}، ${day} ${month} ${year}`;
}
export function monthName(date: string) {
  const { month,year } = parts(persianMonth,date);
  return `${month} ${year}`;
}
export const dayNumber = (date: string) => parts(persianDay,date).day;
export const shortWeekday = (date: string) => weekDay.format(fromDate(date));

export function periodDates(date: string, view: CalendarView) {
  let start = view === 'week' ? addDays(date,-saturdayIndex(date)) : date;
  if (view === 'month') {
    const month = monthName(date);
    while (monthName(addDays(start,-1)) === month) start = addDays(start,-1);
  }
  const days = [start];
  const count = view === 'week' ? 7 : view === 'month' ? 31 : 1;
  for (let index=1; index<count; index++) {
    const next = addDays(start,index);
    if (view === 'month' && monthName(next) !== monthName(date)) break;
    days.push(next);
  }
  const end = addDays(days[days.length-1],1);
  return { days,start,end,previous:addDays(start,-1),next:end };
}

export function branchDateTime(timezone: string, time = new Date()) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit' }).format(time);
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone:timezone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(time);
  return { date, hour, input: `${date}T${hour}` };
}
export function calendarDateTime(value: string): string | null {
  const normalized = asciiDigits(value.trim());
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d$/.exec(normalized);
  return match && validCalendarDate(match[1]) ? normalized : null;
}
export function calendarPath(org: string, options: { booking?: string; branch?: string; court?: string; date?: string; view?: CalendarView; start?: string; page?: number } = {}) {
  const { booking,...filters } = options;
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(filters)) if (value) query.set(key,String(value));
  return `/club/${org}/calendar${booking ? '/'+booking : ''}${query.size ? '?'+query.toString() : ''}`;
}
