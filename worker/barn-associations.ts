/**
 * Datos asociados a un galpón (CFG-06)
 *
 * `barns` es referenciado por 19 tablas. Solo `user_barns`, `barn_team_history` y
 * `barn_pens` se borran en cascada; las demás restringen la eliminación, así que
 * un galpón que operó alguna vez no puede borrarse hasta que sus registros se
 * reasignen a otro galpón o se desvinculen de él.
 *
 * Esta vista responde qué hay en cada tabla y qué se puede hacer con ello. Las
 * acciones se construyen siempre desde `GROUP_DEFS`: la tabla, la columna y el
 * tipo de id nunca vienen del cliente.
 */

import {
  ApiError,
  commitOperation,
  createOperationClaim,
  currentFarmDate,
  lookupExistingOperation,
  normalizeReason,
} from './events';
import { transferAnimal } from './animals';
import { transferInventory } from './inventory';

export type AssociationAction = 'reassign' | 'detach' | 'delete' | 'transfer';

export type AssociationSection = 'animales' | 'operacion' | 'config' | 'trazabilidad' | 'asociados';

export interface AssociationRow {
  id: string;
  label: string;
  meta: string;
  date: string | null;
  quantity: string | null;
  /** Datos que el cliente necesita para invocar la acción (código de ficha, bucket de stock). */
  payload: Record<string, unknown> | null;
}

export interface AssociationGroup {
  key: string;
  label: string;
  note: string;
  section: AssociationSection;
  blocking: boolean;
  actions: AssociationAction[];
  count: number;
  unit: string;
  rows: AssociationRow[];
  hasMore: boolean;
}

export interface BarnAssociations {
  barn: { id: number; code: string; name: string; status: string };
  groups: AssociationGroup[];
  blockers: { count: number; groups: string[] };
  canDelete: boolean;
}

type Row = Record<string, unknown>;

