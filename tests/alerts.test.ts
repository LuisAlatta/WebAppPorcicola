import { describe, expect, it } from 'vitest';
import { classifyAlertDate } from '../worker/alerts';

describe('clasificación local de fechas de alertas (ALE-01)', () => {
  it('incluye el día 7 en próximas y clasifica correctamente los límites', () => {
    expect(classifyAlertDate('2026-11-07','2026-11-08')).toBe('overdue');
    expect(classifyAlertDate('2026-11-08','2026-11-08')).toBe('today');
    expect(classifyAlertDate('2026-11-09','2026-11-08')).toBe('upcoming');
    expect(classifyAlertDate('2026-11-15','2026-11-08')).toBe('upcoming');
    expect(classifyAlertDate('2026-11-16','2026-11-08')).toBe('future');
  });
});
