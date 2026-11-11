import {
  addDays,attendanceLabels,classRoster,closing,coaches,courts,kinds,monthDays,number,opening,seedBookings,
  shortDate,statuses,students,time,today,weekStart,weekday,
} from './model.mjs';

const root=document.querySelector('#report-preview');
const central='شعبهٔ مرکزی';
const park='شعبهٔ پارک';
const branches=[central,park];
const scopes={club:'مجموعه',court:'زمین',coach:'مربی',student:'شاگرد'};
const periods={day:'روزانه',week:'هفتگی',month:'ماهانه',year:'سالانه',custom:'دلخواه'};
const people={court:courts,coach:coaches,student:students};
const persianYear=new Intl.DateTimeFormat('en-u-ca-persian',{year:'numeric',timeZone:'UTC'});
const yearOf=day=>persianYear.format(new Date(day+'T00:00:00Z'));
const faDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
const date=day=>faDate.format(new Date(day+'T00:00:00Z'));
const label=range=>`${date(range.start)} تا ${date(addDays(range.end,-1))}`;
const escape=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=amount=>`${number(amount)} ریال`;
const hours=minutes=>`${new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(minutes/60)} ساعت`;
const percent=(numerator,denominator)=>denominator?new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:1}).format(numerator/denominator):'—';
const named=(kind,id)=>people[kind]?.find(item=>item.id===id)?.name??'—';

