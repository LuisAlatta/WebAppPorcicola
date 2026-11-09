import {
  ApiError,
  commitOperation,
  createOperationClaim,
  currentFarmDate,
  isValidDateString,
  lookupExistingOperation,
  normalizeReason,
  type AuditRecordInput,
} from './events';
import { getConfigSnapshot, type ConfigSnapshot } from './config';
import { stockGuardStatement } from './inventory';

/**
 * Fichas individuales de animales · T09 (ANI-01..ANI-08, INV-04)
 *
 * El código es el identificador permanente y se conserva como texto para no
 * perder ceros iniciales. Los aretes se versionan aparte. La genealogía admite
 * progenitores internos o externos y rechaza parentescos circulares. El alta de
 * un animal nacido o comprado genera una única entrada al inventario dentro de
 * la misma operación idempotente; el alta de un animal que ya estaba en un
 * grupo no suma cabezas y solo lo identifica dentro del saldo existente.
 */

export const ANIMAL_TYPES = ['cerda', 'verraco', 'lechon', 'reemplazo'] as const;
export type AnimalType = (typeof ANIMAL_TYPES)[number];

export const ANIMAL_STATUSES = ['activo', 'vendido', 'descartado', 'muerto'] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];

export const ORIGIN_TYPES = ['nacimiento', 'compra', 'interna', 'inicial'] as const;
export type OriginType = (typeof ORIGIN_TYPES)[number];

export const SEXES = ['macho', 'hembra', 'pendiente'] as const;
export type Sex = (typeof SEXES)[number];

const TYPE_LABEL: Record<AnimalType, string> = {
  cerda: 'Cerda',
  verraco: 'Verraco',
  lechon: 'Lechón',
  reemplazo: 'Reemplazo',
};

const STATUS_LABEL: Record<AnimalStatus, string> = {
  activo: 'Activo',
  vendido: 'Vendido',
  descartado: 'Descartado',
  muerto: 'Muerto',
};

const ORIGIN_LABEL: Record<OriginType, string> = {
  nacimiento: 'Nacimiento',
  compra: 'Compra',
  interna: 'Ya estaba en la granja',
  inicial: 'Saldo inicial',
};

const SEX_LABEL: Record<Sex, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
  pendiente: 'Pendiente de sexado',
};

const ORIGIN_MOVEMENT: Record<OriginType, 'birth' | 'purchase' | 'initial' | null> = {
  nacimiento: 'birth',
  compra: 'purchase',
  inicial: 'initial',
  interna: null,
};

export interface ScopeOptions {
  /** Nombres de galpones autorizados; null o undefined significa toda la granja. */
  allowedBarnNames?: string[] | null;
}

interface Row {
  [key: string]: unknown;
}

export interface AnimalListItem {
  id: number;
  code: string;
  currentTag: string;
  alias: string | null;
  animalType: AnimalType;
  animalTypeLabel: string;
  sex: Sex;
  sexLabel: string;
  breed: string | null;
  status: AnimalStatus;
  statusLabel: string;
  isActive: boolean;
  birthDate: string | null;
  ageDays: number | null;
  ageLabel: string | null;
  currentWeightKg: number | null;
  currentWeightDate: string | null;
  birthWeightKg: number | null;
  weaningDate: string | null;
  weaningWeightKg: number | null;
  aptitude: string | null;
  barnId: number;
  barnCode: string;
  barnName: string;
  stageCode: string;
  stageName: string;
  locationCode: string | null;
  locationName: string | null;
  lotCode: string | null;
  lotName: string | null;
  entryDate: string;
  exitDate: string | null;
  exitType: string | null;
}

export interface TagHistoryItem {
  id: number;
  tag: string;
  validFrom: string;
  validTo: string | null;
  isCurrent: boolean;
}

export interface TypeHistoryItem {
  id: number;
  animalType: AnimalType;
  animalTypeLabel: string;
  validFrom: string;
  validTo: string | null;
  isCurrent: boolean;
  reason: string | null;
}

export interface WeightItem {
  id: number;
  weighedOn: string;
  weighedTime: string;
  weightKg: number;
  stageCode: string | null;
  note: string | null;
  barnId: number | null;
  locationCode: string | null;
  lotCode: string | null;
  corrected: boolean;
  correctsWeightId: number | null;
  gainKg: number | null;
  gainDays: number | null;
}

export interface ParentSummary {
  id: number | null;
  code: string | null;
  alias: string | null;
  external: string | null;
}

export interface ChronologyItem {
  date: string;
  kind: 'alta' | 'pesaje' | 'arete' | 'tipo' | 'inventario' | 'servicio' | 'parto' | 'sanidad';
  title: string;
  detail: string;
  id: number | null;
}

export interface AnimalDetail extends AnimalListItem {
  observations: string | null;
  originType: OriginType;
  originLabel: string;
  originDetail: string | null;
  entryStageCode: string;
  mother: ParentSummary | null;
  father: ParentSummary | null;
  tags: TagHistoryItem[];
  typeHistory: TypeHistoryItem[];
  weights: WeightItem[];
  chronology: ChronologyItem[];
  ageReference: string;
}

export interface AnimalOptions {
  barns: { id: number; code: string; name: string }[];
  stages: { code: string; name: string }[];
  locations: { code: string; name: string; locationType: string }[];
  lots: { code: string; name: string }[];
  aptitudes: { code: string; name: string }[];
  types: { code: string; name: string }[];
  sexes: { code: string; name: string }[];
  statuses: { code: string; name: string }[];
  origins: { code: string; name: string }[];
  deathCauses: { code: string; name: string }[];
  saleCauses: { code: string; name: string }[];
}

export interface AnimalListResult {
  animals: AnimalListItem[];
  total: number;
  options: AnimalOptions;
}

function today(): string {
  return currentFarmDate();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireText(value: unknown, field: string, maxLength = 120): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (parsed.length === 0) throw new ApiError(400, `${field} es obligatorio`);
  if (parsed.length > maxLength) throw new ApiError(400, `${field} no puede superar ${maxLength} caracteres`);
  return parsed;
}

function optionalText(value: unknown, maxLength = 300): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  if (parsed.length === 0) return null;
  if (parsed.length > maxLength) throw new ApiError(400, `El texto no puede superar ${maxLength} caracteres`);
  return parsed;
}

function optionalCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed.length === 0 ? null : parsed;
}

function parseDate(value: unknown, field: string): string {
  if (!isValidDateString(value)) throw new ApiError(400, `${field} inválida: use el formato AAAA-MM-DD`);
  return value;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseDate(value, field);
}

function optionalWeight(value: unknown, field: string, allowZero: boolean): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ApiError(400, `${field} debe ser un número`);
  if (allowZero ? parsed < 0 : parsed <= 0) {
    throw new ApiError(400, allowZero ? `${field} no puede ser negativo` : `${field} debe ser mayor que cero`);
  }
  if (parsed > 500) throw new ApiError(400, `${field} no puede superar 500 kg`);
  return round2(parsed);
}

function optionalId(value: unknown, field: string): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ApiError(400, `${field} inválido`);
  return parsed;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000);
}

function ageLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return 'Fecha futura';
  if (days < 60) return `${days} día${days === 1 ? '' : 's'}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const rest = days - years * 365 - months * 30;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} año${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} mes${months === 1 ? '' : 'es'}`);
  if (parts.length === 0) parts.push(`${rest} día${rest === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function animalRowBase(row: Row, maps: ConfigMaps, asOf: string): AnimalListItem {
  const birthDate = row.birth_date === null || row.birth_date === undefined ? null : String(row.birth_date);
  const reference = row.exit_date ? String(row.exit_date) : asOf;
  const ageDays = birthDate ? daysBetween(birthDate, reference) : null;
  const weight = row.current_weight === null || row.current_weight === undefined
    ? null
    : Number(row.current_weight);
  const type = String(row.animal_type) as AnimalType;
  const status = String(row.status) as AnimalStatus;
  const sex = String(row.sex) as Sex;

  return {
    id: Number(row.id),
    code: String(row.code),
    currentTag: String(row.current_tag ?? row.code),
    alias: row.alias === null || row.alias === undefined ? null : String(row.alias),
    animalType: type,
    animalTypeLabel: TYPE_LABEL[type] ?? type,
    sex,
    sexLabel: SEX_LABEL[sex] ?? sex,
    breed: row.breed === null || row.breed === undefined ? null : String(row.breed),
    status,
    statusLabel: STATUS_LABEL[status] ?? status,
    isActive: Number(row.is_active) === 1,
    birthDate,
    ageDays,
    ageLabel: ageLabel(ageDays),
    currentWeightKg: weight,
    currentWeightDate: row.current_weight_date === null || row.current_weight_date === undefined
      ? null
      : String(row.current_weight_date),
    birthWeightKg: row.birth_weight_kg === null || row.birth_weight_kg === undefined
      ? null
      : Number(row.birth_weight_kg),
    weaningDate: row.weaning_date === null || row.weaning_date === undefined
      ? null
      : String(row.weaning_date),
    weaningWeightKg: row.weaning_weight_kg === null || row.weaning_weight_kg === undefined
      ? null
      : Number(row.weaning_weight_kg),
    aptitude: row.aptitude === null || row.aptitude === undefined ? null : String(row.aptitude),
    barnId: Number(row.barn_id),
    barnCode: String(row.barn_code ?? ''),
    barnName: String(row.barn_name ?? ''),
    stageCode: String(row.current_stage_code),
    stageName: maps.stages.get(String(row.current_stage_code)) ?? String(row.current_stage_code),
    locationCode: row.location_code === null || row.location_code === undefined ? null : String(row.location_code),
    locationName: row.location_code === null || row.location_code === undefined
      ? null
      : maps.locations.get(String(row.location_code)) ?? String(row.location_code),
    lotCode: row.lot_code === null || row.lot_code === undefined ? null : String(row.lot_code),
    lotName: row.lot_code === null || row.lot_code === undefined
      ? null
      : maps.lots.get(String(row.lot_code)) ?? String(row.lot_code),
    entryDate: String(row.entry_date),
    exitDate: row.exit_date === null || row.exit_date === undefined ? null : String(row.exit_date),
    exitType: row.exit_type === null || row.exit_type === undefined ? null : String(row.exit_type),
  };
}

interface ConfigMaps {
  stages: Map<string, string>;
  locations: Map<string, string>;
  lots: Map<string, string>;
}

function configMaps(config: ConfigSnapshot): ConfigMaps {
  return {
    stages: new Map(config.stages.map((stage) => [stage.code, stage.name])),
    locations: new Map(config.locations.map((location) => [location.code, location.name])),
    lots: new Map(config.lots.map((lot) => [lot.code, lot.name])),
  };
}

function catalogItems(config: ConfigSnapshot, key: string): { code: string; name: string }[] {
  const catalog = config.catalogs.find((item) => item.key === key);
  return (catalog?.items ?? []).map((item) => ({ code: item.code, name: item.name }));
}

async function resolveBarnScope(db: D1Database, scope: ScopeOptions): Promise<number[] | null> {
  if (!scope.allowedBarnNames) return null;
  if (scope.allowedBarnNames.length === 0) return [];
  const placeholders = scope.allowedBarnNames.map(() => '?').join(', ');
  const res = await db.prepare(`SELECT id FROM barns WHERE name IN (${placeholders})`)
    .bind(...scope.allowedBarnNames)
    .all<{ id: number }>();
  return (res.results ?? []).map((row) => Number(row.id));
}

function scopeSql(barnIds: number[] | null, column: string): { sql: string; params: unknown[] } {
  if (barnIds === null) return { sql: '', params: [] };
  if (barnIds.length === 0) return { sql: ' AND 1 = 0', params: [] };
  return {
    sql: ` AND ${column} IN (${barnIds.map(() => '?').join(', ')})`,
    params: barnIds,
  };
}

function assertBarnAllowed(barnIds: number[] | null, barnId: number): void {
  if (barnIds === null) return;
  if (!barnIds.includes(barnId)) {
    throw new ApiError(403, 'Acceso denegado: no tiene asignado el galpón indicado');
  }
}

async function buildOptions(db: D1Database, config: ConfigSnapshot, barnIds: number[] | null): Promise<AnimalOptions> {
  const scope = scopeSql(barnIds, 'b.id');
  const barnRows = await db.prepare(`
    SELECT b.id, b.code, b.name FROM barns b
    WHERE 1 = 1${scope.sql}
    ORDER BY b.code
  `).bind(...scope.params).all<{ id: number; code: string; name: string }>();

  return {
    barns: (barnRows.results ?? []).map((barn) => ({
      id: Number(barn.id),
      code: String(barn.code),
      name: String(barn.name),
    })),
    stages: config.stages.map((stage) => ({ code: stage.code, name: stage.name })),
    locations: config.locations.map((location) => ({
      code: location.code,
      name: location.name,
      locationType: location.locationType,
    })),
    lots: config.lots.map((lot) => ({ code: lot.code, name: lot.name })),
    aptitudes: catalogItems(config, 'aptitud'),
    types: ANIMAL_TYPES.map((code) => ({ code, name: TYPE_LABEL[code] })),
    sexes: SEXES.map((code) => ({ code, name: SEX_LABEL[code] })),
    statuses: ANIMAL_STATUSES.map((code) => ({ code, name: STATUS_LABEL[code] })),
    origins: ORIGIN_TYPES.map((code) => ({ code, name: ORIGIN_LABEL[code] })),
    deathCauses: catalogItems(config, 'causa_muerte'),
    saleCauses: catalogItems(config, 'causa_descarte'),
  };
}

const SELECT_COLUMNS = `
  a.*, b.code AS barn_code, b.name AS barn_name,
  t.tag AS current_tag,
  aw.weight_kg AS current_weight, aw.weighed_on AS current_weight_date,
  m.code AS mother_code, f.code AS father_code
`;

function selectFrom(): string {
  return `
    SELECT ${SELECT_COLUMNS}
    FROM animals a
    INNER JOIN barns b ON b.id = a.barn_id
    LEFT JOIN animal_tags t ON t.animal_id = a.id AND t.is_current = 1
    LEFT JOIN animal_weights aw ON aw.id = (
      SELECT w.id FROM animal_weights w
      WHERE w.animal_id = a.id AND w.weighed_on <= ?
        AND NOT EXISTS (SELECT 1 FROM animal_weights replacement WHERE replacement.corrects_weight_id = w.id)
      ORDER BY w.weighed_on DESC, w.weighed_time DESC, w.id DESC
      LIMIT 1
    )
    LEFT JOIN animals m ON m.id = a.mother_id
    LEFT JOIN animals f ON f.id = a.father_id
  `;
}

export interface ListAnimalFilters {
  q?: string | null;
  type?: string | null;
  sex?: string | null;
  status?: string | null;
  stage?: string | null;
  location?: string | null;
  lot?: string | null;
  barnId?: number | null;
  active?: string | null;
  includeExited?: boolean;
  limit?: number | null;
  offset?: number | null;
}

/** Padrón de animales con búsqueda por código, alias o arete y filtros combinables. */
export async function listAnimals(
  db: D1Database,
  filters: ListAnimalFilters,
  scope: ScopeOptions = {},
): Promise<AnimalListResult> {
  const asOf = today();
  const [config, barnIds] = await Promise.all([
    getConfigSnapshot(db, asOf),
    resolveBarnScope(db, scope),
  ]);
  const maps = configMaps(config);

  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];

  const searchingPhysicalExits = filters.status === 'vendido' || filters.status === 'muerto';
  if (!filters.includeExited && !searchingPhysicalExits) where.push('a.exit_date IS NULL');

  const q = optionalCode(filters.q);
  if (q) {
    where.push(`(
      a.code LIKE ?
      OR a.alias LIKE ?
      OR EXISTS (SELECT 1 FROM animal_tags at WHERE at.animal_id = a.id AND at.tag LIKE ?)
    )`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  if (filters.type) {
    if (!ANIMAL_TYPES.includes(filters.type as AnimalType)) throw new ApiError(400, 'Tipo de animal inválido');
    where.push('a.animal_type = ?');
    params.push(filters.type);
  }
  if (filters.sex) {
    if (!SEXES.includes(filters.sex as Sex)) throw new ApiError(400, 'Sexo inválido');
    where.push('a.sex = ?');
    params.push(filters.sex);
  }
  if (filters.status) {
    if (!ANIMAL_STATUSES.includes(filters.status as AnimalStatus)) throw new ApiError(400, 'Estado inválido');
    where.push('a.status = ?');
    params.push(filters.status);
  }
  if (filters.active === '1' || filters.active === '0') {
    where.push('a.is_active = ?');
    params.push(Number(filters.active));
  }
  if (filters.stage) {
    where.push('a.current_stage_code = ?');
    params.push(filters.stage);
  }
  if (filters.location) {
    where.push('a.location_code = ?');
    params.push(filters.location);
  }
  if (filters.lot) {
    where.push('a.lot_code = ?');
    params.push(filters.lot);
  }
  if (filters.barnId !== null && filters.barnId !== undefined) {
    assertBarnAllowed(barnIds, Number(filters.barnId));
    where.push('a.barn_id = ?');
    params.push(Number(filters.barnId));
  }

  const scopeFilter = scopeSql(barnIds, 'a.barn_id');
  const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const rows = await db.prepare(`
    ${selectFrom()}
    WHERE ${where.join(' AND ')}${scopeFilter.sql}
    ORDER BY a.code COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).bind(asOf, ...params, ...scopeFilter.params, limit, offset).all<Row>();

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total FROM animals a
    WHERE ${where.join(' AND ')}${scopeFilter.sql}
  `).bind(...params, ...scopeFilter.params).first<{ total: number }>();

  return {
    animals: (rows.results ?? []).map((row) => animalRowBase(row, maps, asOf)),
    total: Number(countRow?.total ?? 0),
    options: await buildOptions(db, config, barnIds),
  };
}

async function fetchAnimalRow(
  db: D1Database,
  key: string,
  barnIds: number[] | null,
): Promise<Row | null> {
  const scope = scopeSql(barnIds, 'a.barn_id');
  const asOf = today();

  const byCode = await db.prepare(`
    ${selectFrom()}
    WHERE a.code = ?${scope.sql}
  `).bind(asOf, key, ...scope.params).first<Row>();
  if (byCode) return byCode;

  if (!/^\d+$/.test(key)) return null;
  const byId = await db.prepare(`
    ${selectFrom()}
    WHERE a.id = ?${scope.sql}
  `).bind(asOf, Number(key), ...scope.params).first<Row>();
  return byId ?? null;
}

function parentSummary(row: Row, prefix: 'mother' | 'father'): ParentSummary | null {
  const id = row[`${prefix}_id`];
  const external = row[`${prefix}_external`];
  if (id === null || id === undefined) {
    if (external === null || external === undefined) return null;
    return { id: null, code: null, alias: null, external: String(external) };
  }
  return {
    id: Number(id),
    code: row[`${prefix}_code`] === null || row[`${prefix}_code`] === undefined ? null : String(row[`${prefix}_code`]),
    alias: row[`${prefix}_alias`] === null || row[`${prefix}_alias`] === undefined ? null : String(row[`${prefix}_alias`]),
    external: null,
  };
}

/** Ficha completa con aretes, tipos, pesos y cronología. */
export async function getAnimal(
  db: D1Database,
  key: string,
  scope: ScopeOptions = {},
): Promise<AnimalDetail> {
  const asOf = today();
  const [config, barnIds] = await Promise.all([
    getConfigSnapshot(db, asOf),
    resolveBarnScope(db, scope),
  ]);

  if (barnIds !== null && barnIds.length === 0) {
    throw new ApiError(404, 'Animal no encontrado');
  }

  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');

  // Trae madre y padre con sus alias para la ficha.
  const parents = await db.prepare(`
    SELECT id, code, alias FROM animals WHERE id IN (?, ?)
  `).bind(
    Number(row.mother_id ?? 0),
    Number(row.father_id ?? 0),
  ).all<{ id: number; code: string; alias: string | null }>();
  const parentMap = new Map((parents.results ?? []).map((parent) => [Number(parent.id), parent]));
  if (row.mother_id !== null && row.mother_id !== undefined) {
    const mother = parentMap.get(Number(row.mother_id));
    if (mother) row.mother_code = mother.code;
  }
  if (row.father_id !== null && row.father_id !== undefined) {
    const father = parentMap.get(Number(row.father_id));
    if (father) row.father_code = father.code;
  }

  const maps = configMaps(config);
  const base = animalRowBase(row, maps, asOf);
  const id = base.id;

  const [tagRows, typeRows, weightRows, movementRows, serviceRows, litterRows, healthRows] = await Promise.all([
    db.prepare(`
      SELECT id, tag, valid_from, valid_to, is_current FROM animal_tags
      WHERE animal_id = ? ORDER BY valid_from ASC, id ASC
    `).bind(id).all<Row>(),
    db.prepare(`
      SELECT id, animal_type, valid_from, valid_to, is_current, reason FROM animal_type_history
      WHERE animal_id = ? ORDER BY valid_from ASC, id ASC
    `).bind(id).all<Row>(),
    db.prepare(`
      SELECT id, weighed_on, weighed_time, weight_kg, stage_code, barn_id, location_code, lot_code, note, corrects_weight_id
      FROM animal_weights WHERE animal_id = ? ORDER BY weighed_on ASC, weighed_time ASC, id ASC
    `).bind(id).all<Row>(),
    db.prepare(`
      SELECT id, movement_type, effective_date, quantity FROM inventory_movements
      WHERE animal_id = ? ORDER BY effective_date ASC, id ASC
    `).bind(id).all<Row>(),
    db.prepare(`
      SELECT s.id, s.service_date, s.service_type, s.service_number, s.sire_code_snapshot
      FROM reproduction_services s
      JOIN reproduction_cycles c ON c.id = s.cycle_id
      WHERE c.female_animal_id = ? OR s.sire_animal_id = ?
      ORDER BY s.service_date ASC, s.id ASC
    `).bind(id, id).all<Row>().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT l.id, l.farrowing_date, l.parity_number, l.live_count, l.stillborn_count
      FROM litters l
      WHERE l.female_animal_id = ?
      ORDER BY l.farrowing_date ASC, l.id ASC
    `).bind(id).all<Row>().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT h.id, h.event_type, h.effective_date, h.product, h.dosage, h.dosage_unit
      FROM health_events h
      JOIN health_event_animals a ON a.health_event_id = h.id
      WHERE a.animal_id = ?
      ORDER BY h.effective_date ASC, h.id ASC
    `).bind(id).all<Row>().catch(() => ({ results: [] })),
  ]);

  const tags: TagHistoryItem[] = (tagRows.results ?? []).map((tag) => ({
    id: Number(tag.id),
    tag: String(tag.tag),
    validFrom: String(tag.valid_from),
    validTo: tag.valid_to === null || tag.valid_to === undefined ? null : String(tag.valid_to),
    isCurrent: Number(tag.is_current) === 1,
  }));

  const typeHistory: TypeHistoryItem[] = (typeRows.results ?? []).map((item) => {
    const type = String(item.animal_type) as AnimalType;
    return {
      id: Number(item.id),
      animalType: type,
      animalTypeLabel: TYPE_LABEL[type] ?? type,
      validFrom: String(item.valid_from),
      validTo: item.valid_to === null || item.valid_to === undefined ? null : String(item.valid_to),
      isCurrent: Number(item.is_current) === 1,
      reason: item.reason === null || item.reason === undefined ? null : String(item.reason),
    };
  });

  const weightRowsList = weightRows.results ?? [];
  const replacedWeightIds = new Set(weightRowsList
    .map((weight) => weight.corrects_weight_id === null || weight.corrects_weight_id === undefined ? null : Number(weight.corrects_weight_id))
    .filter((weightId): weightId is number => weightId !== null));
  const validWeightRows = weightRowsList.filter((weight) => !replacedWeightIds.has(Number(weight.id)));
  let previous: { id: number; date: string; time: string; kg: number } | null = null;
  const validWeightMetrics = new Map<number, { gainKg: number | null; gainDays: number | null }>();
  for (const weight of validWeightRows) {
    const current = { id: Number(weight.id), date: String(weight.weighed_on), time: String(weight.weighed_time ?? '12:00'), kg: Number(weight.weight_kg) };
    let gainKg: number | null = null; let gainDays: number | null = null;
    if (previous) {
      const days = Math.round((Date.parse(`${current.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86400000);
      if (days > 0) { gainKg = Math.round((current.kg - previous.kg) * 100) / 100; gainDays = days; }
    }
    validWeightMetrics.set(current.id, { gainKg, gainDays });
    previous = current;
  }
  const weights: WeightItem[] = weightRowsList.map((weight) => {
    const id = Number(weight.id);
    const metrics = validWeightMetrics.get(id);
    return {
      id,
      weighedOn: String(weight.weighed_on),
      weighedTime: String(weight.weighed_time ?? '12:00'),
      weightKg: Number(weight.weight_kg),
      stageCode: weight.stage_code === null || weight.stage_code === undefined ? null : String(weight.stage_code),
      note: weight.note === null || weight.note === undefined ? null : String(weight.note),
      barnId: weight.barn_id === null || weight.barn_id === undefined ? null : Number(weight.barn_id),
      locationCode: weight.location_code === null || weight.location_code === undefined ? null : String(weight.location_code),
      lotCode: weight.lot_code === null || weight.lot_code === undefined ? null : String(weight.lot_code),
      corrected: replacedWeightIds.has(id),
      correctsWeightId: weight.corrects_weight_id === null || weight.corrects_weight_id === undefined ? null : Number(weight.corrects_weight_id),
      gainKg: metrics?.gainKg ?? null,
      gainDays: metrics?.gainDays ?? null,
    };
  });

  const chronology: ChronologyItem[] = [
    {
      date: base.entryDate,
      kind: 'alta',
      title: 'Alta en la granja',
      detail: `${base.barnName} · ${base.stageName}${base.locationName ? ` · ${base.locationName}` : ''}`,
      id: null,
    },
  ];
  for (const tag of tags) {
    chronology.push({
      date: tag.validFrom,
      kind: 'arete',
      title: `Arete ${tag.tag}`,
      detail: tag.validTo ? `Vigente hasta ${tag.validTo}` : 'Vigente',
      id: tag.id,
    });
  }
  for (const item of typeHistory) {
    chronology.push({
      date: item.validFrom,
      kind: 'tipo',
      title: `Tipo: ${item.animalTypeLabel}`,
      detail: item.reason ?? (item.validTo ? `Vigente hasta ${item.validTo}` : 'Vigente'),
      id: item.id,
    });
  }
  for (const weight of weights) {
    chronology.push({
      date: weight.weighedOn,
      kind: 'pesaje',
      title: `Pesaje ${weight.weightKg} kg`,
      detail: weight.note ?? 'Pesaje individual',
      id: weight.id,
    });
  }
  for (const movement of movementRows.results ?? []) {
    const type = String(movement.movement_type);
    chronology.push({
      date: String(movement.effective_date),
      kind: 'inventario',
      title: `Inventario: ${type}`,
      detail: `${Number(movement.quantity) > 0 ? '+' : '−'}${Math.abs(Number(movement.quantity))} cabezas`,
      id: Number(movement.id),
    });
  }
  for (const s of serviceRows.results ?? []) {
    const typeLabel = s.service_type === 'inseminacion_artificial' ? 'Inseminación artificial' : s.service_type === 'monta_natural' ? 'Monta natural' : 'Transferencia de embriones';
    chronology.push({
      date: String(s.service_date),
      kind: 'servicio',
      title: `Servicio #${s.service_number ?? 1} (${typeLabel})`,
      detail: s.sire_code_snapshot ? `Verraco: ${s.sire_code_snapshot}` : 'Servicio reproductivo',
      id: Number(s.id),
    });
  }
  for (const l of litterRows.results ?? []) {
    chronology.push({
      date: String(l.farrowing_date),
      kind: 'parto',
      title: `Parto de camada (paridad ${l.parity_number})`,
      detail: `${l.live_count} nacidos vivos, ${l.stillborn_count} nacidos muertos`,
      id: null,
    });
  }
  for (const h of healthRows.results ?? []) {
    const isVaccine = h.event_type === 'vaccination';
    chronology.push({
      date: String(h.effective_date),
      kind: 'sanidad',
      title: `${isVaccine ? 'Vacuna' : 'Tratamiento'}: ${h.product}`,
      detail: h.dosage ? `${h.dosage} ${h.dosage_unit ?? ''}`.trim() : 'Evento sanitario',
      id: Number(h.id),
    });
  }
  chronology.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(b.id ?? 0).localeCompare(String(a.id ?? 0));
  });

  const originType = String(row.origin_type) as OriginType;

  return {
    ...base,
    observations: row.observations === null || row.observations === undefined ? null : String(row.observations),
    originType,
    originLabel: ORIGIN_LABEL[originType] ?? originType,
    originDetail: row.origin_detail === null || row.origin_detail === undefined ? null : String(row.origin_detail),
    entryStageCode: String(row.entry_stage_code),
    mother: parentSummary(row, 'mother'),
    father: parentSummary(row, 'father'),
    tags,
    typeHistory,
    weights,
    chronology,
    ageReference: base.exitDate ?? asOf,
  };
}

