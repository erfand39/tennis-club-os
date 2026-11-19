import { addDays,calendarPath,numberFa,saturdayIndex,weekLabels } from './calendar-dates';
import { financePath } from './finance-fields';
import { currencyLabel,formatMinor } from './money';
import { type DateRange,type ReportScope } from './report-dates';
import { bookingKinds,persianDate } from './resource-fields';
import { type ReportData } from './reports';

export type Measure = 'count'|'minutes'|'rate'|'money';
export type Metric = {key:string;label:string;value:number|bigint|null;measure:Measure;currency?:string;definition:string;detail:string};
export type ReportCell = string|number|bigint|{value:string;href:string};
export type ReportTable = {id:string;title:string;columns:string[];rows:ReportCell[][]};
export const cellValue = (cell:ReportCell) => typeof cell==='object'?cell.value:cell;
const durationFormat = new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const percentFormat = new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:1});
const faDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
export const reportDate=(day:string)=>faDate.format(new Date(day+'T00:00:00Z'));
export const displayRange=(range:DateRange)=>`${reportDate(range.start)} تا ${reportDate(addDays(range.end,-1))}`;
const attendanceLabels={present:'حاضر',late:'با تأخیر',absent:'غایب',excused:'غیبت موجه'};
const bookingStatus={confirmed:'معتبر',cancelled:'لغوشده'};
const sessionStatus={scheduled:'برنامه‌ریزی‌شده',completed:'برگزارشده',cancelled:'لغوشده'};
const moneyKind={receipt:'دریافت',refund:'بازپرداخت',balance:'ماندهٔ فاکتور',expense:'هزینه',wage:'پرداخت یا تعدیل دستمزد',wage_due:'دستمزد تسویه‌نشده'};
const allocations={booking:'رزرو',package:'بستهٔ آموزشی',unallocated:'تخصیص‌نیافته'};
const visit = (status:string|null) => status==='present'||status==='late';
const ratio=(numerator:number,denominator:number)=>denominator?numerator/denominator:null;
const hour=(minutes:number)=>`${durationFormat.format(minutes/60)} ساعت`;

export function displayMetric(item:Metric) {
  if (item.value===null) return '—';
  switch (item.measure) {
    case 'money': return formatMinor(BigInt(item.value),item.currency!);
    case 'minutes': return hour(Number(item.value));
    case 'rate': return percentFormat.format(Number(item.value));
    default: return numberFa.format(item.value);
  }
}

export function metricDifference(current:Metric,previous:Metric) {
  if (current.value===null || previous.value===null) return null;
  const difference=typeof current.value==='bigint'
    ? current.value-BigInt(previous.value)
    : current.value-Number(previous.value);
  if (current.measure==='rate') return `${difference>0?'+':''}${durationFormat.format(Number(difference)*100)} واحد درصد`;
  return (difference>0?'+':'')+displayMetric({...current,value:difference});
}

