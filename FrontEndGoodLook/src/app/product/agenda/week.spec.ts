import { businessDay, mondayOf, shiftDays } from './week';

describe('semana del negocio', () => {
  it('usa el día del negocio y conserva el lunes local durante el cambio de hora', () => {
    expect(businessDay('2026-10-25T23:30:00Z', 'Europe/Madrid')).toBe('2026-10-26');
    expect(businessDay('2026-10-25T23:30:00Z', 'America/New_York')).toBe('2026-10-25');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(shiftDays('2026-10-19', 7)).toBe('2026-10-26');
  });
});
