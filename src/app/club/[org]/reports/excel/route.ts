import { addDays } from '@/lib/calendar-dates';
import { currencyLabel } from '@/lib/money';
import { reportScopes } from '@/lib/report-dates';
import { cellValue,displayRange,moneyMetrics,reportTables,summarizeReport,type Measure } from '@/lib/report-presentation';
import { reportWorkbook } from '@/lib/report-workbook';
import { getReportContext,loadReport } from '@/lib/reports';

const units:Record<Measure,string>={count:'تعداد',minutes:'دقیقه',rate:'نسبت (۰ تا ۱)',money:'واحد پایه'};
const exportValue=(value:bigint|number|string|null)=>typeof value==='bigint'
  ?(String(value).replace('-','').length<=15?Number(value):String(value))
  :value??'—';

export async function GET(request:Request,{params}:{params:Promise<{org:string}>}) {
  const {org}=await params;
  const query=Object.fromEntries(new URL(request.url).searchParams);
  const context=await getReportContext(org,query);
  const {current,previous,entity}=await loadReport(context);
  if (!current) return new Response('گزارش با فیلتر انتخاب‌شده در دسترس نیست.',{status:400});
  const {scope,club,selectedBranches}=context;
  const periods=[{name:'دوره فعلی',data:current},...(previous?[{name:'دوره قبل',data:previous}]:[])];
  const currencies=[...new Set(periods.flatMap(({data})=>data.money.map(item=>item.currency)))].sort();
  const summary=[
    ['باشگاه',club.name],['گزارش',reportScopes[scope],entity?.name??''],['شعبه‌ها',...selectedBranches.map(branch=>branch.name)],
    ['دورهٔ فعلی',displayRange(current.range)],['دورهٔ قبل',previous?displayRange(previous.range):'—'],
    ['مبنای زمان','تاریخ محلی هر شعبه، شروع هفته شنبه'],
    ['نمایش مبلغ','مبالغ بیش از ۱۵ رقم به‌صورت متن دقیق ذخیره می‌شوند.'],
  ];
  const metrics:(string|number)[][]=[['دوره','شاخص','مقدار','واحد','تعریف']];
  const sheets:{name:string;rows:(number|string)[][]}[]=[];
  const tablesById=new Map<string,(typeof sheets)[number]>();
  for (const {name,data} of periods) {
    for (const metric of [...summarizeReport(data,scope),...moneyMetrics(data,scope,currencies)]) {
      metrics.push([name,metric.label,exportValue(metric.value),
        metric.currency?currencyLabel(metric.currency):units[metric.measure],metric.definition]);
    }
    for (const table of reportTables(data,org)) {
      if (!table.rows.length) continue;
      let sheet=tablesById.get(table.id);
      if (!sheet) {
        sheet={name:table.title,rows:[['دوره',...table.columns]]};
        sheets.push(sheet);
        tablesById.set(table.id,sheet);
      }
      for (const row of table.rows) sheet.rows.push([name,...row.map(cell=>exportValue(cellValue(cell)))]);
    }
  }
  const file=reportWorkbook([{name:'فیلترها',rows:summary},{name:'شاخص‌ها',rows:metrics},...sheets]);
  const filename=`sam-report-${scope}-${current.range.start}-${addDays(current.range.end,-1)}.xlsx`;
  return new Response(file,{
    headers:{
      'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':`attachment; filename="${filename}"`,
      'Cache-Control':'private, no-store',
    },
  });
}
