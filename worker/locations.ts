import { ApiError } from './events';

export interface LinkedLocation {
  code: string;
  parentCode: string | null;
  barnId: number | null;
}

interface LocationVersion extends LinkedLocation {
  id: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface LocationHierarchySnapshot {
  serialized: string;
  versions: LocationVersion[];
}

const HIERARCHY_SNAPSHOT_SQL = `SELECT json_group_array(json_array(id, code, parent_code, barn_id,
  effective_from, effective_to, location_type, status)) AS snapshot FROM (SELECT * FROM location_versions ORDER BY id)`;

/** La misma lectura alimenta la validación y la comparación dentro de la transacción. */
export async function getLocationHierarchySnapshot(db: D1Database): Promise<LocationHierarchySnapshot> {
  const serialized = await db.prepare(HIERARCHY_SNAPSHOT_SQL).first<string>('snapshot');
  if (typeof serialized !== 'string') throw new Error('No se pudo leer la jerarquía de ubicaciones');
  const rows = JSON.parse(serialized) as [number, string, string | null, number | null, string, string | null, string, string][];
  return { serialized, versions: rows.map(([id, code, parentCode, barnId, effectiveFrom, effectiveTo]) => ({
    id, code, parentCode, barnId, effectiveFrom, effectiveTo,
  })) };
}

export function linkedLocationsAt(snapshot: LocationHierarchySnapshot, effectiveDate: string): LinkedLocation[] {
  return snapshot.versions.filter((version) => version.effectiveFrom <= effectiveDate
    && (version.effectiveTo === null || version.effectiveTo > effectiveDate));
}

export function locationHierarchyGuardStatement(db: D1Database, snapshot: LocationHierarchySnapshot): D1PreparedStatement {
  return db.prepare(`INSERT INTO inventory_write_guard(guard_id)
    SELECT CASE WHEN (${HIERARCHY_SNAPSHOT_SQL}) = ? THEN 0 ELSE -1 END`).bind(snapshot.serialized);
}

/** Usa el CHECK existente para abortar el lote también en la configuración sin inventario. */
export function locationConfigGuardStatement(db: D1Database, condition: string, values: unknown[]): D1PreparedStatement {
  return db.prepare(`INSERT INTO location_versions(code, name, location_type, effective_from, created_at)
    SELECT '__guard__', '', '__conflict__', '0001-01-01', '' WHERE ${condition}`).bind(...values);
}

export function locationConfigHierarchyGuard(db: D1Database, snapshot: LocationHierarchySnapshot): D1PreparedStatement {
  return locationConfigGuardStatement(db, `(${HIERARCHY_SNAPSHOT_SQL}) <> ?`, [snapshot.serialized]);
}

/** Los hijos heredan el galpón de la raíz; un ciclo o padre ausente invalida la cadena. */
export function resolveLocationBarnId(locations: readonly LinkedLocation[], code: string): number | null {
  const byCode = new Map(locations.map((location) => [location.code, location]));
  const seen = new Set<string>();
  let location = byCode.get(code);
  while (location) {
    if (seen.has(location.code)) return null;
    seen.add(location.code);
    if (!location.parentCode) return location.barnId;
    location = byCode.get(location.parentCode);
  }
  return null;
}

export async function getLinkedLocations(db: D1Database, effectiveDate: string): Promise<LinkedLocation[]> {
  return linkedLocationsAt(await getLocationHierarchySnapshot(db), effectiveDate);
}

/** Una asignación abierta debe conservar su galpón en todas las vigencias posteriores. */
export async function assertLocationForBarn(
  db: D1Database, barnId: number, locationCode: string | null, effectiveDate: string,
  options: { ongoing?: boolean; stockAfterWrite?: boolean } = {},
): Promise<D1PreparedStatement | null> {
  if (!locationCode) return null;
  const snapshot = await getLocationHierarchySnapshot(db);
  const locations = linkedLocationsAt(snapshot, effectiveDate);
  if (!locations.some((location) => location.code === locationCode)) {
    throw new ApiError(400, 'La ubicación no está vigente en esa fecha');
  }
  const linkedBarnId = resolveLocationBarnId(locations, locationCode);
  if (linkedBarnId === null) throw new ApiError(400, 'La ubicación no tiene una cadena válida hasta un galpón vinculado');
  if (linkedBarnId !== barnId) throw new ApiError(400, 'La ubicación pertenece a otro galpón');
  const boundaries = [...new Set(snapshot.versions.flatMap((version) => [version.effectiveFrom, version.effectiveTo])
    .filter((date): date is string => date !== null && date > effectiveDate))].sort();
  if (options.ongoing) {
    for (const boundary of boundaries) {
      if (resolveLocationBarnId(linkedLocationsAt(snapshot, boundary), locationCode) !== barnId) {
        throw new ApiError(400, 'La permanencia del animal cruza un retiro o cambio de galpón programado para la ubicación');
      }
    }
  }
  if (options.stockAfterWrite) {
    const conflicts: string[] = [];
    const values: unknown[] = [snapshot.serialized];
    for (const [index, boundary] of boundaries.entries()) {
      if (resolveLocationBarnId(linkedLocationsAt(snapshot, boundary), locationCode) === barnId) continue;
      conflicts.push(`EXISTS(SELECT 1 FROM inventory_movements WHERE location_code=? AND barn_id=? AND effective_date<?
        GROUP BY lot_code,stage_code,sex HAVING SUM(CASE WHEN movement_type IN ('sale','death','transfer_out') THEN -quantity ELSE quantity END)<>0)`);
      values.push(locationCode, barnId, boundary);
      conflicts.push(`EXISTS(SELECT 1 FROM inventory_movements WHERE location_code=? AND barn_id=?
        AND effective_date>=? AND effective_date<COALESCE(?,'9999-12-31'))`);
      values.push(locationCode, barnId, boundary, boundaries[index + 1] ?? null);
    }
    if (conflicts.length) {
      // Se ejecuta al final del lote: incluye el stock escrito por esta misma operación.
      return db.prepare(`INSERT INTO inventory_write_guard(guard_id)
        SELECT CASE WHEN (${HIERARCHY_SNAPSHOT_SQL})=? AND NOT (${conflicts.join(' OR ')}) THEN 0 ELSE -1 END`).bind(...values);
    }
  }
  return locationHierarchyGuardStatement(db, snapshot);
}

/** Revalida asignaciones y saldos afectados en cada tramo de vigencia, incluidos los hijos. */
export async function locationReassignmentGuards(
  db: D1Database, snapshot: LocationHierarchySnapshot, candidate: LinkedLocation, from: string,
): Promise<D1PreparedStatement[]> {
  const result = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('animals','animal_location_history','inventory_movements')")
    .all<{ name: string }>();
  const tables = new Set((result.results ?? []).map((row) => row.name));
  const dates = [...new Set([from, ...snapshot.versions.flatMap((version) => [version.effectiveFrom, version.effectiveTo])
    .filter((date): date is string => date !== null && date > from)])].sort();
  const guards: D1PreparedStatement[] = [];
  for (const [index, date] of dates.entries()) {
    const until = dates[index + 1] ?? null;
    const previous = linkedLocationsAt(snapshot, date);
    const next = [...previous.filter((location) => location.code !== candidate.code), candidate];
    for (const location of next) {
      const barnId = resolveLocationBarnId(next, location.code);
      const retiring = location.code === candidate.code && candidate.parentCode === null && candidate.barnId === null;
      if (barnId === resolveLocationBarnId(previous, location.code) && !retiring) continue;
      if (barnId === null && location.code !== candidate.code) continue;
      const conditions: string[] = [];
      const values: unknown[] = [];
      if (tables.has('animals')) {
        if (tables.has('animal_location_history')) {
          conditions.push(`EXISTS(SELECT 1 FROM animal_location_history h JOIN animals a ON a.id=h.animal_id
            WHERE h.location_code=? AND h.barn_id<>COALESCE(?,-1) AND h.valid_from<COALESCE(?,'9999-12-31')
              AND (h.valid_until IS NULL OR h.valid_until>?) AND (a.exit_date IS NULL OR a.exit_date>=?))`);
          values.push(location.code, barnId, until, date, date);
        }
        conditions.push(`EXISTS(SELECT 1 FROM animals a WHERE a.location_code=? AND a.barn_id<>COALESCE(?,-1)
          AND a.entry_date<COALESCE(?,'9999-12-31') AND (a.exit_date IS NULL OR a.exit_date>=?)
          ${tables.has('animal_location_history') ? 'AND NOT EXISTS(SELECT 1 FROM animal_location_history h WHERE h.animal_id=a.id)' : ''})`);
        values.push(location.code, barnId, until, date);
      }
      if (tables.has('inventory_movements')) {
        conditions.push(`EXISTS(SELECT 1 FROM inventory_movements WHERE location_code=? AND barn_id<>COALESCE(?,-1)
          AND effective_date>=? AND effective_date<COALESCE(?,'9999-12-31'))`);
        values.push(location.code, barnId, date, until);
        conditions.push(`EXISTS(SELECT 1 FROM inventory_movements WHERE location_code=? AND barn_id<>COALESCE(?,-1) AND effective_date<?
          GROUP BY barn_id,lot_code,stage_code,sex HAVING SUM(CASE WHEN movement_type IN ('sale','death','transfer_out') THEN -quantity ELSE quantity END)<>0)`);
        values.push(location.code, barnId, date);
      }
      if (!conditions.length) continue;
      const condition = `(${conditions.join(' OR ')})`;
      if (await db.prepare(`SELECT 1 WHERE ${condition}`).bind(...values).first()) {
        throw new ApiError(409, 'La ubicación o sus hijos tienen asignaciones o inventario incompatibles; registre primero el traslado físico');
      }
      guards.push(locationConfigGuardStatement(db, condition, values));
    }
  }
  return guards;
}
