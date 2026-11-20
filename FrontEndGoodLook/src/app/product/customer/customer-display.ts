import type { Slot } from './customer-api';

const DAY = 86_400_000;

export interface Window { from: string; to: string; }

export function timeWindow(start: number, days: number): Window {
  return { from: new Date(start).toISOString(), to: new Date(start + days * DAY).toISOString() };
}

export function price(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100);
}

export function slotDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset',
  }).format(new Date(instant));
}

export function windowDates(window: Window, timezone: string) {
  const fmt = new Intl.DateTimeFormat('es-ES', { timeZone: timezone, dateStyle: 'medium' });
  return fmt.formatRange(new Date(window.from), new Date(window.to));
}

export function slotTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset',
  }).format(new Date(instant));
}

export function groupSlots(slots: Slot[], timezone: string) {
  const days = new Map<string, Slot[]>();
  const fmt = new Intl.DateTimeFormat('es-ES', { timeZone: timezone, dateStyle: 'full' });
  for (const slot of slots) {
    const day = fmt.format(new Date(slot.startAt));
    const items = days.get(day);
    if (items) items.push(slot);
    else days.set(day, [slot]);
  }
  return Array.from(days, ([day, items]) => ({ day, items }));
}
