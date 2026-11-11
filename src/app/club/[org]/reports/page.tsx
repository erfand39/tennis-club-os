import Link from 'next/link';
import { numberFa } from '@/lib/calendar-dates';
import { reportPath,reportScopes,reportPeriods } from '@/lib/report-dates';
import {
  activityTrend,busiestStarts,cellValue,displayMetric,displayRange,lastVisit,metricDifference,moneyMetrics,
  reportDate,reportTables,summarizeReport,type Metric,type ReportTable,
} from '@/lib/report-presentation';
import { getReportContext,loadReport } from '@/lib/reports';
import { PrintReport,ReportFilters } from './controls';

const pageSize=40;

function Cards({items,previous,detailLink}:{items:Metric[];previous:Metric[];detailLink:(id:string)=>string}) {
  const lookup=new Map(previous.map(item=>[item.key,item]));
  return <div className="report-cards">{items.map(item=>{
    const earlier=lookup.get(item.key);
    const change=earlier?metricDifference(item,earlier):null;
    return <article className="report-metric" key={item.key}>
      <span className="report-metric-label">{item.label}</span>
      <strong>{displayMetric(item)}</strong>
      <span className="report-comparison">{earlier?<>قبل {displayMetric(earlier)}{change&&<> <bdi>({change})</bdi></>}</>:item.value===null?'مخرج در این بازه صفر است.':null}</span>
      <Link prefetch={false} href={detailLink(item.detail)} title={item.definition} aria-label={`ریز دادهٔ ${item.label}`}>ریز داده <span aria-hidden="true">↙</span></Link>
    </article>;
  })}</div>;
}

function Details({table,page,link}:{table:ReportTable;page:number;link:(id:string,page?:number)=>string}) {
  const pages=Math.max(1,Math.ceil(table.rows.length/pageSize));
  const selectedPage=Math.min(page,pages);
  const rows=table.rows.slice((selectedPage-1)*pageSize,selectedPage*pageSize);
  return <>
    <h3>{table.title}</h3>
    {rows.length>0?<div className="report-table-wrap" tabIndex={0} role="region" aria-label={table.title}>
      <table className="report-table">
        <thead><tr>{table.columns.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column}>
          {typeof cell==='object'?<Link href={cell.href} title={cell.value}>
            {cell.value.length>24?<bdi dir="ltr">{cell.value.slice(0,8)}…</bdi>:cell.value}
          </Link>:cellValue(cell)}
        </td>)}</tr>)}</tbody>
      </table>
    </div>:<div className="empty-state">رکوردی در این بخش و بازه وجود ندارد.</div>}
    {pages>1&&<nav className="resource-pagination" aria-label="صفحه‌های ریز گزارش">
      {selectedPage>1&&<Link className="button subtle" href={link(table.id,selectedPage-1)}>قبلی</Link>}
      <span>{numberFa.format(selectedPage)} از {numberFa.format(pages)} صفحه</span>
      {selectedPage<pages&&<Link className="button subtle" href={link(table.id,selectedPage+1)}>بعدی</Link>}
    </nav>}
  </>;
}

