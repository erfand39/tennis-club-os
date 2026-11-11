export const paymentMethods={cash:'نقدی',card:'کارت‌خوان',transfer:'واریز بانکی'} as const;
export const invoiceStates={open:'باز',partial:'پرداخت جزئی',settled:'تسویه‌شده',voided:'باطل‌شده'} as const;
export type InvoiceState=keyof typeof invoiceStates;

export const financeCommands={
  'finance-issue':'issue_booking_invoice','finance-payment':'record_payment',
  'finance-refund':'record_refund','finance-void':'void_invoice',
} as const;
export type FinanceCommandName=keyof typeof financeCommands;
export function isFinanceCommand(value:string):value is FinanceCommandName {
  return Object.hasOwn(financeCommands,value);
}
export function financePath(org:string,invoice?:string,filters?:Record<string,string>) {
  const query=new URLSearchParams(filters);
  return `/club/${org}/finance${invoice?'/'+invoice:''}${query.size?'?'+query.toString():''}`;
}
