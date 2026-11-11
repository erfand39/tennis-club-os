import { addDays, periodDates, validCalendarDate } from './calendar-dates';

export const reportPeriods = { day:'روزانه', week:'هفتگی', month:'ماهانه', year:'سالانه', custom:'دلخواه' } as const;
export const reportScopes = { club:'مجموعه', court:'زمین', coach:'مربی', student:'شاگرد' } as const;
export type ReportPeriod = keyof typeof reportPeriods;
export type ReportScope = keyof typeof reportScopes;
export type DateRange = { start:string; end:string };
const persianYear = new Intl.DateTimeFormat('en-u-ca-persian', { year:'numeric',timeZone:'UTC' });
const yearOf = (day:string) => persianYear.format(new Date(day+'T00:00:00Z'));
const daysBetween = (start:string,end:string) => (Date.parse(end)-Date.parse(start))/86400000;
export const maximumReportDays = 366;

function presetRange(anchor:string, period:Exclude<ReportPeriod,'custom'>):DateRange {
  if (period!=='year') return periodDates(anchor,period);
  const year=yearOf(anchor);
  let start=periodDates(anchor,'month').start;
  while (yearOf(addDays(start,-1))===year) start=periodDates(addDays(start,-1),'month').start;
  let end=addDays(start,365);
  if (yearOf(end)===year) end=addDays(end,1);
  return {start,end};
}

export function reportRange(period:ReportPeriod,anchor:string,from:string,to:string) {
  if (period!=='custom') {
    const current=presetRange(anchor,period);
    return {current,previous:presetRange(addDays(current.start,-1),period)};
  }
  if (!validCalendarDate(from) || !validCalendarDate(to) || from>to) return null;
  const end=addDays(to,1);
  const length=daysBetween(from,end);
  if (length>maximumReportDays) return null;
  return {current:{start:from,end},previous:{start:addDays(from,-length),end:from}};
}

export function reportPath(org:string,filters:Record<string,string|undefined>={},exportFile=false) {
  const query=new URLSearchParams();
  for (const [key,value] of Object.entries(filters)) if (value) query.set(key,value);
  return `/club/${org}/reports${exportFile?'/excel':''}${query.size?'?'+query:''}`;
}