export interface CreateAnimalInput {
  code?: string;
  alias?: string | null;
  animalType?: string;
  sex?: string;
  breed?: string | null;
  birthDate?: string | null;
  birthWeightKg?: number | string | null;
  weaningDate?: string | null;
  weaningWeightKg?: number | string | null;
  aptitude?: string | null;
  motherId?: number | string | null;
  fatherId?: number | string | null;
  motherExternal?: string | null;
  fatherExternal?: string | null;
  originType?: string;
  originDetail?: string | null;
  purchaseAmount?: unknown;
  purchaseCurrencyCode?: unknown;
  purchaseCounterparty?: unknown;
  purchaseDocumentReference?: unknown;
  entryDate?: string;
  entryStageCode?: string;
  barnId?: number | string;
  locationCode?: string | null;
  lotCode?: string | null;
  observations?: string | null;
  reason?: string;
  operationKey?: string;
  litterId?: string | null;
}

interface ParentInput {
  id: number | null;
  external: string | null;
  row: { id: number; code: string; sex: string; birth_date: string | null; barn_id: number } | null;
}

async function resolveParent(
  db: D1Database,
  idValue: unknown,
  externalValue: unknown,
  field: 'madre' | 'padre',
  expectedSex: 'hembra' | 'macho',
  barnIds: number[] | null,
): Promise<ParentInput> {
  const id = optionalId(idValue, `ID de ${field}`);
  const external = optionalText(externalValue, 60);
  if (id !== null && external !== null) {
    throw new ApiError(400, `Indique ${field} interna o externa, no ambas`);
  }
  if (id === null) return { id: null, external, row: null };

  const row = await db.prepare(`
    SELECT id, code, sex, birth_date, barn_id FROM animals WHERE id = ?
  `).bind(id).first<{ id: number; code: string; sex: string; birth_date: string | null; barn_id: number }>();
  if (!row) throw new ApiError(404, `La ${field} indicada no existe`);
  assertBarnAllowed(barnIds, Number(row.barn_id));
  if (String(row.sex) !== expectedSex) {
    throw new ApiError(400, `La ${field} debe ser de sexo ${expectedSex === 'hembra' ? 'hembra' : 'macho'}`);
  }
  return { id, external: null, row };
}

async function assertNoCycle(
  db: D1Database,
  animalId: number | null,
  motherId: number | null,
  fatherId: number | null,
): Promise<void> {
  if (motherId === null && fatherId === null) return;
  const res = await db.prepare('SELECT id, mother_id, father_id FROM animals')
    .all<{ id: number; mother_id: number | null; father_id: number | null }>();
  const parents = new Map<number, { mother: number | null; father: number | null }>();
  for (const row of res.results ?? []) {
    parents.set(Number(row.id), {
      mother: row.mother_id === null ? null : Number(row.mother_id),
      father: row.father_id === null ? null : Number(row.father_id),
    });
  }

  const stack = [motherId, fatherId].filter((value): value is number => value !== null);
  const seen = new Set<number>();
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (animalId !== null && current === animalId) {
      throw new ApiError(400, 'La genealogía no puede formar un ciclo');
    }
    if (seen.has(current)) continue;
    seen.add(current);
    const parent = parents.get(current);
    if (!parent) continue;
    if (parent.mother !== null) stack.push(parent.mother);
    if (parent.father !== null) stack.push(parent.father);
  }
}

function assertParentDates(
  childBirthDate: string | null,
  mother: ParentInput,
  father: ParentInput,
): void {
  if (!childBirthDate) return;
  for (const [label, parent] of [['madre', mother], ['padre', father]] as const) {
    const birth = parent.row?.birth_date;
    if (birth && birth >= childBirthDate) {
      throw new ApiError(400, `La fecha de nacimiento de la ${label} debe ser anterior a la del animal`);
    }
  }
}

