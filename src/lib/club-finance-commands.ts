import 'server-only';
import { validCalendarDate } from './calendar-dates';
import { uuid } from './club';
import { clubFinanceCommands,commandTab,expenseCategories,operationsPath,type ClubFinanceCommand } from './club-finance-fields';
import { type PoolClient } from 'pg';
import { paymentMethods } from './finance-fields';
import { InputError } from './input';
import { parseMinor } from './money';
import { asciiDigits } from './resource-fields';

function field(form:URLSearchParams,key:string,max:number,required=true) {
  const value=(form.get(key) ?? '').trim();
  if (value.length>max || (required && !value)) throw new InputError('club-finance-invalid');
  return value;
}
function id(form:URLSearchParams,key:string) {
  const value=field(form,key,36);
  if (!uuid(value)) throw new InputError('club-finance-invalid');
  return value;
}
function date(form:URLSearchParams,key:string) {
  const value=asciiDigits(field(form,key,10));
  if (!validCalendarDate(value)) throw new InputError('club-finance-date');
  return value;
}
function number(form:URLSearchParams,key:string,low:number,high:number) {
  const value=asciiDigits(field(form,key,4));
  if (!/^\d{1,4}$/.test(value) || +value<low || +value>high) throw new InputError('club-finance-invalid');
  return +value;
}
function minute(form:URLSearchParams,key:string) {
  const text=asciiDigits(field(form,key,5));
  if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(text)) throw new InputError('club-finance-invalid');
  const [hour,min]=text.split(':').map(Number);
  return hour*60+min;
}
function money(form:URLSearchParams,currency:string,optional=false,fixedUnit=false) {
  const value=field(form,'amount',24,!optional);
  if (!value && optional) return null;
  const parsed=parseMinor(value,fixedUnit ? 'minor' : form.get('unit') ?? 'minor',currency);
  if (parsed===null) throw new InputError('finance-amount');
  return parsed.toString();
}
function method(form:URLSearchParams) {
  const value=field(form,'method',12);
  if (!Object.hasOwn(paymentMethods,value)) throw new InputError('club-finance-invalid');
  return value;
}
function payload(action:ClubFinanceCommand,form:URLSearchParams,currency:string):Record<string,unknown> {
  if (action==='finance-training-issue') {
    const from=date(form,'from'),until=date(form,'until');
    if (from>until) throw new InputError('club-finance-date');
    return {student:id(form,'student'),title:field(form,'title',120),from,until,
      sessions:form.get('sessions')?.trim() ? number(form,'sessions',1,1000) : null,amount:money(form,currency,true)};
  }
  if (action==='finance-expense-record') {
    const category=field(form,'category',20);
    const amount=money(form,currency);
    if (!Object.hasOwn(expenseCategories,category) || amount==='0') throw new InputError('club-finance-invalid');
    return {category,amount,title:field(form,'title',120),day:date(form,'day'),method:method(form)};
  }
  const target=id(form,'target');
  switch (action) {
    case 'finance-training-status':
      return {target,status:field(form,'status',12),reason:field(form,'reason',250)};
    case 'finance-training-redeem':
      return {target,participant:id(form,'participant')};
    case 'finance-training-return':
    case 'finance-expense-void':
    case 'finance-rate-retire':
      return {target,reason:field(form,'reason',250)};
    case 'finance-coach-adjust':
      return {target,amount:money(form,currency),reason:field(form,'reason',250)};
    case 'finance-coach-correct': {
      const expected=parseMinor(field(form,'expected',24),'minor',currency);
      if (expected===null) throw new InputError('finance-amount');
      return {target,expected:expected.toString(),amount:money(form,currency),reason:field(form,'reason',250)};
    }
    case 'finance-coach-approve':
      return {target,amount:money(form,currency,false,true)};
    case 'finance-coach-pay':
      return {target,amount:money(form,currency,false,true),method:method(form),reference:field(form,'reference',120,false)};
    case 'finance-rate-special': {
      const start=minute(form,'start'),end=minute(form,'end');
      const minimum=number(form,'minimum',1,1440),maximum=number(form,'maximum',1,1440);
      if (start>=end || minimum>maximum) throw new InputError('club-finance-invalid');
      return {target,start,end,minimum,maximum,weekday:number(form,'weekday',1,7),amount:money(form,currency)};
    }
  }
}

export async function runClubFinanceAction(db:PoolClient,action:ClubFinanceCommand,form:URLSearchParams,org:string,branch:string,request:string,checkOnly:boolean) {
  const command=clubFinanceCommands[action];
  let result: string|null;
  if (checkOnly) {
    const {rows:[receipt]}=await db.query<{id:string|null}>('select public.club_finance_result($1,$2,$3,$4) as id',[org,branch,command,request]);
    result=receipt.id;
  } else {
    const {rows:[club]}=await db.query<{currency:string}>('select currency from public.organizations where id=$1',[org]);
    if (!club) throw new InputError('denied',403);
    const {rows:[receipt]}=await db.query<{id:string}>('select public.record_club_finance($1,$2,$3,$4,$5) as id',
      [org,branch,command,payload(action,form,club.currency),request]);
    result=receipt.id;
  }
  if (!result) return {status:'unconfirmed'};
  const filters:Record<string,string>={saved:'1'};
  if (action==='finance-training-issue' || action==='finance-training-status') {
    filters.package=result;
  } else if (action==='finance-training-redeem' || action==='finance-training-return') {
    const {rows:[use]}=await db.query<{package_id:string}>('select package_id from public.training_uses where id=$1',[result]);
    if (use) filters.package=use.package_id;
  } else if (commandTab(action)==='coaches') {
    const {rows:[payable]}=await db.query<{session_id:string}>(`
      select p.session_id from public.coach_payables p
      where p.id=$1 or p.id=(select payable_id from public.coach_payment_adjustments where id=$1)
    `,[result]);
    if (payable) filters.session=payable.session_id;
  }
  return {next:operationsPath(org,branch,commandTab(action),filters)};
}
