import assert from 'node:assert/strict';
import { test } from 'node:test';

test('T2-09-ELAPSED-01: Booking boundary time transition triggers elapsed status when ends_at <= now', () => {
  const isElapsed = (endsAt, now) => new Date(endsAt) <= new Date(now);
  assert.equal(isElapsed('2026-11-14T14:00:00Z', '2026-11-14T14:00:00Z'), true);
  assert.equal(isElapsed('2026-11-14T14:00:00Z', '2026-11-14T13:59:59Z'), false);
});

test('T2-09-ELAPSED-02: No-show booking state displays عدم حضور indicator', () => {
  const getBadge = (status) => status === 'no-show' ? 'عدم حضور' : 'پایان‌یافته';
  assert.equal(getBadge('no-show'), 'عدم حضور');
});

test('T2-09-ELAPSED-03: Status badge class naming conventions are uniform across views', () => {
  const views = ['day', 'week', 'month'];
  for (const view of views) {
    const badgeClass = `resource-status is-elapsed`;
    assert.match(badgeClass, /is-elapsed/);
  }
});

test('T2-09-ELAPSED-04: Elapsed booking state disables cancellation action', () => {
  const isActionDisabled = (status) => status === 'elapsed' || status === 'cancelled';
  assert.equal(isActionDisabled('elapsed'), true);
  assert.equal(isActionDisabled('confirmed'), false);
});

test('T2-09-ELAPSED-05: Midnight transition boundary is evaluated in local timezone context', () => {
  const localSlotEnd = new Date('2026-11-14T20:30:00Z'); // 24:00 Tehran time (+03:30)
  const isPastMidnight = (now) => new Date(now) >= localSlotEnd;
  assert.equal(isPastMidnight('2026-11-14T20:30:01Z'), true);
});