async function unidentifiedHeads(
  db: D1Database,
  barnId: number,
  locationCode: string | null,
  lotCode: string | null,
  stageCode: string,
  sex: Sex,
  date: string,
): Promise<number> {
  const headsRow = await db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN movement_type IN ('sale', 'death', 'transfer_out')
        THEN -quantity ELSE quantity END
    ), 0) AS heads
    FROM inventory_movements
    WHERE barn_id = ? AND location_code IS ? AND lot_code IS ? AND stage_code = ? AND sex = ?
      AND effective_date <= ?
  `).bind(barnId, locationCode, lotCode, stageCode, sex, date).first<{ heads: number }>();

  const identifiedRow = await db.prepare(`
    SELECT COUNT(*) AS total FROM animals
    WHERE barn_id = ? AND location_code IS ? AND lot_code IS ? AND current_stage_code = ? AND sex = ?
      AND entry_date <= ? AND (exit_date IS NULL OR exit_date > ?)
  `).bind(barnId, locationCode, lotCode, stageCode, sex, date, date).first<{ total: number }>();

  return Number(headsRow?.heads ?? 0) - Number(identifiedRow?.total ?? 0);
}

/** Alta de ficha individual con una sola entrada al inventario. */
export async function createAnimal(
  db: D1Database,
  actorUserId: number,
  input: CreateAnimalInput,
  scope: ScopeOptions = {},
): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const code = requireText(input.code, 'Código del animal', 40);
  if (/\s/.test(code)) throw new ApiError(400, 'El código no puede contener espacios');

  const animalType = String(input.animalType ?? '') as AnimalType;
  if (!ANIMAL_TYPES.includes(animalType)) throw new ApiError(400, 'Tipo de animal inválido');

  const sex = String(input.sex ?? '') as Sex;
  if (!SEXES.includes(sex)) throw new ApiError(400, 'Sexo inválido: use macho, hembra o pendiente');
  if (animalType === 'cerda' && sex !== 'hembra') throw new ApiError(400, 'Una cerda debe registrarse como hembra');
  if (animalType === 'verraco' && sex !== 'macho') throw new ApiError(400, 'Un verraco debe registrarse como macho');

  const originType = String(input.originType ?? 'compra') as OriginType;
  if (!ORIGIN_TYPES.includes(originType)) throw new ApiError(400, 'Procedencia inválida');

  const entryDate = input.entryDate ? parseDate(input.entryDate, 'Fecha de ingreso') : today();
  if (entryDate > today()) throw new ApiError(400, 'La fecha de ingreso no puede ser futura');

  const birthDate = optionalDate(input.birthDate, 'Fecha de nacimiento');
  if (birthDate && birthDate > entryDate) {
    throw new ApiError(400, 'La fecha de nacimiento no puede ser posterior al ingreso');
  }
  const weaningDate = optionalDate(input.weaningDate, 'Fecha de destete');
  if (weaningDate) {
    if (weaningDate > today()) throw new ApiError(400, 'La fecha de destete no puede ser futura');
    if (birthDate && weaningDate < birthDate) {
      throw new ApiError(400, 'La fecha de destete no puede ser anterior al nacimiento');
    }
  }

  const birthWeightKg = optionalWeight(input.birthWeightKg, 'Peso al nacer', true);
  const weaningWeightKg = optionalWeight(input.weaningWeightKg, 'Peso al destete', false);
  if (weaningWeightKg !== null && weaningDate === null) {
    throw new ApiError(400, 'Indique la fecha de destete junto con su peso');
  }

  const barnId = Number(input.barnId);
  if (!Number.isInteger(barnId) || barnId <= 0) throw new ApiError(400, 'Galpón inválido');
  const stageCode = requireText(input.entryStageCode, 'Etapa de ingreso', 60);
  const locationCode = optionalCode(input.locationCode);
  const lotCode = optionalCode(input.lotCode);
  const alias = optionalText(input.alias, 80);
  const breed = optionalText(input.breed, 80);
  const aptitude = optionalCode(input.aptitude);
  const originDetail = optionalText(input.originDetail, 160);
  const observations = optionalText(input.observations, 500);
  const motherExternal = optionalText(input.motherExternal, 60);
  const fatherExternal = optionalText(input.fatherExternal, 60);
  const motherId = optionalId(input.motherId, 'ID de madre');
  const fatherId = optionalId(input.fatherId, 'ID de padre');
  const litterId = input.litterId ? requireText(input.litterId, 'Camada', 80) : null;

  if (motherId !== null && motherExternal !== null) {
    throw new ApiError(400, 'Indique la madre interna o externa, no ambas');
  }
  if (fatherId !== null && fatherExternal !== null) {
    throw new ApiError(400, 'Indique el padre interno o externo, no ambos');
  }

  const reason = normalizeReason(input.reason, { required: true, fallback: 'Alta de animal' });

  let purchaseAmountMinor:number|null=null;let purchaseCurrency='PEN';let purchaseCounterparty:string|null=null;let purchaseReference:string|null=null;
  if(originType==='compra'&&input.purchaseAmount!==undefined&&input.purchaseAmount!==null&&input.purchaseAmount!==''){
    const raw=String(input.purchaseAmount).trim();if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw))throw new ApiError(400,'El importe de compra debe tener hasta dos decimales');const [whole,decimal='']=raw.split('.');purchaseAmountMinor=Number(whole)*100+Number(decimal.padEnd(2,'0'));if(!Number.isSafeInteger(purchaseAmountMinor)||purchaseAmountMinor<=0)throw new ApiError(400,'El importe de compra debe ser mayor que cero');purchaseCurrency=String(input.purchaseCurrencyCode??'PEN').toUpperCase();if(!/^[A-Z]{3}$/.test(purchaseCurrency))throw new ApiError(400,'Código de moneda inválido');purchaseCounterparty=String(input.purchaseCounterparty??'').trim()||null;purchaseReference=String(input.purchaseDocumentReference??'').trim()||null;
  }
  if(originType==='compra'&&purchaseAmountMinor===null)throw new ApiError(400,'Toda compra de animales requiere importe para enlazarla con Finanzas');

  const payload = {
    code,
    alias,
    animalType,
    sex,
    breed,
    birthDate,
    birthWeightKg,
    weaningDate,
    weaningWeightKg,
    aptitude,
    motherId,
    fatherId,
    motherExternal,
    fatherExternal,
    originType,
    originDetail,
    purchaseAmountMinor,purchaseCurrency,purchaseCounterparty,purchaseReference,
    entryDate,
    entryStageCode: stageCode,
    barnId,
    locationCode,
    lotCode,
    litterId,
    observations,
  };

  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) {
    const stored = replay.result as { code?: string } | null;
    const animal = await getAnimal(db, stored?.code ?? code, scope);
    return { animal, replayed: true };
  }

  const barnIds = await resolveBarnScope(db, scope);
  assertBarnAllowed(barnIds, barnId);

  const barn = await db.prepare('SELECT id, code, name FROM barns WHERE id = ?').bind(barnId)
    .first<{ id: number; code: string; name: string }>();
  if (!barn) throw new ApiError(404, 'El galpón indicado no existe');

  const config = await getConfigSnapshot(db, entryDate);
  if (!config.stages.some((stage) => stage.code === stageCode)) {
    throw new ApiError(400, 'La etapa no está vigente en la fecha de ingreso');
  }
  if (locationCode && !config.locations.some((location) => location.code === locationCode)) {
    throw new ApiError(400, 'La ubicación no está vigente en la fecha de ingreso');
  }
  if (lotCode && !config.lots.some((lot) => lot.code === lotCode)) {
    throw new ApiError(400, 'El lote no está vigente en la fecha de ingreso');
  }
  if (aptitude && !catalogItems(config, 'aptitud').some((item) => item.code === aptitude)) {
    throw new ApiError(400, 'La aptitud no está vigente en la fecha de ingreso');
  }

  const duplicate = await db.prepare('SELECT id FROM animals WHERE code = ?').bind(code).first();
  if (duplicate) throw new ApiError(409, `Ya existe un animal con el código ${code}`);

  const mother = await resolveParent(db, motherId, motherExternal, 'madre', 'hembra', barnIds);
  const father = await resolveParent(db, fatherId, fatherExternal, 'padre', 'macho', barnIds);
  if (mother.id !== null && father.id !== null && mother.id === father.id) {
    throw new ApiError(400, 'La madre y el padre no pueden ser el mismo animal');
  }
  assertParentDates(birthDate, mother, father);
  await assertNoCycle(db, null, mother.id, father.id);

  if (originType === 'interna') {
    const available = await unidentifiedHeads(
      db, barnId, locationCode, lotCode, stageCode, sex, entryDate,
    );
    if (available < 1) {
      throw new ApiError(409, 'No hay cabezas sin identificar en ese grupo para vincular la ficha');
    }
  }

  let litterMotherId: number | null = null;
  if (litterId) {
    if (originType !== 'interna') throw new ApiError(400, 'Vincular una camada consume una cabeza existente; la procedencia debe ser interna');
    const litter = await db.prepare('SELECT * FROM litters WHERE id=?').bind(litterId).first<Row>();
    if (!litter || Number(litter.historical_only) === 1) throw new ApiError(404, 'Camada actual no encontrada');
    if (Number(litter.barn_id) !== barnId || litter.location_code !== locationCode || litter.lot_code !== lotCode || entryDate < String(litter.farrowing_date)) {
      throw new ApiError(400, 'La ficha debe conservar el galpón, ubicación, lote y fecha de la camada');
    }
    if (!['macho','hembra','pendiente'].includes(sex)) throw new ApiError(400, 'Sexo de ficha no coincide con una categoría de la camada');
    const countColumn = sex === 'macho' ? 'male_alive' : sex === 'hembra' ? 'female_alive' : 'unsexed_alive';
    const availableInLitter = Number(litter[countColumn]);
    const identified = await db.prepare('SELECT COUNT(*) AS n FROM animals WHERE litter_id=? AND sex=? AND status="activo"').bind(litterId, sex).first<{n:number}>();
    if (Number(identified?.n ?? 0) >= availableInLitter) throw new ApiError(409, 'No quedan cabezas de ese sexo sin identificar en la camada');
    litterMotherId = Number(litter.female_animal_id);
    if (mother.id !== null && mother.id !== litterMotherId) throw new ApiError(400, 'La madre no coincide con la camada de origen');
    if (mother.id === null && mother.external !== null) throw new ApiError(400, 'La camada de origen requiere la madre registrada');
  }

  const idRow = await db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM animals')
    .first<{ next_id: number }>();
  const animalId = Number(idRow?.next_id ?? 1);
  const createdAt = new Date().toISOString();

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO animals (
        id, code, alias, animal_type, sex, breed, birth_date, birth_weight_kg,
        weaning_date, weaning_weight_kg, status, aptitude, mother_id, father_id,
        mother_external, father_external, origin_type, origin_detail, entry_date,
        entry_stage_code, current_stage_code, barn_id, location_code, lot_code,
        observations, is_active, created_by_user_id, created_at, updated_at, litter_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      animalId, code, alias, animalType, sex, breed, birthDate, birthWeightKg,
      weaningDate, weaningWeightKg, aptitude, mother.id ?? litterMotherId, father.id,
      mother.external, father.external, originType, originDetail, entryDate,
      stageCode, stageCode, barnId, locationCode, lotCode,
      observations, actorUserId, createdAt, createdAt, litterId,
    ),
    db.prepare(`
      INSERT INTO animal_tags (animal_id, tag, valid_from, valid_to, is_current, created_by_user_id, created_at)
      VALUES (?, ?, ?, NULL, 1, ?, ?)
    `).bind(animalId, code, entryDate, actorUserId, createdAt),
    db.prepare(`
      INSERT INTO animal_type_history (
        animal_id, animal_type, valid_from, valid_to, is_current, reason, created_by_user_id, created_at
      ) VALUES (?, ?, ?, NULL, 1, ?, ?, ?)
    `).bind(animalId, animalType, entryDate, 'Alta del animal', actorUserId, createdAt),
  ];

  if (birthWeightKg !== null && birthDate !== null) {
    statements.push(db.prepare(`
      INSERT INTO animal_weights (
        animal_id, weighed_on, weight_kg, stage_code, barn_id, location_code, lot_code,
        note, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'Peso al nacer', ?, ?)
    `).bind(animalId, birthDate, birthWeightKg, barnId, locationCode, lotCode, actorUserId, createdAt));
  }
  if (weaningWeightKg !== null && weaningDate !== null) {
    statements.push(db.prepare(`
      INSERT INTO animal_weights (
        animal_id, weighed_on, weight_kg, stage_code, barn_id, location_code, lot_code,
        note, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Peso al destete', ?, ?)
    `).bind(animalId, weaningDate, weaningWeightKg, stageCode, barnId, locationCode, lotCode, actorUserId, createdAt));
  }

  const movementType = ORIGIN_MOVEMENT[originType];
  let movementId: number | null = null;
  if (movementType !== null) {
    const movementIdRow = await db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM inventory_movements')
      .first<{ next_id: number }>();
    movementId = Number(movementIdRow?.next_id ?? 1);
    statements.push(db.prepare(`
      INSERT INTO inventory_movements (
        id, operation_log_id, movement_type, effective_date, barn_id, location_code, lot_code,
        stage_code, sex, quantity, cause_code, transfer_group_id, notes, animal_id,
        created_by_user_id, created_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?, ?, ?)
    `).bind(
      movementId, movementType, entryDate, barnId, locationCode, lotCode,
      stageCode, sex, `Alta individual ${code}`, animalId, actorUserId, createdAt,
    ));
  }

  const result = { animalId, code };
  const financeRow=purchaseAmountMinor===null?null:await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM financial_entries').first<{id:number}>();const financialEntryId=financeRow?Number(financeRow.id):null;
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'animal.create',
    authorUserId: actorUserId,
    entityType: 'animal',
    entityId: animalId,
    barnId,
    effectiveDate: entryDate,
    payload,
    result:{...result,financialEntryId},
  });

  if(movementId!==null)statements.push(db.prepare('UPDATE inventory_movements SET operation_log_id=? WHERE id=?').bind(claim.id,movementId));
  if(financialEntryId!==null){
    statements.push(db.prepare(`INSERT INTO financial_entries(id,operation_log_id,direction,category,concept,operation_date,amount_minor,currency_code,counterparty,reference,notes,created_by_user_id,created_at,source_type,source_id) VALUES(?,?,'expense','Compra de animal',?,?,?,?,?,?,?,?,?,'animal_purchase',?)`).bind(financialEntryId,claim.id,`Compra de animal ${code}`,entryDate,purchaseAmountMinor,purchaseCurrency,purchaseCounterparty,purchaseReference,reason,actorUserId,claim.recordedAt,String(animalId)));
    statements.push(db.prepare(`INSERT INTO financial_allocations(entry_id,barn_id,barn_name_snapshot,amount_minor,animal_id,animal_code_snapshot,lot_code,quantity,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(financialEntryId,barnId,barn.name,purchaseAmountMinor,animalId,code,lotCode,1,claim.recordedAt));
  }

  const audits: AuditRecordInput[] = [{
    entityType: 'animal',
    entityId: animalId,
    action: 'create',
    actorUserId,
    barnId,
    reason,
    previousData: null,
    newData: {
      code, animalType, sex, birthDate, originType, entryDate, stageCode,
      locationCode, lotCode, motherId: mother.id, fatherId: father.id,
    },
    effectiveDate: entryDate,
    recordedAt: claim.recordedAt,
  }];
  if(financialEntryId!==null)audits.push({entityType:'financial_entry',entityId:financialEntryId,action:'create',actorUserId,barnId,reason,previousData:null,newData:{direction:'expense',category:'Compra de animal',animalCode:code,amountMinor:purchaseAmountMinor,currencyCode:purchaseCurrency,counterparty:purchaseCounterparty,reference:purchaseReference},effectiveDate:entryDate,recordedAt:claim.recordedAt});

  statements.push(db.prepare(`INSERT INTO animal_location_history
    (animal_id, barn_id, location_code, lot_code, stage_code, valid_from, valid_until, operation_log_id, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
    .bind(animalId, barnId, locationCode, lotCode, stageCode, entryDate, claim.id, actorUserId, createdAt));

  if (movementId !== null) {
    audits.push({
      entityType: 'inventory_movement',
      entityId: movementId,
      action: 'create',
      actorUserId,
      barnId,
      reason,
      previousData: null,
      newData: { animalId, movementType, quantity: 1, effectiveDate: entryDate },
      effectiveDate: entryDate,
      recordedAt: claim.recordedAt,
    });
  }

  if (litterId) {
    const litterCountColumn = sex === 'macho' ? 'male_alive' : sex === 'hembra' ? 'female_alive' : 'unsexed_alive';
    statements.unshift(db.prepare(`INSERT INTO litter_identification_guard (guard_id)
      SELECT CASE WHEN COUNT(*) < (SELECT ${litterCountColumn} FROM litters WHERE id=?) THEN 0 ELSE -1 END
      FROM animals WHERE litter_id=? AND sex=? AND status='activo'`).bind(litterId, litterId, sex));
    statements.push(db.prepare('DELETE FROM litter_identification_guard'));
  }

  await commitOperation(db, claim, statements, audits);

  const animal = await getAnimal(db, code, scope);
  return { animal, replayed: false };
}

export interface UpdateAnimalInput {
  alias?: string | null;
  animalType?: string;
  breed?: string | null;
  birthDate?: string | null;
  birthWeightKg?: number | string | null;
  weaningDate?: string | null;
  weaningWeightKg?: number | string | null;
  aptitude?: string | null;
  motherId?: number | string | null;
  fatherId?: number | string | null;
  motherExternal?: string | null;
  fatherExternal?: string | null;
  observations?: string | null;
  effectiveDate?: string;
  reason?: string;
  operationKey?: string;
}

/** Edición de datos descriptivos. El código y la ubicación física son inmutables aquí. */
export async function updateAnimal(
  db: D1Database,
  actorUserId: number,
  key: string,
  input: UpdateAnimalInput,
  scope: ScopeOptions = {},
): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const barnIds = await resolveBarnScope(db, scope);
  if (barnIds !== null && barnIds.length === 0) throw new ApiError(404, 'Animal no encontrado');

  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');

  const currentId = Number(row.id);
  const currentType = String(row.animal_type) as AnimalType;
  const animalType = input.animalType === undefined ? currentType : String(input.animalType) as AnimalType;
  if (!ANIMAL_TYPES.includes(animalType)) throw new ApiError(400, 'Tipo de animal inválido');
  if (animalType === 'cerda' && row.sex !== 'hembra') {
    throw new ApiError(400, 'Una cerda debe registrarse como hembra');
  }
  if (animalType === 'verraco' && row.sex !== 'macho') {
    throw new ApiError(400, 'Un verraco debe registrarse como macho');
  }

  const alias = input.alias === undefined
    ? (row.alias === null || row.alias === undefined ? null : String(row.alias))
    : optionalText(input.alias, 80);
  const breed = input.breed === undefined
    ? (row.breed === null || row.breed === undefined ? null : String(row.breed))
    : optionalText(input.breed, 80);
  const observations = input.observations === undefined
    ? (row.observations === null || row.observations === undefined ? null : String(row.observations))
    : optionalText(input.observations, 500);
  const aptitude = input.aptitude === undefined
    ? (row.aptitude === null || row.aptitude === undefined ? null : String(row.aptitude))
    : optionalCode(input.aptitude);

  const birthDate = input.birthDate === undefined
    ? (row.birth_date === null || row.birth_date === undefined ? null : String(row.birth_date))
    : optionalDate(input.birthDate, 'Fecha de nacimiento');
  if (birthDate && birthDate > String(row.entry_date)) {
    throw new ApiError(400, 'La fecha de nacimiento no puede ser posterior al ingreso');
  }

  const weaningDate = input.weaningDate === undefined
    ? (row.weaning_date === null || row.weaning_date === undefined ? null : String(row.weaning_date))
    : optionalDate(input.weaningDate, 'Fecha de destete');
  if (weaningDate && weaningDate > today()) throw new ApiError(400, 'La fecha de destete no puede ser futura');
  if (weaningDate && birthDate && weaningDate < birthDate) {
    throw new ApiError(400, 'La fecha de destete no puede ser anterior al nacimiento');
  }

  const birthWeightKg = input.birthWeightKg === undefined
    ? (row.birth_weight_kg === null || row.birth_weight_kg === undefined ? null : Number(row.birth_weight_kg))
    : optionalWeight(input.birthWeightKg, 'Peso al nacer', true);
  const weaningWeightKg = input.weaningWeightKg === undefined
    ? (row.weaning_weight_kg === null || row.weaning_weight_kg === undefined ? null : Number(row.weaning_weight_kg))
    : optionalWeight(input.weaningWeightKg, 'Peso al destete', false);
  if (weaningWeightKg !== null && weaningDate === null) {
    throw new ApiError(400, 'Indique la fecha de destete junto con su peso');
  }

  const motherId = input.motherId === undefined
    ? (row.mother_id === null || row.mother_id === undefined ? null : Number(row.mother_id))
    : optionalId(input.motherId, 'ID de madre');
  const fatherId = input.fatherId === undefined
    ? (row.father_id === null || row.father_id === undefined ? null : Number(row.father_id))
    : optionalId(input.fatherId, 'ID de padre');
  const motherExternal = input.motherExternal === undefined
    ? (row.mother_external === null || row.mother_external === undefined ? null : String(row.mother_external))
    : optionalText(input.motherExternal, 60);
  const fatherExternal = input.fatherExternal === undefined
    ? (row.father_external === null || row.father_external === undefined ? null : String(row.father_external))
    : optionalText(input.fatherExternal, 60);

  if (motherId !== null && motherExternal !== null) {
    throw new ApiError(400, 'Indique la madre interna o externa, no ambas');
  }
  if (fatherId !== null && fatherExternal !== null) {
    throw new ApiError(400, 'Indique el padre interno o externo, no ambos');
  }
  if (motherId === currentId || fatherId === currentId) {
    throw new ApiError(400, 'Un animal no puede ser su propio progenitor');
  }

  const effectiveDate = input.effectiveDate ? parseDate(input.effectiveDate, 'Fecha efectiva') : today();
  if (effectiveDate > today()) throw new ApiError(400, 'La fecha efectiva no puede ser futura');

  const typeChanged = animalType !== currentType;
  const reason = normalizeReason(input.reason, {
    required: typeChanged,
    fallback: 'Edición de ficha',
  });

  const payload = {
    key,
    alias,
    animalType,
    breed,
    birthDate,
    birthWeightKg,
    weaningDate,
    weaningWeightKg,
    aptitude,
    motherId,
    fatherId,
    motherExternal,
    fatherExternal,
    observations,
    effectiveDate,
  };

  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) {
    return { animal: await getAnimal(db, key, scope), replayed: true };
  }

  if (!exitedCheck(row)) {
    // Ficha dada de baja: solo se permite editar datos descriptivos, nunca reabrir.
    if (typeChanged) throw new ApiError(400, 'No se puede cambiar el tipo de una ficha cerrada');
  }

  const mother = await resolveParent(db, motherId, motherExternal, 'madre', 'hembra', barnIds);
  const father = await resolveParent(db, fatherId, fatherExternal, 'padre', 'macho', barnIds);
  if (mother.id !== null && father.id !== null && mother.id === father.id) {
    throw new ApiError(400, 'La madre y el padre no pueden ser el mismo animal');
  }
  assertParentDates(birthDate, mother, father);
  await assertNoCycle(db, currentId, mother.id, father.id);

  const config = await getConfigSnapshot(db, effectiveDate);
  if (aptitude && !catalogItems(config, 'aptitud').some((item) => item.code === aptitude)) {
    throw new ApiError(400, 'La aptitud no está vigente en la fecha indicada');
  }

  const updatedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      UPDATE animals SET
        alias = ?, animal_type = ?, breed = ?, birth_date = ?, birth_weight_kg = ?,
        weaning_date = ?, weaning_weight_kg = ?, aptitude = ?, mother_id = ?, father_id = ?,
        mother_external = ?, father_external = ?, observations = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      alias, animalType, breed, birthDate, birthWeightKg,
      weaningDate, weaningWeightKg, aptitude, mother.id, father.id,
      mother.external, father.external, observations, updatedAt, currentId,
    ),
  ];

  if (typeChanged) {
    statements.push(
      db.prepare(`
        UPDATE animal_type_history SET valid_to = ?, is_current = 0
        WHERE animal_id = ? AND is_current = 1
      `).bind(effectiveDate, currentId),
      db.prepare(`
        INSERT INTO animal_type_history (
          animal_id, animal_type, valid_from, valid_to, is_current, reason, created_by_user_id, created_at
        ) VALUES (?, ?, ?, NULL, 1, ?, ?, ?)
      `).bind(currentId, animalType, effectiveDate, reason, actorUserId, updatedAt),
    );
  }

  // Corregir un peso descriptivo deja su pesaje en la serie histórica para que
  // el peso actual siga derivándose del último pesaje válido por fecha.
  const previousBirthDate = row.birth_date === null || row.birth_date === undefined ? null : String(row.birth_date);
  const previousBirthWeight = row.birth_weight_kg === null || row.birth_weight_kg === undefined
    ? null
    : Number(row.birth_weight_kg);
  const previousWeaningDate = row.weaning_date === null || row.weaning_date === undefined ? null : String(row.weaning_date);
  const previousWeaningWeight = row.weaning_weight_kg === null || row.weaning_weight_kg === undefined
    ? null
    : Number(row.weaning_weight_kg);

  if (birthWeightKg !== null && birthDate !== null
    && (birthWeightKg !== previousBirthWeight || birthDate !== previousBirthDate)) {
    statements.push(db.prepare(`
      INSERT INTO animal_weights (
        animal_id, weighed_on, weight_kg, stage_code, barn_id, location_code, lot_code,
        note, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'Peso al nacer corregido', ?, ?)
    `).bind(
      currentId, birthDate, birthWeightKg, Number(row.barn_id),
      row.location_code ?? null, row.lot_code ?? null, actorUserId, updatedAt,
    ));
  }
  if (weaningWeightKg !== null && weaningDate !== null
    && (weaningWeightKg !== previousWeaningWeight || weaningDate !== previousWeaningDate)) {
    statements.push(db.prepare(`
      INSERT INTO animal_weights (
        animal_id, weighed_on, weight_kg, stage_code, barn_id, location_code, lot_code,
        note, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Peso al destete corregido', ?, ?)
    `).bind(
      currentId, weaningDate, weaningWeightKg, String(row.current_stage_code),
      Number(row.barn_id), row.location_code ?? null, row.lot_code ?? null, actorUserId, updatedAt,
    ));
  }

  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'animal.update',
    authorUserId: actorUserId,
    entityType: 'animal',
    entityId: currentId,
    barnId: Number(row.barn_id),
    effectiveDate,
    payload,
    result: { animalId: currentId, code: row.code },
  });

  await commitOperation(db, claim, statements, [{
    entityType: 'animal',
    entityId: currentId,
    action: typeChanged ? 'correct' : 'update',
    actorUserId,
    barnId: Number(row.barn_id),
    reason,
    previousData: {
      alias: row.alias ?? null,
      animalType: currentType,
      breed: row.breed ?? null,
      birthDate: row.birth_date ?? null,
      aptitude: row.aptitude ?? null,
      motherId: row.mother_id ?? null,
      fatherId: row.father_id ?? null,
      observations: row.observations ?? null,
    },
    newData: {
      alias, animalType, breed, birthDate, aptitude,
      motherId: mother.id, fatherId: father.id, observations,
    },
    effectiveDate,
    recordedAt: claim.recordedAt,
  }]);

  return { animal: await getAnimal(db, key, scope), replayed: false };
}

function exitedCheck(row: Row): boolean {
  return row.exit_date === null || row.exit_date === undefined;
}

export interface ChangeTagInput {
  tag?: string;
  effectiveDate?: string;
  reason?: string;
  operationKey?: string;
}

/** Cambia el arete conservando el anterior con su fecha de vigencia (ANI-02). */
export async function changeTag(
  db: D1Database,
  actorUserId: number,
  key: string,
  input: ChangeTagInput,
  scope: ScopeOptions = {},
): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const tag = requireText(input.tag, 'Número de arete', 40);
  if (/\s/.test(tag)) throw new ApiError(400, 'El arete no puede contener espacios');
  const effectiveDate = input.effectiveDate ? parseDate(input.effectiveDate, 'Fecha del cambio') : today();
  if (effectiveDate > today()) throw new ApiError(400, 'La fecha del cambio no puede ser futura');
  const reason = normalizeReason(input.reason, { required: true, fallback: 'Cambio de arete' });

  const payload = { key, tag, effectiveDate, reason };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) {
    return { animal: await getAnimal(db, key, scope), replayed: true };
  }

  const barnIds = await resolveBarnScope(db, scope);
  if (barnIds !== null && barnIds.length === 0) throw new ApiError(404, 'Animal no encontrado');
  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');
  const animalId = Number(row.id);

  const currentTagRow = await db.prepare(`
    SELECT id, tag, valid_from FROM animal_tags WHERE animal_id = ? AND is_current = 1
  `).bind(animalId).first<{ id: number; tag: string; valid_from: string }>();
  if (!currentTagRow) throw new ApiError(409, 'La ficha no tiene un arete vigente');
  if (String(currentTagRow.tag) === tag) throw new ApiError(400, 'El arete indicado ya está vigente');
  if (effectiveDate < String(currentTagRow.valid_from)) {
    throw new ApiError(400, 'La fecha del cambio no puede ser anterior al arete vigente');
  }

  const inUse = await db.prepare('SELECT id FROM animal_tags WHERE tag = ? AND is_current = 1')
    .bind(tag).first();
  if (inUse) throw new ApiError(409, `El arete ${tag} ya está asignado a otro animal`);

  const createdAt = new Date().toISOString();
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'animal.tag',
    authorUserId: actorUserId,
    entityType: 'animal',
    entityId: animalId,
    barnId: Number(row.barn_id),
    effectiveDate,
    payload,
    result: { animalId, code: row.code, tag },
  });

  await commitOperation(db, claim, [
    db.prepare(`
      UPDATE animal_tags SET valid_to = ?, is_current = 0
      WHERE animal_id = ? AND is_current = 1
    `).bind(effectiveDate, animalId),
    db.prepare(`
      INSERT INTO animal_tags (animal_id, tag, valid_from, valid_to, is_current, created_by_user_id, created_at)
      VALUES (?, ?, ?, NULL, 1, ?, ?)
    `).bind(animalId, tag, effectiveDate, actorUserId, createdAt),
  ], [{
    entityType: 'animal',
    entityId: animalId,
    action: 'update',
    actorUserId,
    barnId: Number(row.barn_id),
    reason,
    previousData: { tag: currentTagRow.tag, validFrom: currentTagRow.valid_from },
    newData: { tag, validFrom: effectiveDate },
    effectiveDate,
    recordedAt: claim.recordedAt,
  }]);

  return { animal: await getAnimal(db, key, scope), replayed: false };
}

export interface RegisterWeightInput {
  weighedOn?: unknown;
  weighedTime?: unknown;
  weightKg?: unknown;
  stageCode?: unknown;
  note?: unknown;
  operationKey?: string;
}

export interface CorrectWeightInput extends RegisterWeightInput {
  reason?: unknown;
}

function parseWeightTime(value: unknown): string {
  const time = typeof value === 'string' ? value.trim() : '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(400, 'Hora inválida: use HH:MM');
  return time;
}

async function animalWeightContext(db: D1Database, key: string, weighedOn: string, scope: ScopeOptions) {
  const barnIds = await resolveBarnScope(db, scope);
  if (barnIds !== null && barnIds.length === 0) throw new ApiError(404, 'Animal no encontrado');
  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');
  if (weighedOn < String(row.entry_date) || (row.exit_date && weighedOn > String(row.exit_date))) {
    throw new ApiError(400, 'La fecha del pesaje debe estar entre el ingreso y la salida del animal');
  }
  const location = await db.prepare(`SELECT barn_id, location_code, lot_code, stage_code FROM animal_location_history
    WHERE animal_id = ? AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)
    ORDER BY valid_from DESC, id DESC LIMIT 1`).bind(Number(row.id), weighedOn, weighedOn).first<Row>();
  if (!location) throw new ApiError(409, 'No existe ubicación histórica para esa fecha');
  const barnId = Number(location.barn_id);
  if (barnIds !== null && !barnIds.includes(barnId)) throw new ApiError(403, 'No tiene acceso al galpón donde estaba el animal en la fecha del pesaje');
  return { row, barnId, locationCode: location.location_code === null ? null : String(location.location_code),
    lotCode: location.lot_code === null ? null : String(location.lot_code), stageAtDate: String(location.stage_code) };
}

export async function registerAnimalWeight(db: D1Database, actorUserId: number, key: string,
  input: RegisterWeightInput, scope: ScopeOptions = {}): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const weighedOn = parseDate(input.weighedOn, 'Fecha del pesaje');
  if (weighedOn > today()) throw new ApiError(400, 'La fecha del pesaje no puede ser futura');
  const weighedTime = parseWeightTime(input.weighedTime);
  const weightKg = optionalWeight(input.weightKg, 'Peso', false)!;
  const note = optionalText(input.note);
  const context = await animalWeightContext(db, key, weighedOn, scope);
  const stageCode = optionalCode(input.stageCode) ?? context.stageAtDate;
  const config = await getConfigSnapshot(db, weighedOn);
  if (!config.stages.some((stage) => stage.code === stageCode)) throw new ApiError(400, 'La etapa no estaba vigente en la fecha del pesaje');
  const payload = { key, weighedOn, weighedTime, weightKg, stageCode, note, barnId: context.barnId,
    locationCode: context.locationCode, lotCode: context.lotCode };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { animal: await getAnimal(db, key, scope), replayed: true };
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'animal.weight',
    authorUserId: actorUserId, entityType: 'animal', entityId: Number(context.row.id), barnId: context.barnId,
    effectiveDate: weighedOn, payload, result: { animalId: Number(context.row.id), weighedOn, weighedTime, weightKg } });
  await commitOperation(db, claim, [db.prepare(`INSERT INTO animal_weights
    (animal_id, weighed_on, weighed_time, weight_kg, stage_code, barn_id, location_code, lot_code, note, recorded_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(Number(context.row.id), weighedOn, weighedTime, weightKg, stageCode, context.barnId, context.locationCode,
      context.lotCode, note, actorUserId, claim.recordedAt)], [{ entityType: 'animal', entityId: Number(context.row.id),
      action: 'create', actorUserId, barnId: context.barnId, reason: 'Registro de pesaje', previousData: null,
      newData: payload, effectiveDate: weighedOn, recordedAt: claim.recordedAt }]);
  return { animal: await getAnimal(db, key, scope), replayed: false };
}

