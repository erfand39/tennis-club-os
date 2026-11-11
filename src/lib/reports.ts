import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { type PoolClient } from 'pg';
import { branchDateTime, validCalendarDate } from './calendar-dates';
import { branches,clubFor,uuid } from './club';
import { asUser } from './db';
import { reportPeriods,reportRange,reportScopes,type DateRange,type ReportPeriod,type ReportScope } from './report-dates';
import { reportBlocks,reportBookings,reportCoachTime,reportCourts,reportMoney,reportSessions,reportStudent } from './report-queries';
import { currentUser } from './session';

type Query = Record<string,string|string[]|undefined>;
export type ReportBooking = {
  id:string; kind:'rental'|'private'|'group'; status:'confirmed'|'cancelled'; branch:string; court:string;
  day:string; time:string; starts_in_period:boolean; minutes:number;
};
export type ReportSession = {
  id:string; booking_id:string; status:'scheduled'|'completed'|'cancelled'; branch:string; court:string; coach:string|null;
  planned:boolean; completed:boolean; planned_day:string; actual_day:string|null; minutes:number;
};
type Person = { id:string; session_id:string; student_id:string; student:string|null; status:'present'|'late'|'absent'|'excused'|null };
type Capacity = { id:string; branch:string; court:string; day:string; available:number; blocked:number; inactive:number; occupied:number; actual:number };
type Block = { id:string; branch:string; court:string|null; kind:'closure'|'maintenance'; reason:string; starts:string; ends:string };
type CoachTime = {
  available:number; actual:number; occupied:number;
  spans:{kind:'available'|'actual'|'occupied';start:string;end:string;minutes:number}[];
};
type NewStudent = { id:string; name:string; day:string };
type MoneyKind = 'receipt'|'refund'|'balance'|'expense'|'wage'|'wage_due';
type MoneyEntry = {
  id:string; source_id:string|null; reference:string|null; kind:MoneyKind; branch:string; currency:string;
  amount:string; day:string; allocation:'booking'|'package'|'unallocated'|null;
};
type Student = {
  skill_level:string|null; last_at:Date|null; last_timezone:string|null;
  changes:{id:string;previous_level:string|null;current_level:string|null;effective_at:string}[];
  packages:{id:string;title:string;branch:string;valid_from:string;valid_until:string;status:string;sessions:number|null;used:number}[];
};
type Classes = { sessions:ReportSession[]; people:Person[]; new_students:NewStudent[] };
export type ReportData = Classes & {
  range:DateRange; bookings:ReportBooking[]; capacity:Capacity[]; blocks:Block[];
  coachTime:CoachTime|null; money:MoneyEntry[]; student:Student|null;
};
export type ReportEntity={id:string;name:string;locations:string[]};

const single=(query:Query,key:string)=>typeof query[key]==='string'?query[key]:undefined;

export async function getReportContext(org:string,query:Query) {
  const user=await currentUser();
  if (!user) redirect('/');
  const club=await clubFor(user.id,org);
  if (!club) notFound();
  const allBranches=await branches(user.id,org);
  const branch=single(query,'branch') || '';
  const selectedBranches=branch?allBranches.filter(item=>item.id===branch):allBranches;
  if (branch && selectedBranches.length===0) notFound();
  const reference=selectedBranches.find(item=>item.active) ?? selectedBranches[0];
  const today=branchDateTime(reference?.timezone ?? 'Asia/Tehran').date;
  const rawPeriod=single(query,'period') ?? 'month';
  const rawScope=single(query,'scope') ?? 'club';
  const period=Object.hasOwn(reportPeriods,rawPeriod)?rawPeriod as ReportPeriod:'month';
  const scope=Object.hasOwn(reportScopes,rawScope)?rawScope as ReportScope:'club';
  const rawAnchor=single(query,'anchor') ?? today;
  const anchor=validCalendarDate(rawAnchor)?rawAnchor:today;
  const from=single(query,'from') ?? anchor;
  const to=single(query,'to') ?? anchor;
  const compare=single(query,'compare')==='1';
  const selected=single(query,'entity') || '';
  if (scope!=='club' && selected && !uuid(selected)) notFound();
  const range=reportRange(period,anchor,from,to);
  const branchIds=selectedBranches.map(item=>item.id);
  const filters={branch,period,scope,anchor,from,to,compare:compare?'1':'',entity:scope==='club'?'':selected};
  return {org,club,userId:user.id,allBranches,selectedBranches,branchIds,reference,today,period,scope,compare,range,filters};
}

type Context=Awaited<ReturnType<typeof getReportContext>>;
const directoryQueries={
  court:'select c.id,c.name,array[c.location_id] as locations from public.courts c where c.organization_id=$1',
  coach:`select p.id,p.name,array_agg(l.location_id) as locations from public.coach_profiles p
    join public.coach_locations l on (l.organization_id,l.coach_id)=(p.organization_id,p.id)
    where p.organization_id=$1 group by p.id`,
  student:`select p.id,p.name,array_agg(l.location_id) as locations from public.student_profiles p
    join public.student_locations l on (l.organization_id,l.student_id)=(p.organization_id,p.id)
    where p.organization_id=$1 group by p.id`,
};

export async function loadReport(context:Context) {
  const {org,userId,branchIds,scope,range,filters,compare}=context;
  return asUser(userId,async db=>{
    const entities=scope==='club'?[]:(await db.query<ReportEntity>(directoryQueries[scope]+' order by name,id',[org])).rows;
    const entity=entities.find(item=>item.id===filters.entity&&item.locations.some(location=>branchIds.includes(location)));
    if (filters.entity && !entity) notFound();
    if (!branchIds.length || !range || (scope!=='club' && !entity)) return {entities,entity,current:null,previous:null};
    const current=await readPeriod(db,context,range.current,entity?.id);
    const previous=compare?await readPeriod(db,context,range.previous,entity?.id):null;
    return {entities,entity,current,previous};
  },true);
}

async function readPeriod(db:PoolClient,context:Context,range:DateRange,entity:string|undefined):Promise<ReportData> {
  const {org,branchIds,scope}=context;
  const base=[org,branchIds,range.start,range.end];
  const court=scope==='court'?entity:null;
  const params=[...base,court,scope==='coach'?entity:null,scope==='student'?entity:null];
  const bookings=(await db.query<ReportBooking>(reportBookings,params)).rows;
  const classes=(await db.query<Classes>(reportSessions,params)).rows[0];
  const money=(await db.query<MoneyEntry>(reportMoney,params)).rows;
  const hasCourtTime=scope==='club'||scope==='court';
  const capacity=hasCourtTime?(await db.query<Capacity>(reportCourts,[...base,court])).rows:[];
  const blocks=hasCourtTime?(await db.query<Block>(reportBlocks,[...base,court])).rows:[];
  const coachTime=scope==='coach'?(await db.query<CoachTime>(reportCoachTime,[...base,entity])).rows[0]:null;
  const student=scope==='student'?(await db.query<Student>(reportStudent,[...base,entity])).rows[0] ?? null:null;
  return {...classes,range,bookings,capacity,blocks,coachTime,money,student};
}
