import { asciiDigits,faNumber } from './resource-fields';

export const maximumMinor=9999999999999n;
export function parseMinor(value:string,unit:string,currency:string):bigint|null {
  const normalized=asciiDigits(value.trim()).replaceAll('٬',',');
  if (normalized.length>24 || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized)) return null;
  if (unit!=='minor' && (unit!=='toman' || currency!=='IRR')) return null;
  const amount=BigInt(normalized.replaceAll(',',''))*(unit==='toman'?10n:1n);
  return amount<=maximumMinor ? amount : null;
}
export const currencyLabel=(currency:string)=>currency==='IRR'?'ریال':currency;
export function formatMinor(amount:string|bigint,currency:string) {
  return `${faNumber.format(BigInt(amount))} ${currencyLabel(currency)}`;
}