interface GroupDef {
  key: string;
  label: string;
  note: string;
  section: AssociationSection;
  table: string;
  column: 'barn_id' | 'destination_barn_id';
  /** Columna nullable: admite desvincular sin perder el registro. */
  nullable: boolean;
  /** ON DELETE CASCADE: desaparece con el galpón y no bloquea. */
  cascade: boolean;
  /** El galpón no admite acciones fila por fila; requiere traslado real. */
  transferOnly?: boolean;
  actions: AssociationAction[];
  idType: 'int' | 'text';
  countSql: string;
  rowsSql: string;
  unit: string;
  map: (row: Row) => AssociationRow;
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** Fechas del esquema: ISO completo o YYYY-MM-DD; la vista solo necesita el día. */
const day = (value: unknown): string | null => {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : null;
};

const MOVEMENT_LABEL: Record<string, string> = {
  initial: 'Saldo inicial',
  purchase: 'Compra',
  birth: 'Nacimiento',
  sale: 'Venta',
  death: 'Muerte',
  transfer_in: 'Traslado recibido',
  transfer_out: 'Traslado enviado',
  adjustment: 'Ajuste',
};

const ROLE_LABEL: Record<string, string> = {
  responsable: 'Usuario responsable',
  operario: 'Operario de campo',
  veterinario: 'Médico veterinario',
};

const HEALTH_LABEL: Record<string, string> = {
  treatment: 'Tratamiento',
  deworming: 'Desparasitación',
  other: 'Otro servicio',
  death: 'Muerte',
};

const LITTER_EVENT_LABEL: Record<string, string> = {
  death: 'Muerte',
  weaning: 'Destete',
  adoption_in: 'Adopción recibida',
  adoption_out: 'Adopción enviada',
  discard: 'Descarte',
  sale: 'Venta',
  sale_return: 'Devolución de compra',
};

const FEED_LABEL: Record<string, string> = {
  opening: 'Apertura',
  purchase: 'Compra',
  return_in: 'Devolución recibida',
  delivery: 'Entrega a galpón',
  waste: 'Desperdicio',
  return_supplier: 'Devolución a proveedor',
};

const ALERT_LABEL: Record<string, string> = {
  vaccine: 'Vacuna',
  farrowing: 'Parto',
  weaning: 'Destete',
  treatment: 'Tratamiento',
  feeding: 'Alimentación',
  manual: 'Manual',
  low_weight: 'Peso bajo',
  sale_suggestion: 'Sugerencia de venta',
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: 'Alta',
  update: 'Actualización',
  correct: 'Corrección',
  annul: 'Anulación',
  delete: 'Baja',
};

const GROUP_DEFS: GroupDef[] = [
  {
    key: 'animals',
    label: 'Fichas de animales en el galpón',
    note: 'Cada ficha se mueve con un traslado real, que ajusta el stock y cierra su historial de ubicación. No se puede desvincular: un animal sin galpón no existe en el libro.',
    section: 'animales',
    table: 'animals',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    transferOnly: true,
    actions: ['transfer'],
    idType: 'int',
    countSql: `SELECT count(*) AS n FROM animals WHERE barn_id = ? AND is_active = 1 AND exit_date IS NULL`,
    rowsSql: `
      SELECT id, code, animal_type, sex, current_stage_code, entry_date, status
      FROM animals
      WHERE barn_id = ? AND is_active = 1 AND exit_date IS NULL
      ORDER BY code LIMIT ?`,
    unit: 'fichas',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.code)} · ${text(r.animal_type)}`,
      meta: `${text(r.sex)} · etapa ${text(r.current_stage_code)} · ${text(r.status)}`,
      date: day(r.entry_date),
      quantity: '1 cabeza',
      payload: { code: text(r.code) },
    }),
  },
  {
    key: 'stock',
    label: 'Cabezas en el libro del galpón',
    note: 'Saldo por etapa, sexo, ubicación y lote. Se resuelve con un traslado a otro galpón; mientras quede alguna cabeza no se puede cerrar ni eliminar.',
    section: 'animales',
    table: 'inventory_movements',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    transferOnly: true,
    actions: ['transfer'],
    idType: 'int',
    countSql: `
      SELECT COALESCE(SUM(CASE WHEN movement_type IN ('sale','death','transfer_out')
        THEN -quantity ELSE quantity END), 0) AS n
      FROM inventory_movements WHERE barn_id = ?`,
    rowsSql: `
      SELECT stage_code, sex, location_code, lot_code,
        SUM(CASE WHEN movement_type IN ('sale','death','transfer_out')
          THEN -quantity ELSE quantity END) AS heads
      FROM inventory_movements
      WHERE barn_id = ?
      GROUP BY stage_code, sex, location_code, lot_code
      HAVING heads > 0
      ORDER BY heads DESC LIMIT ?`,
    unit: 'cabezas',
    map: (r) => ({
      id: `${text(r.stage_code)}|${text(r.sex)}|${text(r.location_code)}|${text(r.lot_code)}`,
      label: `Etapa ${text(r.stage_code)} · ${text(r.sex)}`,
      meta: `Ubicación ${text(r.location_code) || '—'} · Lote ${text(r.lot_code) || '—'}`,
      date: null,
      quantity: `${Number(r.heads ?? 0)} cabezas`,
      payload: {
        stageCode: text(r.stage_code),
        sex: text(r.sex),
        locationCode: r.location_code === null || r.location_code === undefined ? null : text(r.location_code),
        lotCode: r.lot_code === null || r.lot_code === undefined ? null : text(r.lot_code),
        quantity: Number(r.heads ?? 0),
      },
    }),
  },
  {
    key: 'inventory_movements',
    label: 'Movimientos de cabezas',
    note: 'Historial del libro de existencias. Reasignarlo cambia a qué galpón se le atribuye cada entrada y salida pasada; desvincularlo no es posible porque la columna es obligatoria.',
    section: 'operacion',
    table: 'inventory_movements',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM inventory_movements WHERE barn_id = ?',
    rowsSql: `
      SELECT m.id, m.movement_type, m.effective_date, m.stage_code, m.sex, m.quantity,
             m.location_code, m.lot_code, u.name AS actor
      FROM inventory_movements m
      LEFT JOIN users u ON u.id = m.created_by_user_id
      WHERE m.barn_id = ? ORDER BY m.effective_date DESC, m.id DESC LIMIT ?`,
    unit: 'movimientos',
    map: (r) => ({
      id: text(r.id),
      label: MOVEMENT_LABEL[text(r.movement_type)] ?? text(r.movement_type),
      meta: `${text(r.stage_code)} · ${text(r.sex)} · ${text(r.location_code) || 'sin ubicación'} · ${text(r.actor)}`,
      date: day(r.effective_date),
      quantity: `${Number(r.quantity ?? 0)} cabezas`,
      payload: null,
    }),
  },
  {
    key: 'reconciliations',
    label: 'Conciliaciones de inventario',
    note: 'Conteos físicos y sus diferencias aprobadas.',
    section: 'operacion',
    table: 'inventory_reconciliations',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM inventory_reconciliations WHERE barn_id = ?',
    rowsSql: `
      SELECT r.id, r.effective_date, r.stage_code, r.sex, r.expected_heads, r.counted_heads,
             r.variance, u.name AS actor
      FROM inventory_reconciliations r
      LEFT JOIN users u ON u.id = r.created_by_user_id
      WHERE r.barn_id = ? ORDER BY r.effective_date DESC, r.id DESC LIMIT ?`,
    unit: 'conciliaciones',
    map: (r) => ({
      id: text(r.id),
      label: `Conteo ${text(r.stage_code)} · ${text(r.sex)}`,
      meta: `Esperado ${Number(r.expected_heads ?? 0)} · Contado ${Number(r.counted_heads ?? 0)} · Varianza ${Number(r.variance ?? 0)} · ${text(r.actor)}`,
      date: day(r.effective_date),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'reproduction_cycles',
    label: 'Ciclos reproductivos',
    note: 'Servicios, gestaciones y partos abiertos o cerrados atribuidos al galpón.',
    section: 'operacion',
    table: 'reproduction_cycles',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'text',
    countSql: 'SELECT count(*) AS n FROM reproduction_cycles WHERE barn_id = ?',
    rowsSql: `
      SELECT c.id, c.cycle_number, c.cycle_status, c.reproductive_status, c.cycle_opened_on,
             c.probable_farrowing_date, a.code AS female_code
      FROM reproduction_cycles c
      LEFT JOIN animals a ON a.id = c.female_animal_id
      WHERE c.barn_id = ? ORDER BY c.cycle_opened_on DESC LIMIT ?`,
    unit: 'ciclos',
    map: (r) => ({
      id: text(r.id),
      label: `Ciclo ${Number(r.cycle_number ?? 0)} de ${text(r.female_code) || 'ficha sin código'}`,
      meta: `${text(r.cycle_status)} · ${text(r.reproductive_status)} · parto probable ${day(r.probable_farrowing_date) ?? '—'}`,
      date: day(r.cycle_opened_on),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'litters',
    label: 'Camadas',
    note: 'Partos registrados con sus lechones vivos, nacidos muertos y destete.',
    section: 'operacion',
    table: 'litters',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'text',
    countSql: 'SELECT count(*) AS n FROM litters WHERE barn_id = ?',
    rowsSql: `
      SELECT id, parity_number, farrowing_date, live_count, stillborn_count,
             expected_weaning_date, actual_weaning_date
      FROM litters WHERE barn_id = ? ORDER BY farrowing_date DESC LIMIT ?`,
    unit: 'camadas',
    map: (r) => ({
      id: text(r.id),
      label: `Parto nº ${Number(r.parity_number ?? 0)}`,
      meta: `Vivos ${Number(r.live_count ?? 0)} · nacidos muertos ${Number(r.stillborn_count ?? 0)} · destete ${day(r.actual_weaning_date) ?? day(r.expected_weaning_date) ?? '—'}`,
      date: day(r.farrowing_date),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'litter_events',
    label: 'Eventos de camada',
    note: 'Destetes, muertes, descartes y ventas que tenían este galpón como destino.',
    section: 'operacion',
    table: 'litter_events',
    column: 'destination_barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM litter_events WHERE destination_barn_id = ?',
    rowsSql: `
      SELECT e.id, e.event_type, e.effective_date, e.sex, e.quantity, e.reason, l.id AS litter_id
      FROM litter_events e
      LEFT JOIN litters l ON l.id = e.litter_id
      WHERE e.destination_barn_id = ? ORDER BY e.effective_date DESC, e.id DESC LIMIT ?`,
    unit: 'eventos',
    map: (r) => ({
      id: text(r.id),
      label: LITTER_EVENT_LABEL[text(r.event_type)] ?? text(r.event_type),
      meta: `${text(r.sex)} · camada ${text(r.litter_id) || '—'} · ${text(r.reason)}`,
      date: day(r.effective_date),
      quantity: `${Number(r.quantity ?? 0)} cabezas`,
      payload: null,
    }),
  },
  {
    key: 'feed_movements',
    label: 'Movimientos de alimento',
    note: 'Entregas de almacén dirigidas a este galpón.',
    section: 'operacion',
    table: 'feed_movements',
    column: 'destination_barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM feed_movements WHERE destination_barn_id = ?',
    rowsSql: `
      SELECT id, movement_type, effective_date, feed_code, lot_code, quantity_kg,
             total_cost_minor, reason
      FROM feed_movements
      WHERE destination_barn_id = ? ORDER BY effective_date DESC, id DESC LIMIT ?`,
    unit: 'movimientos',
    map: (r) => ({
      id: text(r.id),
      label: FEED_LABEL[text(r.movement_type)] ?? text(r.movement_type),
      meta: `${text(r.feed_code)} · lote ${text(r.lot_code)} · ${text(r.reason)}`,
      date: day(r.effective_date),
      quantity: `${Number(r.quantity_kg ?? 0)} kg`,
      payload: null,
    }),
  },
  {
    key: 'feed_turns',
    label: 'Turnos de alimentación',
    note: 'Raciones planificadas y servidas por etapa en el galpón.',
    section: 'operacion',
    table: 'feed_turns',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM feed_turns WHERE barn_id = ?',
    rowsSql: `
      SELECT id, effective_date, shift_code, stage_code, feed_code, planned_kg, served_kg
      FROM feed_turns WHERE barn_id = ? ORDER BY effective_date DESC, id DESC LIMIT ?`,
    unit: 'turnos',
    map: (r) => ({
      id: text(r.id),
      label: `Turno ${text(r.shift_code)} · ${text(r.stage_code)}`,
      meta: `${text(r.feed_code)} · plan ${Number(r.planned_kg ?? 0)} kg · servido ${Number(r.served_kg ?? 0)} kg`,
      date: day(r.effective_date),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'health_events',
    label: 'Actuaciones sanitarias',
    note: 'Servicios sanitarios que incluyen fichas atendidas en este galpón.',
    section: 'operacion',
    table: 'health_event_animals',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM health_event_animals WHERE barn_id = ?',
    rowsSql: `
      SELECT ha.id, ha.animal_code_snapshot, ha.withdrawal_until, h.event_type, h.effective_date,
             h.product, h.cause_code
      FROM health_event_animals ha
      LEFT JOIN health_events h ON h.id = ha.health_event_id
      WHERE ha.barn_id = ? ORDER BY h.effective_date DESC, ha.id DESC LIMIT ?`,
    unit: 'registros',
    map: (r) => ({
      id: text(r.id),
      label: HEALTH_LABEL[text(r.event_type)] ?? text(r.event_type),
      meta: `${text(r.animal_code_snapshot)} · ${text(r.product) || 'sin producto'} · retiro ${day(r.withdrawal_until) ?? 'no'}`,
      date: day(r.effective_date),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'weights',
    label: 'Pesajes',
    note: 'Pesos tomados dentro del galpón. Se conservan aunque queden sin galpón.',
    section: 'operacion',
    table: 'animal_weights',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM animal_weights WHERE barn_id = ?',
    rowsSql: `
      SELECT w.id, w.weighed_on, w.weight_kg, w.stage_code, w.note, a.code AS animal_code
      FROM animal_weights w
      LEFT JOIN animals a ON a.id = w.animal_id
      WHERE w.barn_id = ? ORDER BY w.weighed_on DESC, w.id DESC LIMIT ?`,
    unit: 'pesajes',
    map: (r) => ({
      id: text(r.id),
      label: `Pesaje de ${text(r.animal_code) || 'ficha sin código'}`,
      meta: `${text(r.stage_code) || 'sin etapa'} · ${text(r.note) || 'sin nota'}`,
      date: day(r.weighed_on),
      quantity: `${Number(r.weight_kg ?? 0)} kg`,
      payload: null,
    }),
  },
  {
    key: 'location_history',
    label: 'Historial de ubicación',
    note: 'Intervalos de ubicación de cada ficha. La columna de galpón es obligatoria, así que solo admite reasignación.',
    section: 'operacion',
    table: 'animal_location_history',
    column: 'barn_id',
    nullable: false,
    cascade: false,
    actions: ['reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM animal_location_history WHERE barn_id = ?',
    rowsSql: `
      SELECT h.id, h.valid_from, h.valid_until, h.stage_code, h.location_code, h.lot_code,
             a.code AS animal_code
      FROM animal_location_history h
      LEFT JOIN animals a ON a.id = h.animal_id
      WHERE h.barn_id = ? ORDER BY h.valid_from DESC, h.id DESC LIMIT ?`,
    unit: 'intervalos',
    map: (r) => ({
      id: text(r.id),
      label: `Ubicación de ${text(r.animal_code) || 'ficha sin código'}`,
      meta: `${text(r.stage_code)} · ${text(r.location_code) || 'sin ubicación'} · hasta ${day(r.valid_until) ?? 'abierto'}`,
      date: day(r.valid_from),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'financial_allocations',
    label: 'Gastos e ingresos atribuidos',
    note: 'Reparto de asientos del libro financiero. Al desvincularlos el gasto sigue en el libro, solo deja de imputarse al galpón.',
    section: 'operacion',
    table: 'financial_allocations',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM financial_allocations WHERE barn_id = ?',
    rowsSql: `
      SELECT fa.id, fa.amount_minor, fa.animal_code_snapshot, fa.supply_code, fa.quantity,
             e.direction, e.category, e.concept, e.operation_date, e.currency_code
      FROM financial_allocations fa
      JOIN financial_entries e ON e.id = fa.entry_id
      WHERE fa.barn_id = ? ORDER BY e.operation_date DESC, fa.id DESC LIMIT ?`,
    unit: 'imputaciones',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.concept)} · ${text(r.category)}`,
      meta: `${text(r.direction) === 'income' ? 'Ingreso' : 'Egreso'} · ${text(r.animal_code_snapshot) || text(r.supply_code) || 'galpón'}`,
      date: day(r.operation_date),
      quantity: `${Number(r.amount_minor ?? 0) / 100} ${text(r.currency_code)}`,
      payload: null,
    }),
  },
  {
    key: 'alerts',
    label: 'Alertas',
    note: 'Ocurridos de alerta generados para el galpón, pendientes o ya atendidos.',
    section: 'operacion',
    table: 'alert_occurrences',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM alert_occurrences WHERE barn_id = ?',
    rowsSql: `
      SELECT id, alert_type, title, due_date, status, animal_code, resolution_reason
      FROM alert_occurrences WHERE barn_id = ? ORDER BY due_date DESC, id DESC LIMIT ?`,
    unit: 'alertas',
    map: (r) => ({
      id: text(r.id),
      label: `${ALERT_LABEL[text(r.alert_type)] ?? text(r.alert_type)} · ${text(r.title)}`,
      meta: `${text(r.status)} · ${text(r.animal_code) || 'sin ficha'}${text(r.resolution_reason) ? ` · ${text(r.resolution_reason)}` : ''}`,
      date: day(r.due_date),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'pens',
    label: 'Corrales del galpón',
    note: 'Se eliminan junto con el galpón; no arrastran registros de otros módulos.',
    section: 'config',
    table: 'barn_pens',
    column: 'barn_id',
    nullable: false,
    cascade: true,
    actions: ['delete'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM barn_pens WHERE barn_id = ?',
    rowsSql: 'SELECT id, code, name, capacity, created_at FROM barn_pens WHERE barn_id = ? ORDER BY code LIMIT ?',
    unit: 'corrales',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.code)} · ${text(r.name)}`,
      meta: `Capacidad ${Number(r.capacity ?? 0)}`,
      date: day(r.created_at),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'locations',
    label: 'Ubicaciones del catálogo',
    note: 'Versiones de ubicación declaradas dentro de este galpón. Al desvincularlas siguen en el catálogo, sin galpón.',
    section: 'config',
    table: 'location_versions',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM location_versions WHERE barn_id = ?',
    rowsSql: `
      SELECT id, code, name, location_type, status, effective_from
      FROM location_versions WHERE barn_id = ? ORDER BY code, effective_from DESC LIMIT ?`,
    unit: 'ubicaciones',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.code)} · ${text(r.name)}`,
      meta: `${text(r.location_type)} · ${text(r.status)}`,
      date: day(r.effective_from),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'feed_warehouses',
    label: 'Almacenes de alimento',
    note: 'Almacenes ubicados en este galpón. Al desvincularlos quedan como almacén sin galpón.',
    section: 'config',
    table: 'feed_warehouses',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach', 'reassign'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM feed_warehouses WHERE barn_id = ?',
    rowsSql: 'SELECT id, code, name, location, is_active, created_at FROM feed_warehouses WHERE barn_id = ? ORDER BY code LIMIT ?',
    unit: 'almacenes',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.code)} · ${text(r.name)}`,
      meta: `${text(r.location) || 'sin dirección'} · ${Number(r.is_active) === 1 ? 'activo' : 'inactivo'}`,
      date: day(r.created_at),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'team_history',
    label: 'Cambios de personal',
    note: 'Historial de responsable, operario y veterinario. Se elimina junto con el galpón, por eso no bloquea la eliminación.',
    section: 'asociados',
    table: 'barn_team_history',
    column: 'barn_id',
    nullable: false,
    cascade: true,
    actions: [],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM barn_team_history WHERE barn_id = ?',
    rowsSql: `
      SELECT h.id, h.role, h.valid_from, h.valid_until, h.reason, h.is_current,
             pu.name AS previous_name, nu.name AS new_name, au.name AS actor_name
      FROM barn_team_history h
      LEFT JOIN users pu ON pu.id = h.previous_user_id
      LEFT JOIN users nu ON nu.id = h.new_user_id
      LEFT JOIN users au ON au.id = h.changed_by_user_id
      WHERE h.barn_id = ? ORDER BY h.valid_from DESC, h.id DESC LIMIT ?`,
    unit: 'cambios',
    map: (r) => ({
      id: text(r.id),
      label: ROLE_LABEL[text(r.role)] ?? text(r.role),
      meta: `${text(r.previous_name) || '—'} → ${text(r.new_name)} · por ${text(r.actor_name)}${text(r.reason) ? ` · ${text(r.reason)}` : ''}`,
      date: day(r.valid_from),
      quantity: Number(r.is_current) === 1 ? 'vigente' : 'histórico',
      payload: null,
    }),
  },
  {
    key: 'user_access',
    label: 'Accesos de usuarios',
    note: 'Usuarios autorizados a ver el galpón. Se desvinculan con él y no pierden su cuenta.',
    section: 'asociados',
    table: 'user_barns',
    column: 'barn_id',
    nullable: false,
    cascade: true,
    actions: [],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM user_barns WHERE barn_id = ?',
    rowsSql: `
      SELECT ub.user_id AS id, u.name, u.username, u.role, ub.assigned_at
      FROM user_barns ub JOIN users u ON u.id = ub.user_id
      WHERE ub.barn_id = ? ORDER BY u.name LIMIT ?`,
    unit: 'usuarios',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.name)} (${text(r.username)})`,
      meta: text(r.role),
      date: day(r.assigned_at),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'operations',
    label: 'Operaciones registradas',
    note: 'Claves de reintento de todo lo que se escribió a nombre del galpón. Se conservan: solo dejan de apuntar al galpón.',
    section: 'trazabilidad',
    table: 'operation_log',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach'],
    idType: 'text',
    countSql: 'SELECT count(*) AS n FROM operation_log WHERE barn_id = ?',
    rowsSql: `
      SELECT o.id, o.operation_type, o.entity_type, o.effective_date, o.recorded_at, o.status,
             u.name AS actor
      FROM operation_log o
      LEFT JOIN users u ON u.id = o.author_user_id
      WHERE o.barn_id = ? ORDER BY o.recorded_at DESC LIMIT ?`,
    unit: 'operaciones',
    map: (r) => ({
      id: text(r.id),
      label: `${text(r.operation_type)} · ${text(r.entity_type)}`,
      meta: `${text(r.actor)} · ${text(r.status)}`,
      date: day(r.effective_date),
      quantity: null,
      payload: null,
    }),
  },
  {
    key: 'audit',
    label: 'Auditoría',
    note: 'Altas, correcciones y anulaciones con su autor y motivo. Se conservan: al desvincularlas quedan en el libro sin galpón, que es lo que corresponde cuando el galpón desaparece.',
    section: 'trazabilidad',
    table: 'audit_log',
    column: 'barn_id',
    nullable: true,
    cascade: false,
    actions: ['detach'],
    idType: 'int',
    countSql: 'SELECT count(*) AS n FROM audit_log WHERE barn_id = ?',
    rowsSql: `
      SELECT a.id, a.entity_type, a.entity_id, a.action, a.effective_date, a.recorded_at,
             a.reason, u.name AS actor
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.barn_id = ? ORDER BY a.recorded_at DESC, a.id DESC LIMIT ?`,
    unit: 'registros',
    map: (r) => ({
      id: text(r.id),
      label: `${AUDIT_ACTION_LABEL[text(r.action)] ?? text(r.action)} de ${text(r.entity_type)} ${text(r.entity_id)}`,
      meta: `${text(r.actor)} · ${text(r.reason)}`,
      date: day(r.effective_date),
      quantity: null,
      payload: null,
    }),
  },
];

