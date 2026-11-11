import { ApiError } from './events';

export function parseBarnIds(value: string): number[] {
  if (!/^\d+(,\d+)*$/.test(value) || value.length > 2000) throw new ApiError(400, 'Selección de galpones inválida');
  const ids = [...new Set(value.split(',').map(Number))];
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new ApiError(400, 'Selección de galpones inválida');
  return ids;
}

export async function selectedBarnScope(db: D1Database, value: string, role: string, assigned: string[]) {
  const ids = parseBarnIds(value);
  const rows = await db.prepare(`SELECT id,name FROM barns WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids).all<{ id: number; name: string }>();
  const barns = rows.results ?? [];
  if (barns.length !== ids.length || (role !== 'administrador' && barns.some(barn => !assigned.includes(barn.name)))) {
    throw new ApiError(403, 'No tiene acceso a los galpones seleccionados');
  }
  return barns.map(barn => barn.name);
}
