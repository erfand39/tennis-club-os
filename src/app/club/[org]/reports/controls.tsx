'use client';

import { useState } from 'react';
import { reportPeriods,type ReportPeriod } from '@/lib/report-dates';

export function ReportFilters({filters,branches,entities,scopeLabel}:{
  filters:{branch:string;period:ReportPeriod;anchor:string;from:string;to:string;compare:string;entity:string};
  branches:{id:string;name:string}[];entities:{id:string;name:string;locations:string[]}[];scopeLabel:string;
}) {
  const [period,setPeriod]=useState(filters.period);
  const [branch,setBranch]=useState(filters.branch);
  const [entity,setEntity]=useState(filters.entity);
  const visibleEntities=entities.filter(item=>!branch||item.locations.includes(branch));
  function selectBranch(next:string) {
    setBranch(next);
    if (next&&!entities.some(item=>item.id===entity&&item.locations.includes(next))) setEntity('');
  }
  return <form method="get" className="report-filters">
    <input type="hidden" name="scope" value={scopeLabel} />
    <label className="field"><span>شعبه</span><select name="branch" value={branch} onChange={event=>selectBranch(event.target.value)}>
      <option value="">همهٔ شعبه‌های مجاز</option>
      {branches.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {scopeLabel!=='club'&&<label className="field"><span>پروندهٔ گزارش</span>
      <select name="entity" value={entity} onChange={event=>setEntity(event.target.value)}>
        <option value="">انتخاب کنید</option>
        {visibleEntities.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
    <label className="field"><span>دوره</span><select name="period" value={period} onChange={event=>setPeriod(event.target.value as ReportPeriod)}>
      {Object.entries(reportPeriods).map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select></label>
    {period==='custom'?<>
      <label className="field"><span>از تاریخ</span><input dir="ltr" type="date" name="from" defaultValue={filters.from} required /></label>
      <label className="field"><span>تا تاریخ</span><input dir="ltr" type="date" name="to" defaultValue={filters.to} required /></label>
    </>:<label className="field"><span>تاریخ مرجع</span><input dir="ltr" type="date" name="anchor" defaultValue={filters.anchor} required /></label>}
    <label className="report-check"><input type="checkbox" name="compare" value="1" defaultChecked={filters.compare==='1'} /> مقایسه با دورهٔ قبل</label>
    <button className="button primary">اعمال فیلتر</button>
  </form>;
}

export function PrintReport() {
  return <button type="button" className="button subtle" onClick={()=>window.print()}>چاپ خلاصه / PDF</button>;
}
