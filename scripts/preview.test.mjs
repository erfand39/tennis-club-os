import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays, bookingsOn, defaultStart, longDate, monthDays, occupied, seedBookings,
  storedBookings, today, validateBooking, weekStart,
} from '../prototype/model.mjs';

const rental = {
  id: 'test', date: today, court: 'one', start: 900, duration: 60,
  kind: 'rental', name: 'رزرو آزمایشی', status: 'confirmed', coach: '', student: '',
};

test('seed bookings are loadable and upcoming bookings satisfy booking rules', () => {
  assert.deepEqual(storedBookings(JSON.parse(JSON.stringify(seedBookings))), seedBookings);
  for (const booking of seedBookings.filter(row => row.status === 'confirmed')) {
    assert.equal(validateBooking(booking, seedBookings), null, booking.id);
  }
});

test('court overlaps are rejected while adjacent reservations are valid', () => {
  assert.equal(validateBooking({ ...rental, start: 960 }, seedBookings).field, 'court');
  assert.equal(validateBooking({ ...rental, start: 930 }, seedBookings), null);
});

test('coach and student conflicts are independent of the court', () => {
  const lesson = { ...rental, court: 'three', start: 960, duration: 30, kind: 'private', name: '' };
  assert.equal(validateBooking({ ...lesson, coach: 'kiani', student: 'amini' }, seedBookings).field, 'coach');
  assert.equal(validateBooking({ ...lesson, coach: 'moradi', student: 'rad' }, seedBookings).field, 'student');
  assert.equal(validateBooking({ ...lesson, coach: 'moradi', student: 'rahimi' }, seedBookings), null);
});

test('unavailable courts, past dates, invalid dates and closing time are rejected', () => {
  assert.equal(validateBooking({ ...rental, court: 'four' }, seedBookings).field, 'court');
  assert.equal(validateBooking({ ...rental, date: addDays(today, -1) }, seedBookings).field, 'date');
  assert.equal(validateBooking({ ...rental, date: '2027-02-30' }, seedBookings).field, 'date');
  assert.equal(validateBooking({ ...rental, start: 1290, duration: 60 }, seedBookings).field, 'start');
});

test('cancelling frees the slot, preserves history and restores occupancy', () => {
  const booked = [...seedBookings, rental];
  const cancelled = booked.map(row => row.id === rental.id ? { ...row, status: 'cancelled' } : row);
  const baseline = bookingsOn(seedBookings, today);
  assert.equal(occupied(baseline), 990);
  assert.equal(occupied(bookingsOn(booked, today)), 1050);
  assert.equal(occupied(bookingsOn(cancelled, today)), 990);
  assert.equal(cancelled.find(row => row.id === rental.id).status, 'cancelled');
  assert.equal(validateBooking({ ...rental, id: 'replacement' }, cancelled), null);
});

test('stored data rejects malformed, oversized and duplicate records', () => {
  assert.equal(storedBookings([{ ...rental, kind: '__proto__' }]), null);
  assert.equal(storedBookings([{ ...rental, start: 901 }]), null);
  assert.equal(storedBookings([rental, rental]), null);
  assert.equal(storedBookings(Array(251).fill(rental)), null);
});

test('Jalali month and Saturday-based week match the sample date', () => {
  assert.equal(longDate(today), 'چهارشنبه، ۲۰ آبان ۱۴۰۵');
  assert.equal(weekStart(today), '2026-11-07');
  const dates = monthDays(today);
  assert.equal(dates.length, 30);
  assert.equal(dates[0], '2026-10-23');
  assert.equal(dates.at(-1), '2026-11-21');
  assert.equal(defaultStart(seedBookings, today, 'one'), 900);
});