export function summarizeReport(data:ReportData,scope:ReportScope) {
  const metrics:Metric[]=[];
  const put=(key:string,label:string,value:Metric['value'],measure:Measure,detail:string,definition:string,currency?:string) =>
    metrics.push({key,label,value,measure,detail,definition,currency});
  const booked=data.bookings.filter(row=>row.status==='confirmed');
  const completed=data.sessions.filter(row=>row.completed);
  const attendance=data.people.filter(row=>visit(row.status));
  const active=new Set(attendance.map(row=>row.student_id)).size;
  const sum=(key:'available'|'blocked'|'inactive'|'occupied'|'actual')=>data.capacity.reduce((total,row)=>total+row[key],0);
  if (scope==='club'||scope==='court') {
    const available=sum('available'),actual=sum('actual');
    put('bookings','رزروهای معتبر',booked.filter(row=>row.starts_in_period).length,'count','bookings','رزروهای لغونشده با شروع در بازه.');
    put('occupancy','نرخ اشغال رزروشده',ratio(sum('occupied'),available),'rate','capacity','دقایق رزرو معتبر در ساعات قابل استفاده، تقسیم بر دقایق قابل استفاده.');
    put('booked','زمان رزروشده',booked.reduce((total,row)=>total+row.minutes,0),'minutes','bookings','مجموع زمان رزروهای معتبر پس از برش در مرز بازه.');
    put('actual','استفادهٔ واقعی ثبت‌شده',actual,'minutes','sessions','اجتماع زمان واقعی جلسات آموزشی برگزارشده در هر زمین. اجاره‌ها زمان واقعی ثبت‌شده ندارند.');
    put('actual_rate','نسبت استفادهٔ آموزشی به ظرفیت',ratio(actual,available),'rate','capacity','زمان واقعی ثبت‌شده تقسیم بر زمان قابل استفاده.');
    put('available','ظرفیت قابل استفاده',available,'minutes','capacity','ساعات کاری مؤثر زمین پس از کسر زمان غیرفعال و اجتماع تعطیلی و تعمیرات.');
    put('blocked','تعطیلی و تعمیرات',sum('blocked'),'minutes','capacity','زمان مشترک ساعات کاری فعال با اجتماع انسدادهای معتبر.');
    put('inactive','خارج از بهره‌برداری',sum('inactive'),'minutes','capacity','ساعات کاری ثبت‌شده در زمانی که زمین فعال نبوده است.');
  }
  put('completed','جلسات برگزارشده',completed.length,'count','sessions','جلسات یکتا با شروع واقعی در بازه و وضعیت برگزارشده.');
  put('planned','جلسات برنامه‌ریزی‌شده در بازه',data.sessions.filter(row=>row.planned&&row.status!=='cancelled').length,'count','sessions','جلسات معتبر با شروع برنامه‌ای در بازه، شامل جلسات برگزارشده.');
  put('cancelled','جلسات لغوشده',data.sessions.filter(row=>row.planned&&row.status==='cancelled').length,'count','sessions','جلسات لغوشده با شروع برنامه‌ای در بازه.');
  if (scope==='club'||scope==='coach') put('active','شاگردان فعال در تمرین',active,'count','attendance','تعداد شاگردان یکتا با حضور یا تأخیر ثبت‌شده در جلسهٔ برگزارشده.');
  if (scope==='club') put('new','پرونده‌های جدید شاگردان',new Set(data.new_students.map(row=>row.id)).size,'count','new-students','تعداد پرونده‌های یکتا بر مبنای زمان ثبت در سامانه و عضویت در شعبه‌های انتخاب‌شده.');
  put('attendance','نرخ حضور',ratio(attendance.length,data.people.length),'rate','attendance','حاضر یا با تأخیر تقسیم بر ثبت‌نام‌های معتبر در جلسات برگزارشده.');
  if (scope==='student'||scope==='coach') {
    put('present','حضور و تأخیر',attendance.length,'count','attendance','تعداد حضور یا تأخیر ثبت‌شده.');
    put('absent','غیبت ثبت‌شده',data.people.filter(row=>row.status==='absent'||row.status==='excused').length,'count','attendance','تعداد غیبت‌ها شامل غیبت موجه.');
  }
  if (scope==='student') {
    const bySession=new Map(completed.map(row=>[row.id,row.actual_day!]));
    const days=new Set(attendance.map(row=>bySession.get(row.session_id)!).filter(Boolean));
    put('days','روزهای تمرین',days.size,'count','attendance','تعداد روزهای محلی یکتا با حضور ثبت‌شده.');
    put('weeks','هفته‌های دارای تمرین',new Set([...days].map(day=>addDays(day,-saturdayIndex(day)))).size,'count','attendance','تعداد هفته‌های شنبه‌محور یکتا با حضور ثبت‌شده.');
  }
  if (data.coachTime) {
    put('teaching','زمان واقعی تدریس',data.coachTime.actual,'minutes','coach-time','اجتماع زمان واقعی جلسات مربی در بازه، حتی در چند شعبه.');
    put('working','ظرفیت کاری مربی',data.coachTime.available,'minutes','coach-time','اجتماع ساعات کاری مؤثر مربی پس از کسر تعطیلی شعبه‌ها.');
    put('coach-use','استفاده از ظرفیت کاری',ratio(data.coachTime.occupied,data.coachTime.available),'rate','coach-time','اشتراک زمان واقعی تدریس با ظرفیت کاری، تقسیم بر ظرفیت کاری.');
  }
  return metrics;
}

