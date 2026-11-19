import { centsFromInput, localDateTime } from './input';

describe('formularios de gestión', () => {
  it('convierte euros a céntimos exactos', () => {
    expect(centsFromInput('19,99')).toBe(1999);
    expect(centsFromInput('0.05')).toBe(5);
    expect(centsFromInput('1.999')).toBeNull();
    expect(centsFromInput('-1')).toBeNull();
  });
  it('usa la zona IANA del local y rechaza horas inexistentes o ambiguas', () => {
    expect(localDateTime('2026-11-19T10:00', 'Europe/Madrid')).toBe('2026-11-19T09:00:00.000Z');
    expect(localDateTime('2026-03-29T02:30', 'Europe/Madrid')).toBeNull();
    expect(localDateTime('2026-10-25T02:30', 'Europe/Madrid')).toBeNull();
  });
});
