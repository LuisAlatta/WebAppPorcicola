import { BARN_BACKUP_LIMITS, type BarnBackup, type BarnBackupRow, type BarnBackupValue, type ImportBarnBackupResult } from '../src/types/barn-backup';
import {
  ApiError, canonicalize, commitOperation, createOperationClaim, currentFarmDate,
  lookupExistingOperation, normalizeReason, sha256Hex,
} from './events';
export type { BarnBackup, ImportBarnBackupInput, ImportBarnBackupResult } from '../src/types/barn-backup';

// Deliberadamente fija. Una tabla nueva requiere revisar su alcance antes de incluirla.
export const BARN_BACKUP_TABLES = [
  'barns', 'user_barns', 'barn_team_history', 'barn_pens', 'location_versions',
  'animals', 'animal_tags', 'animal_type_history', 'animal_weights', 'animal_location_history',
  'reproduction_cycles', 'reproduction_services', 'reproduction_events', 'reproduction_weaning_plans',
  'litters', 'litter_events', 'litter_corrections', 'litter_identified_adoptions',
  'inventory_movements', 'inventory_reconciliations', 'health_events', 'health_event_animals',
  'vaccine_occurrences', 'feed_warehouses', 'feed_movements', 'feed_turns',
  'financial_entries', 'financial_allocations', 'financial_settlements', 'financial_settlement_allocations',
  'alert_occurrences', 'alert_escalations', 'alert_notifications', 'operation_log', 'audit_log',
] as const;
const REFERENCE_TABLES = ['users', 'catalog_versions', 'stage_versions', 'lot_versions', 'vaccine_rules', 'alert_escalation_rules'] as const;
const ALL_TABLES = [...BARN_BACKUP_TABLES, ...REFERENCE_TABLES];
const USER_COLUMNS = ['id', 'username', 'role', 'is_active', 'created_at'];
const BUSINESS = new Set<string>(BARN_BACKUP_TABLES);
export { BARN_BACKUP_LIMITS } from '../src/types/barn-backup';

type Column = { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number };
type ForeignKey = { id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string; match: string };
type Schema = Record<string, { columns: Column[]; keys: Column[]; fks: ForeignKey[] }>;
type Dataset = Record<string, BarnBackupRow[]>;
type Kind = 'owned' | 'shared' | 'external';
const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;
function fail(message: string): never { throw new ApiError(400, message); }
function conflict(message: string): never { throw new ApiError(409, `${message}. No se restauró ningún dato`); }
const jsonKey = (schema: Schema, table: string, alias: string) => `json_array(${schema[table].keys.map(c => `${alias}.${q(c.name)}`).join(',')})`;
const rowKey = (schema: Schema, table: string, row: BarnBackupRow) => JSON.stringify(schema[table].keys.map(c => row[c.name]));
const emptyDataset = (): Dataset => Object.fromEntries(ALL_TABLES.map(table => [table, []]));

async function requireAdministrator(db: D1Database, actorUserId: number) {
  const user = await db.prepare("SELECT id FROM users WHERE id=? AND role='administrador' AND is_active=1").bind(actorUserId).first();
  if (!user) throw new ApiError(403, 'Solo un Administrador activo puede respaldar o restaurar galpones');
}
function adminGuard(db: D1Database, actorUserId: number) {
  return db.prepare("INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND role='administrador' AND is_active=1) THEN 0 ELSE -1 END").bind(actorUserId);
}

async function loadSchema(db: D1Database): Promise<{ schema: Schema; hash: string }> {
  const results = await db.batch(ALL_TABLES.flatMap(table => [
    db.prepare(`PRAGMA table_info(${q(table)})`), db.prepare(`PRAGMA foreign_key_list(${q(table)})`),
  ]));
  const schema: Schema = {};
  ALL_TABLES.forEach((table, i) => {
    const actual = results[i * 2].results as unknown as Column[];
    if (!actual?.length) throw new ApiError(409, `Falta la tabla ${table}; aplique las migraciones antes de usar respaldos`);
    const columns = table === 'users' ? actual.filter(c => USER_COLUMNS.includes(c.name)) : actual;
    const keys = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk);
    const fks = results[i * 2 + 1].results as unknown as ForeignKey[];
    if (!keys.length || columns.some(c => !/^[a-z_][a-z0-9_]*$/i.test(c.name))) throw new ApiError(409, `Esquema incompatible: ${table}`);
    for (const fk of fks) {
      if (fk.seq !== 0 || !ALL_TABLES.includes(fk.table as typeof ALL_TABLES[number])) {
        throw new ApiError(409, `Dependencia no soportada: ${table}.${fk.from} → ${fk.table}`);
      }
    }
    schema[table] = { columns, keys, fks };
  });
  return { schema, hash: await sha256Hex(canonicalize(schema)) };
}