export function moneyMetrics(data:ReportData,scope:ReportScope,currencies:string[]) {
  const totals=new Map(currencies.map(currency=>[currency,{receipt:0n,refund:0n,balance:0n,expense:0n,wage:0n,wage_due:0n,unallocated:0n}]));
  for (const entry of data.money) {
    const group=totals.get(entry.currency)!;
    const amount=BigInt(entry.amount);
    group[entry.kind]+=amount;
    if (entry.allocation==='unallocated' && (entry.kind==='receipt'||entry.kind==='refund')) group.unallocated+=amount;
  }
  return [...totals].flatMap(([currency,total])=>{
    const metrics:Metric[]=[];
    const add=(key:string,label:string,value:bigint,definition:string)=>metrics.push({key:key+currency,label,value,definition,measure:'money',currency,detail:'money'});
    add('net',scope==='club'?'دریافتی خالص':'دریافتی خالص منتسب',total.receipt+total.refund,'دریافت‌های قطعی منهای بازپرداخت‌ها در تاریخ مؤثر هر حرکت.');
    add('due','ماندهٔ فاکتور در پایان دوره',total.balance,'ماندهٔ صورت‌حساب‌های معتبر پس از دریافت و بازپرداخت تا قبل از مرز پایان دوره.');
    if (scope==='club') {
      add('expense','هزینه‌های ثبت‌شده',total.expense,'هزینه‌های ابطال‌نشده در تاریخ مؤثر ثبت‌شده.');
      add('unallocated','دریافتی تخصیص‌نیافته',total.unallocated,'خالص حرکات فاکتورهایی که یک قلم منبع مشخص ندارند.');
    }
    if (scope==='club'||scope==='coach') {
      add('wage',scope==='coach'?'دستمزد پرداخت‌شدهٔ مربی':'پرداخت خالص مربیان',total.wage,'پرداخت دستمزد و تعدیل در تاریخ مؤثر هر عملیات.');
      add('wage-due','دستمزد مصوب تسویه‌نشده',total.wage_due,'دستمزد مصوب تا پایان دوره که تا همان زمان پرداخت نشده است.');
    }
    return metrics;
  });
}