const SECTION_ORDER: AssociationSection[] = ['animales', 'operacion', 'config', 'asociados', 'trazabilidad'];

const ROWS_PER_GROUP = 25;

const INT_ID_PATTERN = /^\d{1,12}$/;
const TEXT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

async function countOf(db: D1Database, def: GroupDef, barnId: number): Promise<number> {
  const row = await db.prepare(def.countSql).bind(barnId).first<Row>();
  return Number(row?.n ?? 0);
}

/** Desglose completo de lo que hay detrás de un galpón y qué se puede hacer con ello. */
export async function getBarnAssociations(
  db: D1Database,
  barnId: number,
  rowsPerGroup = ROWS_PER_GROUP,
): Promise<BarnAssociations> {
  const barn = await db.prepare('SELECT id, code, name, status FROM barns WHERE id = ?')
    .bind(barnId)
    .first<Row>();
  if (!barn) throw new ApiError(404, 'Galpón no encontrado');

  const limit = Math.min(Math.max(Number(rowsPerGroup) || ROWS_PER_GROUP, 1), 100);

  const groups = await Promise.all(GROUP_DEFS.map(async (def) => {
    const [count, res] = await Promise.all([
      countOf(db, def, barnId),
      db.prepare(def.rowsSql).bind(barnId, limit).all<Row>(),
    ]);
    const rows = (res.results ?? []).map(def.map);
    return {
      key: def.key,
      label: def.label,
      note: def.note,
      section: def.section,
      blocking: !def.cascade && count > 0,
      actions: def.actions,
      count,
      unit: def.unit,
      rows,
      hasMore: count > rows.length,
    } satisfies AssociationGroup;
  }));

  groups.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));

  const blockers = groups.filter((group) => group.blocking);
  return {
    barn: {
      id: Number(barn.id),
      code: text(barn.code),
      name: text(barn.name),
      status: text(barn.status) || 'preparacion',
    },
    groups,
    blockers: {
      count: blockers.length,
      groups: blockers.map((group) => group.key),
    },
    canDelete: blockers.length === 0,
  };
}