export default async function ReportsPage({params,searchParams}:{
  params:Promise<{org:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>;
}) {
  const [{org},query]=await Promise.all([params,searchParams]);
  const context=await getReportContext(org,query);
  const {entities,entity,current,previous}=await loadReport(context);
  const {club,period,scope,filters,range,allBranches,selectedBranches,reference}=context;
  const metrics=current?summarizeReport(current,scope):[];
  const previousMetrics=previous?summarizeReport(previous,scope):[];
  const currencies=[...new Set([...current?.money??[],...previous?.money??[]].map(item=>item.currency))].sort();
  const financial=current?moneyMetrics(current,scope,currencies):[];
  const previousFinancial=previous?moneyMetrics(previous,scope,currencies):[];
  const tables=current?reportTables(current,org).filter(table=>scope==='club'||
    (table.id!=='new-students'&&(scope==='court'||!['capacity','blocks'].includes(table.id)))):[];
  const requestedTable=tables.find(table=>table.id===query.detail);
  const activeTable=requestedTable??tables.find(table=>table.id==='sessions');
  const detailLink=(id:string,page?:number)=>reportPath(org,{...filters,detail:id,page:page?String(page):undefined})+`#${id==='definitions'?'definitions':'report-detail'}`;
  const page=typeof query.page==='string'&&/^\d{1,6}$/.test(query.page)?Math.max(1,Number(query.page)):1;
  const trend=current?activityTrend(current):null;
  const peak=current&&(scope==='club'||scope==='court')?busiestStarts(current).slice(0,7):[];
  const trendMax=Math.max(1,...trend?.bars.map(item=>item.count)??[]);
  const noRecords=current&&![current.bookings,current.sessions,current.money,current.capacity,current.blocks,
    current.new_students,current.student?.packages??[],current.student?.changes??[]].some(rows=>rows.length);
  return <div className="report-page">
    <header className="report-hero">
      <div><p>{club.name} · {reportPeriods[period]} · {reference&&selectedBranches.length===1?reference.name:'همهٔ شعبه‌های مجاز'}</p><h1>گزارش‌های باشگاه</h1>
        <div className="report-period"><strong>{entity?.name??reportScopes[scope]}</strong>
          <span>{range?displayRange(range.current):'بازهٔ نامعتبر'}</span></div>
        {previous&&<p>دورهٔ قبل {displayRange(previous.range)}</p>}
      </div>
      {current&&<div className="report-actions">
        <a className="button primary" href={reportPath(org,filters,true)}>دریافت Excel</a>
        <PrintReport />
      </div>}
    </header>

    <nav className="report-scopes" aria-label="نوع گزارش">{Object.entries(reportScopes).map(([key,label])=>
      <Link key={key} href={reportPath(org,{...filters,scope:key,entity:undefined})} aria-current={scope===key?'page':undefined}>{label}</Link>
    )}</nav>
    <section className="panel report-filter-panel" aria-label="فیلتر گزارش">
      <ReportFilters key={JSON.stringify(filters)} filters={filters} branches={allBranches} entities={entities} scopeLabel={scope} />
      <p className="report-help">
        هفته از شنبه شروع می‌شود. ماه و سال شمسی‌اند. ورودی تاریخ میلادی است و بازه با تاریخ محلی هر شعبه محاسبه می‌شود.
        {selectedBranches.length===1&&<> <bdi dir="ltr">{reference?.timezone}</bdi></>}
      </p>
      {!range&&<p className="local-notice error" role="alert">ترتیب تاریخ‌ها و طول بازه را بررسی کنید. بازهٔ دلخواه حداکثر ۳۶۶ روز است.</p>}
    </section>

    {range&&!current&&<div className="panel report-panel empty-state">
      <strong>{!selectedBranches.length?'شعبه‌ای در دسترس نیست.':entities.some(item=>item.locations.some(location=>context.branchIds.includes(location)))?'یک پرونده را انتخاب و فیلتر را اعمال کنید.':'پرونده‌ای در شعبه‌های انتخاب‌شده وجود ندارد.'}</strong>
    </div>}
    {current&&<>
      {noRecords&&<p className="local-notice" role="status">داده‌ای برای بازهٔ انتخاب‌شده پیدا نشد.</p>}
      {current.student&&<section className="panel report-panel report-student" aria-label="وضعیت تمرین شاگرد">
        <div><span>سطح فعلی ثبت‌شده</span><strong>{current.student.skill_level??'—'}</strong></div>
        <div><span>آخرین مراجعه تا پایان دوره</span><strong>{lastVisit(current)}</strong></div>
        <div><span>بسته‌های ثبت‌شده تا پایان دوره</span><strong>{numberFa.format(current.student.packages.length)}</strong></div>
      </section>}
      <section className="report-section" aria-labelledby="report-activity-title">
        <h2 id="report-activity-title">عملکرد در بازه</h2>
        <Cards items={metrics} previous={previousMetrics} detailLink={detailLink}/>
      </section>
      <div className={peak.length?'report-charts':'report-charts single'}>
        {trend&&<section className="panel report-panel">
          <h2>روند برگزاری جلسات</h2>
          <p className="report-help">تعداد جلسات برگزارشده در بازه‌های {numberFa.format(trend.size)} روزه</p>
          {trend.bars.some(item=>item.count>0)?<div className="report-trend" role="list" aria-label="تعداد جلسات به تفکیک بازه">
            {trend.bars.map((item,index)=>{
              const next=trend.bars[index+1]?.day??current.range.end;
              const label=displayRange({start:item.day,end:next});
              return <div key={item.day} role="listitem" title={label}>
                <span>{numberFa.format(item.count)}</span>
                <span className="report-bar" style={{height:`${100*item.count/trendMax}%`}} aria-hidden="true" />
                <small aria-label={label}>{reportDate(item.day).split('/').slice(1).join('/')}</small>
              </div>;
            })}
          </div>:<div className="empty-state">جلسهٔ برگزارشده‌ای در این بازه ثبت نشده است.</div>}
        </section>}
        {peak.length>0&&<section className="panel report-panel">
          <h2>زمان‌های پرترافیک</h2>
          <p className="report-help">بر پایهٔ ساعت شروع رزروهای معتبر در هر روز هفته</p>
          <ol className="report-peaks">{peak.map(item=><li key={item.weekday+item.hour}>
            <span>{item.label}</span><meter value={item.count} max={peak[0].count} aria-label={item.label}/><strong>{numberFa.format(item.count)}</strong>
          </li>)}</ol>
        </section>}
      </div>
      <section className="report-section" aria-labelledby="report-finance-title">
        <h2 id="report-finance-title">گردش و ماندهٔ مالی</h2>
        {financial.length?<Cards items={financial} previous={previousFinancial} detailLink={detailLink}/>
          :<p className="panel report-panel empty-state">گردش یا ماندهٔ مالی مرتبطی ثبت نشده است.</p>}
        {scope==='student'&&<p className="report-help">سوابق پرداخت این گزارش از فاکتور بسته‌های ثبت‌شده به نام شاگرد می‌آید.</p>}
      </section>

      <section className="panel report-panel report-detail" id="report-detail">
        <h2>ریز داده و رکورد منبع</h2>
        <p className="report-help">تاریخ‌های ریز داده به‌صورت میلادی نمایش داده می‌شوند. {previous?'Excel ریز هر دو دوره را دارد.':'Excel ریز همهٔ جدول‌های این دوره را دارد.'}</p>
        <nav className="report-table-tabs" aria-label="بخش‌های ریز داده">{tables.map(table=>
          <Link prefetch={false} key={table.id} href={detailLink(table.id)} aria-current={activeTable?.id===table.id?'page':undefined}>{table.title}</Link>
        )}</nav>
        {activeTable&&<Details table={activeTable} page={page} link={detailLink}/>}
      </section>
      <details id="definitions" className="panel report-panel report-definitions" open={query.detail==='definitions'||undefined}>
        <summary>تعریف و منبع شاخص‌ها</summary>
        <dl>{[...metrics,...financial].map(item=><div key={item.key}><dt>{item.label}</dt><dd>{item.definition}</dd></div>)}</dl>
      </details>
    </>}
    {range&&<p className="report-print-note">شعبه‌های گزارش {selectedBranches.map(branch=>branch.name).join('، ')} · مرز زمانی محلی هر شعبه</p>}
  </div>;
}