// La expansión conserva dependencias del historial sin arrastrar todos los datos de otros galpones.
function exportQuery(schema: Schema): string {
  const A = 'SELECT id FROM animals WHERE barn_id=(SELECT id FROM target)';
  const L = `SELECT id FROM litters WHERE barn_id=(SELECT id FROM target) OR female_animal_id IN (${A})`;
  const C = `SELECT id FROM reproduction_cycles WHERE barn_id=(SELECT id FROM target) OR female_animal_id IN (${A})`;
  const H = `SELECT DISTINCT health_event_id FROM health_event_animals WHERE barn_id=(SELECT id FROM target) OR animal_id IN (${A})`;
  const own = 'barn_id=(SELECT id FROM target)';
  const inventory = `${own} OR animal_id IN (${A}) OR litter_id IN (${L}) OR health_event_id IN (${H})
    OR reverses_movement_id IN (SELECT id FROM inventory_movements WHERE ${own})`;
  const seeds: Record<string, string> = {
    barns: 'id=(SELECT id FROM target)', user_barns: own, barn_team_history: own, barn_pens: own,
    location_versions: 'code IN (SELECT code FROM location_codes)', animals: `${own} OR mother_id IN (${A}) OR father_id IN (${A}) OR litter_id IN (${L})`,
    animal_tags: `animal_id IN (${A})`, animal_type_history: `animal_id IN (${A})`,
    animal_weights: `${own} OR animal_id IN (${A}) OR corrects_weight_id IN (SELECT id FROM animal_weights WHERE ${own} OR animal_id IN (${A}))`,
    animal_location_history: `${own} OR animal_id IN (${A})`, reproduction_cycles: `id IN (${C})`,
    reproduction_services: `cycle_id IN (${C}) OR sire_animal_id IN (${A})`, reproduction_events: `cycle_id IN (${C})`,
    reproduction_weaning_plans: `cycle_id IN (${C})`, litters: `id IN (${L})`,
    litter_events: `destination_barn_id=(SELECT id FROM target) OR litter_id IN (${L}) OR destination_litter_id IN (${L})`,
    litter_corrections: `litter_id IN (${L})`, litter_identified_adoptions: `animal_id IN (${A}) OR source_litter_id IN (${L}) OR target_litter_id IN (${L})`,
    inventory_movements: inventory, inventory_reconciliations: own, health_events: `id IN (${H}) OR inventory_movement_id IN (SELECT id FROM inventory_movements WHERE ${own})`,
    vaccine_occurrences: `animal_id IN (${A}) OR application_health_event_id IN (${H})`,
    feed_warehouses: own,
    // El saldo de los lotes usados requiere compras/aperturas/devoluciones, no todo el almacén compartido.
    feed_movements: `EXISTS(SELECT 1 FROM feed_buckets b WHERE b.warehouse_id=s.warehouse_id AND b.feed_code=s.feed_code AND b.lot_code=s.lot_code)
      OR reverses_movement_id IN (SELECT id FROM feed_movements WHERE destination_barn_id=(SELECT id FROM target))`,
    feed_turns: own, financial_entries: `id IN (SELECT id FROM entries)`,
    alert_occurrences: own, operation_log: own, audit_log: own,
  };
  // D1 limita los términos de un SELECT compuesto. Agrupar no pagina ni trunca.
  const ctes: string[] = [];
  function compound(prefix: string, terms: string[], union = 'UNION ALL'): string {
    let level = 0;
    while (terms.length > 4) {
      const names: string[] = [];
      for (let i = 0; i < terms.length; i += 4) {
        const name = `${prefix}_${level}_${i / 4}`;
        ctes.push(`${name} AS MATERIALIZED (${terms.slice(i, i + 4).join(` ${union} `)})`);
        names.push(`SELECT * FROM ${name}`);
      }
      terms = names;
      level++;
    }
    return terms.join(` ${union} `);
  }
  const seedSQL = compound('seed', Object.entries(seeds).map(([table, where]) => `SELECT ${lit(table)} AS t,${jsonKey(schema, table, 's')} AS k FROM ${q(table)} s WHERE ${where}`), 'UNION');
  const edges: string[] = [];
  function edge(from: string, to: string, condition: string) {
    edges.push(`SELECT ${lit(from)} AS ft,${jsonKey(schema, from, 's')} AS fk,${lit(to)} AS t,${jsonKey(schema, to, 'p')} AS k FROM ${q(from)} s JOIN ${q(to)} p ON ${condition}`);
  }
  for (const table of ALL_TABLES) {
    // No expansión desde usuarios/configuración/otros galpones hacia hijos.
    for (const fk of schema[table].fks) edge(table, fk.table, `s.${q(fk.from)}=p.${q(fk.to)}`);
    const cols = new Set(schema[table].columns.map(c => c.name));
    for (const name of ['stage_code', 'entry_stage_code', 'current_stage_code', 'stage_code_snapshot', 'destination_stage_code']) {
      if (cols.has(name)) edge(table, 'stage_versions', `s.${q(name)}=p.code`);
    }
    for (const name of ['location_code', 'location_code_snapshot', 'destination_location_code', ...(table === 'location_versions' ? ['parent_code'] : [])]) {
      if (cols.has(name)) edge(table, 'location_versions', `s.${q(name)}=p.code`);
    }
    for (const name of ['lot_code', 'lot_code_snapshot', 'destination_lot_code']) {
      // El lote valorizado del alimento no es un lote de animales.
      if (cols.has(name) && !['feed_movements', 'feed_turns'].includes(table)) edge(table, 'lot_versions', `s.${q(name)}=p.code`);
    }
    const catalogLinks = { sex: 'sexo', status: 'estado_animal', aptitude: 'aptitud', service_type: 'tipo_servicio', physiological_status: 'estado_fisiologico', feed_code: 'alimento' };
    for (const [column, catalog] of Object.entries(catalogLinks)) {
      if (cols.has(column) && (column !== 'status' || table === 'animals')) edge(table, 'catalog_versions', `s.${q(column)}=p.item_code AND p.catalog_key=${lit(catalog)}`);
    }
  }
  edge('health_events', 'health_event_animals', `p.health_event_id=s.id AND s.id IN (${H})`);
  edge('financial_entries', 'financial_allocations', 'p.entry_id=s.id');
  edge('financial_entries', 'financial_settlements', 'p.financial_entry_id=s.id');
  edge('financial_entries', 'financial_entries', 'p.reversal_of_id=s.id');
  edge('financial_settlements', 'financial_settlement_allocations', 'p.settlement_id=s.id');
  edge('alert_occurrences', 'alert_escalations', 'p.alert_occurrence_id=s.id');
  edge('alert_occurrences', 'alert_notifications', 'p.alert_occurrence_id=s.id');
  edge('operation_log', 'audit_log', 'p.operation_log_id=s.id');
  // Hermanos de la MISMA operación (traslados y documentos), no todos los hijos del galpón.
  for (const table of ['inventory_movements', 'inventory_reconciliations', 'animal_location_history', 'health_events',
    'feed_movements', 'feed_turns', 'financial_entries', 'financial_settlements', 'litter_events', 'litter_corrections', 'litter_identified_adoptions']) {
    edge('operation_log', table, 'p.operation_log_id=s.id');
  }
  edge('inventory_movements', 'inventory_movements', 's.transfer_group_id IS NOT NULL AND p.transfer_group_id=s.transfer_group_id');
  // Identificadores históricos sin FK: conservar sus snapshots cuando todavía existen.
  // No se exige existencia para enlaces libres/obsoletos que el propio módulo admite.
  for (const [source, table] of [['vaccine_occurrence', 'vaccine_occurrences'], ['reproduction_cycle', 'reproduction_cycles'],
    ['litter', 'litters'], ['health_event', 'health_events'], ['animal_weight_threshold', 'animals'], ['sale_weight_threshold', 'animals']] as const) {
    edge('alert_occurrences', table, `s.source_type=${lit(source)} AND s.source_id=CAST(p.id AS TEXT)`);
  }
  for (const [source, table] of [['vaccine_occurrence', 'vaccine_occurrences'], ['reproduction_cycle', 'reproduction_cycles'],
    ['litter', 'litters'], ['health_event', 'health_events'], ['animal', 'animals'], ['inventory_movement', 'inventory_movements'],
    ['feed_movement', 'feed_movements'], ['feed_turn', 'feed_turns'], ['financial_entry', 'financial_entries'], ['financial_settlement', 'financial_settlements']] as const) {
    edge('alert_occurrences', table, `s.linked_event_type=${lit(source)} AND s.linked_event_id=CAST(p.id AS TEXT)`);
  }
  edge('alert_occurrences', 'animals', 's.animal_code=p.code');
  edge('alert_occurrences', 'operation_log', "s.source_type='manual' AND s.source_id=p.id");
  edge('alert_occurrences', 'operation_log', "s.source_type='feed_plan' AND p.entity_type='feed_plan' AND s.source_id=CAST(p.entity_id AS TEXT)");
  // Enlaces polimórficos reales (no se interpretan payloads arbitrarios).
  for (const [source, table] of [['feed_purchase', 'feed_movements'], ['animal_purchase', 'animals'], ['animal_sale', 'animals'], ['inventory_sale', 'inventory_movements'], ['litter_sale', 'litter_events']] as const) {
    edge('financial_entries', table, `s.source_type=${lit(source)} AND s.source_id=CAST(p.id AS TEXT)`);
  }
  for (const [source, table] of [['expected_farrowing', 'reproduction_cycles'], ['farrowing', 'litters']] as const) {
    edge('vaccine_occurrences', table, `s.source_event_type=${lit(source)} AND s.source_event_id=CAST(p.id AS TEXT)`);
  }
  const edgeSQL = compound('edge', edges);
  const output = compound('output', ALL_TABLES.map(table => `SELECT ${lit(table)} AS table_name,json_object(${schema[table].columns.map(c => `${lit(c.name)},s.${q(c.name)}`).join(',')}) AS row_json
    FROM ${q(table)} s JOIN nodes n ON n.t=${lit(table)} AND n.k=${jsonKey(schema, table, 's')}`));
  return `WITH RECURSIVE target(id) AS (VALUES (?)),
    location_codes(code) AS (SELECT code FROM location_versions WHERE ${own} UNION SELECT v.code FROM location_versions v JOIN location_codes p ON v.parent_code=p.code WHERE v.barn_id IS NULL OR v.barn_id=(SELECT id FROM target)),
    feed_buckets AS (SELECT DISTINCT m.warehouse_id,m.feed_code,m.lot_code FROM feed_movements m WHERE m.destination_barn_id=(SELECT id FROM target) OR m.animal_id IN (${A}) OR m.warehouse_id IN (SELECT id FROM feed_warehouses WHERE ${own})),
    entries(id) AS (SELECT entry_id FROM financial_allocations WHERE ${own} OR animal_id IN (${A})
      UNION SELECT f.id FROM financial_entries f WHERE (f.source_type IN ('animal_purchase','animal_sale') AND f.source_id IN (SELECT CAST(id AS TEXT) FROM animals WHERE ${own}))
      OR (f.source_type='inventory_sale' AND f.source_id IN (SELECT CAST(id AS TEXT) FROM inventory_movements WHERE ${own}))
      UNION SELECT f.reversal_of_id FROM financial_entries f JOIN entries e ON f.id=e.id WHERE f.reversal_of_id IS NOT NULL),
    ${ctes.join(',')}, edges AS (${edgeSQL}),
    nodes(t,k) AS (${seedSQL} UNION SELECT e.t,e.k FROM nodes n JOIN edges e ON e.ft=n.t AND e.fk=n.k) ${output}`;
}

