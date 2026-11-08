import {
  ApiError,
  commitOperation,
  createOperationClaim,
  currentFarmDate,
  isValidDateString,
  lookupExistingOperation,
  normalizeReason,
} from './events';

/**
 * Configuración versionada de la granja (T07 · CFG-01..CFG-05).
 * Cada cambio se registra como una versión con fecha de vigencia explícita,
 * se audita con la convención de T06 y conserva los valores anteriores.
 */

export const CATALOG_LABELS: Record<string, string> = {
  sexo: 'Sexo',
  estado_animal: 'Estado del animal',
  etapa: 'Etapa productiva',
  aptitud: 'Aptitud',
  ubicacion: 'Tipo de ubicación',
  lote: 'Lote de manejo',
  causa_descarte: 'Causa de descarte',
  causa_muerte: 'Causa de muerte',
  tipo_servicio: 'Tipo de servicio',
  estado_fisiologico: 'Estado fisiológico',
  alimento: 'Alimento',
};

export const SETTING_KEYS = ['farm_name', 'timezone', 'currency', 'weight_unit'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

const LOCATION_TYPES = ['galpon', 'corral', 'area', 'otro'] as const;
const CODE_PATTERN = /^[a-z0-9_]{2,40}$/;

export interface CatalogItem {
  id: number;
  catalogKey: string;
  code: string;
  name: string;
  sortOrder: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

export interface StageItem {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  initialWeightKg: number | null;
  finalWeightKg: number | null;
  initialAgeDays: number | null;
  finalAgeDays: number | null;
  durationDays: number | null;
  rationName: string | null;
  dailyFeedKg: number | null;
  monthlyFeedKg: number | null;
  totalFeedKg: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

export interface SettingItem {
  id: number;
  key: string;
  value: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface LocationItem {
  id: number;
  code: string;
  name: string;
  locationType: string;
  parentCode: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

export interface LotItem {
  id: number;
  code: string;
  name: string;
  stageCode: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

export interface ConfigSnapshot {
  asOf: string;
  settings: SettingItem[];
  catalogs: { key: string; label: string; items: CatalogItem[] }[];
  stages: StageItem[];
  locations: LocationItem[];
  lots: LotItem[];
}

type Row = Record<string, unknown>;

function text(value: unknown, field: string, maxLength = 120): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (parsed.length === 0) throw new ApiError(400, `${field} es obligatorio`);
  if (parsed.length > maxLength) throw new ApiError(400, `${field} no puede superar ${maxLength} caracteres`);
  return parsed;
}

function normalizeCode(value: unknown, field = 'Código'): string {
  const code = text(value, field, 40).toLowerCase();
  if (!CODE_PATTERN.test(code)) {
    throw new ApiError(400, `${field} inválido: use entre 2 y 40 caracteres en minúscula, números o guion bajo`);
  }
  return code;
}

function effectiveDate(value: unknown): string {
  if (!isValidDateString(value)) {
    throw new ApiError(400, 'Fecha efectiva inválida: use el formato AAAA-MM-DD');
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ApiError(400, `${field} debe ser un número mayor o igual a cero`);
  return parsed;
}

function optionalInteger(value: unknown, field: string): number | null {
  const parsed = optionalNumber(value, field);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) throw new ApiError(400, `${field} debe ser un número entero`);
  return parsed;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mapCatalog(row: Row): CatalogItem {
  return {
    id: Number(row.id),
    catalogKey: String(row.catalog_key),
    code: String(row.item_code),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null || row.effective_to === undefined ? null : String(row.effective_to),
    status: row.status === 'retired' ? 'retired' : 'active',
  };
}

function mapStage(row: Row): StageItem {
  const daily = row.daily_feed_kg === null || row.daily_feed_kg === undefined ? null : Number(row.daily_feed_kg);
  const duration = row.duration_days === null || row.duration_days === undefined ? null : Number(row.duration_days);
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    initialWeightKg: row.initial_weight_kg === null || row.initial_weight_kg === undefined ? null : Number(row.initial_weight_kg),
    finalWeightKg: row.final_weight_kg === null || row.final_weight_kg === undefined ? null : Number(row.final_weight_kg),
    initialAgeDays: row.initial_age_days === null || row.initial_age_days === undefined ? null : Number(row.initial_age_days),
    finalAgeDays: row.final_age_days === null || row.final_age_days === undefined ? null : Number(row.final_age_days),
    durationDays: duration,
    rationName: row.ration_name === null || row.ration_name === undefined ? null : String(row.ration_name),
    dailyFeedKg: daily,
    monthlyFeedKg: daily === null ? null : round3(daily * 30),
    totalFeedKg: daily === null || duration === null ? null : round3(daily * duration),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null || row.effective_to === undefined ? null : String(row.effective_to),
    status: row.status === 'retired' ? 'retired' : 'active',
  };
}

function mapSetting(row: Row): SettingItem {
  return {
    id: Number(row.id),
    key: String(row.setting_key),
    value: String(row.value),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null || row.effective_to === undefined ? null : String(row.effective_to),
  };
}

function mapLocation(row: Row): LocationItem {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    locationType: String(row.location_type),
    parentCode: row.parent_code === null || row.parent_code === undefined ? null : String(row.parent_code),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null || row.effective_to === undefined ? null : String(row.effective_to),
    status: row.status === 'retired' ? 'retired' : 'active',
  };
}

function mapLot(row: Row): LotItem {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    stageCode: row.stage_code === null || row.stage_code === undefined ? null : String(row.stage_code),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null || row.effective_to === undefined ? null : String(row.effective_to),
    status: row.status === 'retired' ? 'retired' : 'active',
  };
}

async function queryRows(db: D1Database, sql: string, params: unknown[]): Promise<Row[]> {
  const result = await db.prepare(sql).bind(...params).all<Row>();
  return result.results ?? [];
}

/** Consulta el estado de la configuración para una fecha efectiva. */
export async function getConfigSnapshot(db: D1Database, asOfInput?: string | null): Promise<ConfigSnapshot> {
  const asOf = asOfInput ? effectiveDate(asOfInput) : currentFarmDate();

  const [settingRows, catalogRows, stageRows, locationRows, lotRows] = await Promise.all([
    queryRows(db, `
      SELECT * FROM farm_setting_versions
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
      ORDER BY setting_key, effective_from DESC
    `, [asOf, asOf]),
    queryRows(db, `
      SELECT * FROM catalog_versions
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
      ORDER BY catalog_key, sort_order, name
    `, [asOf, asOf]),
    queryRows(db, `
      SELECT * FROM stage_versions
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
      ORDER BY sort_order, name
    `, [asOf, asOf]),
    queryRows(db, `
      SELECT * FROM location_versions
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
      ORDER BY location_type, name
    `, [asOf, asOf]),
    queryRows(db, `
      SELECT * FROM lot_versions
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
      ORDER BY name
    `, [asOf, asOf]),
  ]);

  const settingsByKey = new Map<string, SettingItem>();
  for (const row of settingRows) {
    const item = mapSetting(row);
    if (!settingsByKey.has(item.key)) settingsByKey.set(item.key, item);
  }

  const catalogs = Object.entries(CATALOG_LABELS).map(([key, label]) => ({
    key,
    label,
    items: catalogRows.map(mapCatalog).filter((item) => item.catalogKey === key),
  }));

  return {
    asOf,
    settings: SETTING_KEYS.map((key) => settingsByKey.get(key)).filter((value): value is SettingItem => Boolean(value)),
    catalogs,
    stages: stageRows.map(mapStage),
    locations: locationRows.map(mapLocation),
    lots: lotRows.map(mapLot),
  };
}

export type ConfigHistoryEntity = 'catalog' | 'stage' | 'setting' | 'location' | 'lot';

export async function getConfigHistory(
  db: D1Database,
  entity: ConfigHistoryEntity,
  code: string,
  catalogKey?: string,
): Promise<unknown[]> {
  const normalizedCode = text(code, 'Código', 60);

  if (entity === 'catalog') {
    const key = text(catalogKey, 'Catálogo', 60);
    const rows = await queryRows(db, `
      SELECT * FROM catalog_versions WHERE catalog_key = ? AND item_code = ? ORDER BY effective_from DESC
    `, [key, normalizedCode]);
    return rows.map(mapCatalog);
  }
  if (entity === 'stage') {
    const rows = await queryRows(db, 'SELECT * FROM stage_versions WHERE code = ? ORDER BY effective_from DESC', [normalizedCode]);
    return rows.map(mapStage);
  }
  if (entity === 'setting') {
    const rows = await queryRows(db, 'SELECT * FROM farm_setting_versions WHERE setting_key = ? ORDER BY effective_from DESC', [normalizedCode]);
    return rows.map(mapSetting);
  }
  if (entity === 'location') {
    const rows = await queryRows(db, 'SELECT * FROM location_versions WHERE code = ? ORDER BY effective_from DESC', [normalizedCode]);
    return rows.map(mapLocation);
  }
  const rows = await queryRows(db, 'SELECT * FROM lot_versions WHERE code = ? ORDER BY effective_from DESC', [normalizedCode]);
  return rows.map(mapLot);
}

interface OpenVersionRow {
  id: number;
  effective_from: string;
}

async function findOpenVersion(
  db: D1Database,
  table: string,
  codeColumn: string,
  code: string,
  extraColumn?: string,
  extraValue?: string,
): Promise<OpenVersionRow | null> {
  const extraSql = extraColumn ? ` AND ${extraColumn} = ?` : '';
  const params: unknown[] = extraColumn ? [code, extraValue] : [code];
  const sql = `
    SELECT id, effective_from FROM ${table}
    WHERE ${codeColumn} = ?${extraSql} AND effective_to IS NULL
    ORDER BY effective_from DESC LIMIT 1
  `;
  const row = await db.prepare(sql).bind(...params).first<OpenVersionRow>();
  return row ?? null;
}

async function nextId(db: D1Database, table: string): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${table}`).first<{ next_id: number }>();
  return Number(row?.next_id ?? 1);
}

function assertVersionDate(open: OpenVersionRow | null, date: string): void {
  if (open && String(open.effective_from) >= date) {
    throw new ApiError(400, 'La fecha efectiva debe ser posterior al inicio de la versión vigente');
  }
}

interface SaveCatalogInput {
  catalogKey?: string;
  code?: string;
  name?: string;
  sortOrder?: number;
  effectiveFrom?: string;
  operationKey?: string;
  reason?: string;
}

export async function saveCatalogItem(db: D1Database, actorUserId: number, input: SaveCatalogInput): Promise<{ item: CatalogItem; replayed: boolean }> {
  const catalogKey = text(input.catalogKey, 'Catálogo', 60);
  if (!CATALOG_LABELS[catalogKey]) throw new ApiError(400, 'Catálogo no reconocido');
  const code = normalizeCode(input.code);
  const name = text(input.name, 'Nombre');
  const sortOrder = optionalInteger(input.sortOrder, 'Orden') ?? 0;
  const from = effectiveDate(input.effectiveFrom);

  const payload = { catalogKey, code, name, sortOrder, effectiveFrom: from };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { item: replay.result as CatalogItem, replayed: true };

  const open = await findOpenVersion(db, 'catalog_versions', 'item_code', code, 'catalog_key', catalogKey);
  assertVersionDate(open, from);

  const duplicate = await db.prepare(`
    SELECT id FROM catalog_versions WHERE catalog_key = ? AND item_code = ? AND effective_from = ?
  `).bind(catalogKey, code, from).first();
  if (duplicate) throw new ApiError(409, 'Ya existe una versión de este ítem para la fecha indicada');

  const id = await nextId(db, 'catalog_versions');
  const item: CatalogItem = {
    id, catalogKey, code, name, sortOrder,
    effectiveFrom: from, effectiveTo: null, status: 'active',
  };
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'config.catalog.save',
    authorUserId: actorUserId,
    entityType: 'catalog_item',
    entityId: id,
    effectiveDate: from,
    payload,
    result: item,
  });

  const statements: D1PreparedStatement[] = [];
  if (open) {
    statements.push(db.prepare('UPDATE catalog_versions SET effective_to = ? WHERE id = ?').bind(from, open.id));
  }
  statements.push(db.prepare(`
    INSERT INTO catalog_versions
      (id, catalog_key, item_code, name, sort_order, effective_from, effective_to, status, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?)
  `).bind(id, catalogKey, code, name, sortOrder, from, actorUserId, claim.recordedAt));

  const result = await commitOperation(db, claim, statements, [{
    entityType: 'catalog_item',
    entityId: id,
    action: open ? 'update' : 'create',
    actorUserId,
    reason: normalizeReason(input.reason, { fallback: 'Configuración de catálogo' }),
    previousData: open ? { id: open.id, effectiveFrom: open.effective_from } : null,
    newData: item,
    effectiveDate: from,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? (result.result as CatalogItem) : item, replayed: result.replayed };
}

interface SaveStageInput {
  code?: string;
  name?: string;
  sortOrder?: number;
  initialWeightKg?: number | null;
  finalWeightKg?: number | null;
  initialAgeDays?: number | null;
  finalAgeDays?: number | null;
  durationDays?: number | null;
  rationName?: string | null;
  dailyFeedKg?: number | null;
  effectiveFrom?: string;
  operationKey?: string;
  reason?: string;
}

export async function saveStage(db: D1Database, actorUserId: number, input: SaveStageInput): Promise<{ item: StageItem; replayed: boolean }> {
  const code = normalizeCode(input.code);
  const name = text(input.name, 'Nombre de la etapa');
  const sortOrder = optionalInteger(input.sortOrder, 'Orden') ?? 0;
  const initialWeightKg = optionalNumber(input.initialWeightKg, 'Peso inicial');
  const finalWeightKg = optionalNumber(input.finalWeightKg, 'Peso final');
  const initialAgeDays = optionalInteger(input.initialAgeDays, 'Edad inicial');
  const finalAgeDays = optionalInteger(input.finalAgeDays, 'Edad final');
  const durationDays = optionalInteger(input.durationDays, 'Duración');
  const dailyFeedKg = optionalNumber(input.dailyFeedKg, 'Consumo diario');
  const rationName = input.rationName === null || input.rationName === undefined || String(input.rationName).trim() === ''
    ? null
    : text(input.rationName, 'Ración');
  const from = effectiveDate(input.effectiveFrom);

  if (initialWeightKg !== null && finalWeightKg !== null && finalWeightKg < initialWeightKg) {
    throw new ApiError(400, 'El peso final no puede ser menor que el peso inicial');
  }
  if (initialAgeDays !== null && finalAgeDays !== null && finalAgeDays < initialAgeDays) {
    throw new ApiError(400, 'La edad final no puede ser menor que la edad inicial');
  }
  if (durationDays !== null && durationDays === 0) {
    throw new ApiError(400, 'La duración debe ser mayor que cero o quedar abierta');
  }

  const payload = {
    code, name, sortOrder, initialWeightKg, finalWeightKg, initialAgeDays, finalAgeDays,
    durationDays, rationName, dailyFeedKg, effectiveFrom: from,
  };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { item: replay.result as StageItem, replayed: true };

  const open = await findOpenVersion(db, 'stage_versions', 'code', code);
  assertVersionDate(open, from);

  const duplicate = await db.prepare('SELECT id FROM stage_versions WHERE code = ? AND effective_from = ?').bind(code, from).first();
  if (duplicate) throw new ApiError(409, 'Ya existe una versión de esta etapa para la fecha indicada');

  const id = await nextId(db, 'stage_versions');
  const item = mapStage({
    id, code, name, sort_order: sortOrder,
    initial_weight_kg: initialWeightKg, final_weight_kg: finalWeightKg,
    initial_age_days: initialAgeDays, final_age_days: finalAgeDays,
    duration_days: durationDays, ration_name: rationName, daily_feed_kg: dailyFeedKg,
    effective_from: from, effective_to: null, status: 'active',
  });
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'config.stage.save',
    authorUserId: actorUserId,
    entityType: 'stage',
    entityId: id,
    effectiveDate: from,
    payload,
    result: item,
  });

  const statements: D1PreparedStatement[] = [];
  if (open) statements.push(db.prepare('UPDATE stage_versions SET effective_to = ? WHERE id = ?').bind(from, open.id));
  statements.push(db.prepare(`
    INSERT INTO stage_versions
      (id, code, name, sort_order, initial_weight_kg, final_weight_kg, initial_age_days, final_age_days,
       duration_days, ration_name, daily_feed_kg, effective_from, effective_to, status, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?)
  `).bind(
    id, code, name, sortOrder, initialWeightKg, finalWeightKg, initialAgeDays, finalAgeDays,
    durationDays, rationName, dailyFeedKg, from, actorUserId, claim.recordedAt,
  ));

  const result = await commitOperation(db, claim, statements, [{
    entityType: 'stage',
    entityId: id,
    action: open ? 'update' : 'create',
    actorUserId,
    reason: normalizeReason(input.reason, { fallback: 'Configuración de etapa productiva' }),
    previousData: open ? { id: open.id, effectiveFrom: open.effective_from } : null,
    newData: item,
    effectiveDate: from,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? (result.result as StageItem) : item, replayed: result.replayed };
}

interface SaveSettingInput {
  key?: string;
  value?: string;
  effectiveFrom?: string;
  operationKey?: string;
  reason?: string;
}

export async function saveSetting(db: D1Database, actorUserId: number, input: SaveSettingInput): Promise<{ item: SettingItem; replayed: boolean }> {
  const key = text(input.key, 'Parámetro', 60);
  if (!(SETTING_KEYS as readonly string[]).includes(key)) throw new ApiError(400, 'Parámetro no reconocido');
  const value = text(input.value, 'Valor', 200);
  const from = effectiveDate(input.effectiveFrom);

  const payload = { key, value, effectiveFrom: from };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { item: replay.result as SettingItem, replayed: true };

  const open = await findOpenVersion(db, 'farm_setting_versions', 'setting_key', key);
  assertVersionDate(open, from);

  const id = await nextId(db, 'farm_setting_versions');
  const item: SettingItem = { id, key, value, effectiveFrom: from, effectiveTo: null };
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'config.setting.save',
    authorUserId: actorUserId,
    entityType: 'farm_setting',
    entityId: id,
    effectiveDate: from,
    payload,
    result: item,
  });

  const statements: D1PreparedStatement[] = [];
  if (open) statements.push(db.prepare('UPDATE farm_setting_versions SET effective_to = ? WHERE id = ?').bind(from, open.id));
  statements.push(db.prepare(`
    INSERT INTO farm_setting_versions (id, setting_key, value, effective_from, effective_to, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
  `).bind(id, key, value, from, actorUserId, claim.recordedAt));

  const result = await commitOperation(db, claim, statements, [{
    entityType: 'farm_setting',
    entityId: id,
    action: open ? 'update' : 'create',
    actorUserId,
    reason: normalizeReason(input.reason, { fallback: 'Configuración de parámetro de granja' }),
    previousData: open ? { id: open.id, effectiveFrom: open.effective_from } : null,
    newData: item,
    effectiveDate: from,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? (result.result as SettingItem) : item, replayed: result.replayed };
}

interface SaveLocationInput {
  code?: string;
  name?: string;
  locationType?: string;
  parentCode?: string | null;
  effectiveFrom?: string;
  operationKey?: string;
  reason?: string;
}

export async function saveLocation(db: D1Database, actorUserId: number, input: SaveLocationInput): Promise<{ item: LocationItem; replayed: boolean }> {
  const code = normalizeCode(input.code);
  const name = text(input.name, 'Nombre de la ubicación');
  const locationType = text(input.locationType, 'Tipo de ubicación', 20);
  if (!(LOCATION_TYPES as readonly string[]).includes(locationType)) throw new ApiError(400, 'Tipo de ubicación inválido');
  const parentCode = input.parentCode === null || input.parentCode === undefined || String(input.parentCode).trim() === ''
    ? null
    : normalizeCode(input.parentCode, 'Ubicación padre');
  const from = effectiveDate(input.effectiveFrom);

  if (parentCode === code) throw new ApiError(400, 'Una ubicación no puede ser su propia ubicación padre');

  const payload = { code, name, locationType, parentCode, effectiveFrom: from };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { item: replay.result as LocationItem, replayed: true };

  const open = await findOpenVersion(db, 'location_versions', 'code', code);
  assertVersionDate(open, from);

  const id = await nextId(db, 'location_versions');
  const item: LocationItem = { id, code, name, locationType, parentCode, effectiveFrom: from, effectiveTo: null, status: 'active' };
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'config.location.save',
    authorUserId: actorUserId,
    entityType: 'farm_location',
    entityId: id,
    effectiveDate: from,
    payload,
    result: item,
  });

  const statements: D1PreparedStatement[] = [];
  if (open) statements.push(db.prepare('UPDATE location_versions SET effective_to = ? WHERE id = ?').bind(from, open.id));
  statements.push(db.prepare(`
    INSERT INTO location_versions
      (id, code, name, location_type, parent_code, effective_from, effective_to, status, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?)
  `).bind(id, code, name, locationType, parentCode, from, actorUserId, claim.recordedAt));

  const result = await commitOperation(db, claim, statements, [{
    entityType: 'farm_location',
    entityId: id,
    action: open ? 'update' : 'create',
    actorUserId,
    reason: normalizeReason(input.reason, { fallback: 'Configuración de ubicación física' }),
    previousData: open ? { id: open.id, effectiveFrom: open.effective_from } : null,
    newData: item,
    effectiveDate: from,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? (result.result as LocationItem) : item, replayed: result.replayed };
}

interface SaveLotInput {
  code?: string;
  name?: string;
  stageCode?: string | null;
  effectiveFrom?: string;
  operationKey?: string;
  reason?: string;
}

export async function saveLot(db: D1Database, actorUserId: number, input: SaveLotInput): Promise<{ item: LotItem; replayed: boolean }> {
  const code = normalizeCode(input.code);
  const name = text(input.name, 'Nombre del lote');
  const stageCode = input.stageCode === null || input.stageCode === undefined || String(input.stageCode).trim() === ''
    ? null
    : normalizeCode(input.stageCode, 'Etapa del lote');
  const from = effectiveDate(input.effectiveFrom);

  const payload = { code, name, stageCode, effectiveFrom: from };
  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { item: replay.result as LotItem, replayed: true };

  const open = await findOpenVersion(db, 'lot_versions', 'code', code);
  assertVersionDate(open, from);

  const id = await nextId(db, 'lot_versions');
  const item: LotItem = { id, code, name, stageCode, effectiveFrom: from, effectiveTo: null, status: 'active' };
  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'config.lot.save',
    authorUserId: actorUserId,
    entityType: 'handling_lot',
    entityId: id,
    effectiveDate: from,
    payload,
    result: item,
  });

  const statements: D1PreparedStatement[] = [];
  if (open) statements.push(db.prepare('UPDATE lot_versions SET effective_to = ? WHERE id = ?').bind(from, open.id));
  statements.push(db.prepare(`
    INSERT INTO lot_versions
      (id, code, name, stage_code, effective_from, effective_to, status, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, 'active', ?, ?)
  `).bind(id, code, name, stageCode, from, actorUserId, claim.recordedAt));

  const result = await commitOperation(db, claim, statements, [{
    entityType: 'handling_lot',
    entityId: id,
    action: open ? 'update' : 'create',
    actorUserId,
    reason: normalizeReason(input.reason, { fallback: 'Configuración de lote de manejo' }),
    previousData: open ? { id: open.id, effectiveFrom: open.effective_from } : null,
    newData: item,
    effectiveDate: from,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? (result.result as LotItem) : item, replayed: result.replayed };
}

export interface RetireInput {
  effectiveFrom?: string;
  operationKey?: string;
  reason?: string;
}

/** Retira una versión vigente de las opciones nuevas sin borrar su historial. */
export async function retireCatalogItem(
  db: D1Database,
  actorUserId: number,
  catalogKeyInput: string,
  codeInput: string,
  input: RetireInput,
): Promise<{ item: CatalogItem; replayed: boolean }> {
  const catalogKey = text(catalogKeyInput, 'Catálogo', 60);
  if (!CATALOG_LABELS[catalogKey]) throw new ApiError(400, 'Catálogo no reconocido');
  const code = normalizeCode(codeInput);
  const from = effectiveDate(input.effectiveFrom);
  const payload = { catalogKey, code, effectiveFrom: from, retired: true };

  const replay = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (replay) return { item: replay.result as CatalogItem, replayed: true };

  const open = await findOpenVersion(db, 'catalog_versions', 'item_code', code, 'catalog_key', catalogKey);
  if (!open) throw new ApiError(404, 'No existe una versión vigente de este ítem');
  assertVersionDate(open, from);

  const row = await db.prepare('SELECT * FROM catalog_versions WHERE id = ?').bind(open.id).first<Row>();
  if (!row) throw new ApiError(404, 'No existe una versión vigente de este ítem');
  const previous = mapCatalog(row);
  const item: CatalogItem = { ...previous, effectiveTo: from, status: 'retired' };

  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'config.catalog.retire',
    authorUserId: actorUserId,
    entityType: 'catalog_item',
    entityId: open.id,
    effectiveDate: from,
    payload,
    result: item,
  });

  const result = await commitOperation(db, claim, [
    db.prepare("UPDATE catalog_versions SET effective_to = ?, status = 'retired' WHERE id = ?").bind(from, open.id),
  ], [{
    entityType: 'catalog_item',
    entityId: open.id,
    action: 'annul',
    actorUserId,
    reason: normalizeReason(input.reason, { required: true, fallback: 'Retiro de catálogo' }),
    previousData: previous,
    newData: item,
    effectiveDate: from,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? (result.result as CatalogItem) : item, replayed: result.replayed };
}

async function retireSimple(
  db: D1Database,
  actorUserId: number,
  options: {
    table: string;
    codeColumn: string;
    code: string;
    fieldLabel: string;
    entityType: string;
    operationType: string;
    payload: unknown;
    operationKey?: string;
    reason?: string;
    effectiveFrom: string;
    map: (row: Row) => { id: number; effectiveFrom: string; status: string; effectiveTo: string | null };
  },
): Promise<{ item: unknown; replayed: boolean }> {
  const replay = await lookupExistingOperation(db, actorUserId, options.operationKey, options.payload);
  if (replay) return { item: replay.result, replayed: true };

  const open = await findOpenVersion(db, options.table, options.codeColumn, options.code);
  if (!open) throw new ApiError(404, `No existe una versión vigente de ${options.fieldLabel}`);
  assertVersionDate(open, options.effectiveFrom);

  const row = await db.prepare(`SELECT * FROM ${options.table} WHERE id = ?`).bind(open.id).first<Row>();
  if (!row) throw new ApiError(404, `No existe una versión vigente de ${options.fieldLabel}`);
  const previous = options.map(row);
  const item = { ...previous, effectiveTo: options.effectiveFrom, status: 'retired' as const };

  const claim = await createOperationClaim({
    operationKey: options.operationKey,
    operationType: options.operationType,
    authorUserId: actorUserId,
    entityType: options.entityType,
    entityId: open.id,
    effectiveDate: options.effectiveFrom,
    payload: options.payload,
    result: item,
  });

  const result = await commitOperation(db, claim, [
    db.prepare(`UPDATE ${options.table} SET effective_to = ?, status = 'retired' WHERE id = ?`).bind(options.effectiveFrom, open.id),
  ], [{
    entityType: options.entityType,
    entityId: open.id,
    action: 'annul',
    actorUserId,
    reason: normalizeReason(options.reason, { required: true, fallback: 'Retiro de configuración' }),
    previousData: previous,
    newData: item,
    effectiveDate: options.effectiveFrom,
    recordedAt: claim.recordedAt,
  }]);

  return { item: result.replayed ? result.result : item, replayed: result.replayed };
}

export async function retireStage(db: D1Database, actorUserId: number, codeInput: string, input: RetireInput) {
  const code = normalizeCode(codeInput);
  const from = effectiveDate(input.effectiveFrom);
  return retireSimple(db, actorUserId, {
    table: 'stage_versions',
    codeColumn: 'code',
    code,
    fieldLabel: 'la etapa',
    entityType: 'stage',
    operationType: 'config.stage.retire',
    payload: { code, effectiveFrom: from, retired: true },
    operationKey: input.operationKey,
    reason: input.reason,
    effectiveFrom: from,
    map: (row) => mapStage(row),
  });
}

export async function retireLocation(db: D1Database, actorUserId: number, codeInput: string, input: RetireInput) {
  const code = normalizeCode(codeInput);
  const from = effectiveDate(input.effectiveFrom);
  return retireSimple(db, actorUserId, {
    table: 'location_versions',
    codeColumn: 'code',
    code,
    fieldLabel: 'la ubicación',
    entityType: 'farm_location',
    operationType: 'config.location.retire',
    payload: { code, effectiveFrom: from, retired: true },
    operationKey: input.operationKey,
    reason: input.reason,
    effectiveFrom: from,
    map: (row) => mapLocation(row),
  });
}

export async function retireLot(db: D1Database, actorUserId: number, codeInput: string, input: RetireInput) {
  const code = normalizeCode(codeInput);
  const from = effectiveDate(input.effectiveFrom);
  return retireSimple(db, actorUserId, {
    table: 'lot_versions',
    codeColumn: 'code',
    code,
    fieldLabel: 'el lote',
    entityType: 'handling_lot',
    operationType: 'config.lot.retire',
    payload: { code, effectiveFrom: from, retired: true },
    operationKey: input.operationKey,
    reason: input.reason,
    effectiveFrom: from,
    map: (row) => mapLot(row),
  });
}
