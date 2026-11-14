import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  SLOT_MINUTES,
  buildTimelineSlots,
  canMoveBooking,
  hhmmToMinutes,
  minutesToHHMM,
  validateDropTarget,
} from '../src/lib/calendar-dnd.ts';

test('minutesToHHMM and hhmmToMinutes round-trip cleanly', () => {
  assert.equal(minutesToHHMM(480), '08:00');
  assert.equal(minutesToHHMM(1050), '17:30');
  assert.equal(minutesToHHMM(1320), '22:00');
  assert.equal(hhmmToMinutes('08:00'), 480);
  assert.equal(hhmmToMinutes('17:30'), 1050);
  assert.equal(hhmmToMinutes('22:00'), 1320);
});

test('buildTimelineSlots builds half-hour steps from 08:00 to 21:30', () => {
  const slots = buildTimelineSlots(DAY_START_MINUTE, DAY_END_MINUTE, SLOT_MINUTES);
  assert.equal(slots[0], 480);
  assert.equal(slots[slots.length - 1], 1290);
  assert.equal(slots.length, 28);
});

test('canMoveBooking allows upcoming confirmed scheduled bookings on active branch', () => {
  const now = Date.parse('2026-11-14T10:00:00Z');
  assert.equal(
    canMoveBooking({
      status: 'confirmed',
      session_status: 'scheduled',
      startsAtMs: Date.parse('2026-11-14T13:30:00Z'),
      branchActive: true,
      nowMs: now,
    }),
    true,
  );
  assert.equal(
    canMoveBooking({
      status: 'cancelled',
      session_status: 'scheduled',
      startsAtMs: Date.parse('2026-11-14T13:30:00Z'),
      branchActive: true,
      nowMs: now,
    }),
    false,
  );
  assert.equal(
    canMoveBooking({
      status: 'confirmed',
      session_status: 'completed',
      startsAtMs: Date.parse('2026-11-14T13:30:00Z'),
      branchActive: true,
      nowMs: now,
    }),
    false,
  );
  assert.equal(
    canMoveBooking({
      status: 'confirmed',
      session_status: 'scheduled',
      startsAtMs: Date.parse('2026-11-14T09:00:00Z'),
      branchActive: true,
      nowMs: now,
    }),
    false,
  );
});

test('validateDropTarget checks conflicts, operating hours, and past times', () => {
  const tz = 'Asia/Tehran';
  const today = '2026-11-14';
  const nowMinute = 12 * 60; // 12:00
  const nowMs = Date.parse('2026-11-14T08:30:00Z'); // 12:00 Tehran (+03:30)

  // Booking 1: 17:00-18:00 (1020-1080 Tehran -> 13:30-14:30Z)
  const booking1 = {
    id: 'b1',
    court_id: 'c1',
    startsAtIso: '2026-11-14T13:30:00.000Z',
    endsAtIso: '2026-11-14T14:30:00.000Z',
    local_day: today,
    status: 'confirmed',
    session_status: 'scheduled',
  };
  // Booking 2: 19:00-20:30 on same court c1 (1140-1230 Tehran -> 15:30-17:00Z)
  const booking2 = {
    id: 'b2',
    court_id: 'c1',
    startsAtIso: '2026-11-14T15:30:00.000Z',
    endsAtIso: '2026-11-14T17:00:00.000Z',
    local_day: today,
    status: 'confirmed',
    session_status: 'scheduled',
  };
  const bookings = [booking1, booking2];

  // Valid move of b1 to 15:00-16:00 (900)
  const okMove = validateDropTarget({
    booking: booking1,
    targetDate: today,
    targetStartMinute: 15 * 60,
    bookings,
    timezone: tz,
    branchActive: true,
    nowDate: today,
    nowMinute,
    nowMs,
  });
  assert.deepEqual(okMove, {
    ok: true,
    startInput: '2026-11-14T15:00',
    startHour: '15:00',
    endHour: '16:00',
  });

  // Conflict move of b1 to 18:30-19:30 (overlaps b2 19:00-20:30)
  const conflictMove = validateDropTarget({
    booking: booking1,
    targetDate: today,
    targetStartMinute: 18 * 60 + 30,
    bookings,
    timezone: tz,
    branchActive: true,
    nowDate: today,
    nowMinute,
    nowMs,
  });
  assert.deepEqual(conflictMove, { ok: false, reason: 'conflict' });

  // Outside operating hours (21:30 for a 60m booking ends at 22:30 > 22:00)
  const hoursMove = validateDropTarget({
    booking: booking1,
    targetDate: today,
    targetStartMinute: 21 * 60 + 30,
    bookings,
    timezone: tz,
    branchActive: true,
    nowDate: today,
    nowMinute,
    nowMs,
  });
  assert.deepEqual(hoursMove, { ok: false, reason: 'hours' });

  // Past slot (10:00 < 12:00)
  const pastMove = validateDropTarget({
    booking: booking1,
    targetDate: today,
    targetStartMinute: 10 * 60,
    bookings,
    timezone: tz,
    branchActive: true,
    nowDate: today,
    nowMinute,
    nowMs,
  });
  assert.deepEqual(pastMove, { ok: false, reason: 'past' });
});
