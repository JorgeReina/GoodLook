import { localTimeToUtc } from '../../pilot/local-time';

export function centsFromInput(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 4_294_967_295 ? cents : null;
}

export function localDateTime(value: string, timezone: string): string | null {
  const [day, time] = value.split('T');
  if (!day || !time) return null;
  const result = localTimeToUtc(day, time, timezone, 0);
  return result.status === 'valid' ? result.iso : null;
}