/** Clasificación y diferencias NULL replican planBarnDeletion, no el manifest del cliente. */
function scopeOf(data: Dataset, barnId: number) {
  const ids = (table: string, predicate: (r: BarnBackupRow) => boolean) => new Set(data[table].filter(predicate).map(r => r.id));
  const A = ids('animals', r => r.barn_id === barnId);
  const L = ids('litters', r => r.barn_id === barnId || A.has(r.female_animal_id));
  const C = ids('reproduction_cycles', r => r.barn_id === barnId || A.has(r.female_animal_id));
  const H = new Set(data.health_event_animals.filter(r => r.barn_id === barnId || A.has(r.animal_id)).map(r => r.health_event_id));
  const I = ids('inventory_movements', r => r.barn_id === barnId);
  const F = ids('feed_movements', r => r.destination_barn_id === barnId);
  const W = ids('animal_weights', r => r.barn_id === barnId || A.has(r.animal_id));
  const alerts = ids('alert_occurrences', r => r.barn_id === barnId);
  const physicalCodes = new Set(data.location_versions.filter(r => r.barn_id === barnId).map(r => r.code));
  for (;;) {
    const before = physicalCodes.size;
    for (const r of data.location_versions) if ((r.barn_id === null || r.barn_id === barnId) && physicalCodes.has(r.parent_code)) physicalCodes.add(r.code);
    if (before === physicalCodes.size) break;
  }
  function kind(table: string, r: BarnBackupRow): Kind {
    if (!BUSINESS.has(table)) return 'external';
    switch (table) {
      case 'barns': return r.id === barnId ? 'owned' : 'external';
      case 'user_barns': case 'barn_pens': case 'barn_team_history': return r.barn_id === barnId ? 'owned' : 'external';
      case 'location_versions': return r.barn_id === barnId ? 'owned' : r.barn_id === null && physicalCodes.has(r.code) ? 'shared' : 'external';
      case 'animals': return A.has(r.id) ? 'owned' : 'external';
      case 'animal_tags': case 'animal_type_history': return A.has(r.animal_id) ? 'owned' : 'external';
      case 'animal_weights': return W.has(r.id) ? 'owned' : 'external';
      case 'animal_location_history': return r.barn_id === barnId || A.has(r.animal_id) ? 'owned' : 'external';
      case 'reproduction_cycles': return C.has(r.id) ? 'owned' : 'external';
      case 'reproduction_services': case 'reproduction_events': case 'reproduction_weaning_plans': return C.has(r.cycle_id) ? 'owned' : 'external';
      case 'litters': return L.has(r.id) ? 'owned' : 'external';
      case 'litter_events': return L.has(r.litter_id) || L.has(r.destination_litter_id) || r.destination_barn_id === barnId ? 'owned' : 'external';
      case 'litter_corrections': return L.has(r.litter_id) ? 'owned' : 'external';
      case 'litter_identified_adoptions': return A.has(r.animal_id) || L.has(r.source_litter_id) || L.has(r.target_litter_id) ? 'owned' : 'external';
      case 'inventory_movements': case 'inventory_reconciliations': case 'feed_turns': return r.barn_id === barnId ? 'owned' : 'external';
      case 'health_events': return H.has(r.id) ? 'owned' : 'external';
      case 'health_event_animals': return H.has(r.health_event_id) || r.barn_id === barnId || A.has(r.animal_id) ? 'owned' : 'external';
      case 'vaccine_occurrences': return A.has(r.animal_id) || H.has(r.application_health_event_id) ? 'owned' : 'external';
      case 'feed_movements': return r.destination_barn_id === barnId ? 'owned' : r.destination_barn_id === null ? 'shared' : 'external';
      case 'feed_warehouses': case 'financial_entries': case 'financial_allocations': case 'financial_settlements': case 'financial_settlement_allocations': case 'operation_log': case 'audit_log': return 'shared';
      case 'alert_occurrences': return alerts.has(r.id) ? 'owned' : 'external';
      case 'alert_escalations': case 'alert_notifications': return alerts.has(r.alert_occurrence_id) ? 'owned' : 'external';
      default: return 'external';
    }
  }
  function nulls(table: string, r: BarnBackupRow): Set<string> {
    const allowed = new Set<string>();
    const link = (column: string, set: Set<BarnBackupValue>) => { if (r[column] !== null && set.has(r[column])) allowed.add(column); };
    if (['financial_allocations', 'feed_warehouses', 'operation_log', 'audit_log'].includes(table) && r.barn_id === barnId) allowed.add('barn_id');
    if (table === 'animals') { link('mother_id', A); link('father_id', A); link('litter_id', L); }
    if (table === 'inventory_movements') {
      // El borrado pone AMBOS enlaces a NULL, aunque uno sea externo.
      if (A.has(r.animal_id) || L.has(r.litter_id)) { if (r.animal_id !== null) allowed.add('animal_id'); if (r.litter_id !== null) allowed.add('litter_id'); }
      link('health_event_id', H); link('reverses_movement_id', I);
    }
    if (table === 'reproduction_services') link('sire_animal_id', A);
    if (table === 'health_events') link('inventory_movement_id', I);
    if (table === 'animal_weights') link('corrects_weight_id', W);
    if (table === 'feed_movements') { link('animal_id', A); link('reverses_movement_id', F); }
    if (table === 'financial_allocations') link('animal_id', A);
    return allowed;
  }
  return { kind, nulls };
}