/** Filas que aún impiden eliminar el galpón, con su etiqueta legible. */
export async function describeBarnBlockers(db: D1Database, barnId: number): Promise<string[]> {
  const summary = await Promise.all(GROUP_DEFS.filter((def) => !def.cascade).map(async (def) => {
    const count = await countOf(db, def, barnId);
    return count > 0 ? `${def.label.toLowerCase()}: ${count} ${def.unit}` : null;
  }));
  return summary.filter((item): item is string => item !== null);
}

export interface ResolveAssociationInput {
  barnId: number;
  group: string;
  recordId: string;
  action: AssociationAction;
  targetBarnId?: unknown;
  reason?: unknown;
  operationKey?: string;
}

function findDef(group: string): GroupDef {
  const def = GROUP_DEFS.find((item) => item.key === group);
  if (!def) throw new ApiError(400, 'Tipo de registro no reconocido');
  return def;
}

function validateRecordId(def: GroupDef, recordId: string): number | string {
  const raw = String(recordId ?? '').trim();
  if (def.idType === 'int') {
    if (!INT_ID_PATTERN.test(raw)) throw new ApiError(400, 'Identificador de registro inválido');
    return Number(raw);
  }
  if (!TEXT_ID_PATTERN.test(raw)) throw new ApiError(400, 'Identificador de registro inválido');
  return raw;
}