export function reportTables(data:ReportData,org:string):ReportTable[] {
  const sessionNames=new Map(data.sessions.map(item=>[item.id,item]));
  const sessionLink=(id:string,value:string)=>({value,href:`/club/${org}/classes/${id}`});
  const tables:ReportTable[]=[
    {id:'bookings',title:'رزروها',columns:['تاریخ شروع','ساعت شروع','شعبه','زمین','نوع','وضعیت','شروع در دوره','دقیقه در دوره','شناسهٔ رزرو'],
      rows:data.bookings.map(row=>[row.day,row.time,row.branch,row.court,bookingKinds[row.kind],bookingStatus[row.status],
        row.starts_in_period?'بله':'خیر',row.minutes,{value:row.id,href:calendarPath(org,{booking:row.id})}])},
    {id:'sessions',title:'جلسات و زمان واقعی',columns:['شعبه','زمین','مربی','تاریخ برنامه','تاریخ برگزاری','وضعیت','دقیقهٔ واقعی در دوره','شناسهٔ جلسه'],
      rows:data.sessions.map(row=>[row.branch,row.court,row.coach??'—',row.planned_day,row.actual_day??'—',sessionStatus[row.status],
        row.minutes,sessionLink(row.id,row.id)])},
    {id:'attendance',title:'حضور و غیاب',columns:['شاگرد','تاریخ برگزاری','شعبه','وضعیت','شناسهٔ ثبت‌نام','شناسهٔ جلسه'],
      rows:data.people.map(row=>[row.student??row.student_id,sessionNames.get(row.session_id)?.actual_day??'—',
        sessionNames.get(row.session_id)?.branch??'—',row.status?attendanceLabels[row.status]:'ثبت‌نشده',row.id,sessionLink(row.session_id,row.session_id)])},
    {id:'new-students',title:'پرونده‌های جدید',columns:['تاریخ ثبت','شاگرد','شناسهٔ پرونده'],
      rows:Array.from(new Map(data.new_students.map(row=>[row.id,row])).values()).map(row=>[row.day,row.name,row.id])},
    {id:'capacity',title:'ریز ظرفیت و اشغال زمین',columns:['تاریخ','شعبه','زمین','دقیقهٔ قابل استفاده','دقیقهٔ اشغال معتبر','دقیقهٔ واقعی آموزشی','دقیقهٔ مسدود','دقیقهٔ غیرفعال'],
      rows:data.capacity.map(row=>[row.day,row.branch,row.court,row.available,row.occupied,row.actual,row.blocked,row.inactive])},
    {id:'blocks',title:'تعطیلی و تعمیرات',columns:['نوع انسداد','شعبه','زمین','علت','شروع در بازه','پایان در بازه','شناسهٔ انسداد'],
      rows:data.blocks.map(row=>[row.kind==='closure'?'تعطیلی شعبه':'تعمیرات زمین',row.branch,row.court??'همهٔ زمین‌ها',row.reason,row.starts,row.ends,row.id])},
    {id:'money',title:'ریز گردش و ماندهٔ مالی',columns:['تاریخ مؤثر','شعبه','نوع','مبلغ در واحد پایه','واحد','منبع','تخصیص','شناسهٔ ثبت'],
      rows:data.money.map(row=>[row.day,row.branch,moneyKind[row.kind],BigInt(row.amount),currencyLabel(row.currency),
        row.source_id?(row.kind==='wage'||row.kind==='wage_due'?sessionLink(row.source_id,row.source_id)
          :{value:row.reference??row.source_id,href:financePath(org,row.source_id)}):row.reference??'—',
        row.allocation?allocations[row.allocation]:'—',row.id])},
  ];
  if (data.coachTime) {
    const labels={available:'ظرفیت کاری',actual:'زمان واقعی تدریس',occupied:'تدریس در ساعات کاری'};
    tables.push({id:'coach-time',title:'ریز ظرفیت کاری مربی',columns:['نوع','شروع (UTC)','پایان (UTC)','دقیقه'],
      rows:data.coachTime.spans.map(row=>[labels[row.kind],row.start,row.end,row.minutes])});
  }
  if (data.student) {
    tables.push({id:'levels',title:'تغییر سطح ثبت‌شده',columns:['زمان ثبت (UTC)','سطح قبلی','سطح جدید','شناسهٔ تغییر'],
      rows:data.student.changes.map(row=>[row.effective_at,row.previous_level??'—',row.current_level??'—',row.id])});
    tables.push({id:'packages',title:'بسته‌ها و اعتبار',columns:['بسته','شعبه','شروع اعتبار','پایان اعتبار','وضعیت فعلی','مصرف تا پایان دوره','ماندهٔ جلسه','شناسهٔ بسته'],
      rows:data.student.packages.map(row=>[row.title,row.branch,row.valid_from,row.valid_until,
        row.status==='active'?'فعال':row.status==='cancelled'?'لغوشده':'متوقف',row.used,row.sessions===null?'نامحدود':row.sessions-row.used,row.id])});
  }
  return tables;
}

export function activityTrend(data:ReportData) {
  const size=Math.max(1,Math.ceil((Date.parse(data.range.end)-Date.parse(data.range.start))/86400000/16));
  const bars:{day:string;count:number}[]=[];
  const completions=new Map<string,number>();
  for (const row of data.sessions) if (row.completed&&row.actual_day)
    completions.set(row.actual_day,(completions.get(row.actual_day)??0)+1);
  for (let day=data.range.start;day<data.range.end;day=addDays(day,size)) {
    let count=0;
    for (let index=0;index<size;index++) count+=completions.get(addDays(day,index))??0;
    bars.push({day,count});
  }
  return {bars,size};
}

export function busiestStarts(data:ReportData) {
  const counts=new Map<string,{weekday:number;hour:string;count:number}>();
  for (const row of data.bookings) {
    if (row.status!=='confirmed'||!row.starts_in_period) continue;
    const weekday=saturdayIndex(row.day),hour=row.time.slice(0,2);
    const key=weekday+hour;
    const cell=counts.get(key)??{weekday,hour,count:0};
    cell.count++;
    counts.set(key,cell);
  }
  return [...counts.values()].sort((a,b)=>b.count-a.count||a.weekday-b.weekday||a.hour.localeCompare(b.hour))
    .map(item=>({...item,label:`${weekLabels[item.weekday]}، ${numberFa.format(Number(item.hour))} تا ${numberFa.format(Number(item.hour)+1)}`}));
}

export const lastVisit=(data:ReportData)=>data.student?.last_at?persianDate(data.student.last_at,data.student.last_timezone??'Asia/Tehran',true):'—';