export async function correctAnimalWeight(db: D1Database, actorUserId: number, key: string, weightId: number,
  input: CorrectWeightInput, scope: ScopeOptions = {}): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const reason = normalizeReason(input.reason, { required: true, fallback: 'Corrección de pesaje' });
  const original = await db.prepare(`SELECT w.* FROM animal_weights w JOIN animals a ON a.id = w.animal_id
    WHERE w.id = ? AND a.code = ?`).bind(weightId, key).first<Row>();
  if (!original) throw new ApiError(404, 'Pesaje no encontrado');
  const weighedOn = String(original.weighed_on);
  const context = await animalWeightContext(db, key, weighedOn, scope);
  const weightKg = optionalWeight(input.weightKg, 'Peso corregido', false)!;
  const note = optionalText(input.note) ?? String(original.note ?? '');
  const payload = { key, weightId, weightKg, note, reason };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { animal: await getAnimal(db, key, scope), replayed: true };
  const replaced = await db.prepare('SELECT id FROM animal_weights WHERE corrects_weight_id = ?').bind(weightId).first();
  if (replaced) throw new ApiError(409, 'Este pesaje ya fue corregido');
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'animal.weight.correction',
    authorUserId: actorUserId, entityType: 'animal_weight', entityId: weightId, barnId: context.barnId,
    effectiveDate: weighedOn, payload, result: { animalId: Number(context.row.id), weightId, weightKg } });
  await commitOperation(db, claim, [db.prepare(`INSERT INTO animal_weights
    (animal_id, weighed_on, weighed_time, weight_kg, stage_code, barn_id, location_code, lot_code, note,
      corrects_weight_id, recorded_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(Number(context.row.id), weighedOn, String(original.weighed_time ?? '12:00'), weightKg, original.stage_code,
      original.barn_id, original.location_code, original.lot_code, note, weightId, actorUserId, claim.recordedAt)],
  [{ entityType: 'animal_weight', entityId: weightId, action: 'update', actorUserId, barnId: context.barnId,
    reason, previousData: { weightKg: Number(original.weight_kg) }, newData: { weightKg, correctsWeightId: weightId },
    effectiveDate: weighedOn, recordedAt: claim.recordedAt }]);
  return { animal: await getAnimal(db, key, scope), replayed: false };
}

export interface TransferAnimalInput {
  destinationBarnId?: unknown;
  locationCode?: unknown;
  lotCode?: unknown;
  effectiveDate?: string;
  reason?: string;
  operationKey?: string;
}

/** Traslada una ficha identificada, su saldo, su historia de ubicación y auditoría atómicamente. */
export async function transferAnimal(
  db: D1Database,
  actorUserId: number,
  key: string,
  input: TransferAnimalInput,
  scope: ScopeOptions = {},
): Promise<{ animal: AnimalDetail; transferGroupId: string; replayed: boolean; warning: string | null }> {
  const barnIds = await resolveBarnScope(db, scope);
  if (barnIds !== null && barnIds.length === 0) throw new ApiError(404, 'Animal no encontrado');
  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');
  if (!exitedCheck(row)) throw new ApiError(409, 'No se puede trasladar una ficha con salida física registrada');
  const sourceBarnId = Number(row.barn_id);
  const destinationBarnId = Number(input.destinationBarnId);
  if (!Number.isInteger(destinationBarnId) || destinationBarnId <= 0) throw new ApiError(400, 'Seleccione un galpón destino');
  const effectiveDate = input.effectiveDate ? parseDate(input.effectiveDate, 'Fecha del traslado') : today();
  if (effectiveDate > today() || effectiveDate < String(row.entry_date)) throw new ApiError(400, 'La fecha del traslado debe estar entre el ingreso y hoy');
  const destination = await db.prepare('SELECT id, name, capacity FROM barns WHERE id = ?').bind(destinationBarnId).first<{ id: number; name: string; capacity: number | null }>();
  if (!destination) throw new ApiError(404, 'El galpón destino no existe');
  if (scope.allowedBarnNames && !scope.allowedBarnNames.includes(destination.name)) throw new ApiError(403, 'Debe tener acceso a ambos galpones para trasladar la ficha');
  const locationCode = optionalCode(input.locationCode);
  const lotCode = optionalCode(input.lotCode);
  const stageCode = String(row.current_stage_code);
  const sex = String(row.sex) as Sex;
  const payload = { key, destinationBarnId, locationCode, lotCode, effectiveDate };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { animal: await getAnimal(db, key, scope), ...(replay.result as { transferGroupId: string; warning: string | null }), replayed: true };
  if (destinationBarnId === sourceBarnId) throw new ApiError(400, 'Seleccione un galpón destino diferente al actual');
  const config = await getConfigSnapshot(db, effectiveDate);
  if (locationCode && !config.locations.some((item) => item.code === locationCode)) throw new ApiError(400, 'La ubicación no está vigente en esa fecha');
  if (lotCode && !config.lots.some((item) => item.code === lotCode)) throw new ApiError(400, 'El lote no está vigente en esa fecha');
  const later = await db.prepare('SELECT id FROM animal_location_history WHERE animal_id = ? AND valid_from > ? LIMIT 1')
    .bind(Number(row.id), effectiveDate).first();
  if (later) throw new ApiError(409, 'El animal tiene movimientos posteriores; corrija primero la cronología para evitar reescribir historia');
  const reason = normalizeReason(input.reason, { required: true, fallback: 'Traslado individual' });
  let warning: string | null = null;
  if (destination.capacity !== null && destination.capacity !== undefined) {
    const occupied = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN movement_type IN ('sale','death','transfer_out')
      THEN -quantity ELSE quantity END), 0) AS heads FROM inventory_movements WHERE barn_id = ? AND effective_date <= ?`)
      .bind(destinationBarnId, effectiveDate).first<{ heads: number }>();
    const projected = Number(occupied?.heads ?? 0) + 1;
    if (projected > Number(destination.capacity)) warning = `El destino quedaría sobre capacidad: ${projected}/${destination.capacity} cabezas.`;
  }
  const transferGroupId = crypto.randomUUID();
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: 'animal.transfer',
    authorUserId: actorUserId, entityType: 'animal', entityId: Number(row.id), barnId: sourceBarnId,
    effectiveDate, payload, result: { animalId: Number(row.id), transferGroupId, warning } });
  const createdAt = claim.recordedAt;
  const sourceLocation = row.location_code === null || row.location_code === undefined ? null : String(row.location_code);
  const sourceLot = row.lot_code === null || row.lot_code === undefined ? null : String(row.lot_code);
  const animalId = Number(row.id);
  const insertLeg = (barnId: number, location: string | null, lot: string | null, movementType: 'transfer_out' | 'transfer_in') => db.prepare(`
    INSERT INTO inventory_movements (operation_log_id, movement_type, effective_date, barn_id, location_code,
      lot_code, stage_code, sex, quantity, transfer_group_id, notes, animal_id, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`)
    .bind(claim.id, movementType, effectiveDate, barnId, location, lot, stageCode, sex, transferGroupId,
      `Traslado de ficha ${String(row.code)}`, animalId, actorUserId, createdAt);
  await commitOperation(db, claim, [
    db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)'),
    db.prepare('UPDATE animal_location_history SET valid_until = ? WHERE animal_id = ? AND valid_until IS NULL')
      .bind(effectiveDate, animalId),
    db.prepare(`INSERT INTO animal_location_history
      (animal_id, barn_id, location_code, lot_code, stage_code, valid_from, valid_until, operation_log_id, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .bind(animalId, destinationBarnId, locationCode, lotCode, stageCode, effectiveDate, claim.id, actorUserId, createdAt),
    db.prepare('UPDATE animals SET barn_id = ?, location_code = ?, lot_code = ?, updated_at = ? WHERE id = ?')
      .bind(destinationBarnId, locationCode, lotCode, createdAt, animalId),
    insertLeg(sourceBarnId, sourceLocation, sourceLot, 'transfer_out'),
    insertLeg(destinationBarnId, locationCode, lotCode, 'transfer_in'),
    stockGuardStatement(db, sourceBarnId, sourceLocation, sourceLot, stageCode, sex),
    stockGuardStatement(db, destinationBarnId, locationCode, lotCode, stageCode, sex),
    db.prepare('DELETE FROM inventory_write_guard'),
  ], [{ entityType: 'animal', entityId: animalId, action: 'update', actorUserId, barnId: sourceBarnId, reason,
    previousData: { barnId: sourceBarnId, locationCode: sourceLocation, lotCode: sourceLot },
    newData: { barnId: destinationBarnId, locationCode, lotCode, transferGroupId }, effectiveDate, recordedAt: createdAt }]);
  return { animal: await getAnimal(db, key, scope), transferGroupId, warning, replayed: false };
}

export interface AnimalExitInput {
  exitType?: unknown;
  purchaseReturn?: unknown;
  causeCode?: unknown;
  effectiveDate?: string;
  saleAmount?: unknown;
  currencyCode?: unknown;
  counterparty?: unknown;
  documentReference?: unknown;
  reason?: string;
  operationKey?: string;
}

/** Registra venta o muerte y cierra la ficha en el mismo lote que descuenta una cabeza. */
export async function registerAnimalExit(
  db: D1Database,
  actorUserId: number,
  key: string,
  input: AnimalExitInput,
  scope: ScopeOptions = {},
): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const barnIds = await resolveBarnScope(db, scope);
  if (barnIds !== null && barnIds.length === 0) throw new ApiError(404, 'Animal no encontrado');
  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');
  const purchaseReturn=input.purchaseReturn===true;
  const exitType = String(input.exitType ?? '') as 'sale' | 'death';
  if (exitType !== 'sale' && exitType !== 'death') throw new ApiError(400, 'La salida debe ser venta o muerte');
  const effectiveDate = input.effectiveDate ? parseDate(input.effectiveDate, 'Fecha de salida') : today();
  if (effectiveDate > today() || effectiveDate < String(row.entry_date)) throw new ApiError(400, 'La fecha de salida debe estar entre el ingreso y hoy');
  const causeCode = requireText(input.causeCode, exitType === 'death' ? 'Causa de muerte' : 'Causa de venta o descarte', 60);
  const config = await getConfigSnapshot(db, effectiveDate);
  const causeKey = exitType === 'death' ? 'causa_muerte' : 'causa_descarte';
  if (!catalogItems(config, causeKey).some((item) => item.code === causeCode)) throw new ApiError(400, 'La causa no está vigente en la fecha de salida');
  const animalId = Number(row.id);
  const barnId = Number(row.barn_id);
  const stageCode = String(row.current_stage_code);
  const sex = String(row.sex) as Sex;
  const locationCode = row.location_code === null || row.location_code === undefined ? null : String(row.location_code);
  const lotCode = row.lot_code === null || row.lot_code === undefined ? null : String(row.lot_code);
  if(exitType==='sale'){
    const restriction=await db.prepare(`SELECT h.product,h.withdrawal_until FROM health_events h JOIN health_event_animals ha ON ha.health_event_id=h.id
      WHERE ha.animal_id=? AND h.event_type<>'death' AND h.effective_date<=? AND ha.withdrawal_until>=? ORDER BY ha.withdrawal_until DESC LIMIT 1`).bind(animalId,effectiveDate,effectiveDate).first<{product:string;withdrawal_until:string}>();
    if(restriction)throw new ApiError(409,`No se puede vender: retiro sanitario de ${restriction.product} hasta ${restriction.withdrawal_until}`);
  }
  let originalPurchase:Row|null=null;
  if(purchaseReturn){
    if(exitType!=='sale'||String(row.origin_type)!=='compra')throw new ApiError(400,'Solo se puede devolver desde su origen un animal registrado como compra');
    originalPurchase=await db.prepare("SELECT * FROM financial_entries WHERE source_type='animal_purchase' AND source_id=? ORDER BY id LIMIT 1").bind(String(animalId)).first<Row>();
    if(!originalPurchase)throw new ApiError(409,'No hay una compra original vigente para devolver');
    if(effectiveDate<String(originalPurchase.operation_date))throw new ApiError(400,'La devolución no puede ser anterior a la compra');
  }
  let saleAmountMinor:number|null=null;let saleCurrency='PEN';let buyer:string|null=null;let documentReference:string|null=null;
  if(purchaseReturn&&originalPurchase){saleAmountMinor=Number(originalPurchase.amount_minor);saleCurrency=String(originalPurchase.currency_code);buyer=originalPurchase.counterparty===null?null:String(originalPurchase.counterparty);documentReference=originalPurchase.reference===null?null:String(originalPurchase.reference);}
  else if(exitType==='sale'&&input.saleAmount!==undefined&&input.saleAmount!==null&&input.saleAmount!==''){
    const raw=String(input.saleAmount).trim();if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw))throw new ApiError(400,'El importe de venta debe tener hasta dos decimales');const [whole,decimal='']=raw.split('.');saleAmountMinor=Number(whole)*100+Number(decimal.padEnd(2,'0'));if(!Number.isSafeInteger(saleAmountMinor)||saleAmountMinor<=0)throw new ApiError(400,'El importe de venta debe ser mayor que cero');
    saleCurrency=String(input.currencyCode??'PEN').toUpperCase();if(!/^[A-Z]{3}$/.test(saleCurrency))throw new ApiError(400,'Código de moneda inválido');buyer=String(input.counterparty??'').trim()||null;documentReference=String(input.documentReference??'').trim()||null;
  }
  if(exitType==='sale'&&saleAmountMinor===null)throw new ApiError(400,'Toda venta de animales requiere importe para enlazarla con Finanzas');
  const payload = { key, exitType, purchaseReturn, originalPurchaseId:originalPurchase?.id??null, causeCode, effectiveDate,saleAmountMinor,saleCurrency,buyer,documentReference };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { animal: await getAnimal(db, key, scope), replayed: true };
  if(purchaseReturn&&originalPurchase?.reversed_at!==null)throw new ApiError(409,'La compra ya tiene una devolución registrada');
  if (!exitedCheck(row)) throw new ApiError(409, 'La ficha ya tiene una salida física');
  const reason = normalizeReason(input.reason, { required: true, fallback: exitType === 'death' ? 'Muerte de animal' : 'Venta de animal' });
  const financeRow=saleAmountMinor===null?null:await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM financial_entries').first<{id:number}>();const financialEntryId=financeRow?Number(financeRow.id):null;
  const claim = await createOperationClaim({ operationKey: input.operationKey, operationType: purchaseReturn?'animal.purchase.return':`animal.${exitType}`,
    authorUserId: actorUserId, entityType: 'animal', entityId: animalId, barnId, effectiveDate,
    payload, result: { animalId, code: row.code, exitType,financialEntryId } });
  const createdAt = claim.recordedAt;
  const movementId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const healthEventId = exitType === 'death' ? Date.now() * 1000 + Math.floor(Math.random() * 1000) : null;
  const status = exitType === 'sale' ? 'vendido' : 'muerto';
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)'),
    db.prepare(`UPDATE animals SET status = ?, exit_date = ?, exit_type = ?, is_active = 0,
      deactivated_at = ?, deactivation_reason = ?, updated_at = ? WHERE id = ? AND exit_date IS NULL`)
      .bind(status, effectiveDate, exitType, createdAt, reason, createdAt, animalId),
    ...(healthEventId === null ? [] : [db.prepare(`INSERT INTO health_events(id,operation_log_id,event_type,effective_date,cause_code,observations,created_by_user_id,created_at)
      VALUES(?,?,'death',?,?,?, ?,?)`).bind(healthEventId,claim.id,effectiveDate,causeCode,reason,actorUserId,createdAt)]),
    db.prepare(`INSERT INTO inventory_movements
      (id, operation_log_id, movement_type, effective_date, barn_id, location_code, lot_code, stage_code, sex,
       quantity, cause_code, notes, animal_id, created_by_user_id, created_at, health_event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`)
      .bind(movementId, claim.id, exitType, effectiveDate, barnId, locationCode, lotCode, stageCode, sex,
        causeCode, reason, animalId, actorUserId, createdAt,healthEventId),
    ...(healthEventId === null ? [] : [db.prepare(`INSERT INTO health_event_animals(health_event_id,animal_id,animal_code_snapshot,barn_id,barn_name_snapshot,location_code_snapshot,lot_code_snapshot,stage_code_snapshot,withdrawal_until)
      VALUES(?,?,?,?,?,?,?,?,NULL)`).bind(healthEventId,animalId,String(row.code),barnId,String(row.barn_name),locationCode,lotCode,stageCode)]),
    stockGuardStatement(db, barnId, locationCode, lotCode, stageCode, sex),
    db.prepare('DELETE FROM inventory_write_guard'),
    ...(financialEntryId===null?[]:[...(originalPurchase?[db.prepare('UPDATE financial_entries SET reversed_at=? WHERE id=? AND reversed_at IS NULL').bind(createdAt,Number(originalPurchase.id))]:[]),db.prepare(`INSERT INTO financial_entries(id,operation_log_id,direction,category,concept,operation_date,amount_minor,currency_code,counterparty,reference,notes,created_by_user_id,created_at,source_type,source_id,reversal_of_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(financialEntryId,claim.id,'income',originalPurchase?'Devolución de compra de animal':'Venta de animal',originalPurchase?`Devolución de compra del animal ${String(row.code)}`:`Venta de animal ${String(row.code)}`,effectiveDate,saleAmountMinor,saleCurrency,buyer,documentReference,reason,actorUserId,createdAt,originalPurchase?'reversal':'animal_sale',String(originalPurchase?.id??animalId),originalPurchase?Number(originalPurchase.id):null),db.prepare(`INSERT INTO financial_allocations(entry_id,barn_id,barn_name_snapshot,amount_minor,animal_id,animal_code_snapshot,lot_code,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(financialEntryId,barnId,String(row.barn_name),saleAmountMinor,animalId,String(row.code),lotCode,createdAt)]),
  ];
  await commitOperation(db, claim, statements, [{ entityType: 'animal', entityId: animalId, action: 'update', actorUserId, barnId, reason,
    previousData: { status: String(row.status), exitDate: null },
    newData: { status, exitType, exitDate: effectiveDate, causeCode, inventoryMovementId: movementId,healthEventId }, effectiveDate, recordedAt: createdAt },
    ...(healthEventId===null?[]:[{entityType:'health_event',entityId:healthEventId,action:'create' as const,actorUserId,barnId,reason,previousData:null,newData:{eventType:'death',causeCode,animalCode:String(row.code),inventoryMovementId:movementId},effectiveDate,recordedAt:createdAt}]),
    ...(originalPurchase?[{entityType:'financial_entry',entityId:Number(originalPurchase.id),action:'update' as const,actorUserId,barnId,reason,previousData:{reversedAt:null},newData:{reversedAt:createdAt,reversalEntryId:financialEntryId},effectiveDate,recordedAt:createdAt}]:[]),
    ...(financialEntryId===null?[]:[{entityType:'financial_entry',entityId:financialEntryId,action:'create' as const,actorUserId,barnId,reason,previousData:null,newData:{direction:'income',category:originalPurchase?'Devolución de compra de animal':'Venta de animal',animalCode:String(row.code),amountMinor:saleAmountMinor,currencyCode:saleCurrency,counterparty:buyer,reference:documentReference,inventoryMovementId:movementId,reversalOfId:originalPurchase?.id??null},effectiveDate,recordedAt:createdAt}])]);
  return { animal: await getAnimal(db, key, scope), replayed: false };
}

/** Revierte una venta al devolver físicamente el animal, restaurando stock y caja en un lote. */
export async function registerAnimalSaleReturn(db:D1Database,actorUserId:number,key:string,input:{effectiveDate?:unknown;reason?:unknown;operationKey?:string},scope:ScopeOptions={}){
  const barnIds=await resolveBarnScope(db,scope);if(barnIds!==null&&!barnIds.length)throw new ApiError(404,'Animal no encontrado');
  const animal=await fetchAnimalRow(db,key,barnIds);if(!animal)throw new ApiError(404,'Animal no encontrado');
  const animalId=Number(animal.id);const original=await db.prepare("SELECT * FROM financial_entries WHERE source_type='animal_sale' AND source_id=? ORDER BY id DESC LIMIT 1").bind(String(animalId)).first<Row>();
  if(!original)throw new ApiError(409,'No hay una venta financiera original para devolver');
  const effectiveDate=input.effectiveDate?parseDate(input.effectiveDate,'Fecha de devolución'):today();if(effectiveDate>today()||effectiveDate<=String(original.operation_date))throw new ApiError(400,'La devolución debe ser posterior a la fecha de venta y no puede ser futura');
  const reason=normalizeReason(input.reason,{required:true});const payload={animalId,entryId:Number(original.id),effectiveDate,reason};const replay=await lookupExistingOperation(db,actorUserId,input.operationKey,payload);if(replay)return{animal:await getAnimal(db,key,scope),replayed:true};
  if(original.reversed_at!==null)throw new ApiError(409,'La venta ya tiene una devolución registrada');
  if(String(animal.status)!=='vendido'||String(animal.exit_date)!==String(original.operation_date))throw new ApiError(409,'La ficha ya no coincide con la salida de esta venta');
  const sourceLocation=await db.prepare(`SELECT h.* FROM animal_location_history h WHERE h.animal_id=? AND h.valid_from<=? AND (h.valid_until IS NULL OR h.valid_until>?) ORDER BY h.valid_from DESC,h.id DESC LIMIT 1`).bind(animalId,String(original.operation_date),String(original.operation_date)).first<Row>();
  if(!sourceLocation)throw new ApiError(409,'No se encontró la ubicación histórica de la venta');const barnId=Number(sourceLocation.barn_id);const barn=await db.prepare("SELECT name FROM barns WHERE id=? AND status<>'inactivo'").bind(barnId).first<{name:string}>();if(!barn)throw new ApiError(409,'El galpón de la venta está inactivo');if(scope.allowedBarnNames&&!scope.allowedBarnNames.includes(barn.name))throw new ApiError(403,'Sin acceso al galpón de la venta');
  const operationLogId=String(await db.prepare('SELECT operation_log_id FROM financial_entries WHERE id=?').bind(Number(original.id)).first<{operation_log_id:string}>().then(row=>row?.operation_log_id??''));
  const originalMovement=await db.prepare("SELECT * FROM inventory_movements WHERE operation_log_id=? AND animal_id=? AND movement_type='sale' LIMIT 1").bind(operationLogId,animalId).first<Row>();if(!originalMovement)throw new ApiError(409,'No se encontró la salida de inventario de la venta');
  const allocations=await db.prepare('SELECT * FROM financial_allocations WHERE entry_id=? ORDER BY id').bind(Number(original.id)).all<Row>();if(allocations.results?.length!==1)throw new ApiError(409,'La venta no tiene una distribución individual válida para devolver');
  const financeId=Number((await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM financial_entries').first<{id:number}>())?.id??1);const movementId=Date.now()*1000+Math.floor(Math.random()*1000);
  const claim=await createOperationClaim({operationKey:input.operationKey,operationType:'animal.sale.return',authorUserId:actorUserId,entityType:'animal',entityId:animalId,barnId,effectiveDate,payload,result:{animalId,originalEntryId:Number(original.id),financeId,movementId}});const now=claim.recordedAt;
  const allocation=allocations.results![0];const location=sourceLocation.location_code===null?null:String(sourceLocation.location_code);const lot=sourceLocation.lot_code===null?null:String(sourceLocation.lot_code);const stage=String(sourceLocation.stage_code);const sex=String(animal.sex) as Sex;
  await commitOperation(db,claim,[
    db.prepare('INSERT INTO inventory_write_guard (guard_id) VALUES (1)'),
    db.prepare('UPDATE financial_entries SET reversed_at=? WHERE id=? AND reversed_at IS NULL').bind(now,Number(original.id)),
    db.prepare(`UPDATE animal_location_history SET valid_until=? WHERE animal_id=? AND valid_until IS NULL`).bind(effectiveDate,animalId),
    db.prepare(`INSERT INTO animal_location_history(animal_id,barn_id,location_code,lot_code,stage_code,valid_from,valid_until,operation_log_id,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,NULL,?,?,?)`).bind(animalId,barnId,location,lot,stage,effectiveDate,claim.id,actorUserId,now),
    db.prepare(`UPDATE animals SET status='activo',exit_date=NULL,exit_type=NULL,is_active=1,deactivated_at=NULL,deactivation_reason=NULL,barn_id=?,location_code=?,lot_code=?,current_stage_code=?,updated_at=? WHERE id=? AND status='vendido'`).bind(barnId,location,lot,stage,now,animalId),
    db.prepare(`INSERT INTO inventory_movements(id,operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,reverses_movement_id,notes,animal_id,created_by_user_id,created_at) VALUES(?,?,'purchase',?,?,?,?,?,?,1,?,?,?,?,?)`).bind(movementId,claim.id,effectiveDate,barnId,location,lot,stage,sex,Number(originalMovement.id),`Devolución de venta #${Number(original.id)}`,animalId,actorUserId,now),
    db.prepare(`INSERT INTO financial_entries(id,operation_log_id,direction,category,concept,operation_date,amount_minor,currency_code,counterparty,reference,notes,created_by_user_id,created_at,source_type,source_id,reversal_of_id) VALUES(?,?,'expense','Devolución de venta de animal',?,?,?,?,?,?,?,?,?,'reversal',?,?)`).bind(financeId,claim.id,`Devolución de venta del animal ${String(animal.code)}`,effectiveDate,Number(original.amount_minor),String(original.currency_code),original.counterparty,original.reference,reason,actorUserId,now,String(original.id),Number(original.id)),
    db.prepare(`INSERT INTO financial_allocations(entry_id,barn_id,barn_name_snapshot,amount_minor,animal_id,animal_code_snapshot,lot_code,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(financeId,allocation.barn_id,allocation.barn_name_snapshot,Number(allocation.amount_minor),animalId,String(animal.code),lot,now),
    stockGuardStatement(db,barnId,location,lot,stage,sex),db.prepare('DELETE FROM inventory_write_guard'),
  ],[
    {entityType:'animal',entityId:animalId,action:'update',actorUserId,barnId,reason,previousData:{status:'vendido',exitDate:animal.exit_date},newData:{status:'activo',returnedFromSale:Number(original.id),inventoryMovementId:movementId},effectiveDate,recordedAt:now},
    {entityType:'financial_entry',entityId:Number(original.id),action:'update',actorUserId,barnId,reason,previousData:{reversedAt:null},newData:{reversedAt:now,reversalEntryId:financeId},effectiveDate,recordedAt:now},
    {entityType:'financial_entry',entityId:financeId,action:'create',actorUserId,barnId,reason,previousData:null,newData:{direction:'expense',reversalOfId:Number(original.id),amountMinor:Number(original.amount_minor),currencyCode:String(original.currency_code)},effectiveDate,recordedAt:now},
  ]);
  return{animal:await getAnimal(db,key,scope),replayed:false};
}

export interface ToggleAvailabilityInput {
  reason?: string;
  operationKey?: string;
}

/**
 * Desactiva la disponibilidad de una ficha (ANI-08). No registra venta ni muerte
 * y no altera el inventario físico: solo la retira de las selecciones nuevas.
 */
export async function setAnimalAvailability(
  db: D1Database,
  actorUserId: number,
  key: string,
  active: boolean,
  input: ToggleAvailabilityInput,
  scope: ScopeOptions = {},
): Promise<{ animal: AnimalDetail; replayed: boolean }> {
  const reason = normalizeReason(input.reason, { required: true, fallback: active ? 'Reactivación de ficha' : 'Desactivación de ficha' });
  const payload = { key, active, reason };

  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) {
    return { animal: await getAnimal(db, key, scope), replayed: true };
  }

  const barnIds = await resolveBarnScope(db, scope);
  if (barnIds !== null && barnIds.length === 0) throw new ApiError(404, 'Animal no encontrado');
  const row = await fetchAnimalRow(db, key, barnIds);
  if (!row) throw new ApiError(404, 'Animal no encontrado');
  if (!exitedCheck(row)) throw new ApiError(409, 'La ficha está cerrada por una salida física');

  const animalId = Number(row.id);
  const isActive = Number(row.is_active) === 1;
  if (isActive === active) {
    throw new ApiError(400, active ? 'La ficha ya está activa' : 'La ficha ya está desactivada');
  }

  const now = new Date().toISOString();
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: active ? 'animal.reactivate' : 'animal.deactivate',
    authorUserId: actorUserId,
    entityType: 'animal',
    entityId: animalId,
    barnId: Number(row.barn_id),
    effectiveDate: today(),
    payload,
    result: { animalId, code: row.code, active },
  });

  await commitOperation(db, claim, [
    db.prepare(`
      UPDATE animals SET is_active = ?, deactivated_at = ?, deactivation_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(active ? 1 : 0, active ? null : now, active ? null : reason, now, animalId),
  ], [{
    entityType: 'animal',
    entityId: animalId,
    action: 'update',
    actorUserId,
    barnId: Number(row.barn_id),
    reason,
    previousData: { isActive },
    newData: { isActive: active, deactivationReason: active ? null : reason },
    effectiveDate: today(),
    recordedAt: claim.recordedAt,
  }]);

  return { animal: await getAnimal(db, key, scope), replayed: false };
}