/**
 * Aplica sobre una fila la acción que su grupo admite: reasignar a otro galpón,
 * desvincular conservando el registro, o eliminar cuando es solo configuración.
 */
export async function resolveBarnAssociation(
  db: D1Database,
  actorUserId: number,
  input: ResolveAssociationInput,
): Promise<{ ok: true; action: AssociationAction; group: string; replayed: boolean }> {
  const def = findDef(input.group);
  const action = input.action;

  if (!def.actions.includes(action)) {
    throw new ApiError(400, `${def.label} no admite esta acción. ${def.note}`);
  }
  if (action === 'detach' && !def.nullable) {
    throw new ApiError(400, `${def.label} no puede quedar sin galpón: la columna es obligatoria.`);
  }

  const recordId = validateRecordId(def, input.recordId);
  const reason = normalizeReason(input.reason, { required: true });
  const effectiveDate = currentFarmDate();

  let targetBarnId: number | null = null;
  if (action === 'reassign') {
    targetBarnId = Number(input.targetBarnId);
    if (!Number.isInteger(targetBarnId) || targetBarnId <= 0) {
      throw new ApiError(400, 'Seleccione el galpón destino');
    }
    if (targetBarnId === input.barnId) {
      throw new ApiError(400, 'El destino debe ser otro galpón');
    }
    const target = await db.prepare('SELECT id FROM barns WHERE id = ?').bind(targetBarnId).first();
    if (!target) throw new ApiError(404, 'El galpón destino no existe');
  }

  const owned = await db.prepare(`SELECT 1 AS ok FROM ${def.table} WHERE ${def.column} = ? AND id = ?`)
    .bind(input.barnId, recordId)
    .first<Row>();
  if (!owned) throw new ApiError(409, 'El registro ya no pertenece a este galpón o dejó de existir');

  const payload = {
    barnId: input.barnId,
    group: def.key,
    recordId: String(recordId),
    action,
    targetBarnId,
  };
  const existing = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (existing) return { ok: true, action, group: def.key, replayed: true };

  const statement = action === 'delete'
    ? db.prepare(`DELETE FROM ${def.table} WHERE id = ? AND ${def.column} = ?`).bind(recordId, input.barnId)
    : db.prepare(`UPDATE ${def.table} SET ${def.column} = ? WHERE id = ? AND ${def.column} = ?`)
      .bind(action === 'detach' ? null : targetBarnId, recordId, input.barnId);

  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: `barn.association.${action}`,
    authorUserId: actorUserId,
    entityType: 'barn_association',
    entityId: input.barnId,
    // Sin barn_id: la propia operación de limpieza no debe volver a bloquear el galpón.
    barnId: null,
    effectiveDate,
    payload,
    result: { group: def.key, recordId: String(recordId), action },
  });

  await commitOperation(db, claim, [statement], [{
    entityType: 'barn_association',
    entityId: input.barnId,
    action: action === 'delete' ? 'delete' : 'update',
    actorUserId,
    barnId: null,
    reason,
    previousData: { group: def.key, recordId: String(recordId), barnId: input.barnId },
    newData: { group: def.key, recordId: String(recordId), barnId: action === 'detach' ? null : targetBarnId },
    effectiveDate,
    recordedAt: claim.recordedAt,
  }]);

  return { ok: true, action, group: def.key, replayed: false };
}

