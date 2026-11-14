export const DAY_START_MINUTE = 8 * 60;
export const DAY_END_MINUTE = 22 * 60;
export const SLOT_MINUTES = 30;

export type DndBookingLike = {
  id: string;
  court_id: string;
  startsAtIso: string;
  endsAtIso: string;
  local_day: string;
  status: 'confirmed' | 'cancelled';
  session_status: 'scheduled' | 'completed' | 'cancelled' | null;
};

export function minutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function localDateTimeParts(date: Date | string, timezone: string): { date: string; hour: string; minutes: number } {
  const instant = typeof date === 'string' ? new Date(date) : date;
  const dateStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  const normalizedHour = hourStr === '24:00' ? '00:00' : hourStr;
  return {
    date: dateStr,
    hour: normalizedHour,
    minutes: hhmmToMinutes(normalizedHour),
  };
}

export function canMoveBooking(params: {
  status: 'confirmed' | 'cancelled';
  session_status: 'scheduled' | 'completed' | 'cancelled' | null;
  startsAtMs: number;
  branchActive: boolean;
  nowMs?: number;
}): boolean {
  if (!params.branchActive) return false;
  if (params.status !== 'confirmed') return false;
  if (params.session_status === 'completed' || params.session_status === 'cancelled') return false;
  const currentMinuteMs = Math.floor((params.nowMs ?? Date.now()) / 60000) * 60000;
  return params.startsAtMs >= currentMinuteMs;
}

export function buildTimelineSlots(startMinute = DAY_START_MINUTE, endMinute = DAY_END_MINUTE, step = SLOT_MINUTES): number[] {
  const slots: number[] = [];
  for (let m = startMinute; m < endMinute; m += step) {
    slots.push(m);
  }
  return slots;
}

export type DropValidationResult =
  | { ok: true; startInput: string; startHour: string; endHour: string }
  | { ok: false; reason: 'locked' | 'past' | 'hours' | 'conflict' };

export function validateDropTarget(params: {
  booking: DndBookingLike;
  targetDate: string;
  targetStartMinute: number;
  bookings: DndBookingLike[];
  timezone: string;
  branchActive: boolean;
  nowDate: string;
  nowMinute: number;
  nowMs?: number;
}): DropValidationResult {
  const startMs = new Date(params.booking.startsAtIso).getTime();
  const endMs = new Date(params.booking.endsAtIso).getTime();
  const durationMinutes = Math.max(SLOT_MINUTES, Math.round((endMs - startMs) / 60000));

  if (
    !canMoveBooking({
      status: params.booking.status,
      session_status: params.booking.session_status,
      startsAtMs: startMs,
      branchActive: params.branchActive,
      nowMs: params.nowMs,
    })
  ) {
    return { ok: false, reason: 'locked' };
  }

  if (
    params.targetDate < params.nowDate ||
    (params.targetDate === params.nowDate && params.targetStartMinute < params.nowMinute)
  ) {
    return { ok: false, reason: 'past' };
  }

  const targetEndMinute = params.targetStartMinute + durationMinutes;
  if (params.targetStartMinute < DAY_START_MINUTE || targetEndMinute > DAY_END_MINUTE) {
    return { ok: false, reason: 'hours' };
  }

  for (const other of params.bookings) {
    if (other.id === params.booking.id) continue;
    if (other.status !== 'confirmed') continue;
    if (other.court_id !== params.booking.court_id) continue;
    if (other.local_day !== params.targetDate) continue;

    const otherStart = localDateTimeParts(other.startsAtIso, params.timezone).minutes;
    const otherDuration = Math.max(1, Math.round((new Date(other.endsAtIso).getTime() - new Date(other.startsAtIso).getTime()) / 60000));
    const otherEnd = otherStart + otherDuration;

    if (params.targetStartMinute < otherEnd && targetEndMinute > otherStart) {
      return { ok: false, reason: 'conflict' };
    }
  }

  const startHour = minutesToHHMM(params.targetStartMinute);
  const endHour = minutesToHHMM(targetEndMinute);
  return {
    ok: true,
    startInput: `${params.targetDate}T${startHour}`,
    startHour,
    endHour,
  };
}