function snapshotBody(backup: BarnBackup) {
  return { format: backup.format, version: backup.version, exportedAt: backup.exportedAt, barnId: backup.barnId, tables: backup.tables, references: backup.references, schemaHash: backup.manifest.schemaHash };
}
function byteLength(text: string) { return new TextEncoder().encode(text).byteLength; }
function checkSize(value: unknown) {
  if (byteLength(JSON.stringify(value)) > BARN_BACKUP_LIMITS.bytes) throw new ApiError(413, `Respaldo demasiado grande: máximo ${BARN_BACKUP_LIMITS.bytes} bytes; no se truncan datos`);
}

function validateBackup(input: unknown, schema: Schema): BarnBackup {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(input)) fail('El respaldo debe ser un objeto JSON');
  if (input.format !== 'webporcicola-barn-backup' || input.version !== 1) fail('Formato o versión del respaldo no soportados');
  if (!Number.isSafeInteger(input.barnId) || Number(input.barnId) <= 0) fail('barnId inválido');
  if (typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt))) fail('exportedAt inválido');
  if (!object(input.tables) || !object(input.references) || !object(input.manifest)) fail('Faltan tablas, referencias o manifest de exportación');
  if (Object.keys(input).some(k => !['format', 'version', 'exportedAt', 'barnId', 'tables', 'references', 'manifest'].includes(k))) fail('Propiedades de respaldo desconocidas');
  const manifest = input.manifest;
  if (Object.keys(manifest).sort().join(',') !== 'digest,exportOperationId,schemaHash' || typeof manifest.schemaHash !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.schemaHash)
    || typeof manifest.digest !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.digest) || typeof manifest.exportOperationId !== 'string' || !/^[a-f0-9-]{36}$/.test(manifest.exportOperationId)) fail('Manifest inválido');
  let count = 0;
  const seen: Record<string, Set<string>> = Object.fromEntries(ALL_TABLES.map(t => [t, new Set<string>()]));
  for (const [container, isReference] of [[input.tables, false], [input.references, true]] as const) {
    for (const [table, rows] of Object.entries(container)) {
      if (!ALL_TABLES.includes(table as typeof ALL_TABLES[number]) || (!isReference && !BUSINESS.has(table))) fail(`Tabla no permitida: ${table}`);
      if (!Array.isArray(rows)) fail(`Las filas de ${table} deben ser un arreglo`);
      count += rows.length;
      if (count > BARN_BACKUP_LIMITS.rows) throw new ApiError(413, `Demasiadas filas: máximo ${BARN_BACKUP_LIMITS.rows}; no se truncan datos`);
      for (const raw of rows) {
        if (!object(raw)) fail(`Fila inválida en ${table}`);
        const columns = schema[table].columns;
        if (Object.keys(raw).sort().join(',') !== columns.map(c => c.name).sort().join(',')) fail(`Columnas incompatibles en ${table}`);
        for (const column of columns) {
          const value = raw[column.name];
          if (value === null) { if (column.notnull || column.pk) fail(`NULL no permitido en ${table}.${column.name}`); continue; }
          if (/INT/i.test(column.type)) { if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`Tipo INTEGER inválido en ${table}.${column.name}`); }
          else if (/REAL|NUM|FLOAT|DOUBLE/i.test(column.type)) { if (typeof value !== 'number' || !Number.isFinite(value)) fail(`Tipo numérico inválido en ${table}.${column.name}`); }
          else if (typeof value !== 'string') fail(`Tipo TEXT inválido en ${table}.${column.name}`);
          if (typeof value === 'string' && byteLength(value) > BARN_BACKUP_LIMITS.cellBytes) throw new ApiError(413, `Celda demasiado grande: ${table}.${column.name}`);
          if (column.pk && (typeof value === 'number' ? value <= 0 : value === '')) fail(`Clave primaria inválida en ${table}`);
        }
        const key = rowKey(schema, table, raw as BarnBackupRow);
        if (seen[table].has(key)) fail(`Clave primaria duplicada en ${table}: ${key}`);
        seen[table].add(key);
      }
    }
  }
  for (const table of BARN_BACKUP_TABLES) if (!(table in input.tables)) fail(`Falta la tabla ${table} en el respaldo`);
  checkSize(input);
  return input as unknown as BarnBackup;
}

