'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  GripVertical,
  Lock,
  Move,
  X,
} from 'lucide-react';
import { type DragEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  SLOT_MINUTES,
  buildTimelineSlots,
  canMoveBooking,
  localDateTimeParts,
  minutesToHHMM,
  validateDropTarget,
} from '@/lib/calendar-dnd';
import { type CalendarView, longDay, numberFa, weekLabels } from '@/lib/calendar-dates';
import { errorMessage } from '@/lib/messages';
import { bookingKinds } from '@/lib/resource-fields';

export type SerializedCourt = {
  id: string;
  name: string;
  surface: string;
  status: 'active' | 'inactive' | 'archived';
};

export type SerializedBooking = {
  id: string;
  location_id: string;
  court_id: string;
  court: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
  local_day: string;
  kind: keyof typeof bookingKinds;
  status: 'confirmed' | 'cancelled';
  booker_name: string | null;
  coach: string | null;
  session_id: string | null;
  session_status: 'scheduled' | 'completed' | 'cancelled' | null;
  capacity: number | null;
  revision: string;
  startHour: string;
  endHour: string;
  startMinute: number;
  endMinute: number;
  dayLabel: string;
};

export type SerializedPeriodDay = {
  day: string;
  dayNumber: string;
  shortWeekday: string;
  longDay: string;
  confirmed: number;
  href: string;
};

type CalendarBoardProps = {
  org: string;
  branchId: string;
  branchActive: boolean;
  timezone: string;
  view: CalendarView;
  date: string;
  today: string;
  nowMinute: number;
  courts: SerializedCourt[];
  selectedCourt?: string;
  bookings: SerializedBooking[];
  totalBookings: number;
  page: number;
  pages: number;
  prevPageHref?: string;
  nextPageHref?: string;
  periodDays: SerializedPeriodDay[];
  monthOffset: number;
  freeWindowsSlot?: ReactNode;
};

const SLOT_HEIGHT = 30;
const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];
const faTimeFormat = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false });

function formatFaClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${faTimeFormat.format(h)}:${faTimeFormat.format(m)}`;
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function dropReasonMessage(reason: 'locked' | 'past' | 'hours' | 'conflict'): string {
  switch (reason) {
    case 'locked':
      return 'این سانس دیگر قابل جابه‌جایی نیست.';
    case 'past':
      return 'امکان انتقال سانس به زمان گذشته وجود ندارد.';
    case 'hours':
      return 'بازهٔ انتخابی خارج از ساعات کاری زمین (۰۸:۰۰ تا ۲۲:۰۰) است.';
    case 'conflict':
      return 'این بازه با سانس دیگری در همین زمین تداخل دارد.';
  }
}

export function CalendarBoard({
  org,
  branchId,
  branchActive,
  timezone,
  view,
  date,
  today,
  nowMinute,
  courts,
  selectedCourt,
  bookings: serverBookings,
  totalBookings,
  page,
  pages,
  prevPageHref,
  nextPageHref,
  periodDays,
  monthOffset,
  freeWindowsSlot,
}: CalendarBoardProps) {
  const router = useRouter();
  const [items, setItems] = useState<SerializedBooking[]>(serverBookings);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [pickModeBookingId, setPickModeBookingId] = useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ courtId: string; minute: number } | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string; bookingId?: string } | null>(null);

  useEffect(() => {
    setItems(serverBookings);
  }, [serverBookings]);

  useEffect(() => {
    if (!pickModeBookingId) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPickModeBookingId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pickModeBookingId]);

  const timelineSlots = useMemo(() => buildTimelineSlots(DAY_START_MINUTE, DAY_END_MINUTE, SLOT_MINUTES), []);
  const activeCourts = useMemo(
    () => courts.filter(c => c.status === 'active' && (!selectedCourt || c.id === selectedCourt)),
    [courts, selectedCourt],
  );

  const selectedBooking = useMemo(() => {
    const targetId = activeBookingId ?? pickModeBookingId;
    return targetId ? items.find(item => item.id === targetId) ?? null : null;
  }, [activeBookingId, pickModeBookingId, items]);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, SerializedBooking[]>();
    for (const item of items) {
      const list = map.get(item.local_day) ?? [];
      list.push(item);
      map.set(item.local_day, list);
    }
    return map;
  }, [items]);

  async function commitMove(booking: SerializedBooking, targetDate: string, targetStartMinute: number) {
    if (savingId) return;
    const validation = validateDropTarget({
      booking,
      targetDate,
      targetStartMinute,
      bookings: items,
      timezone,
      branchActive,
      nowDate: today,
      nowMinute,
    });

    if (!validation.ok) {
      setFeedback({ kind: 'error', text: dropReasonMessage(validation.reason) });
      return;
    }

    if (targetDate === booking.local_day && targetStartMinute === booking.startMinute) {
      setActiveBookingId(null);
      setPickModeBookingId(null);
      setHoverSlot(null);
      setHoverDay(null);
      return;
    }

    setSavingId(booking.id);
    setActiveBookingId(null);
    setPickModeBookingId(null);
    setHoverSlot(null);
    setHoverDay(null);
    setFeedback(null);

    const fields = new URLSearchParams({
      org,
      branch: branchId,
      booking: booking.id,
      revision: booking.revision,
      request: makeRequestId(),
      start: validation.startInput,
    });

    try {
      const response = await fetch('/api/booking-move', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: fields,
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        revision?: string;
        starts_at?: string;
        ends_at?: string;
      };
      if (!response.ok || !data.ok || !data.revision || !data.starts_at || !data.ends_at) {
        router.refresh();
        setFeedback({ kind: 'error', text: errorMessage(data.error ?? 'unavailable') ?? 'خطا در تغییر زمان سانس.' });
        return;
      }

      if (data.revision || data.starts_at) {
        setItems(current =>
          current.map(row => {
            if (row.id !== booking.id) return row;
            const startsIso = data.starts_at ?? row.startsAtIso;
            const endsIso = data.ends_at ?? row.endsAtIso;
            const startParts = localDateTimeParts(startsIso, timezone);
            const endParts = localDateTimeParts(endsIso, timezone);
            return {
              ...row,
              revision: data.revision ?? String(Number(row.revision) + 1),
              startsAtIso: startsIso,
              endsAtIso: endsIso,
              local_day: startParts.date,
              dayLabel: longDay(startParts.date),
              startHour: startParts.hour,
              endHour: endParts.hour === '00:00' && endParts.date !== startParts.date ? '24:00' : endParts.hour,
              startMinute: startParts.minutes,
              endMinute: endParts.date !== startParts.date && endParts.minutes === 0 ? 24 * 60 : endParts.minutes,
            };
          }),
        );
      }

      const dayText = targetDate === booking.local_day ? '' : ` (${longDay(targetDate)})`;
      setFeedback({
        kind: 'success',
        text: `زمان «${bookingKinds[booking.kind]}» به ${formatFaClock(validation.startHour)}–${formatFaClock(validation.endHour)}${dayText} منتقل شد.`,
        bookingId: booking.id,
      });
      router.refresh();
    } catch {
      router.refresh();
      setFeedback({ kind: 'error', text: errorMessage('unavailable') ?? 'ارتباط با سامانه برقرار نشد.' });
    } finally {
      setSavingId(null);
    }
  }

  function startDrag(event: DragEvent<HTMLElement>, booking: SerializedBooking) {
    event.dataTransfer.setData('text/plain', booking.id);
    event.dataTransfer.effectAllowed = 'move';
    setActiveBookingId(booking.id);
    setPickModeBookingId(null);
    setFeedback(null);
  }

  function endDrag() {
    setActiveBookingId(null);
    setHoverSlot(null);
    setHoverDay(null);
  }

  const nowIndicatorTop =
    date === today && nowMinute >= DAY_START_MINUTE && nowMinute <= DAY_END_MINUTE
      ? ((nowMinute - DAY_START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT
      : null;

  const hoverValidation = useMemo(() => {
    if (!selectedBooking || !hoverSlot) return null;
    if (hoverSlot.courtId !== selectedBooking.court_id) {
      return { ok: false as const, message: 'تغییر زمان فقط در همین زمین امکان‌پذیر است.' };
    }
    const check = validateDropTarget({
      booking: selectedBooking,
      targetDate: date,
      targetStartMinute: hoverSlot.minute,
      bookings: items,
      timezone,
      branchActive,
      nowDate: today,
      nowMinute,
    });
    if (!check.ok) {
      return { ok: false as const, message: dropReasonMessage(check.reason) };
    }
    return {
      ok: true as const,
      startHour: check.startHour,
      endHour: check.endHour,
      durationMin: Math.max(SLOT_MINUTES, selectedBooking.endMinute - selectedBooking.startMinute),
    };
  }, [selectedBooking, hoverSlot, date, items, timezone, branchActive, today, nowMinute]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {feedback && (
          <motion.div
            key={`${feedback.kind}-${feedback.text}`}
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={{ duration: 0.22, ease: EASE_SMOOTH }}
            className={`local-notice calendar-dnd-toast ${feedback.kind === 'error' ? 'error' : 'is-success'}`}
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            <span className="calendar-dnd-toast-main">
              {feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
              <span>{feedback.text}</span>
            </span>
            <span className="calendar-dnd-toast-actions">
              {feedback.bookingId && (
                <Link className="panel-link" href={`/club/${org}/calendar/${feedback.bookingId}`}>
                  جزئیات سانس
                  <ArrowUpRight size={14} />
                </Link>
              )}
              <button
                type="button"
                className="calendar-dnd-dismiss"
                aria-label="بستن پیام"
                onClick={() => setFeedback(null)}
              >
                <X size={15} />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedBooking && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="calendar-dnd-banner"
          role="status"
        >
          <span>
            <CalendarClock size={16} />
            <strong>
              در حال جابه‌جایی: {bookingKinds[selectedBooking.kind]} ({selectedBooking.court})
            </strong>
            <span>
              — {view === 'day' ? 'روی یکی از ساعت‌های آزاد همان زمین رها یا کلیک کنید.' : 'روی روز دلخواه در تقویم بالا رها کنید.'}
            </span>
          </span>
          {pickModeBookingId && (
            <button
              type="button"
              className="button subtle calendar-dnd-cancel-pick"
              onClick={() => setPickModeBookingId(null)}
            >
              انصراف
            </button>
          )}
        </motion.div>
      )}

      {view !== 'day' && (
        <section className="panel local-panel calendar-grid-panel" aria-label="تقویم بازه">
          <div className="calendar-section-title">
            <h2>{view === 'week' ? 'روزهای هفته' : 'روزهای ماه'}</h2>
            <small>سانس‌ها را از فهرست پایین بکشید و روی روز دلخواه رها کنید.</small>
          </div>
          <div className={`calendar-grid ${view === 'month' ? 'is-month' : ''}`}>
            {view === 'month' &&
              weekLabels.map((name, index) => (
                <span className="calendar-weeklabel" key={name} title={name}>
                  {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'][index]}
                </span>
              ))}
            {view === 'month' &&
              Array.from({ length: monthOffset }, (_, index) => <span aria-hidden="true" key={index} />)}
            {periodDays.map(day => {
              const count = bookingsByDay.get(day.day)?.filter(b => b.status === 'confirmed').length ?? day.confirmed;
              const canDropDay = Boolean(selectedBooking && day.day >= today);
              const isHoveredDay = hoverDay === day.day;
              const isSelectedDay = day.day === date;
              const isTodayDay = day.day === today;
              return (
                <Link
                  key={day.day}
                  href={day.href}
                  data-drop-day={day.day}
                  data-selected={isSelectedDay ? 'true' : undefined}
                  data-today={isTodayDay ? 'true' : undefined}
                  aria-current={isSelectedDay ? 'date' : undefined}
                  aria-label={`${day.longDay}${isTodayDay ? ' (امروز)' : ''}، ${numberFa.format(count)} سانس`}
                  className={[
                    'calendar-day',
                    isSelectedDay ? 'is-selected' : '',
                    isTodayDay ? 'is-today' : '',
                    canDropDay ? 'is-drop-ready' : '',
                    isHoveredDay ? 'is-drop-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={event => {
                    if (!activeBookingId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = day.day >= today ? 'move' : 'none';
                    setHoverDay(day.day);
                  }}
                  onDragLeave={() => {
                    if (hoverDay === day.day) setHoverDay(null);
                  }}
                  onDrop={event => {
                    if (!activeBookingId) return;
                    event.preventDefault();
                    const bookingId = event.dataTransfer.getData('text/plain') || activeBookingId;
                    const target = items.find(item => item.id === bookingId);
                    setHoverDay(null);
                    if (target) {
                      void commitMove(target, day.day, target.startMinute);
                    }
                  }}
                  onClick={event => {
                    if (pickModeBookingId && selectedBooking && day.day >= today) {
                      event.preventDefault();
                      void commitMove(selectedBooking, day.day, selectedBooking.startMinute);
                    }
                  }}
                >
                  {view === 'week' && <small>{day.shortWeekday}</small>}
                  <span className="calendar-day-num">
                    <strong>{day.dayNumber}</strong>
                    {isTodayDay && <span className="calendar-today-tag">امروز</span>}
                  </span>
                  <span className={count ? 'calendar-count has-bookings' : 'calendar-count'}>
                    {count ? numberFa.format(count) : '–'}
                    {view === 'week' && count > 0 ? ' سانس' : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {view === 'day' && (
        <section className="panel local-panel calendar-board-panel" aria-label="جدول زمان‌بندی تعاملی زمین‌ها">
          <div className="calendar-section-title">
            <div>
              <h2>جدول زمانی و جابه‌جایی سانس‌ها</h2>
              <small>سانس‌های تأییدشدهٔ پیشِ‌رو را با کشیدن و رها کردن (Drag &amp; Drop) به ساعت دیگری منتقل کنید.</small>
            </div>
            <div className="calendar-board-legend" aria-hidden="true">
              <span className="legend-chip is-movable">
                <GripVertical size={13} />
                قابل جابه‌جایی
              </span>
              <span className="legend-chip is-locked">
                <Lock size={12} />
                قفل / گذشته
              </span>
            </div>
          </div>

          {!activeCourts.length ? (
            <div className="empty-state">
              <strong>زمین فعالی برای نمایش در این جدول انتخاب نشده است.</strong>
            </div>
          ) : (
            <div className="calendar-timeline-scroll">
              <div
                className={`calendar-timeline ${activeBookingId ? 'is-dragging-active' : ''}`}
                style={{ gridTemplateColumns: `68px repeat(${activeCourts.length}, minmax(210px, 1fr))` }}
              >
                <div className="calendar-timeline-corner" aria-hidden="true">
                  ساعت
                </div>
                {activeCourts.map(court => (
                  <div
                    key={court.id}
                    className={`calendar-court-head ${selectedBooking?.court_id === court.id ? 'is-target-court' : ''}`}
                  >
                    <strong>{court.name}</strong>
                    <small>{court.surface}</small>
                  </div>
                ))}

                <div className="calendar-time-axis" style={{ height: `${timelineSlots.length * SLOT_HEIGHT}px` }}>
                  {timelineSlots.map(minute => (
                    <div
                      key={minute}
                      className={`calendar-time-tick ${minute % 60 === 0 ? 'is-hour' : ''}`}
                      style={{ height: `${SLOT_HEIGHT}px` }}
                    >
                      {minute % 60 === 0 && <bdi dir="ltr">{minutesToHHMM(minute)}</bdi>}
                    </div>
                  ))}
                  {nowIndicatorTop !== null && (
                    <div className="calendar-now-dot" style={{ top: `${nowIndicatorTop}px` }} aria-hidden="true" />
                  )}
                </div>

                {activeCourts.map(court => {
                  const courtBookings = items.filter(b => b.court_id === court.id && b.local_day === date);
                  const isTargetCourt = selectedBooking ? selectedBooking.court_id === court.id : false;
                  const isDimmedCourt = Boolean(selectedBooking && selectedBooking.court_id !== court.id);

                  return (
                    <div
                      key={court.id}
                      data-court-lane={court.id}
                      className={`calendar-court-lane ${isTargetCourt ? 'is-target-lane' : ''} ${isDimmedCourt ? 'is-dimmed-lane' : ''}`}
                      style={{ height: `${timelineSlots.length * SLOT_HEIGHT}px` }}
                    >
                      {timelineSlots.map(minute => {
                        const isHourLine = minute % 60 === 0;
                        const slotValid =
                          selectedBooking && isTargetCourt
                            ? validateDropTarget({
                                booking: selectedBooking,
                                targetDate: date,
                                targetStartMinute: minute,
                                bookings: items,
                                timezone,
                                branchActive,
                                nowDate: today,
                                nowMinute,
                              }).ok
                            : false;

                        const slotHovered = hoverSlot?.courtId === court.id && hoverSlot.minute === minute;

                        return (
                          <div
                            key={minute}
                            data-drop-court={court.id}
                            data-drop-minute={minute}
                            data-slot-time={minutesToHHMM(minute)}
                            className={[
                              'calendar-slot-cell',
                              isHourLine ? 'is-hour' : 'is-half',
                              pickModeBookingId && isTargetCourt && slotValid ? 'is-pick-candidate' : '',
                              slotHovered ? (slotValid ? 'is-hovered-valid' : 'is-hovered-invalid') : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={{ height: `${SLOT_HEIGHT}px` }}
                            onDragOver={event => {
                              if (!activeBookingId) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = slotValid ? 'move' : 'none';
                              setHoverSlot({ courtId: court.id, minute });
                            }}
                            onDrop={event => {
                              if (!activeBookingId) return;
                              event.preventDefault();
                              const bookingId = event.dataTransfer.getData('text/plain') || activeBookingId;
                              const target = items.find(item => item.id === bookingId);
                              setHoverSlot(null);
                              if (!target) return;
                              if (target.court_id !== court.id) {
                                setFeedback({ kind: 'error', text: 'تغییر زمان در تقویم فقط روی زمین فعلی همان سانس مجاز است.' });
                                return;
                              }
                              void commitMove(target, date, minute);
                            }}
                            onClick={() => {
                              if (!pickModeBookingId || !selectedBooking) return;
                              if (selectedBooking.court_id !== court.id) return;
                              void commitMove(selectedBooking, date, minute);
                            }}
                          />
                        );
                      })}

                      {nowIndicatorTop !== null && (
                        <div className="calendar-now-line" style={{ top: `${nowIndicatorTop}px` }} aria-hidden="true" />
                      )}

                      {hoverSlot?.courtId === court.id && hoverValidation && (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.14, ease: EASE_SMOOTH }}
                          className={`calendar-drop-ghost ${hoverValidation.ok ? 'is-valid' : 'is-invalid'}`}
                          style={{
                            top: `${((hoverSlot.minute - DAY_START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT + 2}px`,
                            height: `${
                              hoverValidation.ok
                                ? Math.max(SLOT_HEIGHT - 4, (hoverValidation.durationMin / SLOT_MINUTES) * SLOT_HEIGHT - 4)
                                : SLOT_HEIGHT * 2 - 4
                            }px`,
                          }}
                          aria-hidden="true"
                        >
                          {hoverValidation.ok ? (
                            <>
                              <strong>
                                <bdi dir="ltr">
                                  {hoverValidation.startHour}–{hoverValidation.endHour}
                                </bdi>
                              </strong>
                              <span>رها کنید برای انتقال</span>
                            </>
                          ) : (
                            <span>{hoverValidation.message}</span>
                          )}
                        </motion.div>
                      )}

                      {courtBookings.map(booking => {
                        const clampedStart = Math.max(DAY_START_MINUTE, booking.startMinute);
                        const clampedEnd = Math.min(DAY_END_MINUTE, booking.endMinute);
                        if (clampedEnd <= clampedStart) return null;
                        const top = ((clampedStart - DAY_START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
                        const height = Math.max(SLOT_HEIGHT * 1.4, ((clampedEnd - clampedStart) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
                        const movable = canMoveBooking({
                          status: booking.status,
                          session_status: booking.session_status,
                          startsAtMs: new Date(booking.startsAtIso).getTime(),
                          branchActive,
                        });
                        const isDragging = activeBookingId === booking.id;
                        const isPicked = pickModeBookingId === booking.id;
                        const isSaving = savingId === booking.id;

                        return (
                          <div
                            key={booking.id}
                            style={{ top: `${top}px`, height: `${height}px` }}
                            className={[
                              'calendar-booking-slot',
                              isDragging ? 'is-dragging' : '',
                              isPicked ? 'is-picked' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <article
                              data-booking-card={booking.id}
                              data-movable={movable ? 'true' : 'false'}
                              draggable={movable && !isSaving}
                              onDragStart={event => startDrag(event, booking)}
                              onDragEnd={endDrag}
                              className={[
                                'calendar-booking-block',
                                `kind-${booking.kind}`,
                                booking.status === 'cancelled' ? 'is-cancelled' : '',
                                movable ? 'is-movable' : 'is-locked',
                                isDragging ? 'is-dragging' : '',
                                isPicked ? 'is-picked' : '',
                                isSaving ? 'is-saving' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <div className="calendar-block-top">
                                <span className="calendar-block-title">
                                  {movable ? <GripVertical size={14} className="calendar-drag-grip" /> : <Lock size={12} />}
                                  <strong>{bookingKinds[booking.kind]}</strong>
                                </span>
                                <div className="calendar-block-actions">
                                  {movable && (
                                    <button
                                      type="button"
                                      className={`calendar-pick-btn ${isPicked ? 'is-active' : ''}`}
                                      title="انتخاب ساعت جدید"
                                      aria-label={`انتخاب ساعت جدید برای ${bookingKinds[booking.kind]}`}
                                      onClick={event => {
                                        event.stopPropagation();
                                        setPickModeBookingId(current => (current === booking.id ? null : booking.id));
                                        setFeedback(null);
                                      }}
                                    >
                                      <Move size={13} />
                                    </button>
                                  )}
                                  <Link
                                    href={`/club/${org}/calendar/${booking.id}`}
                                    className="calendar-detail-btn"
                                    title="جزئیات سانس"
                                    aria-label={`مشاهدهٔ جزئیات ${bookingKinds[booking.kind]}`}
                                  >
                                    <ArrowUpRight size={14} />
                                  </Link>
                                </div>
                              </div>
                              <div className="calendar-block-meta">
                                <span>{booking.booker_name ?? booking.coach ?? 'بدون عنوان'}</span>
                                <bdi className="calendar-time" dir="ltr">
                                  {booking.startHour}–{booking.endHour}
                                </bdi>
                              </div>
                            </article>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {freeWindowsSlot}

      <section className="panel local-panel" aria-label="فهرست سانس‌ها">
        <div className="calendar-section-title">
          <h2>سانس‌ها</h2>
          <small>{numberFa.format(totalBookings)} سانس در این بازه</small>
        </div>
        {items.length ? (
          <ul className="resource-list calendar-list">
            {items.map(booking => {
              const movable = canMoveBooking({
                status: booking.status,
                session_status: booking.session_status,
                startsAtMs: new Date(booking.startsAtIso).getTime(),
                branchActive,
              });
              const statusText =
                booking.status === 'cancelled'
                  ? 'لغوشده'
                  : booking.session_status === 'completed'
                    ? 'برگزارشده'
                    : 'تأییدشده';
              const isPicked = pickModeBookingId === booking.id;

              return (
                <li
                  key={booking.id}
                  draggable={movable && savingId !== booking.id}
                  onDragStart={event => startDrag(event, booking)}
                  onDragEnd={endDrag}
                  className={`calendar-list-item ${movable ? 'is-movable' : ''} ${activeBookingId === booking.id ? 'is-dragging' : ''} ${isPicked ? 'is-picked' : ''}`}
                >
                  <div className={`calendar-row-wrap ${isPicked ? 'is-picked' : ''}`}>
                    {movable && (
                      <button
                        type="button"
                        className={`calendar-row-handle ${isPicked ? 'is-active' : ''}`}
                        title={view === 'day' ? 'انتخاب برای تغییر ساعت' : 'کشیدن یا انتخاب برای انتقال به روز دیگر'}
                        aria-label={`انتقال ${bookingKinds[booking.kind]}`}
                        onClick={() => {
                          setPickModeBookingId(current => (current === booking.id ? null : booking.id));
                          setFeedback(null);
                        }}
                      >
                        <GripVertical size={15} />
                      </button>
                    )}
                    <Link className="calendar-row" href={`/club/${org}/calendar/${booking.id}`}>
                      <span>
                        <strong>{bookingKinds[booking.kind]}</strong>
                        <small>{booking.booker_name ?? booking.coach}</small>
                      </span>
                      <span>{booking.court}</span>
                      <span>
                        <bdi className="calendar-time" dir="ltr">
                          {booking.startHour}–{booking.endHour}
                        </bdi>
                        {view !== 'day' && <small>{booking.dayLabel}</small>}
                      </span>
                      <span className={`resource-status ${booking.status === 'cancelled' ? 'is-inactive' : 'is-active'}`}>
                        <i />
                        {statusText}
                      </span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state">
            <strong>سانسی در این بازه ثبت نشده است.</strong>
          </div>
        )}
        {pages > 1 && (
          <nav className="resource-pagination" aria-label="صفحه‌های سانس">
            {prevPageHref && (
              <Link className="button subtle" href={prevPageHref}>
                قبلی
              </Link>
            )}
            <span>
              {numberFa.format(page)} از {numberFa.format(pages)}
            </span>
            {nextPageHref && (
              <Link className="button subtle" href={nextPageHref}>
                بعدی
              </Link>
            )}
          </nav>
        )}
      </section>
    </MotionConfig>
  );
}
