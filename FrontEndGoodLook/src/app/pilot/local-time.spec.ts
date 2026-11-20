import { localTimeToUtc } from './local-time';

describe('localTimeToUtc', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');
  it('converts winter and summer local times to UTC', () => {
    expect(localTimeToUtc('2026-02-10','12:30','Europe/Madrid',now)).toEqual({status:'valid',iso:'2026-02-10T11:30:00.000Z'});
    expect(localTimeToUtc('2026-07-10','12:30','Europe/Madrid',now)).toEqual({status:'valid',iso:'2026-07-10T10:30:00.000Z'});
  });
  it('rejects a skipped and an ambiguous daylight saving time', () => {
    expect(localTimeToUtc('2026-03-29','02:30','Europe/Madrid',now).status).toBe('invalid');
    expect(localTimeToUtc('2026-10-25','02:30','Europe/Madrid',now).status).toBe('ambiguous');
  });
  it('rejects invalid dates, time zones and past appointments', () => {
    expect(localTimeToUtc('2026-02-30','12:00','Europe/Madrid',now).status).toBe('invalid');
    expect(localTimeToUtc('2026-02-10','12:30','invalid-zone',now).status).toBe('invalid');
    expect(localTimeToUtc('2025-01-01','12:00','UTC',now).status).toBe('past');
  });
});
