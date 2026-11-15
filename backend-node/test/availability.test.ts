import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAvailableSlots, intervalsOverlap } from '../src/appointments/availability.js';

const minute = 60_000;

test('a half-open interval does not overlap when appointments touch', () => {
  assert.equal(intervalsOverlap({ start: 0, end: 30 * minute }, { start: 30 * minute, end: 60 * minute }), false);
  assert.equal(intervalsOverlap({ start: 0, end: 31 * minute }, { start: 30 * minute, end: 60 * minute }), true);
});

test('generates complete aligned slots and excludes every overlapping appointment', () => {
  const result = findAvailableSlots({ working: { start: 0, end: 120 * minute }, durationMinutes: 30, stepMinutes: 15, occupied: [{ start: 45 * minute, end: 75 * minute }] });
  assert.deepEqual(result, [0, 15, 75, 90].map(start => ({ start: start * minute, end: (start + 30) * minute })));
});

test('slots must fit entirely in working hours and may end at closing', () => {
  assert.deepEqual(findAvailableSlots({ working: { start: 0, end: 45 * minute }, durationMinutes: 30, stepMinutes: 15, occupied: [] }), [ { start: 0, end: 30 * minute }, { start: 15 * minute, end: 45 * minute } ]);
});

test('rejects non-positive, reversed, non-integer and invalid intervals', () => {
  for (const input of [
    { working: {start: 10, end: 10}, durationMinutes: 30, stepMinutes: 15, occupied: [] },
    { working: {start: 0, end: 100}, durationMinutes: 0, stepMinutes: 15, occupied: [] },
    { working: {start: 0, end: 100}, durationMinutes: 30, stepMinutes: 0, occupied: [] },
    { working: {start: 0, end: 100}, durationMinutes: 30, stepMinutes: 15, occupied: [{ start: NaN, end: 5 }] },
    { working: {start: 0, end: Infinity}, durationMinutes: 30, stepMinutes: 15, occupied: [] },
    { working: {start: 0, end: 100}, durationMinutes: 1.5, stepMinutes: 15, occupied: [] },
  ]) assert.throws(() => findAvailableSlots(input), RangeError);
  assert.throws(() => intervalsOverlap({start: 5, end: 1}, {start: 0, end: 2}), RangeError);
});