function combine(backup: BarnBackup): Dataset {
  const data = emptyDataset();
  for (const table of ALL_TABLES) data[table] = [...(backup.tables[table] ?? []), ...(backup.references[table] ?? [])];
  return data;
}
function validateDependencies(data: Dataset, schema: Schema) {
  for (const table of ALL_TABLES) for (const fk of schema[table].fks) {
    const values = new Set(data[fk.table].map(r => r[fk.to]));
    for (const row of data[table]) if (row[fk.from] !== null && !values.has(row[fk.from])) {
      fail(`Falta dependencia ${table}.${fk.from}=${row[fk.from]} → ${fk.table}.${fk.to} en el respaldo`);
    }
  }
}

export async function exportBarnBackup(db: D1Database, actorUserId: number, barnId: number): Promise<BarnBackup> {
  if (!Number.isSafeInteger(barnId) || barnId <= 0) fail('ID de galpón inválido');
  await requireAdministrator(db, actorUserId);
  const { schema, hash } = await loadSchema(db);
  const [result] = await db.batch([db.prepare(exportQuery(schema)).bind(barnId)]);
  const data = emptyDataset();
  let bytes = 0;
  for (const raw of result.results as { table_name: string; row_json: string }[]) {
    bytes += byteLength(raw.row_json);
    if (bytes > BARN_BACKUP_LIMITS.bytes || result.results.length > BARN_BACKUP_LIMITS.rows) throw new ApiError(413, 'El respaldo supera los límites; no se exportó ni truncó el historial');
    data[raw.table_name].push(JSON.parse(raw.row_json) as BarnBackupRow);
  }
  if (!data.barns.some(r => r.id === barnId)) throw new ApiError(404, 'Galpón no encontrado');
  const scope = scopeOf(data, barnId);
  const backup: BarnBackup = { format: 'webporcicola-barn-backup', version: 1, exportedAt: new Date().toISOString(), barnId,
    tables: Object.fromEntries(BARN_BACKUP_TABLES.map(t => [t, []])), references: {}, manifest: { schemaHash: hash, digest: '', exportOperationId: '' } };
  for (const table of ALL_TABLES) {
    data[table].sort((a, b) => rowKey(schema, table, a).localeCompare(rowKey(schema, table, b)));
    for (const row of data[table]) {
      const container = scope.kind(table, row) === 'external' ? backup.references : backup.tables;
      (container[table] ??= []).push(row);
    }
  }
  validateDependencies(data, schema);
  backup.manifest.digest = await sha256Hex(canonicalize(snapshotBody(backup)));
  const claim = await createOperationClaim({ operationKey: `backup-export-${crypto.randomUUID()}`, operationType: 'barn.backup.export', authorUserId: actorUserId,
    entityType: 'barn', entityId: barnId, barnId: null, payload: { barnId, digest: backup.manifest.digest, schemaHash: hash }, result: { barnId, exportedAt: backup.exportedAt } });
  backup.manifest.exportOperationId = claim.id;
  validateBackup(backup, schema);
  await commitOperation(db, claim, [adminGuard(db, actorUserId), db.prepare('DELETE FROM inventory_write_guard WHERE guard_id=0')], [{ entityType: 'barn', entityId: barnId, action: 'create', actorUserId, barnId: null,
    reason: 'Exportación de respaldo completo del galpón', newData: { digest: backup.manifest.digest, exportedAt: backup.exportedAt }, effectiveDate: claim.effectiveDate, recordedAt: claim.recordedAt }]);
  return backup;
}

