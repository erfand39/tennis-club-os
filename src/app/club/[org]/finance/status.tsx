import { invoiceStates,type InvoiceState } from '@/lib/finance-fields';

export function InvoiceStatus({status}:{status:InvoiceState}) {
  return <span className={`resource-status ${status==='settled'?'is-active':status==='voided'?'is-inactive':'is-archived'}`}><i />{invoiceStates[status]}</span>;
}