export interface VacateInput {
  barnId: number;
  mode: 'detach' | 'reassign';
  targetBarnId?: unknown;
  reason?: unknown;
  operationKey?: string;
}

export interface VacateResult {
  ok: true;
  mode: 'detach' | 'reassign';
  affected: { group: string; label: string; count: number }[];
  skipped: { group: string; label: string; unit: string; count: number; why: string }[];
  pending: string[];
  replayed: boolean;
}

/**
 * Resuelve de una vez todos los registros del galpón que admiten la acción del modo.
 * El ganado vivo y el saldo del libro nunca se mueven por aquí: requieren traslado.
 */
export async function vacateBarn(
  db: D1Database,
  actorUserId: number,
  input: VacateInput,
): Promise<VacateResult> {
  const mode = input.mode === 'reassign' ? 'reassign' : 'detach';
  const reason = normalizeReason(input.reason, { required: true });
  const effectiveDate = currentFarmDate();

  let targetBarnId: number | null = null;
  if (mode === 'reassign') {
    targetBarnId = Number(input.targetBarnId);
    if (!Number.isInteger(targetBarnId) || targetBarnId <= 0) {
      throw new ApiError(400, 'Seleccione el galpón destino');
    }
    if (targetBarnId === input.barnId) throw new ApiError(400, 'El destino debe ser otro galpón');
    const target = await db.prepare('SELECT id FROM barns WHERE id = ?').bind(targetBarnId).first();
    if (!target) throw new ApiError(404, 'El galpón destino no existe');
  }

  const payload = { barnId: input.barnId, mode, targetBarnId };
  const existing = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (existing) return { ...(existing.result as VacateResult), replayed: true };

  const eligible = GROUP_DEFS.filter((def) => !def.cascade && !def.transferOnly
    && (mode === 'detach' ? def.nullable : def.actions.includes('reassign')));

  const counts = await Promise.all(eligible.map((def) => countOf(db, def, input.barnId)));
  const affected = eligible
    .map((def, index) => ({ group: def.key, label: def.label, count: counts[index] }))
    .filter((item) => item.count > 0);

  const skippedDefs = GROUP_DEFS.filter((def) => !def.cascade && def.transferOnly);
  const skippedCounts = await Promise.all(skippedDefs.map((def) => countOf(db, def, input.barnId)));
  const skipped = skippedDefs
    .map((def, index) => ({
      group: def.key,
      label: def.label,
      unit: def.unit,
      count: skippedCounts[index],
      why: 'Requiere un traslado: mueve fichas, saldos e historial de ubicación.',
    }))
    .filter((item) => item.count > 0);

  const statements: D1PreparedStatement[] = affected.map((item) => {
    const def = findDef(item.group);
    return db.prepare(`UPDATE ${def.table} SET ${def.column} = ? WHERE ${def.column} = ?`)
      .bind(mode === 'detach' ? null : targetBarnId, input.barnId);
  });

  const result: VacateResult = {
    ok: true,
    mode,
    affected,
    skipped,
    pending: skipped.map((item) => `${item.label.toLowerCase()}: ${item.count} ${item.unit}`),
    replayed: false,
  };

  if (statements.length === 0) return { ...result, replayed: false };

  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: `barn.vacate.${mode}`,
    authorUserId: actorUserId,
    entityType: 'barn_association',
    entityId: input.barnId,
    barnId: null,
    effectiveDate,
    payload,
    result,
  });

  await commitOperation(db, claim, statements, [{
    entityType: 'barn_association',
    entityId: input.barnId,
    action: 'update',
    actorUserId,
    barnId: null,
    reason,
    previousData: { barnId: input.barnId, mode, affected },
    newData: { mode, targetBarnId, affected },
    effectiveDate,
    recordedAt: claim.recordedAt,
  }]);

  return result;
}

