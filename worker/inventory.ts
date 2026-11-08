import {
  ApiError,
  commitOperation,
  createOperationClaim,
  currentFarmDate,
  isValidDateString,
  lookupExistingOperation,
  normalizeReason,
} from './events';
import { getConfigSnapshot, type ConfigSnapshot } from './config';

/**
 * Inventario individual y colectivo · T08 (INV-01..INV-03)
 *
 * Un único libro de movimientos inmutable sostiene las existencias a fecha de
 * corte y la ocupación. Cada movimiento tiene tipo excluyente, fecha efectiva,
 * galpón, ubicación, lote, etapa, sexo y cantidad. Los traslados internos se
 * registran como dos filas del mismo grupo y se cancelan en el total de la
 * granja. El desglose individual queda preparado para T09: por ahora todo el
 * saldo de un grupo está sin identificar.
 */

export const MOVEMENT_TYPES = [
  'initial', 'purchase', 'birth', 'sale', 'death', 'transfer_in', 'transfer_out', 'adjustment',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const WRITABLE_TYPES: MovementType[] = ['initial', 'purchase', 'birth', 'sale', 'death', 'adjustment'];

export const SEXES = ['macho', 'hembra', 'pendiente'] as const;
export type Sex = (typeof SEXES)[number];

const TYPE_LABEL: Record<MovementType, string> = {
  initial: 'Saldo inicial',
  purchase: 'Compra',
  birth: 'Nacimiento',
  sale: 'Venta / salida',
  death: 'Muerte',
  transfer_in: 'Traslado recibido',
  transfer_out: 'Traslado enviado',
  adjustment: 'Ajuste',
};

const POSITIVE_TYPES: MovementType[] = ['initial', 'purchase', 'birth', 'transfer_in'];
const NEGATIVE_TYPES: MovementType[] = ['sale', 'death', 'transfer_out'];

export interface InventoryMovement {
  id: number;
  movementType: MovementType;
  movementLabel: string;
  effectiveDate: string;
  barnId: number;
  barnCode: string;
  barnName: string;
  locationCode: string | null;
  locationName: string | null;
  lotCode: string | null;
  lotName: string | null;
  stageCode: string;
  stageName: string;
  sex: Sex;
  quantity: number;
  causeCode: string | null;
  notes: string | null;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
}

interface SexCounts {
  macho: number;
  hembra: number;
  pendiente: number;
  total: number;
}

export interface StageSummary {
  stageCode: string;
  stageName: string;
  initial: number;
  entriesExternal: number;
  entries: number;
  exits: number;
  deaths: number;
  available: number;
  entriesBySex: SexCounts;
  exitsBySex: SexCounts;
  deathsBySex: SexCounts;
  mortalityPct: number | null;
  mortalityDenominator: number;
}

export interface InventoryBalance {
  barnId: number;
  barnCode: string;
  barnName: string;
  locationCode: string | null;
  locationName: string | null;
  lotCode: string | null;
  lotName: string | null;
  stageCode: string;
  stageName: string;
  sex: Sex;
  heads: number;
  identified: number;
  unidentified: number;
}

export interface InventorySnapshot {
  asOf: string;
  from: string;
  balances: InventoryBalance[];
  summary: {
    byStage: StageSummary[];
    total: StageSummary;
  };
  movements: InventoryMovement[];
  options: {
    barns: { id: number; code: string; name: string }[];
    stages: { code: string; name: string }[];
    locations: { code: string; name: string; locationType: string }[];
    lots: { code: string; name: string }[];
    sexes: { code: string; name: string }[];
    deathCauses: { code: string; name: string }[];
    saleCauses: { code: string; name: string }[];
  };
}

interface ScopeOptions {
  /** Nombres de galpones autorizados; null o undefined significa toda la granja. */
  allowedBarnNames?: string[] | null;
}

type Row = Record<string, unknown>;

function emptyCounts(): SexCounts {
  return { macho: 0, hembra: 0, pendiente: 0, total: 0 };
}

function addCount(counts: SexCounts, sex: Sex, amount: number): void {
  counts[sex] += amount;
  counts.total += amount;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseDate(value: unknown, field: string): string {
  if (!isValidDateString(value)) {
    throw new ApiError(400, `${field} inválida: use el formato AAAA-MM-DD`);
  }
  return value;
}

function today(): string {
  return currentFarmDate();
}

function movementDelta(type: MovementType, quantity: number): number {
  if (NEGATIVE_TYPES.includes(type)) return -quantity;
  return quantity;
}

function mapMovement(row: Row): InventoryMovement {
  const type = String(row.movement_type) as MovementType;
  return {
    id: Number(row.id),
    movementType: type,
    movementLabel: TYPE_LABEL[type] ?? type,
    effectiveDate: String(row.effective_date),
    barnId: Number(row.barn_id),
    barnCode: String(row.barn_code ?? ''),
    barnName: String(row.barn_name ?? ''),
    locationCode: row.location_code === null || row.location_code === undefined ? null : String(row.location_code),
    locationName: row.location_name === null || row.location_name === undefined ? null : String(row.location_name),
    lotCode: row.lot_code === null || row.lot_code === undefined ? null : String(row.lot_code),
    lotName: row.lot_name === null || row.lot_name === undefined ? null : String(row.lot_name),
    stageCode: String(row.stage_code),
    stageName: String(row.stage_name ?? row.stage_code),
    sex: String(row.sex) as Sex,
    quantity: Number(row.quantity),
    causeCode: row.cause_code === null || row.cause_code === undefined ? null : String(row.cause_code),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    createdByUserId: Number(row.created_by_user_id),
    createdByName: String(row.created_by_name ?? ''),
    createdAt: String(row.created_at),
  };
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

function barnFilterSql(barnIds: number[] | null, column = 'm.barn_id'): { sql: string; params: unknown[] } {
  if (barnIds === null) return { sql: '', params: [] };
  if (barnIds.length === 0) return { sql: ' AND 1 = 0', params: [] };
  return {
    sql: ` AND ${column} IN (${barnIds.map(() => '?').join(', ')})`,
    params: barnIds,
  };
}

function namesFromConfig(config: ConfigSnapshot): {
  stages: Map<string, string>;
  locations: Map<string, string>;
  lots: Map<string, string>;
} {
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

function buildOptions(config: ConfigSnapshot): Omit<InventorySnapshot['options'], 'barns'> {
  return {
    stages: config.stages.map((stage) => ({ code: stage.code, name: stage.name })),
    locations: config.locations.map((location) => ({
      code: location.code,
      name: location.name,
      locationType: location.locationType,
    })),
    lots: config.lots.map((lot) => ({ code: lot.code, name: lot.name })),
    sexes: catalogItems(config, 'sexo'),
    deathCauses: catalogItems(config, 'causa_muerte'),
    saleCauses: catalogItems(config, 'causa_descarte'),
  };
}

async function listMovementsQuery(
  db: D1Database,
  filters: {
    from?: string;
    to?: string;
    barnIds: number[] | null;
    type?: MovementType;
    limit?: number;
  },
  maps: { stages: Map<string, string>; locations: Map<string, string>; lots: Map<string, string> },
): Promise<InventoryMovement[]> {
  const where: string[] = ['m.effective_date <= ?'];
  const params: unknown[] = [filters.to ?? today()];

  if (filters.from) {
    where.push('m.effective_date >= ?');
    params.push(filters.from);
  }
  if (filters.type) {
    where.push('m.movement_type = ?');
    params.push(filters.type);
  }
  const scope = barnFilterSql(filters.barnIds);
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

  const res = await db.prepare(`
    SELECT
      m.*, b.code AS barn_code, b.name AS barn_name, u.name AS created_by_name
    FROM inventory_movements m
    INNER JOIN barns b ON b.id = m.barn_id
    INNER JOIN users u ON u.id = m.created_by_user_id
    WHERE ${where.join(' AND ')}${scope.sql}
    ORDER BY m.effective_date DESC, m.id DESC
    LIMIT ?
  `).bind(...params, ...scope.params, limit).all<Row>();

  return (res.results ?? []).map((row) => {
    const movement = mapMovement(row);
    movement.stageName = maps.stages.get(movement.stageCode) ?? movement.stageCode;
    movement.locationName = movement.locationCode ? maps.locations.get(movement.locationCode) ?? movement.locationCode : null;
    movement.lotName = movement.lotCode ? maps.lots.get(movement.lotCode) ?? movement.lotCode : null;
    return movement;
  });
}

/** Existencias a fecha de corte, resumen de entradas/salidas y movimientos recientes. */
export async function getInventorySnapshot(
  db: D1Database,
  input: { asOf?: string | null; from?: string | null; movementLimit?: number | null },
  scope: ScopeOptions = {},
): Promise<InventorySnapshot> {
  const asOf = input.asOf ? parseDate(input.asOf, 'Fecha de corte') : today();
  if (asOf > today()) throw new ApiError(400, 'La fecha de corte no puede ser futura');

  const from = input.from ? parseDate(input.from, 'Fecha inicial') : '0000-01-01';
  if (from > asOf) throw new ApiError(400, 'La fecha inicial no puede ser posterior a la fecha de corte');

  const [config, barnIds] = await Promise.all([
    getConfigSnapshot(db, asOf),
    resolveBarnScope(db, scope),
  ]);
  const maps = namesFromConfig(config);

  const barnScope = barnFilterSql(barnIds, 'b.id');
  const barnRows = await db.prepare(`
    SELECT b.id, b.code, b.name FROM barns b
    WHERE 1 = 1${barnScope.sql}
    ORDER BY b.code
  `).bind(...barnScope.params).all<{ id: number; code: string; name: string }>();
  const barns = (barnRows.results ?? []).map((barn) => ({
    id: Number(barn.id),
    code: String(barn.code),
    name: String(barn.name),
  }));

  const balanceScope = barnFilterSql(barnIds);
  const balanceRows = await db.prepare(`
    SELECT
      m.barn_id, b.code AS barn_code, b.name AS barn_name,
      m.location_code, m.lot_code, m.stage_code, m.sex,
      SUM(CASE WHEN m.movement_type IN ('sale', 'death', 'transfer_out')
        THEN -m.quantity ELSE m.quantity END) AS heads
    FROM inventory_movements m
    INNER JOIN barns b ON b.id = m.barn_id
    WHERE m.effective_date <= ?${balanceScope.sql}
    GROUP BY m.barn_id, b.code, b.name, m.location_code, m.lot_code, m.stage_code, m.sex
    HAVING heads <> 0
    ORDER BY b.code, m.stage_code, m.lot_code, m.sex
  `).bind(asOf, ...balanceScope.params).all<Row>();

  const balances: InventoryBalance[] = (balanceRows.results ?? []).map((row) => {
    const heads = Number(row.heads);
    return {
      barnId: Number(row.barn_id),
      barnCode: String(row.barn_code),
      barnName: String(row.barn_name),
      locationCode: row.location_code === null || row.location_code === undefined ? null : String(row.location_code),
      locationName: row.location_code === null || row.location_code === undefined
        ? null
        : maps.locations.get(String(row.location_code)) ?? String(row.location_code),
      lotCode: row.lot_code === null || row.lot_code === undefined ? null : String(row.lot_code),
      lotName: row.lot_code === null || row.lot_code === undefined
        ? null
        : maps.lots.get(String(row.lot_code)) ?? String(row.lot_code),
      stageCode: String(row.stage_code),
      stageName: maps.stages.get(String(row.stage_code)) ?? String(row.stage_code),
      sex: String(row.sex) as Sex,
      heads,
      identified: 0,
      unidentified: heads,
    };
  });

  const summaryScope = barnFilterSql(barnIds);
  const summaryRows = await db.prepare(`
    SELECT
      m.stage_code, m.movement_type, m.sex,
      CASE WHEN m.quantity > 0 THEN 1 ELSE 0 END AS positive,
      SUM(m.quantity) AS total
    FROM inventory_movements m
    WHERE m.effective_date >= ? AND m.effective_date <= ?${summaryScope.sql}
    GROUP BY m.stage_code, m.movement_type, m.sex,
      CASE WHEN m.quantity > 0 THEN 1 ELSE 0 END
  `).bind(from, asOf, ...summaryScope.params).all<Row>();

  const stageMap = new Map<string, StageSummary>();
  const ensureStage = (code: string): StageSummary => {
    const existing = stageMap.get(code);
    if (existing) return existing;
    const created: StageSummary = {
      stageCode: code,
      stageName: maps.stages.get(code) ?? code,
      initial: 0,
      entriesExternal: 0,
      entries: 0,
      exits: 0,
      deaths: 0,
      available: 0,
      entriesBySex: emptyCounts(),
      exitsBySex: emptyCounts(),
      deathsBySex: emptyCounts(),
      mortalityPct: null,
      mortalityDenominator: 0,
    };
    stageMap.set(code, created);
    return created;
  };

  // Las etapas activas sin movimientos también aparecen en el resumen.
  for (const stage of config.stages) ensureStage(stage.code);

  for (const row of summaryRows.results ?? []) {
    const type = String(row.movement_type) as MovementType;
    const sex = String(row.sex) as Sex;
    const positive = Number(row.positive) === 1;
    const total = Number(row.total);
    const stage = ensureStage(String(row.stage_code));

    if (POSITIVE_TYPES.includes(type) || (type === 'adjustment' && positive)) {
      const amount = Math.abs(total);
      stage.entries += amount;
      addCount(stage.entriesBySex, sex, amount);
      if (type === 'initial') stage.initial += amount;
      else stage.entriesExternal += amount;
      continue;
    }

    const amount = Math.abs(total);
    stage.exits += amount;
    addCount(stage.exitsBySex, sex, amount);
    if (type === 'death') {
      stage.deaths += amount;
      addCount(stage.deathsBySex, sex, amount);
    }
  }

  for (const stage of stageMap.values()) {
    stage.available = stage.entries - stage.exits;
    stage.mortalityDenominator = stage.entries;
    stage.mortalityPct = stage.entries > 0 ? round1((stage.deaths / stage.entries) * 100) : null;
  }

  const stages = [...stageMap.values()].sort((a, b) => a.stageName.localeCompare(b.stageName));
  const total = stages.reduce<StageSummary>((acc, stage) => {
    acc.initial += stage.initial;
    acc.entriesExternal += stage.entriesExternal;
    acc.entries += stage.entries;
    acc.exits += stage.exits;
    acc.deaths += stage.deaths;
    acc.available += stage.available;
    for (const sex of SEXES) {
      acc.entriesBySex[sex] += stage.entriesBySex[sex];
      acc.exitsBySex[sex] += stage.exitsBySex[sex];
      acc.deathsBySex[sex] += stage.deathsBySex[sex];
    }
    acc.entriesBySex.total += stage.entriesBySex.total;
    acc.exitsBySex.total += stage.exitsBySex.total;
    acc.deathsBySex.total += stage.deathsBySex.total;
    return acc;
  }, {
    stageCode: 'total',
    stageName: 'Total de la granja',
    initial: 0,
    entriesExternal: 0,
    entries: 0,
    exits: 0,
    deaths: 0,
    available: 0,
    entriesBySex: emptyCounts(),
    exitsBySex: emptyCounts(),
    deathsBySex: emptyCounts(),
    mortalityPct: null,
    mortalityDenominator: 0,
  });
  total.mortalityDenominator = total.entries;
  total.mortalityPct = total.entries > 0 ? round1((total.deaths / total.entries) * 100) : null;

  const movements = await listMovementsQuery(db, {
    to: asOf,
    barnIds,
    limit: input.movementLimit ?? 50,
  }, maps);

  return {
    asOf,
    from,
    balances,
    summary: { byStage: stages, total },
    movements,
    options: { ...buildOptions(config), barns },
  };
}

/** Movimientos con filtros para consulta y auditoría. */
export async function listInventoryMovements(
  db: D1Database,
  filters: { from?: string | null; to?: string | null; type?: string | null; limit?: number | null },
  scope: ScopeOptions = {},
): Promise<InventoryMovement[]> {
  const to = filters.to ? parseDate(filters.to, 'Fecha final') : today();
  const from = filters.from ? parseDate(filters.from, 'Fecha inicial') : undefined;
  if (from && from > to) throw new ApiError(400, 'La fecha inicial no puede ser posterior a la fecha final');

  let type: MovementType | undefined;
  if (filters.type) {
    if (!MOVEMENT_TYPES.includes(filters.type as MovementType)) throw new ApiError(400, 'Tipo de movimiento inválido');
    type = filters.type as MovementType;
  }

  const [config, barnIds] = await Promise.all([
    getConfigSnapshot(db, to),
    resolveBarnScope(db, scope),
  ]);

  return listMovementsQuery(db, {
    from,
    to,
    barnIds,
    type,
    limit: filters.limit ?? 100,
  }, namesFromConfig(config));
}

export interface RegisterMovementInput {
  movementType?: string;
  effectiveDate?: string;
  barnId?: number | string;
  locationCode?: string | null;
  lotCode?: string | null;
  stageCode?: string;
  sex?: string;
  quantity?: number | string;
  causeCode?: string | null;
  notes?: string | null;
  operationKey?: string;
  reason?: string;
}

function requireText(value: unknown, field: string, maxLength = 120): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (parsed.length === 0) throw new ApiError(400, `${field} es obligatorio`);
  if (parsed.length > maxLength) throw new ApiError(400, `${field} no puede superar ${maxLength} caracteres`);
  return parsed;
}

function optionalCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed.length === 0 ? null : parsed;
}

/** Registra un movimiento inmutable y verifica que no deje saldos negativos. */
export async function registerMovement(
  db: D1Database,
  actorUserId: number,
  input: RegisterMovementInput,
  scope: ScopeOptions = {},
): Promise<{ movement: InventoryMovement; replayed: boolean }> {
  const type = String(input.movementType ?? '') as MovementType;
  if (!MOVEMENT_TYPES.includes(type)) throw new ApiError(400, 'Tipo de movimiento inválido');
  if (!WRITABLE_TYPES.includes(type)) {
    throw new ApiError(400, 'Los traslados internos se registran desde el módulo de traslados (T10)');
  }

  const effectiveDate = parseDate(input.effectiveDate, 'Fecha del movimiento');
  if (effectiveDate > today()) throw new ApiError(400, 'La fecha del movimiento no puede ser futura');

  const barnId = Number(input.barnId);
  if (!Number.isInteger(barnId) || barnId <= 0) throw new ApiError(400, 'Galpón inválido');
  const barn = await db.prepare('SELECT id, code, name FROM barns WHERE id = ?').bind(barnId)
    .first<{ id: number; code: string; name: string }>();
  if (!barn) throw new ApiError(404, 'El galpón indicado no existe');
  if (scope.allowedBarnNames && !scope.allowedBarnNames.includes(barn.name)) {
    throw new ApiError(403, 'Acceso denegado: no tiene asignado el galpón indicado');
  }

  const stageCode = requireText(input.stageCode, 'Etapa', 60);
  const sex = String(input.sex ?? '') as Sex;
  if (!SEXES.includes(sex)) throw new ApiError(400, 'Sexo inválido: use macho, hembra o pendiente');

  const quantityRaw = typeof input.quantity === 'string' ? Number(input.quantity) : input.quantity;
  if (!Number.isInteger(quantityRaw) || Number(quantityRaw) === 0) {
    throw new ApiError(400, 'La cantidad debe ser un número entero distinto de cero');
  }
  const quantity = Number(quantityRaw);
  if (type !== 'adjustment' && quantity < 0) {
    throw new ApiError(400, 'La cantidad debe ser positiva; use un ajuste para corregir hacia abajo');
  }

  const locationCode = optionalCode(input.locationCode);
  const lotCode = optionalCode(input.lotCode);
  const rawCause = optionalCode(input.causeCode);
  const notes = input.notes === null || input.notes === undefined || String(input.notes).trim() === ''
    ? null
    : requireText(input.notes, 'Notas', 300);

  const config = await getConfigSnapshot(db, effectiveDate);
  if (!config.stages.some((stage) => stage.code === stageCode)) {
    throw new ApiError(400, 'La etapa no está vigente en la fecha indicada');
  }
  if (locationCode && !config.locations.some((location) => location.code === locationCode)) {
    throw new ApiError(400, 'La ubicación no está vigente en la fecha indicada');
  }
  if (lotCode && !config.lots.some((lot) => lot.code === lotCode)) {
    throw new ApiError(400, 'El lote no está vigente en la fecha indicada');
  }

  let causeCode: string | null = null;
  if (type === 'death') {
    causeCode = requireText(rawCause, 'Causa de muerte', 60);
    if (!catalogItems(config, 'causa_muerte').some((item) => item.code === causeCode)) {
      throw new ApiError(400, 'La causa de muerte no está vigente en la fecha indicada');
    }
  } else if (type === 'sale') {
    causeCode = rawCause;
    if (causeCode && !catalogItems(config, 'causa_descarte').some((item) => item.code === causeCode)) {
      throw new ApiError(400, 'La causa de salida no está vigente en la fecha indicada');
    }
  } else if (rawCause) {
    throw new ApiError(400, 'Solo las muertes y salidas registran causa');
  }

  const reason = normalizeReason(input.reason, { required: true, fallback: 'Movimiento de inventario' });

  const payload = {
    movementType: type,
    effectiveDate,
    barnId,
    locationCode,
    lotCode,
    stageCode,
    sex,
    quantity,
    causeCode,
    notes,
  };

  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { movement: replay.result as InventoryMovement, replayed: true };

  // Comprobación cronológica del grupo: también detecta correcciones retroactivas
  // que dejarían un saldo negativo en fechas posteriores.
  const bucketRows = await db.prepare(`
    SELECT id, effective_date, movement_type, quantity
    FROM inventory_movements
    WHERE barn_id = ? AND location_code IS ? AND lot_code IS ? AND stage_code = ? AND sex = ?
    ORDER BY effective_date ASC, id ASC
  `).bind(barnId, locationCode, lotCode, stageCode, sex).all<Row>();

  const timeline = (bucketRows.results ?? []).map((row) => ({
    date: String(row.effective_date),
    delta: movementDelta(String(row.movement_type) as MovementType, Number(row.quantity)),
  }));
  timeline.push({ date: effectiveDate, delta: movementDelta(type, quantity) });
  timeline.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = 0;
  for (const entry of timeline) {
    running += entry.delta;
    if (running < 0) {
      throw new ApiError(
        409,
        `Saldo insuficiente en ${stageCode}/${sex}: el movimiento dejaría ${running} cabezas el ${entry.date}`,
      );
    }
  }

  const idRow = await db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM inventory_movements')
    .first<{ next_id: number }>();
  const id = Number(idRow?.next_id ?? 1);
  const createdAt = new Date().toISOString();

  const movement: InventoryMovement = {
    id,
    movementType: type,
    movementLabel: TYPE_LABEL[type],
    effectiveDate,
    barnId,
    barnCode: barn.code,
    barnName: barn.name,
    locationCode,
    locationName: locationCode ? config.locations.find((location) => location.code === locationCode)?.name ?? locationCode : null,
    lotCode,
    lotName: lotCode ? config.lots.find((lot) => lot.code === lotCode)?.name ?? lotCode : null,
    stageCode,
    stageName: config.stages.find((stage) => stage.code === stageCode)?.name ?? stageCode,
    sex,
    quantity,
    causeCode,
    notes,
    createdByUserId: actorUserId,
    createdByName: '',
    createdAt,
  };

  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: `inventory.${type}`,
    authorUserId: actorUserId,
    entityType: 'inventory_movement',
    entityId: id,
    barnId,
    effectiveDate,
    payload,
    result: movement,
  });

  const result = await commitOperation(db, claim, [
    db.prepare(`
      INSERT INTO inventory_movements (
        id, operation_log_id, movement_type, effective_date, barn_id, location_code, lot_code,
        stage_code, sex, quantity, cause_code, transfer_group_id, notes, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).bind(
      id, claim.id, type, effectiveDate, barnId, locationCode, lotCode,
      stageCode, sex, quantity, causeCode, notes, actorUserId, createdAt,
    ),
  ], [{
    entityType: 'inventory_movement',
    entityId: id,
    action: 'create',
    actorUserId,
    barnId,
    reason,
    previousData: null,
    newData: movement,
    effectiveDate,
    recordedAt: claim.recordedAt,
  }]);

  return {
    movement: result.replayed ? (result.result as InventoryMovement) : movement,
    replayed: result.replayed,
  };
}
