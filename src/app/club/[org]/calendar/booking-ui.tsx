import { type Booking } from '@/lib/calendar';
import { branchDateTime, numberFa } from '@/lib/calendar-dates';

export function BookingStatus({ booking }: { booking: Booking }) {
  const status = booking.status === 'cancelled' ? 'لغوشده' : booking.session_status === 'completed' ? 'برگزارشده' : 'تأییدشده';
  return <span className={`resource-status ${booking.status==='cancelled' ? 'is-inactive' : 'is-active'}`}><i />{status}</span>;
}
export function LocalTimeRange({ start,end,zone }: { start: Date; end: Date; zone: string }) {
  const a = branchDateTime(zone,start);
  const b = branchDateTime(zone,end);
  return <bdi className="calendar-time" dir="ltr">{a.hour}–{a.date !== b.date && b.hour==='00:00' ? '24:00' : b.hour}</bdi>;
}
export function displayPrice(amount: string, currency: string) {
  return `${numberFa.format(BigInt(amount))} ${currency==='IRR' ? 'ریال' : currency}`;
}