function sampleBookings() {
  const rows=seedBookings.map(row=>({...row,branch:central}));
  const templates=seedBookings.filter(row=>row.status==='completed');
  for (const offset of [1,2,4,5,8,11,14,17,24,28,35]) {
    templates.filter((_,index)=>(index+offset)%4!==0).forEach((row,index)=>{
      const student=row.student;
      const outcome=(index+offset)%5===0?'absent':(index+offset)%3===0?'late':'present';
      rows.push({...row,id:`sample-${offset}-${index}`,date:addDays(today,-offset),branch:offset%3===2?park:central,
        status:offset%7===0&&index===2?'cancelled':'completed',attendance:student?{[student]:outcome}:undefined});
    });
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
}
const bookings=sampleBookings();
const cash=bookings.filter(row=>row.status==='completed').map(row=>({
  id:row.id+'-payment',booking:row,day:row.date,type:'دریافت',amount:row.duration*(row.kind==='rental'?22000:31000),
}));
const returned=cash.find(row=>row.booking.kind==='private');
cash.push({...returned,id:returned.id+'-refund',day:addDays(returned.day,10),type:'بازپرداخت',amount:-300000});
const expenses=[{branch:central,day:addDays(today,-2),amount:1250000},{branch:park,day:addDays(today,-5),amount:900000}];
const profileJoins=students.map((row,index)=>({id:row.id,day:addDays(today,-(index*9+1)),branch:index===2?park:central}));
const state={scope:'club',branch:'',entity:'',period:'week',anchor:today,from:today,to:today,compare:true,detail:'bookings'};
const inRange=(day,range)=>day>=range.start&&day<range.end;

function preset(period,anchor) {
  if (period==='day') return {start:anchor,end:addDays(anchor,1)};
  if (period==='week') return {start:weekStart(anchor),end:addDays(weekStart(anchor),7)};
  if (period==='month') {
    const days=monthDays(anchor);
    return {start:days[0],end:addDays(days.at(-1),1)};
  }
  const year=yearOf(anchor);
  let start=monthDays(anchor)[0];
  while (yearOf(addDays(start,-1))===year) start=monthDays(addDays(start,-1))[0];
  return {start,end:addDays(start,yearOf(addDays(start,365))===year?366:365)};
}
function ranges() {
  if (state.period!=='custom') {
    const range=preset(state.period,state.anchor);
    return [range,preset(state.period,addDays(range.start,-1))];
  }
  const days=(Date.parse(state.to)-Date.parse(state.from))/86400000+1;
  if (!(days>=1&&days<=366)) return [];
  return [{start:state.from,end:addDays(state.to,1)},{start:addDays(state.from,-days),end:state.from}];
}
function scoped(row) {
  return (!state.branch||row.branch===state.branch)&&(
    state.scope==='club'||state.scope==='court'&&row.court===state.entity||
    state.scope==='coach'&&row.coach===state.entity||state.scope==='student'&&classRoster(row).includes(state.entity));
}
function read(range) {
  const raw=bookings.filter(row=>inRange(row.date,range)&&scoped(row));
  const valid=raw.filter(row=>row.status!=='cancelled');
  const lessons=valid.filter(row=>row.kind!=='rental'&&row.status==='completed');
  const attendance=lessons.flatMap(row=>classRoster(row).filter(id=>state.scope!=='student'||id===state.entity)
    .map(id=>({row,id,outcome:row.attendance?.[id]})));
  const visited=attendance.filter(({outcome})=>outcome==='present'||outcome==='late');
  const active=new Set(visited.map(row=>row.id)).size;
  const expense=expenses.filter(row=>inRange(row.day,range)&&(!state.branch||row.branch===state.branch)).reduce((total,row)=>total+row.amount,0);
  const movements=cash.filter(entry=>inRange(entry.day,range)&&scoped(entry.booking));
  const net=movements.reduce((total,row)=>total+row.amount,0);
  const duration=valid.reduce((total,row)=>total+row.duration,0);
  const actual=lessons.reduce((total,row)=>total+(row.actualEnd-row.actualStart),0);
  const days=(Date.parse(range.end)-Date.parse(range.start))/86400000;
  const countCourts=state.scope==='court'?Number(courts.some(row=>row.id===state.entity&&row.active)):courts.filter(row=>row.active).length;
  const capacity=days*(state.branch?1:2)*countCourts*(closing-opening);
  const metrics={};
  const add=(name,value,table)=>{ metrics[name]={value,table}; };
  if (state.scope==='club'||state.scope==='court') {
    add('رزروهای معتبر',number(valid.length),'bookings');
    add('نرخ اشغال رزروشده',percent(duration,capacity),'capacity');
    add('زمان رزروشده',hours(duration),'bookings');
    add('استفادهٔ واقعی ثبت‌شده',hours(actual),'sessions');
    add('ظرفیت قابل استفاده',hours(capacity),'capacity');
  }
  add('جلسات برگزارشده',number(lessons.length),'sessions');
  add('نرخ حضور',percent(visited.length,attendance.length),'attendance');
  if (state.scope==='club'||state.scope==='coach') add('شاگردان فعال در تمرین',number(active),'attendance');
  if (state.scope==='club') add('پرونده‌های جدید شاگردان',number(profileJoins.filter(row=>inRange(row.day,range)&&(!state.branch||row.branch===state.branch)).length),'new-students');
  if (state.scope==='coach') add('زمان واقعی تدریس',hours(actual),'sessions');
  if (state.scope==='student'||state.scope==='coach') {
    add('حضور و تأخیر',number(visited.length),'attendance');
    add('غیبت ثبت‌شده',number(attendance.length-visited.length),'attendance');
  }
  const finance={ 'دریافتی خالص':{value:money(net),table:'money'} };
  if (state.scope==='club') finance['هزینه‌های ثبت‌شده']={value:money(expense),table:'money'};
  return {metrics,finance,valid,raw,lessons,attendance,movements,capacity,actual,duration,range};
}

function cards(metrics,previous) {
  return `<div class="report-cards">${Object.entries(metrics).map(([name,item])=>`
    <article class="report-metric"><span class="report-metric-label">${name}</span><strong>${item.value}</strong>
      <span class="report-comparison">${previous?.[name]?`قبل ${previous[name].value}`:''}</span>
      <a href="#report-detail" data-detail="${item.table}">ریز داده <span aria-hidden="true">↙</span></a>
    </article>`).join('')}</div>`;
}
function tableData(data) {
  const activityRow=row=>[date(row.date),row.branch,named('court',row.court),time(row.start),kinds[row.kind],statuses[row.status],number(row.duration)];
  return {
    bookings:{title:'رزروها',columns:['تاریخ','شعبه','زمین','شروع','نوع','وضعیت','دقیقه'],rows:data.raw.map(activityRow)},
    sessions:{title:'جلسات',columns:['تاریخ','شعبه','زمین','شروع','نوع','وضعیت','دقیقه'],rows:data.lessons.map(activityRow)},
    attendance:{title:'حضور و غیاب',columns:['تاریخ','شعبه','شاگرد','وضعیت'],rows:data.attendance.map(({row,id,outcome})=>[date(row.date),row.branch,named('student',id),attendanceLabels[outcome]??'ثبت‌نشده'])},
    capacity:{title:'ظرفیت و اشغال',columns:['دوره','دقیقهٔ قابل استفاده','دقیقهٔ رزروشده','دقیقهٔ واقعی'],
      rows:[[label(data.range),number(data.capacity),number(data.duration),number(data.actual)]]},
    'new-students':{title:'پرونده‌های جدید',columns:['تاریخ','شعبه','شاگرد'],
      rows:profileJoins.filter(row=>inRange(row.day,data.range)&&(!state.branch||row.branch===state.branch)).map(row=>[date(row.day),row.branch,named('student',row.id)])},
    money:{title:'گردش مالی',columns:['تاریخ مؤثر','شعبه','نوع','مبلغ'],rows:[
      ...data.movements.map(row=>[date(row.day),row.booking.branch,row.type,money(row.amount)]),
      ...(state.scope==='club'?expenses.filter(row=>inRange(row.day,data.range)&&(!state.branch||row.branch===state.branch))
        .map(row=>[date(row.day),row.branch,'هزینه',money(row.amount)]):[]),
    ]},
  };
}
function details(data) {
  const tables=tableData(data);
  const table=tables[state.detail];
  return `<section id="report-detail" class="panel report-panel report-detail">
    <h2>ریز داده و رکورد منبع</h2><nav class="report-table-tabs" aria-label="بخش‌های ریز داده">
      ${Object.entries(tables).filter(([id])=>!['capacity','new-students'].includes(id)||
        state.scope==='club'||id==='capacity'&&state.scope==='court').map(([id,item])=>`<a href="#report-detail" data-detail="${id}"
          ${id===state.detail?'aria-current="page"':''}>${item.title}</a>`).join('')}
    </nav><h3>${table.title}</h3>
    ${table.rows.length?`<div class="report-table-wrap" role="region" aria-label="${table.title}" tabindex="0">
      <table class="report-table"><thead><tr>${table.columns.map(cell=>`<th scope="col">${cell}</th>`).join('')}</tr></thead>
      <tbody>${table.rows.map(row=>`<tr>${row.map(cell=>`<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>`:'<p class="empty-state">رکوردی در این بخش و بازه وجود ندارد.</p>'}
    <button type="button" class="button subtle" data-action="csv">دریافت CSV این جدول</button>
  </section>`;
}
function charts(data) {
  const size=Math.max(1,Math.ceil((Date.parse(data.range.end)-Date.parse(data.range.start))/86400000/14));
  const bars=[];
  for (let start=data.range.start;start<data.range.end;start=addDays(start,size)) {
    bars.push({start,count:data.lessons.filter(row=>row.date>=start&&row.date<addDays(start,size)).length});
  }
  const maximum=Math.max(1,...bars.map(row=>row.count));
  const peak=new Map();
  for (const row of data.valid) {
    const name=weekday(row.date)+'، '+time(Math.floor(row.start/60)*60);
    peak.set(name,(peak.get(name)??0)+1);
  }
  const busiest=[...peak.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  const showPeak=busiest.length&&(state.scope==='club'||state.scope==='court');
  return `<div class="report-charts ${showPeak?'':'single'}"><section class="panel report-panel"><h2>روند برگزاری جلسات</h2>
    <p class="report-help">تعداد جلسات برگزارشده در بازه‌های ${number(size)} روزه</p>
    ${data.lessons.length?`<div class="report-trend" role="list" aria-label="تعداد جلسه‌ها در هر بازه">${bars.map(({start,count})=>`
      <div role="listitem"><span>${number(count)}</span><span class="report-bar" style="height:${count/maximum*100}%" aria-hidden="true"></span><small>${shortDate(start)}</small></div>`).join('')}</div>`
      :'<div class="empty-state">جلسهٔ برگزارشده‌ای در این بازه وجود ندارد.</div>'}
  </section>${showPeak?`<section class="panel report-panel"><h2>زمان‌های پرترافیک</h2><p class="report-help">ساعت شروع رزروهای معتبر</p>
    <ol class="report-peaks">${busiest.map(([name,count])=>`<li><span>${name}</span><meter value="${count}" max="${busiest[0][1]}" aria-label="${name}"></meter><strong>${number(count)}</strong></li>`).join('')}</ol></section>`:''}</div>`;
}
function options(items,selected) {
  return items.map(([value,title])=>`<option value="${escape(value)}" ${value===selected?'selected':''}>${escape(title)}</option>`).join('');
}
function dateFields(period,values=state) {
  return period==='custom'?`
    <label class="field"><span>از تاریخ</span><input type="date" name="from" dir="ltr" value="${escape(values.from||state.from)}" required></label>
    <label class="field"><span>تا تاریخ</span><input type="date" name="to" dir="ltr" value="${escape(values.to||state.to)}" required></label>`
    :`<label class="field"><span>تاریخ مرجع</span><input type="date" name="anchor" dir="ltr" value="${escape(values.anchor||state.anchor)}" required></label>`;
}

function render() {
  const [range,previousRange]=ranges();
  const data=range?read(range):null;
  const previous=data&&state.compare?read(previousRange):null;
  root.innerHTML=`<div class="report-page">
    <header class="report-hero"><div><p>باشگاه تنیس سام · دادهٔ ساختگی</p><h1>گزارش‌های باشگاه</h1>
      <div class="report-period"><strong>${state.scope==='club'?'مجموعه':named(state.scope,state.entity)}</strong>
        <span>${range?label(range):'بازهٔ نامعتبر'}</span></div>
      ${previous?`<p>دورهٔ قبل ${label(previousRange)}</p>`:''}
    </div>${data?'<div class="report-actions"><button class="button subtle" type="button" data-action="print">چاپ خلاصه / PDF</button></div>':''}</header>
    <nav class="report-scopes" aria-label="نوع گزارش">${Object.entries(scopes).map(([key,name])=>`
      <a href="#report-preview" data-scope="${key}" ${state.scope===key?'aria-current="page"':''}>${name}</a>`).join('')}</nav>
    <section class="panel report-filter-panel" aria-label="فیلتر گزارش"><form class="report-filters">
      <label class="field"><span>شعبه</span><select name="branch">${options([['','همهٔ شعبه‌ها'],...branches.map(name=>[name,name])],state.branch)}</select></label>
      ${state.scope!=='club'?`<label class="field"><span>پروندهٔ گزارش</span><select name="entity">${options(people[state.scope].map(row=>[row.id,row.name]),state.entity)}</select></label>`:''}
      <label class="field"><span>دوره</span><select name="period">${options(Object.entries(periods),state.period)}</select></label>
      <div class="report-date-fields">${dateFields(state.period)}</div>
      <label class="report-check"><input type="checkbox" name="compare" ${state.compare?'checked':''}> مقایسه با دورهٔ قبل</label>
      <button type="submit" class="button primary">اعمال فیلتر</button>
    </form><p class="report-help">هفته از شنبه شروع می‌شود. ماه و سال شمسی‌اند. تاریخ‌های گزارش با زمان محلی شعبه محاسبه شده‌اند.</p>
    ${range?'':'<p class="local-notice error" role="alert">ترتیب تاریخ‌ها را بررسی کنید. حداکثر طول بازه ۳۶۶ روز است.</p>'}</section>
    ${data?`<section class="report-section"><h2>عملکرد در بازه</h2>${cards(data.metrics,previous?.metrics)}</section>
      ${charts(data)}<section class="report-section"><h2>گردش مالی</h2>${cards(data.finance,previous?.finance)}</section>
      ${details(data)}`:''}
  </div>`;
}
root.addEventListener('change',event=>{
  if (event.target.name==='period') root.querySelector('.report-date-fields').innerHTML=dateFields(event.target.value);
});
root.addEventListener('submit',event=>{
  event.preventDefault();
  const values=Object.fromEntries(new FormData(event.target));
  Object.assign(state,values,{compare:values.compare==='on'});
  render();
  root.querySelector('button[type="submit"]')?.focus();
});
root.addEventListener('click',event=>{
  const target=event.target.closest('[data-scope],[data-detail],[data-action]');
  if (!target) return;
  if (target.dataset.scope) {
    state.scope=target.dataset.scope;
    state.entity=people[state.scope]?.[0].id??'';
    state.detail='bookings';
    render();
    root.querySelector(`[data-scope="${state.scope}"]`)?.focus();
  } else if (target.dataset.detail) {
    event.preventDefault();
    state.detail=target.dataset.detail;
    const section=root.querySelector('#report-detail');
    section.outerHTML=details(read(ranges()[0]));
    root.querySelector(`#report-detail [data-detail="${state.detail}"]`)?.focus();
    root.querySelector('#report-detail')?.scrollIntoView();
  } else if (target.dataset.action==='print') {
    window.print();
  } else if (target.dataset.action==='csv') {
    const table=tableData(read(ranges()[0]))[state.detail];
    const content=[table.columns,...table.rows].map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff',content],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='sam-preview-report.csv';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});
render();
