export type LocalTimeResult = { status: 'valid'; iso: string } | { status: 'invalid' | 'ambiguous' | 'past' };

/** Convert a wall time in an IANA zone without silently accepting DST gaps or overlaps. */
export function localTimeToUtc(date: string, time: string, zone: string, now = Date.now()): LocalTimeResult {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock || !Number.isFinite(now)) return {status:'invalid'};
  const [, year, month, dom] = day.map(Number);
  const [, hour, minute] = clock.map(Number);
  if (year < 1000 || hour > 23 || minute > 59) return {status:'invalid'};
  const wall = Date.UTC(year, month - 1, dom, hour, minute);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== dom) return {status:'invalid'};
  try {
    const format = new Intl.DateTimeFormat('en-GB', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
    const components = (epoch: number) => Object.fromEntries(format.formatToParts(epoch).map(part => [part.type, part.value]));
    const offsets = new Set<number>();
    // Sample surrounding offsets; each possible offset generates one UTC candidate.
    for (let sample = wall - 36 * 3600000; sample <= wall + 36 * 3600000; sample += 30 * 60000) {
      const p = components(sample);
      offsets.add(Date.UTC(+p['year'], +p['month'] - 1, +p['day'], +p['hour'], +p['minute'], +p['second']) - sample);
    }
    const matches: number[] = [];
    for (const offset of offsets) {
      const candidate = wall - offset;
      const p = components(candidate);
      if (+p['year'] === year && +p['month'] === month && +p['day'] === dom && +p['hour'] === hour && +p['minute'] === minute && +p['second'] === 0) matches.push(candidate);
    }
    if (!matches.length) return {status:'invalid'};
    if (matches.length > 1) return {status:'ambiguous'};
    if (matches[0] <= now) return {status:'past'};
    return {status:'valid', iso:new Date(matches[0]).toISOString()};
  } catch { return {status:'invalid'}; }
}
