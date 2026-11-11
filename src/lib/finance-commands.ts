import 'server-only';
import { bookingError } from './booking-commands';
import { isClubFinanceCommand } from './club-finance-fields';
import { runClubFinanceAction } from './club-finance-commands';
import { uuid } from './club';
import { asUser } from './db';
import { financeCommands,financePath,isFinanceCommand,paymentMethods,type FinanceCommandName } from './finance-fields';
import { InputError } from './input';
import { parseMinor } from './money';

type FinanceAction=FinanceCommandName|'finance-operation';
export const isFinanceAction=(value:string):value is FinanceAction=>isFinanceCommand(value)||value==='finance-operation';

function id(form:URLSearchParams,key:string) {
  const value=form.get(key) ?? '';
  if (!uuid(value)) throw new InputError('finance-invalid');
  return value;
}
function optionalText(form:URLSearchParams,key:string,limit:number) {
  const value=(form.get(key) ?? '').trim();
  if (value.length>limit) throw new InputError('finance-invalid');
  return value || null;
}
function amountOf(form:URLSearchParams,key:string,currency:string,allowZero=false) {
  const value=(form.get(key) ?? '').trim();
  if (!value && allowZero) return '0';
  const amount=parseMinor(value,form.get('unit') ?? 'minor',currency);
  if (amount===null || (!allowZero && amount===0n)) throw new InputError('finance-amount');
  return amount.toString();
}

export async function runFinanceAction(action:FinanceAction,form:URLSearchParams,user:string,org:string) {
  const branch=id(form,'branch');
  const request=id(form,'request');
  try {
    return await asUser(user,async db=>{
      const branchVisible=await db.query('select 1 from public.locations where organization_id=$1 and id=$2',[org,branch]);
      if (!branchVisible.rowCount) throw new InputError('denied',403);
      if (isClubFinanceCommand(action)) return runClubFinanceAction(db,action,form,org,branch,request,false);
      if (action==='finance-operation') {
        const name=form.get('command') ?? '';
        if (!isFinanceCommand(name)) throw new InputError('finance-invalid');
        if (isClubFinanceCommand(name)) return runClubFinanceAction(db,name,form,org,branch,request,true);
        const {rows:[result]}=await db.query<{id:string|null}>('select public.finance_command_result($1,$2,$3,$4) as id',
          [org,branch,financeCommands[name],request]);
        return result.id ? {next:financePath(org,result.id,{saved:'1'})} : {status:'unconfirmed'};
      }
      if (action==='finance-issue') {
        const booking=id(form,'booking');
        const {rows:[price]}=await db.query<{currency:string}>(`
          select currency from public.booking_prices where (organization_id,location_id,booking_id)=($1,$2,$3)
        `,[org,branch,booking]);
        if (!price) throw new InputError('finance-not-invoiceable',409);
        const {rows:[invoice]}=await db.query<{id:string}>('select public.issue_booking_invoice($1,$2,$3,$4,$5,$6) as id',
          [org,branch,booking,amountOf(form,'discount',price.currency,true),optionalText(form,'reason',250),request]);
        return {next:financePath(org,invoice.id,{saved:'1'})};
      }
      const invoice=id(form,'invoice');
      const {rows:[detail]}=await db.query<{currency:string}>('select currency from public.invoices where (organization_id,location_id,id)=($1,$2,$3)',
        [org,branch,invoice]);
      if (!detail) throw new InputError('denied',403);
      if (action==='finance-payment') {
        const method=form.get('method') ?? '';
        if (!Object.hasOwn(paymentMethods,method)) throw new InputError('finance-invalid');
        await db.query('select public.record_payment($1,$2,$3,$4,$5,$6,$7)',
          [org,branch,invoice,amountOf(form,'amount',detail.currency),method,optionalText(form,'reference',120),request]);
      } else if (action==='finance-refund') {
        const payment=id(form,'payment');
        const found=await db.query('select 1 from public.payments where (organization_id,location_id,invoice_id,id)=($1,$2,$3,$4)',
          [org,branch,invoice,payment]);
        if (!found.rowCount) throw new InputError('denied',403);
        const reason=optionalText(form,'reason',250);
        if (!reason) throw new InputError('finance-reason');
        await db.query('select public.record_refund($1,$2,$3,$4,$5,$6)',[org,branch,payment,amountOf(form,'amount',detail.currency),reason,request]);
      } else {
        const reason=optionalText(form,'reason',250);
        if (!reason) throw new InputError('finance-reason');
        await db.query('select public.void_invoice($1,$2,$3,$4,$5)',[org,branch,invoice,reason,request]);
      }
      return {next:financePath(org,invoice,{saved:'1'})};
    });
  } catch (failure) {
    if (failure instanceof InputError) throw failure;
    const db=failure as Parameters<typeof bookingError>[0];
    const errors:Record<string,[string,number?]>={
      booking_not_invoiceable:['finance-not-invoiceable',409],booking_already_invoiced:['finance-already-invoiced',409],
      invalid_invoice_discount:['finance-discount'],invoice_discount_exceeds_price:['finance-discount-cap',409],
      invoice_not_payable:['finance-closed',409],payment_exceeds_due:['finance-due',409],refund_exceeds_payment:['finance-refund-cap',409],
      invoice_has_receipts:['finance-has-receipts',409],invoice_void_reason_required:['finance-reason'],
      finance_cancel_package_first:['training-cancel-first',409], training_not_eligible:['training-ineligible',409],
      training_private_already_billed:['training-private-invoiced',409], training_private_covered:['training-private-covered',409],
      student_unavailable:['booking-student-unavailable'], training_already_redeemed:['training-duplicate',409], training_no_credit:['training-empty',409],
      training_has_consumption:['training-used',409], club_finance_transition:['club-finance-transition',409],
      coach_estimate_changed:['coach-estimate-changed',409], club_finance_date:['club-finance-date'],
      club_finance_reason:['finance-reason'], club_finance_invalid:['club-finance-invalid'],
      invalid_refund:['finance-invalid'],invalid_payment:['finance-invalid'],request_payload_mismatch:['finance-request',409],
    };
    if (db.code==='23P01' && action==='finance-rate-special') throw new InputError('rate-special-conflict',409);
    const match=errors[db.message ?? ''];
    if (match) throw new InputError(...match);
    if (isClubFinanceCommand(action) && (db.code?.startsWith('22') || db.code?.startsWith('23'))) throw new InputError('club-finance-invalid');
    throw bookingError(db) ?? failure;
  }
}
