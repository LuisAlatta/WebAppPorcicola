import { ApiError } from './events';

export interface AnimalRefOptions {
  columns?: string;
  allowedBarnNames?: string[] | null;
  barnId?: number | null;
  effectiveDate?: string;
  activeOnly?: boolean;
  ambiguousMessage?: string;
}

export async function resolveAllowedBarnIds(
  db: D1Database,
  allowedBarnNames?: string[] | null,
): Promise<number[] | null> {
  if (allowedBarnNames === undefined || allowedBarnNames === null) return null;
  if (allowedBarnNames.length === 0) return [];
  const placeholders = allowedBarnNames.map(() => '?').join(', ');
  const res = await db.prepare(`SELECT id FROM barns WHERE name IN (${placeholders})`)
    .bind(...allowedBarnNames)
    .all<{ id: number }>();
  return (res.results ?? []).map((row) => Number(row.id));
}

function pickUniqueRow<T extends Record<string, unknown>>(
  rows: T[],
  ref: string,
  ambiguousMessage?: string,
): { row: T | null; outOfScope: boolean } {
  if (rows.length === 1) return { row: rows[0], outOfScope: false };
  const active = rows.filter((row) => Number(row.is_active) === 1 && row.exit_date === null);
  if (active.length === 1) return { row: active[0], outOfScope: false };
  throw new ApiError(
    409,
    ambiguousMessage ?? `Hay más de un animal con el código ${ref} en los galpones seleccionados; seleccione un galpón específico`,
  );
}

/**
 * Resuelve una ficha animal por `id:<n>` o por `code` respetando galpones autorizados.
 * Si el mismo código está activo en varios galpones dentro del alcance, exige desambiguar.
 */
export async function resolveAnimalRef<T extends Record<string, unknown> = Record<string, unknown>>(
  db: D1Database,
  ref: string,
  options: AnimalRefOptions = {},
): Promise<{ row: T | null; outOfScope: boolean }> {
  const columns = options.columns ?? 'a.*';
  const baseSelect = `SELECT ${columns}, b.name AS barn_name FROM animals a JOIN barns b ON b.id = a.barn_id`;

  if (/^id:\d+$/.test(ref)) {
    const id = Number(ref.slice(3));
    const row = await db.prepare(`${baseSelect} WHERE a.id = ?`).bind(id).first<T>();
    if (!row) return { row: null, outOfScope: false };
    if (options.activeOnly && (Number(row.is_active) !== 1 || row.exit_date !== null)) {
      return { row: null, outOfScope: false };
    }
    return { row, outOfScope: false };
  }

  const allRes = await db.prepare(`${baseSelect} WHERE a.code = ? ORDER BY a.is_active DESC, a.id DESC`)
    .bind(ref).all<T>();
  const allRows = allRes.results ?? [];
  if (allRows.length === 0) return { row: null, outOfScope: false };

  const activeFiltered = options.activeOnly
    ? allRows.filter((row) => Number(row.is_active) === 1 && row.exit_date === null)
    : allRows;
  if (activeFiltered.length === 0) return { row: null, outOfScope: false };

  const allowedIds = await resolveAllowedBarnIds(db, options.allowedBarnNames);
  const hasBarnFilter = options.barnId !== undefined && options.barnId !== null;
  if (!hasBarnFilter && allowedIds === null) {
    return pickUniqueRow(activeFiltered, ref, options.ambiguousMessage);
  }

  const scoped: T[] = [];
  for (const row of activeFiltered) {
    let effectiveBarnId = Number(row.barn_id);
    if (options.effectiveDate) {
      const loc = await db.prepare(`SELECT barn_id FROM animal_location_history
        WHERE animal_id = ? AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)
        ORDER BY valid_from DESC, id DESC LIMIT 1`)
        .bind(Number(row.id), options.effectiveDate, options.effectiveDate)
        .first<{ barn_id: number }>();
      if (loc) effectiveBarnId = Number(loc.barn_id);
    }
    if (hasBarnFilter && effectiveBarnId !== Number(options.barnId)) continue;
    if (allowedIds !== null && !allowedIds.includes(effectiveBarnId)) continue;
    scoped.push(row);
  }

  if (scoped.length === 0) return { row: null, outOfScope: true };
  return pickUniqueRow(scoped, ref, options.ambiguousMessage);
}
