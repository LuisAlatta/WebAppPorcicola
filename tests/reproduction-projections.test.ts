import { describe, expect, it } from 'vitest';
import { projectedDate } from '../src/utils/reproduction';

describe('Fechas probables de inseminación', () => {
  it('calcula 21 días y permite modificar el intervalo', () => {
    expect(projectedDate('2026-11-14', '21')).toBe('2026-12-05');
    expect(projectedDate('2026-11-14', '18')).toBe('2026-12-02');
  });
  it('calcula parto y cruza meses y años sin desfase horario', () => {
    expect(projectedDate('2026-11-14', '114')).toBe('2027-03-08');
    expect(projectedDate('2028-02-08', '21')).toBe('2028-02-29');
  });
  it('no muestra fechas para intervalos vacíos o inválidos', () => {
    for (const days of ['', '0', '-1', '2.5', 'abc']) expect(projectedDate('2026-11-14', days)).toBe('');
    expect(projectedDate('', '21')).toBe('');
  });
});
