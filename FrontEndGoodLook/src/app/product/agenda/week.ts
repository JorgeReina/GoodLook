export function businessDay(instant: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(instant));
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function calendarDate(day: string) {
  return new Date(day + 'T00:00:00Z');
}

export function shiftDays(day: string, delta: number): string {
  const date = calendarDate(day);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  return shiftDays(day, -((calendarDate(day).getUTCDay() + 6) % 7));
}

export function displayDay(day: string): string {
  return new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(calendarDate(day));
}

export function displayInstant(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat('es', {
    timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(instant));
}