/** Lee con límite real incluso si falta Content-Length o se usa transferencia por chunks. */
export async function readBarnBackupRequest(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > BARN_BACKUP_LIMITS.requestBytes) throw new ApiError(413, 'Respaldo demasiado grande');
  if (!request.body) fail('Se requiere un cuerpo JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > BARN_BACKUP_LIMITS.requestBytes) { await reader.cancel(); throw new ApiError(413, 'Respaldo demasiado grande; no se truncan datos'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch { return fail('JSON inválido'); }
}

export async function importBarnBackup(db: D1Database, actorUserId: number, input: unknown): Promise<ImportBarnBackupResult> {
  await requireAdministrator(db, actorUserId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Se requiere backup, operationKey y reason');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(k => !['backup', 'operationKey', 'reason'].includes(k))) fail('Propiedades de importación desconocidas');
  if (typeof body.operationKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(body.operationKey)) fail('Clave de reintento obligatoria e inválida');
  if (typeof body.reason !== 'string' || body.reason.length > 2000) fail('Motivo inválido: máximo 2000 caracteres');
  const reason = normalizeReason(body.reason, { required: true });
  const { schema, hash } = await loadSchema(db);
  const backup = validateBackup(body.backup, schema);
  if (backup.manifest.schemaHash !== hash) conflict('El esquema cambió; el respaldo requiere exactamente las mismas columnas y dependencias');
  const data = combine(backup);
  validateDependencies(data, schema);
  const scope = scopeOf(data, backup.barnId);
  for (const table of ALL_TABLES) {
    for (const row of backup.tables[table] ?? []) if (scope.kind(table, row) === 'external') fail(`Fila fuera del alcance restaurable: ${table}`);
    for (const row of backup.references[table] ?? []) if (scope.kind(table, row) !== 'external') fail(`Referencia mal clasificada: ${table}`);
  }
  if (backup.tables.barns.length !== 1 || backup.tables.barns[0].id !== backup.barnId) fail('El respaldo debe contener exactamente su galpón');
  const digest = await sha256Hex(canonicalize(snapshotBody(backup)));
  if (digest !== backup.manifest.digest) fail('El respaldo fue alterado: su huella no coincide');
  const attestation = await db.prepare("SELECT payload FROM operation_log WHERE id=? AND operation_type='barn.backup.export' AND status='committed'").bind(backup.manifest.exportOperationId).first<{ payload: string }>();
  if (!attestation || attestation.payload !== canonicalize({ barnId: backup.barnId, digest, schemaHash: hash })) conflict('Falta la constancia de exportación en esta granja; no se aceptan respaldos de otra base');
  const payload = { type: 'barn.backup.import', barnId: backup.barnId, digest, exportOperationId: backup.manifest.exportOperationId, reason };
  const replay = await lookupExistingOperation(db, actorUserId, body.operationKey, payload);
  if (replay) return { ...(replay.result as ImportBarnBackupResult), replayed: true };
  const barn = backup.tables.barns[0];
  const collision = await db.prepare('SELECT id FROM barns WHERE id=? OR code=?').bind(backup.barnId, barn.code).first();
  if (collision) {
    const concurrentReplay = await lookupExistingOperation(db, actorUserId, body.operationKey, payload);
    if (concurrentReplay) return { ...(concurrentReplay.result as ImportBarnBackupResult), replayed: true };
    conflict('Ya existe un galpón con ese ID o código');
  }

  const presentResults = await db.batch(ALL_TABLES.map(table => {
    const columns = schema[table].columns.map(c => q(c.name)).join(',');
    return db.prepare(`SELECT ${columns} FROM ${q(table)} s WHERE ${jsonKey(schema, table, 's')} IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(data[table].map(r => rowKey(schema, table, r))));
  }));
  // Un reintento pudo terminar entre la consulta de clave y esta lectura consistente.
  const concurrentReplay = await lookupExistingOperation(db, actorUserId, body.operationKey, payload);
  if (concurrentReplay) return { ...(concurrentReplay.result as ImportBarnBackupResult), replayed: true };
  const statements: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
  const guards: D1PreparedStatement[] = [adminGuard(db, actorUserId)];
  const writes: D1PreparedStatement[] = [];
  ALL_TABLES.forEach((table, index) => {
    const present = new Map((presentResults[index].results as BarnBackupRow[]).map(row => [rowKey(schema, table, row), row]));
    const columns = schema[table].columns;
    for (const row of data[table]) {
      const key = rowKey(schema, table, row);
      const existing = present.get(key);
      const kind = scope.kind(table, row);
      const pkWhere = schema[table].keys.map(c => `${q(c.name)} IS ?`).join(' AND ');
      const pkParams = schema[table].keys.map(c => row[c.name]);
      if (!existing) {
        if (kind === 'external') conflict(`Falta dependencia externa ${table} ${key}; debe existir y coincidir en la granja`);
        guards.push(db.prepare(`INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ${q(table)} WHERE ${pkWhere}) THEN 0 ELSE -1 END`).bind(...pkParams));
        writes.push(db.prepare(`INSERT INTO ${q(table)} (${columns.map(c => q(c.name)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...columns.map(c => row[c.name])));
      } else {
        if (kind === 'owned') conflict(`ID ocupado en ${table} ${key}`);
        const allowed = scope.nulls(table, row);
        const relink: string[] = [];
        for (const c of columns) {
          if (existing[c.name] === row[c.name]) continue;
          if (existing[c.name] === null && row[c.name] !== null && allowed.has(c.name)) relink.push(c.name);
          else conflict(`Registro modificado o colisión en ${table} ${key}, columna ${c.name}`);
        }
        const unchanged = columns.map(c => `${q(c.name)} IS ?`).join(' AND ');
        const params = columns.map(c => existing[c.name]);
        guards.push(db.prepare(`INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM ${q(table)} WHERE ${unchanged}) THEN 0 ELSE -1 END`).bind(...params));
        if (relink.length) writes.push(db.prepare(`UPDATE ${q(table)} SET ${relink.map(c => `${q(c)}=?`).join(',')} WHERE ${unchanged}`).bind(...relink.map(c => row[c]), ...params));
      }
    }
  });
  // Guardar también la ausencia por código y la constancia: la validación previa no protege carreras.
  guards.push(db.prepare('INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM barns WHERE id=? OR code=?) THEN 0 ELSE -1 END').bind(backup.barnId, barn.code));
  guards.push(db.prepare("INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN EXISTS(SELECT 1 FROM operation_log WHERE id=? AND operation_type='barn.backup.export' AND status='committed' AND payload=?) THEN 0 ELSE -1 END").bind(backup.manifest.exportOperationId, attestation.payload));
  statements.push(...guards, ...writes, db.prepare('DELETE FROM inventory_write_guard WHERE guard_id=0'));
  // Un CHECK hace fallar el batch completo incluso ante FK diferidas/ciclos; nada queda parcial.
  statements.push(db.prepare('INSERT INTO inventory_write_guard(guard_id) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 0 ELSE -1 END'), db.prepare('DELETE FROM inventory_write_guard WHERE guard_id=0'), db.prepare('PRAGMA defer_foreign_keys = OFF'));
  const result: ImportBarnBackupResult = { barnId: backup.barnId, code: String(barn.code), name: String(barn.name) };
  const claim = await createOperationClaim({ operationKey: body.operationKey, operationType: 'barn.backup.import', authorUserId: actorUserId, entityType: 'barn', entityId: backup.barnId, barnId: null, payload, result });
  try {
    const committed = await commitOperation(db, claim, statements, [{ entityType: 'barn', entityId: backup.barnId, action: 'create', actorUserId, barnId: backup.barnId, reason,
      newData: { ...result, digest, rows: Object.fromEntries(BARN_BACKUP_TABLES.map(t => [t, backup.tables[t].length])) }, effectiveDate: currentFarmDate(), recordedAt: claim.recordedAt }]);
    return { ...(committed.result as ImportBarnBackupResult), replayed: committed.replayed };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (/constraint|guard_id|foreign.key/i.test(String(error))) conflict('Conflicto de restauración: una dependencia, ID, código o fila cambió durante la importación');
    throw error;
  }
}
