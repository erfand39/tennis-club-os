import { type Booking } from '@/lib/calendar';
import { formatMinor } from '@/lib/money';
import { branchDateTime } from '@/lib/calendar-dates';

export function BookingStatus({ booking }: { booking: Booking }) {
  const isPast = new Date(booking.ends_at).getTime() <= Date.now();
  const isElapsed = booking.status === 'confirmed' && booking.session_status !== 'completed' && isPast;
  const status = booking.status === 'cancelled'
    ? 'لغو شده'
    : booking.session_status === 'completed'
    ? 'برگزارشده'
    : isElapsed
    ? 'پایان‌یافته'
    : 'تأییدشده';
  const statusClass = booking.status === 'cancelled'
    ? 'is-inactive'
    : isElapsed
    ? 'is-elapsed'
    : 'is-active';
  return <span className={`resource-status ${statusClass}`}><i />{status}</span>;
}
export function LocalTimeRange({ start,end,zone }: { start: Date; end: Date; zone: string }) {
  const a = branchDateTime(zone,start);
  const b = branchDateTime(zone,end);
  return <bdi className="calendar-time" dir="ltr">{a.hour}–{a.date !== b.date && b.hour==='00:00' ? '24:00' : b.hour}</bdi>;
}
export const displayPrice = formatMinor;