export interface EvacuateInput {
  barnId: number;
  destinationBarnId?: unknown;
  reason?: unknown;
  operationKey?: string;
}

export interface EvacuateResult {
  ok: true;
  barnId: number;
  destinationBarnId: number;
  fichasTrasladadas: number;
  cabezasTrasladadas: number;
  fichasReasignadas: number;
  desvinculadas: { group: string; label: string; count: number }[];
  reasignadas: { group: string; label: string; count: number }[];
  replayed: boolean;
}

const keyToken = (value: string): string => value.replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 40);

/**
 * Vacía el galpón y lo elimina en una sola acción.
 *
 * El ganado vivo se mueve con traslados reales (nunca con un UPDATE de barn_id),
 * porque un traslado ajusta el saldo del libro y cierra el historial de ubicación.
 * Cada traslado es una operación propia y derivada de la clave del intento, así que
 * un corte a mitad de camino se reanuda sin duplicar movimientos. El historial
 * obligatorio pasa al destino y la trazabilidad que admite nulo se desvincula, de
 * modo que el libro de auditoría no se toca.
 */
export async function evacuateAndDeleteBarn(
  db: D1Database,
  actorUserId: number,
  input: EvacuateInput,
): Promise<EvacuateResult> {
  const reason = normalizeReason(input.reason, { required: true });
  const effectiveDate = currentFarmDate();

  const destinationBarnId = Number(input.destinationBarnId);
  if (!Number.isInteger(destinationBarnId) || destinationBarnId <= 0) {
    throw new ApiError(400, 'Seleccione el galpón destino');
  }
  if (destinationBarnId === input.barnId) throw new ApiError(400, 'El destino debe ser otro galpón');

  // Primero el reintento: un vaciado ya aplicado no puede confundirse con un galpón inexistente.
  const payload = { barnId: input.barnId, destinationBarnId, effectiveDate };
  const existing = await lookupExistingOperation(db, actorUserId, input.operationKey, payload);
  if (existing) return { ...(existing.result as EvacuateResult), replayed: true };

  const barn = await db.prepare('SELECT id, code, name FROM barns WHERE id = ?')
    .bind(input.barnId)
    .first<Row>();
  if (!barn) throw new ApiError(404, 'Galpón no encontrado');

  const destination = await db.prepare('SELECT id, name FROM barns WHERE id = ?')
    .bind(destinationBarnId)
    .first<Row>();
  if (!destination) throw new ApiError(404, 'El galpón destino no existe');

  const attemptKey = input.operationKey ?? `evac-auto-${crypto.randomUUID()}`;
  const subKey = (tag: string, identity: string) => `evac-${keyToken(attemptKey)}-${tag}-${keyToken(identity)}`.slice(0, 128);

  const liveFichas = await db.prepare(
    'SELECT code FROM animals WHERE barn_id = ? AND is_active = 1 AND exit_date IS NULL ORDER BY code LIMIT 2000',
  ).bind(input.barnId).all<Row>();
  const codes = (liveFichas.results ?? []).map((row) => text(row.code)).filter((code) => code.length > 0);
  for (const code of codes) {
    await transferAnimal(db, actorUserId, code, {
      destinationBarnId,
      effectiveDate,
      reason,
      operationKey: subKey('ficha', code),
    }, {});
  }

  const stockBuckets = await db.prepare(`
    SELECT stage_code, sex, location_code, lot_code,
      SUM(CASE WHEN movement_type IN ('sale','death','transfer_out') THEN -quantity ELSE quantity END) AS heads
    FROM inventory_movements
    WHERE barn_id = ?
    GROUP BY stage_code, sex, location_code, lot_code
    HAVING heads > 0
    ORDER BY heads DESC LIMIT 500
  `).bind(input.barnId).all<Row>();

  let headsMoved = 0;
  for (const bucket of stockBuckets.results ?? []) {
    const quantity = Number(bucket.heads ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    const stageCode = text(bucket.stage_code);
    const sex = text(bucket.sex);
    const locationCode = bucket.location_code === null || bucket.location_code === undefined
      ? null : text(bucket.location_code);
    const lotCode = bucket.lot_code === null || bucket.lot_code === undefined ? null : text(bucket.lot_code);
    // El destino recibe las cabezas sin ubicación ni lote: ambos códigos pertenecen
    // al galpón de origen y el traslado los rechazaría fuera de su galpón.
    await transferInventory(db, actorUserId, {
      effectiveDate,
      sourceBarnId: input.barnId,
      destinationBarnId,
      sourceLocationCode: locationCode,
      sourceLotCode: lotCode,
      destinationLocationCode: null,
      destinationLotCode: null,
      stageCode,
      sex,
      quantity,
      reason,
      operationKey: subKey('stock', `${stageCode}|${sex}|${locationCode ?? ''}|${lotCode ?? ''}`),
    }, {});
    headsMoved += quantity;
  }

  const leftovers = await Promise.all(GROUP_DEFS.filter((def) => def.transferOnly).map(async (def) => ({
    def,
    count: await countOf(db, def, input.barnId),
  })));
  const pending = leftovers
    .filter((item) => item.count > 0)
    .map((item) => `${item.def.label.toLowerCase()}: ${item.count} ${item.def.unit}`);
  if (pending.length > 0) {
    throw new ApiError(409, `No se pudo trasladar todo el ganado (${pending.join(', ')}). Los traslados ya registrados no se duplican; reintente la acción.`);
  }

  const closedFichas = await db.prepare(
    'SELECT count(*) AS n FROM animals WHERE barn_id = ?',
  ).bind(input.barnId).first<Row>();
  const fichasReasignadas = Number(closedFichas?.n ?? 0);

  const historyDefs = GROUP_DEFS.filter((def) => !def.cascade && !def.transferOnly);
  const historyCounts = await Promise.all(historyDefs.map((def) => countOf(db, def, input.barnId)));
  const desvinculadas = historyDefs
    .map((def, index) => ({ group: def.key, label: def.label, count: historyCounts[index] }))
    .filter((item, index) => item.count > 0 && historyDefs[index].nullable);
  const reasignadas = historyDefs
    .map((def, index) => ({ group: def.key, label: def.label, count: historyCounts[index] }))
    .filter((item, index) => item.count > 0 && !historyDefs[index].nullable);

  const result: EvacuateResult = {
    ok: true,
    barnId: input.barnId,
    destinationBarnId,
    fichasTrasladadas: codes.length,
    cabezasTrasladadas: headsMoved,
    fichasReasignadas,
    desvinculadas,
    reasignadas,
    replayed: false,
  };

  const statements: D1PreparedStatement[] = [
    ...desvinculadas.map((item) => {
      const def = findDef(item.group);
      return db.prepare(`UPDATE ${def.table} SET ${def.column} = NULL WHERE ${def.column} = ?`).bind(input.barnId);
    }),
    ...reasignadas.map((item) => {
      const def = findDef(item.group);
      return db.prepare(`UPDATE ${def.table} SET ${def.column} = ? WHERE ${def.column} = ?`).bind(destinationBarnId, input.barnId);
    }),
    db.prepare('UPDATE animals SET barn_id = ? WHERE barn_id = ?').bind(destinationBarnId, input.barnId),
    db.prepare('DELETE FROM user_barns WHERE barn_id = ?').bind(input.barnId),
    db.prepare('DELETE FROM barn_team_history WHERE barn_id = ?').bind(input.barnId),
    db.prepare('DELETE FROM barn_pens WHERE barn_id = ?').bind(input.barnId),
    db.prepare('DELETE FROM barns WHERE id = ?').bind(input.barnId),
  ];

  const claim = await createOperationClaim({
    operationKey: input.operationKey,
    operationType: 'barn.evacuate_and_delete',
    authorUserId: actorUserId,
    entityType: 'barn',
    entityId: input.barnId,
    barnId: null,
    effectiveDate,
    payload,
    result,
  });

  await commitOperation(db, claim, statements, [{
    entityType: 'barn',
    entityId: input.barnId,
    action: 'delete',
    actorUserId,
    barnId: null,
    reason,
    previousData: {
      barnId: input.barnId,
      code: text(barn.code),
      name: text(barn.name),
      fichasTrasladadas: codes.length,
      cabezasTrasladadas: headsMoved,
    },
    newData: {
      destinationBarnId,
      destinationName: text(destination.name),
      fichasReasignadas,
      desvinculadas,
      reasignadas,
    },
    effectiveDate,
    recordedAt: claim.recordedAt,
  }]);

  return result;
}
