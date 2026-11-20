/** UTC epoch milliseconds. Intervals use [start, end): adjacent bookings do not overlap. */
export interface TimeInterval {
  start: number;
  end: number;
}

export interface AvailabilityInput {
  working: TimeInterval;
  durationMinutes: number;
  stepMinutes: number;
  occupied: readonly TimeInterval[];
}

function validateInterval(interval: TimeInterval): void {
  if (!Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end) || interval.start >= interval.end) {
    throw new RangeError('Interval must have finite integer bounds with start before end');
  }
}

/** Compares half-open time ranges. */
export function intervalsOverlap(first: TimeInterval, second: TimeInterval): boolean {
  validateInterval(first);
  validateInterval(second);
  return first.start < second.end && second.start < first.end;
}

/**
 * Generates candidates aligned to the beginning of one working interval.
 * The caller supplies server-derived working hours and blocking appointments.
 * This is only an advisory calculation: it does not reserve a slot.
 */
export function findAvailableSlots(input: AvailabilityInput): TimeInterval[] {
  validateInterval(input.working);
  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes <= 0 ||
      !Number.isSafeInteger(input.stepMinutes) || input.stepMinutes <= 0) {
    throw new RangeError('Duration and step must be positive whole minutes');
  }
  for (const interval of input.occupied) validateInterval(interval);
  const duration = input.durationMinutes * 60_000;
  const step = input.stepMinutes * 60_000;
  if (!Number.isSafeInteger(duration) || !Number.isSafeInteger(step)) {
    throw new RangeError('Duration or step is too large');
  }
  const width = input.working.end - input.working.start;
  if (!Number.isSafeInteger(width)) throw new RangeError('Working interval is too large');
  if (width < duration) return [];
  const count = Math.floor((width - duration) / step) + 1;
  if (count > 10_000) throw new RangeError('Too many candidate slots');

  const available: TimeInterval[] = [];
  for (let index = 0; index < count; index++) {
    const start = input.working.start + index * step;
    const end = start + duration;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) throw new RangeError('Invalid slot bounds');
    if (!input.occupied.some(block => start < block.end && block.start < end)) available.push({ start, end });
  }
  return available;
}
