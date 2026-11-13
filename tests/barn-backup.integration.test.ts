import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthFixture } from './health-test-helpers';
import worker from '../worker/index';
import { BARN_BACKUP_LIMITS, BARN_BACKUP_TABLES, exportBarnBackup, importBarnBackup } from '../worker/barn-backup';
import type { BarnBackup, BarnBackupRow } from '../src/types/barn-backup';
import { createOperationClaim, operationInsertStatement } from '../worker/events';

const now = '2026-08-01T12:00:00.000Z';
describe('Respaldo íntegro y restauración de galpones en D1 real', () => {
  let fixture: Awaited<ReturnType<typeof healthFixture>>;
  let db: D1Database;
  let sequence = 0;
  beforeAll(async () => { fixture = await healthFixture('barn-backup-integration'); db = fixture.db; });
  afterAll(async () => { await fixture.runtime.dispose(); });

  async function richBarn() {
    const prefix = `BB-${++sequence}`;
    const created = await fixture.api('/api/admin/barns', { code: prefix, name: `Respaldo ${prefix}`, capacity: 200 });
    expect(created.status).toBe(201);
    const barnId = (await created.json() as { barn: { id: number } }).barn.id;
    let id = barnId * 100000;
    const actor = (await db.prepare("SELECT id FROM users WHERE role='administrador'").first<{ id: number }>())!.id;
    async function insert(table: string, values: BarnBackupRow) {
      const entries = Object.entries(values);
      await db.prepare(`INSERT INTO ${table} (${entries.map(([k]) => k).join(',')}) VALUES (${entries.map(() => '?').join(',')})`).bind(...entries.map(([, v]) => v)).run();
      return values.id as number;
    }
    const op = async (tag: string, barn = barnId) => {
      const claim = await createOperationClaim({ operationKey: `${prefix}-${tag}-operation`, operationType: tag, authorUserId: actor, entityType: tag, barnId: barn, payload: { tag }, result: { ok: true } });
      await operationInsertStatement(db, claim).run();
      return claim.id;
    };
    const animal = async (tag: string, barn = barnId, extras: BarnBackupRow = {}) => {
      const animalId = ++id;
      await insert('animals', { id: animalId, code: `${prefix}-${tag}`, animal_type: 'cerda', sex: 'hembra', origin_type: 'inicial', entry_date: '2026-01-01', entry_stage_code: 'gestacion', current_stage_code: 'gestacion', barn_id: barn,
        created_by_user_id: actor, created_at: now, updated_at: now, ...extras });
      return animalId;
    };
    const sow = await animal('sow');
    const boar = await animal('boar', barnId, { animal_type: 'verraco', sex: 'macho' });
    const closed = await animal('closed', barnId, { is_active: 0, status: 'vendido', exit_date: '2026-07-01', exit_type: 'sale' });
    const external = await animal('external', 2, { mother_id: sow, father_id: boar });
    const unrelated = await animal('unrelated', 2);
    await insert('user_barns', { user_id: actor, barn_id: barnId, assigned_at: now });
    const history = ++id;
    await insert('barn_team_history', { id: history, barn_id: barnId, role: 'responsable', new_user_id: actor, valid_from: '2026-01-01', valid_until: '2026-02-01', changed_by_user_id: actor, created_at: now, is_current: 0 });
    const correction = ++id;
    await insert('barn_team_history', { id: correction, barn_id: barnId, role: 'responsable', previous_user_id: actor, new_user_id: actor, valid_from: '2026-02-01', changed_by_user_id: actor, created_at: now, corrects_history_id: history, reason: 'Corrección histórica' });
    await db.prepare('UPDATE barn_team_history SET superseded_by_id=? WHERE id=?').bind(correction, history).run();
    await insert('barn_pens', { id: ++id, barn_id: barnId, code: `${prefix}-P`, name: 'Corral', created_at: now });
    const root = `${prefix}-root`, child = `${prefix}-child`;
    await insert('location_versions', { id: ++id, code: root, name: 'Raíz', location_type: 'galpon', barn_id: barnId, effective_from: '2026-01-01', created_at: now, created_by_user_id: actor });
    // Hijo legado sin barn_id: no se borra, pero forma parte del respaldo físico.
    await insert('location_versions', { id: ++id, code: child, name: 'Hijo', location_type: 'corral', parent_code: root, effective_from: '2026-01-01', created_at: now });
    await db.prepare('UPDATE animals SET location_code=? WHERE id=?').bind(child, sow).run();
    await insert('animal_tags', { id: ++id, animal_id: closed, tag: `${prefix}-old`, valid_from: '2026-01-01', valid_to: '2026-02-01', is_current: 0, created_by_user_id: actor, created_at: now });
    await insert('animal_tags', { id: ++id, animal_id: closed, tag: `${prefix}-current`, valid_from: '2026-02-01', created_by_user_id: actor, created_at: now });
    await insert('animal_type_history', { id: ++id, animal_id: closed, animal_type: 'cerda', valid_from: '2026-01-01', created_by_user_id: actor, created_at: now });
    const weight = ++id;
    await insert('animal_weights', { id: weight, animal_id: closed, weighed_on: '2026-01-01', weight_kg: 80.5, barn_id: barnId, recorded_by_user_id: actor, created_at: now });
    await insert('animal_weights', { id: ++id, animal_id: external, weighed_on: '2026-01-02', weight_kg: 82, barn_id: 2, corrects_weight_id: weight, recorded_by_user_id: actor, created_at: now });
    await insert('animal_location_history', { id: ++id, animal_id: closed, barn_id: barnId, stage_code: 'engorde', valid_from: '2026-01-01', valid_until: '2026-07-01', operation_log_id: await op('location'), created_by_user_id: actor, created_at: now });
    const cycle = async (tag: string, female: number, barn: number, number: number) => {
      const key = `${prefix}-${tag}`;
      await insert('reproduction_cycles', { id: key, female_animal_id: female, cycle_number: number, cycle_status: 'closed', reproductive_status: 'empty', cycle_opened_on: '2026-01-01', gestation_days: 114, probable_farrowing_date: '2026-04-25', barn_id: barn, created_by_user_id: actor, created_at: now, updated_at: now });
      return key;
    };
    const ownCycle = await cycle('cycle', sow, barnId, 1);
    const transitiveCycle = await cycle('transitive-cycle', sow, 2, 2);
    const externalCycle = await cycle('external-cycle', external, 2, 1);
    const litter = async (tag: string, c: string, female: number, barn: number, parity: number) => {
      const key = `${prefix}-${tag}`;
      await insert('litters', { id: key, cycle_id: c, female_animal_id: female, parity_number: parity, farrowing_date: '2026-04-25', barn_id: barn, male_alive: 5, female_alive: 4, unsexed_alive: 1, male_stillborn: 1, female_stillborn: 0, unsexed_stillborn: 0, live_count: 10, stillborn_count: 1, total_born: 11, historical_only: 1, actual_weaning_date: '2026-05-20', created_by_user_id: actor, created_at: now });
      return key;
    };
    const ownLitter = await litter('litter', ownCycle, sow, barnId, 1);
    const transitiveLitter = await litter('transitive-litter', transitiveCycle, sow, 2, 2);
    const externalLitter = await litter('external-litter', externalCycle, external, 2, 1);
    await db.prepare('UPDATE animals SET litter_id=? WHERE id IN (?,?)').bind(ownLitter, closed, external).run();
    const service = ++id;
    await insert('reproduction_services', { id: service, cycle_id: ownCycle, service_number: 1, service_date: '2026-01-01', service_type: 'monta_natural', sire_animal_id: boar, material_source: 'internal', created_by_user_id: actor, created_at: now });
    await insert('reproduction_services', { id: ++id, cycle_id: externalCycle, service_number: 1, service_date: '2026-01-01', service_type: 'monta_natural', sire_animal_id: boar, material_source: 'internal', created_by_user_id: actor, created_at: now });
    await insert('reproduction_events', { id: ++id, cycle_id: ownCycle, service_id: service, event_type: 'closed', event_date: '2026-05-20', created_by_user_id: actor, created_at: now });
    await insert('reproduction_weaning_plans', { id: ++id, cycle_id: ownCycle, reference_weaning_date: '2026-05-20', heat_interval_days: 5, first_repeat_interval_days: 21, second_repeat_interval_days: 21, expected_heat_date: '2026-05-25', expected_first_repeat_date: '2026-06-15', expected_second_repeat_date: '2026-07-06', created_by_user_id: actor, updated_at: now });
    const adoptionOp = await op('adoption');
    await insert('litter_events', { id: ++id, operation_log_id: adoptionOp, litter_id: ownLitter, destination_litter_id: externalLitter, event_type: 'adoption_out', effective_date: '2026-05-01', sex: 'hembra', quantity: 1, reason: 'Adopción entre galpones', created_by_user_id: actor, created_at: now });
    await insert('litter_events', { id: ++id, operation_log_id: adoptionOp, litter_id: externalLitter, destination_litter_id: ownLitter, event_type: 'adoption_in', effective_date: '2026-05-01', sex: 'hembra', quantity: 1, reason: 'Adopción entre galpones', created_by_user_id: actor, created_at: now });
    await insert('litter_identified_adoptions', { id: ++id, operation_log_id: adoptionOp, animal_id: closed, source_litter_id: ownLitter, target_litter_id: externalLitter, effective_date: '2026-05-01' });
    await insert('litter_corrections', { id: ++id, litter_id: transitiveLitter, operation_log_id: await op('litter-correction'), reason: 'Corrección histórica', previous_data: '{"maleAlive":4}', new_data: '{"maleAlive":5}', effective_date: '2026-05-02', actor_user_id: actor, created_at: now });
    const movement = async (tag: string, barn: number, extras: BarnBackupRow = {}) => {
      const key = ++id;
      await insert('inventory_movements', { id: key, operation_log_id: await op(tag, barn), movement_type: 'initial', effective_date: '2026-01-01', barn_id: barn, stage_code: 'engorde', sex: 'hembra', quantity: 5, created_by_user_id: actor, created_at: now, ...extras });
      return key;
    };
    const initial = await movement('inventory-initial', barnId, { animal_id: closed, litter_id: ownLitter });
    const adjustment = await movement('inventory-adjustment', barnId, { movement_type: 'adjustment', quantity: 1 });
    await insert('inventory_reconciliations', { id: ++id, operation_log_id: await op('reconcile'), barn_id: barnId, stage_code: 'engorde', sex: 'hembra', effective_date: '2026-01-02', expected_heads: 5, counted_heads: 6, variance: 1, adjustment_movement_id: adjustment, created_by_user_id: actor, created_at: now });
    const externalMovement = await movement('external-inventory', 2, { animal_id: external, litter_id: ownLitter, reverses_movement_id: initial });
    await movement('collective-transfer-out', barnId, { movement_type: 'transfer_out', quantity: 2, transfer_group_id: `${prefix}-transfer` });
    const externalTransfer = await movement('collective-transfer-in', 2, { movement_type: 'transfer_in', quantity: 2, transfer_group_id: `${prefix}-transfer` });
    const health = ++id;
    await insert('health_events', { id: health, operation_log_id: await op('health'), event_type: 'death', effective_date: '2026-06-01', product: 'Producto', inventory_movement_id: initial, created_by_user_id: actor, created_at: now });
    await db.prepare('UPDATE inventory_movements SET health_event_id=? WHERE id=?').bind(health, initial).run();
    for (const [animalId, barn] of [[closed, barnId], [external, 2]]) await insert('health_event_animals', { id: ++id, health_event_id: health, animal_id: animalId, animal_code_snapshot: `${prefix}-${animalId}`, barn_id: barn, barn_name_snapshot: `Galpón ${barn}`, stage_code_snapshot: 'engorde', withdrawal_until: '2026-06-10' });
    const secondHealth = ++id;
    await insert('health_events', { id: secondHealth, operation_log_id: await op('second-health'), event_type: 'treatment', effective_date: '2026-05-01', product: 'Vacuna', created_by_user_id: actor, created_at: now });
    await insert('health_event_animals', { id: ++id, health_event_id: secondHealth, animal_id: closed, animal_code_snapshot: `${prefix}-closed`, barn_id: barnId, barn_name_snapshot: prefix, stage_code_snapshot: 'engorde' });
    // El enlace sanitario de un movimiento externo también se desvincula al borrar H.
    await db.prepare('UPDATE inventory_movements SET health_event_id=? WHERE id=?').bind(secondHealth, externalMovement).run();
    const rule = ++id;
    await insert('vaccine_rules', { id: rule, rule_key: `${prefix}-rule`, version: 1, vaccine_name: 'Vacuna', target_category: 'cerda_multipara', base_event: 'farrowing', effective_from: '2026-01-01', created_by_user_id: actor, created_at: now });
    await insert('vaccine_occurrences', { id: ++id, rule_key: `${prefix}-rule`, rule_version_id: rule, animal_id: closed, animal_code_snapshot: `${prefix}-closed`, animal_type_snapshot: 'cerda', target_category_snapshot: 'cerda_multipara', source_event_type: 'farrowing', source_event_id: ownLitter, source_date: '2026-04-25', vaccine_name_snapshot: 'Vacuna', scheduled_date: '2026-05-01', status: 'applied', applied_date: '2026-05-01', application_health_event_id: secondHealth, created_by_user_id: actor, created_at: now, updated_at: now });
    // Otra ocurrencia se borra por pertenecer al grupo sanitario, no por su animal.
    await insert('vaccine_occurrences', { id: ++id, animal_id: external, animal_code_snapshot: `${prefix}-external`, animal_type_snapshot: 'cerda', target_category_snapshot: 'cerda_multipara', source_event_type: 'manual', source_event_id: prefix, source_date: '2026-04-25', vaccine_name_snapshot: 'Otra vacuna', scheduled_date: '2026-05-01', status: 'applied', applied_date: '2026-05-01', application_health_event_id: health, created_by_user_id: actor, created_at: now, updated_at: now });
    const externalOnly = await animal('alert-external', 2);
    const externalOccurrence = ++id;
    await insert('vaccine_occurrences', { id: externalOccurrence, animal_id: externalOnly, animal_code_snapshot: `${prefix}-alert-external`, animal_type_snapshot: 'cerda', target_category_snapshot: 'cerda_multipara', source_event_type: 'manual', source_event_id: `${prefix}-manual`, source_date: '2026-04-25', vaccine_name_snapshot: 'Vacuna externa referenciada', scheduled_date: '2026-05-01', is_manual: 1, created_by_user_id: actor, created_at: now, updated_at: now });
    await insert('alert_occurrences', { id: ++id, alert_key: `${prefix}-external-alert`, alert_type: 'vaccine', source_type: 'vaccine_occurrence', source_id: String(externalOccurrence), due_date: '2026-05-01', due_bucket: 'overdue', title: 'Alerta histórica externa', detail_json: '{}', barn_id: barnId, animal_code: `${prefix}-alert-external`, status: 'attended', linked_event_type: 'health_event', linked_event_id: String(health), created_by_user_id: actor, created_at: now, updated_at: now });
    const warehouse = ++id;
    await insert('feed_warehouses', { id: warehouse, code: `${prefix}-warehouse`, name: 'Almacén propio', barn_id: barnId, created_by_user_id: actor, created_at: now });
    const feed = async (tag: string, warehouseId: number, type: string, delta: number, destination: number | null, extras: BarnBackupRow = {}) => {
      const key = ++id;
      await insert('feed_movements', { id: key, operation_log_id: await op(tag), warehouse_id: warehouseId, movement_type: type, effective_date: '2026-01-01', feed_code: 'engorde', lot_code: prefix, quantity_kg: Math.abs(delta), stock_delta_kg: delta, unit_cost_minor: 200, total_cost_minor: Math.abs(delta) * 200, destination_barn_id: destination, reason: 'Movimiento de alimento', created_by_user_id: actor, created_at: now, ...extras });
      return key;
    };
    const purchase = await feed('feed-purchase', warehouse, 'purchase', 100, null);
    await feed('feed-return', warehouse, 'return_supplier', -10, null, { reverses_movement_id: purchase });
    await feed('feed-opening-shared', 1, 'opening', 80, null);
    const delivery = await feed('feed-delivery', 1, 'delivery', -5, barnId, { animal_id: closed });
    await feed('feed-other-delivery', 1, 'delivery', -7, 2, { animal_id: external });
    await insert('feed_turns', { id: ++id, operation_log_id: await op('feed-turn'), feed_movement_id: delivery, effective_date: '2026-01-01', shift_code: 'manana', barn_id: barnId, stage_code: 'engorde', feed_code: 'engorde', lot_code: prefix, planned_kg: 6, served_kg: 5, consumed_kg: 4, created_by_user_id: actor, created_at: now });
    const planOp = await op('feed.plan');
    await db.prepare('UPDATE operation_log SET payload=?,result_payload=? WHERE id=?').bind(JSON.stringify({ groupKey: `${prefix}-plan`, barnId }), JSON.stringify({ id: id + 1, barnId, plannedKg: 8 }), planOp).run();
    const entry = ++id;
    await insert('financial_entries', { id: entry, operation_log_id: await op('finance'), direction: 'expense', category: 'Alimento', concept: 'Compra compartida', operation_date: '2026-01-01', amount_minor: 10000, currency_code: 'PEN', source_type: 'feed_purchase', source_id: String(purchase), created_by_user_id: actor, created_at: now });
    const allocation = ++id;
    await insert('financial_allocations', { id: allocation, entry_id: entry, barn_id: barnId, animal_id: closed, barn_name_snapshot: prefix, amount_minor: 6000, created_at: now });
    const externalAllocation = ++id;
    await insert('financial_allocations', { id: externalAllocation, entry_id: entry, barn_id: 2, animal_id: external, amount_minor: 4000, created_at: now });
    const settlement = ++id;
    await insert('financial_settlements', { id: settlement, operation_log_id: await op('settlement'), financial_entry_id: entry, settlement_date: '2026-01-02', amount_minor: 5000, payment_method: 'Efectivo', created_by_user_id: actor, created_at: now });
    for (const [a, amount] of [[allocation, 3000], [externalAllocation, 2000]]) await insert('financial_settlement_allocations', { id: ++id, settlement_id: settlement, financial_allocation_id: a, amount_minor: amount });
    const reversal = ++id;
    await insert('financial_entries', { id: reversal, operation_log_id: await op('finance-reversal'), direction: 'income', category: 'Anulación', concept: 'Reversión documentada', operation_date: '2026-07-01', amount_minor: 10000, currency_code: 'PEN', reversal_of_id: entry, created_by_user_id: actor, created_at: now });
    await db.prepare('UPDATE financial_entries SET reversed_at=? WHERE id=?').bind(now, entry).run();
    await insert('financial_allocations', { id: ++id, entry_id: reversal, barn_id: barnId, amount_minor: 6000, created_at: now });
    await insert('financial_allocations', { id: ++id, entry_id: reversal, barn_id: 2, amount_minor: 4000, created_at: now });
    const alert = ++id;
    await insert('alert_occurrences', { id: alert, alert_key: prefix, alert_type: 'manual', source_type: 'manual', source_id: prefix, due_date: '2026-08-01', due_bucket: 'today', title: 'Alerta histórica', detail_json: '{}', barn_id: barnId, status: 'resolved', created_by_user_id: actor, created_at: now, updated_at: now });
    // Reutiliza una regla global sin exportarla como dato importable.
    let escalationRule = (await db.prepare("SELECT id FROM alert_escalation_rules WHERE alert_type='manual'").first<{ id: number }>())?.id;
    if (!escalationRule) { escalationRule = ++id; await insert('alert_escalation_rules', { id: escalationRule, alert_type: 'manual', overdue_days: 2, created_by_user_id: actor, created_at: now, updated_at: now }); }
    await insert('alert_escalations', { id: ++id, alert_occurrence_id: alert, rule_id: escalationRule, overdue_days: 3, escalated_at: now });
    await insert('alert_notifications', { id: ++id, notification_key: prefix, user_id: actor, alert_occurrence_id: alert, transition: 'critical', priority: 'critical', title: 'Notificación', body: 'Aviso histórico', action_url: '/alertas', created_at: now, read_at: now });
    await insert('audit_log', { id: ++id, operation_log_id: planOp, entity_type: 'feed_plan', entity_id: id, action: 'correct', actor_user_id: actor, barn_id: barnId, reason: 'Historial del plan', previous_data: '{"plannedKg":5}', new_data: '{"plannedKg":8}', effective_date: '2026-01-01', recorded_at: now });
    return { barnId, actor, closed, external, unrelated, externalOnly, externalOccurrence, externalTransfer, entry, allocation, initial, delivery, history, insert, prefix };
  }

  async function getBackup(barnId: number) {
    const response = await fixture.api(`/api/admin/barns/${barnId}/backup`);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    return response.json() as Promise<BarnBackup>;
  }
  async function remove(barnId: number) {
    const response = await fixture.api(`/api/admin/barns/${barnId}/evacuate-and-delete`, { destinationBarnId: null, reason: 'Borrado para comprobar restauración completa', operationKey: `delete-backup-${barnId}` });
    expect(response.status, await response.clone().text()).toBe(200);
  }
  const restore = (backup: BarnBackup, key = `restore-backup-${backup.barnId}`) => fixture.api('/api/admin/barns/import-backup', { backup, operationKey: key, reason: 'Restauración integral de respaldo verificado' });
  async function checkRows(backup: BarnBackup) {
    for (const container of [backup.tables, backup.references]) for (const [table, rows] of Object.entries(container)) for (const row of rows) {
      const pk = table === 'user_barns' ? ['user_id', 'barn_id'] : ['id'];
      const stored = await db.prepare(`SELECT ${Object.keys(row).join(',')} FROM ${table} WHERE ${pk.map(c => `${c}=?`).join(' AND ')}`).bind(...pk.map(c => row[c])).first();
      expect(stored, `${table} ${JSON.stringify(pk.map(c => row[c]))}`).toEqual(row);
    }
  }
  const totals = async () => db.batch([
    db.prepare('SELECT SUM(amount_minor) AS total FROM financial_entries'),
    db.prepare('SELECT SUM(amount_minor) AS total FROM financial_settlements'),
    db.prepare('SELECT SUM(stock_delta_kg) AS total FROM feed_movements'),
    db.prepare("SELECT SUM(CASE WHEN movement_type IN ('sale','death','transfer_out') THEN -quantity ELSE quantity END) AS total FROM inventory_movements"),
  ]).then(results => results.map(r => (r.results[0] as { total: number }).total));

  it('roundtrip de TODOS los módulos, cerrados, genealogía, ciclos FK, adopciones, stock y documentos compartidos, sin doble gasto', async () => {
    const f = await richBarn();
    const before = await totals();
    const backup = await getBackup(f.barnId);
    expect(Object.keys(backup.tables).sort()).toEqual([...BARN_BACKUP_TABLES].sort());
    for (const table of BARN_BACKUP_TABLES) expect(backup.tables[table].length, table).toBeGreaterThan(0);
    expect(backup.tables.animals.some(r => r.id === f.closed && r.exit_date !== null)).toBe(true);
    expect(backup.references.animals.some(r => r.id === f.external)).toBe(true);
    expect(backup.references.animals.some(r => r.id === f.unrelated)).toBe(false);
    expect(backup.references.animals.some(r => r.id === f.externalOnly)).toBe(true);
    expect(backup.references.vaccine_occurrences.some(r => r.id === f.externalOccurrence)).toBe(true);
    expect(backup.references.inventory_movements.some(r => r.id === f.externalTransfer)).toBe(true);
    expect(backup.references.users[0]).not.toHaveProperty('password_hash');
    expect(backup.references.users[0]).not.toHaveProperty('password_salt');
    for (const forbidden of ['users', 'sessions', 'login_attempts', 'catalog_versions', 'vaccine_rules', 'report_definitions', 'financial_cash_openings', 'alert_escalation_recipients']) expect(backup.tables).not.toHaveProperty(forbidden);
    await remove(f.barnId);
    expect(await db.prepare('SELECT barn_id,animal_id FROM financial_allocations WHERE id=?').bind(f.allocation).first()).toEqual({ barn_id: null, animal_id: null });
    expect(await db.prepare('SELECT mother_id,father_id,litter_id FROM animals WHERE id=?').bind(f.external).first()).toEqual({ mother_id: null, father_id: null, litter_id: null });
    const restored = await restore(backup);
    expect(restored.status, await restored.clone().text()).toBe(201);
    expect(await restored.json()).toMatchObject({ barnId: f.barnId, code: f.prefix, name: `Respaldo ${f.prefix}`, replayed: false });
    await checkRows(backup);
    expect(await totals()).toEqual(before);
    const replay = await restore(backup);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ barnId: f.barnId, replayed: true });
    expect(await totals()).toEqual(before);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM operation_log WHERE operation_type='barn.backup.import' AND entity_id=?").bind(f.barnId).first<{ n: number }>())!.n).toBe(1);
    const again = await restore(backup, `another-restore-${f.barnId}`);
    expect(again.status).toBe(409);
    const changedReason = await fixture.api('/api/admin/barns/import-backup', { backup, operationKey: `restore-backup-${f.barnId}`, reason: 'Otro motivo reutilizando la clave' });
    expect(changedReason.status).toBe(409);
  }, 120000);

  it('rechaza filas compartidas modificadas y dependencias faltantes sin sobreescribir ni crear un galpón parcial', async () => {
    const f = await richBarn(), backup = await getBackup(f.barnId);
    await remove(f.barnId);
    await db.prepare("UPDATE financial_entries SET concept='Modificado después de exportar' WHERE id=?").bind(f.entry).run();
    const response = await restore(backup);
    expect(response.status).toBe(409);
    expect(await response.text()).toMatch(/financial_entries.*concept/);
    expect(await db.prepare('SELECT id FROM barns WHERE id=?').bind(f.barnId).first()).toBeNull();
    expect(await db.prepare('SELECT barn_id FROM financial_allocations WHERE id=?').bind(f.allocation).first()).toEqual({ barn_id: null });
    await db.prepare("UPDATE financial_entries SET concept='Compra compartida' WHERE id=?").bind(f.entry).run();
    await db.prepare("UPDATE animals SET alias='Modificado en otro galpón' WHERE id=?").bind(f.external).run();
    const externalChanged = await restore(backup);
    expect(externalChanged.status).toBe(409);
    expect(await externalChanged.text()).toMatch(/animals.*alias/);
    expect(await db.prepare('SELECT mother_id FROM animals WHERE id=?').bind(f.external).first()).toEqual({ mother_id: null });
    await db.prepare('UPDATE animals SET alias=NULL WHERE id=?').bind(f.external).run();
    const ref = backup.references.vaccine_rules[0];
    await db.prepare('DELETE FROM vaccine_rules WHERE id=?').bind(ref.id).run();
    const missing = await restore(backup);
    expect(missing.status).toBe(409);
    expect(await missing.text()).toMatch(/dependencia externa vaccine_rules/);
    expect(await db.prepare('SELECT id FROM barns WHERE id=?').bind(f.barnId).first()).toBeNull();
  }, 120000);

  it('rollback del batch por carrera de modificación, IDs/códigos ocupados y claves concurrentes', async () => {
    const f = await richBarn(), backup = await getBackup(f.barnId);
    await remove(f.barnId);
    // Colisión única tardía: el PK no está ocupado, pero el arete vigente sí.
    const tag = backup.tables.animal_tags.find(r => r.is_current === 1)!;
    await f.insert('animal_tags', { id: f.barnId * 100000 + 90000, animal_id: f.unrelated, tag: tag.tag, valid_from: '2026-07-01', created_by_user_id: f.actor, created_at: now });
    const response = await restore(backup);
    expect(response.status).toBe(409);
    expect(await db.prepare('SELECT id FROM barns WHERE id=?').bind(f.barnId).first()).toBeNull();
    expect(await db.prepare('SELECT id FROM animals WHERE id=?').bind(f.closed).first()).toBeNull();
    expect(await db.prepare('SELECT barn_id FROM financial_allocations WHERE id=?').bind(f.allocation).first()).toEqual({ barn_id: null });
    expect(await db.prepare("SELECT id FROM operation_log WHERE operation_type='barn.backup.import' AND entity_id=?").bind(f.barnId).first()).toBeNull();
    await db.prepare('DELETE FROM animal_tags WHERE animal_id=?').bind(f.unrelated).run();
    // Carrera después de SELECTs previos pero antes del batch: el guard compara TODA la fila.
    let injected = false;
    const raced = new Proxy(db, { get(target, property) {
      if (property !== 'batch') { const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value; }
      return async (statements: D1PreparedStatement[]) => {
        if (!injected && statements.some(s => String((s as unknown as { statement?: string }).statement).includes('PRAGMA defer_foreign_keys'))) {
          injected = true;
          await target.prepare("UPDATE financial_entries SET concept='Cambio concurrente' WHERE id=?").bind(f.entry).run();
        }
        return target.batch(statements);
      };
    } });
    await expect(importBarnBackup(raced, f.actor, { backup, operationKey: `race-restore-${f.barnId}`, reason: 'Restauración con carrera controlada' })).rejects.toMatchObject({ status: 409 });
    expect(injected).toBe(true);
    expect(await db.prepare('SELECT id FROM barns WHERE id=?').bind(f.barnId).first()).toBeNull();
    await db.prepare("UPDATE financial_entries SET concept='Compra compartida' WHERE id=?").bind(f.entry).run();
    const [first, second] = await Promise.all([restore(backup), restore(backup)]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect((await first.json() as { barnId: number }).barnId).toBe(f.barnId);
    expect((await second.json() as { barnId: number }).barnId).toBe(f.barnId);
    await checkRows(backup);
  }, 120000);

  it('valida esquema, tipos, PKs, alcance, huella, asignaciones y límites; no silencia FK faltantes', async () => {
    const f = await richBarn(), backup = await getBackup(f.barnId);
    const tamper = async (change: (b: BarnBackup) => void, pattern: RegExp) => {
      const copy = structuredClone(backup); change(copy);
      const res = await restore(copy);
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(pattern);
    };
    await tamper(b => { b.tables.sessions = []; }, /Tabla no permitida/);
    await tamper(b => { b.tables.animals[0].evil_column = 'x'; }, /Columnas incompatibles/);
    await tamper(b => { b.tables.animals[0].barn_id = '3'; }, /INTEGER/);
    await tamper(b => { b.tables.animals.push(b.tables.animals[0]); }, /duplicada/);
    await tamper(b => { b.tables.user_barns[0].barn_id = 2; }, /alcance|dependencia/);
    await tamper(b => { b.references.users = []; }, /Falta dependencia/);
    await tamper(b => { b.tables.animals[0].alias = 'Respaldo manipulado'; }, /alterado/);
    await tamper(b => { b.tables.user_barns[0].assigned_at = '2030-01-01'; }, /alterado/);
    const extraUsername = `${f.prefix}-extra@test.local`.toLowerCase();
    expect((await fixture.api('/api/admin/users', { username: extraUsername, password: 'PasswordPrueba2026!', name: 'Usuario ajeno', role: 'operario' })).status).toBe(201);
    const extraUser = (await db.prepare('SELECT id,username,role,is_active,created_at FROM users WHERE username=?').bind(extraUsername).first<BarnBackupRow>())!;
    await tamper(b => { b.references.users.push(extraUser); b.tables.user_barns.push({ user_id: extraUser.id, barn_id: f.barnId, assigned_at: now }); }, /alterado/);
    expect(await db.prepare('SELECT user_id FROM user_barns WHERE user_id=? AND barn_id=?').bind(extraUser.id, f.barnId).first()).toBeNull();
    const incompatible = structuredClone(backup); incompatible.manifest.schemaHash = 'a'.repeat(64);
    expect((await restore(incompatible)).status).toBe(409);
    const huge = structuredClone(backup); huge.tables.animals = Array.from({ length: BARN_BACKUP_LIMITS.rows + 1 }, () => backup.tables.animals[0]);
    expect((await restore(huge)).status).toBe(413);
    const missingKey = await fixture.api('/api/admin/barns/import-backup', { backup, reason: 'Debe exigir clave de reintento' });
    expect(missingKey.status).toBe(400);
    expect(await db.prepare('SELECT id FROM barns WHERE id=?').bind(f.barnId).first()).not.toBeNull();
  }, 120000);

  it('rutas admin autenticadas, CSRF, JSON inválido, tamaño declarado y constancia misma granja', async () => {
    for (const [path, method] of [['/api/admin/barns/1/backup', 'GET'], ['/api/admin/barns/import-backup', 'POST']]) {
      const response = await worker.fetch(new Request(`http://localhost${path}`, { method }), { DB: db });
      expect(response.status).toBe(401);
    }
    const user = await fixture.api('/api/admin/users', { username: 'backup-operator@test.local', password: 'PasswordPrueba2026!', name: 'Operario', role: 'operario' });
    expect(user.status).toBe(201);
    const login = await fixture.api('/api/auth/login', { username: 'backup-operator@test.local', password: 'PasswordPrueba2026!' });
    const token = (await login.json() as { token: string }).token;
    for (const [path, method] of [['/api/admin/barns/1/backup', 'GET'], ['/api/admin/barns/import-backup', 'POST']]) {
      const response = await worker.fetch(new Request(`http://localhost${path}`, { method, headers: { Authorization: `Bearer ${token}` } }), { DB: db });
      expect(response.status).toBe(403);
    }
    const f = await richBarn(), backup = await getBackup(f.barnId);
    await remove(f.barnId);
    await db.prepare('DELETE FROM audit_log WHERE operation_log_id=?').bind(backup.manifest.exportOperationId).run();
    await db.prepare('DELETE FROM operation_log WHERE id=?').bind(backup.manifest.exportOperationId).run();
    const missing = await restore(backup);
    expect(missing.status).toBe(409);
    expect(await missing.text()).toMatch(/constancia de exportación/);
    expect((await fixture.api('/api/admin/barns/99999999/backup')).status).toBe(404);
    expect((await fixture.api('/api/admin/barns/1junk/backup')).status).toBe(404);
    expect((await fixture.api('/api/admin/barns/1/backup', {}, 'POST')).status).toBe(404);
    // Lectura limitada no requiere la autenticación para probarla aisladamente.
    const { readBarnBackupRequest } = await import('../worker/barn-backup');
    await expect(readBarnBackupRequest(new Request('http://localhost', { method: 'POST', body: '{broken' }))).rejects.toMatchObject({ status: 400 });
    await expect(readBarnBackupRequest(new Request('http://localhost', { method: 'POST', headers: { 'Content-Length': String(BARN_BACKUP_LIMITS.requestBytes + 1) }, body: '{}' }))).rejects.toMatchObject({ status: 413 });
    await expect(readBarnBackupRequest(new Request('http://localhost', { method: 'POST', body: ' '.repeat(BARN_BACKUP_LIMITS.requestBytes + 1) }))).rejects.toMatchObject({ status: 413 });
    const envelope = { backup: { data: 'a'.repeat(BARN_BACKUP_LIMITS.bytes - 100) }, reason: 'Restauración de prueba', operationKey: 'backup-test-envelope' };
    await expect(readBarnBackupRequest(new Request('http://localhost', { method: 'POST', body: JSON.stringify(envelope) }))).resolves.toEqual(envelope);
    const csrf = await worker.fetch(new Request('http://localhost/api/admin/barns/import-backup', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }), { DB: db });
    expect(csrf.status).toBe(403);
  }, 120000);

  it('rechaza ID/código ocupado, usuarios y configuración modificados; replay si el primer intento termina durante la lectura', async () => {
    const f = await richBarn(), backup = await getBackup(f.barnId);
    await remove(f.barnId);
    await f.insert('barns', { id: f.barnId, code: `${f.prefix}-otro`, name: 'ID reutilizado', created_at: now });
    expect((await restore(backup)).status).toBe(409);
    expect(await db.prepare('SELECT code FROM barns WHERE id=?').bind(f.barnId).first()).toEqual({ code: `${f.prefix}-otro` });
    await db.prepare('DELETE FROM barns WHERE id=?').bind(f.barnId).run();
    await f.insert('barns', { id: f.barnId + 1000, code: f.prefix, name: 'Código reutilizado', created_at: now });
    expect((await restore(backup)).status).toBe(409);
    await db.prepare('DELETE FROM barns WHERE id=?').bind(f.barnId + 1000).run();
    await f.insert('animals', { id: f.closed, code: `${f.prefix}-ocupado`, animal_type: 'lechon', sex: 'macho', origin_type: 'inicial', entry_date: '2026-01-01', entry_stage_code: 'engorde', current_stage_code: 'engorde', barn_id: 2, created_by_user_id: f.actor, created_at: now, updated_at: now });
    const occupied = await restore(backup);
    expect(occupied.status).toBe(409);
    expect(await occupied.text()).toMatch(/ID ocupado en animals/);
    await db.prepare('DELETE FROM animals WHERE id=?').bind(f.closed).run();
    const stage = backup.references.stage_versions[0];
    await db.prepare("UPDATE stage_versions SET name='Configuración cambiada' WHERE id=?").bind(stage.id).run();
    const configChanged = await restore(backup);
    expect(configChanged.status).toBe(409);
    expect(await configChanged.text()).toMatch(/stage_versions.*name/);
    await db.prepare('UPDATE stage_versions SET name=? WHERE id=?').bind(stage.name, stage.id).run();
    const user = backup.references.users.find(r => r.id === f.actor)!;
    await db.prepare("UPDATE users SET username='identidad-reutilizada@test.local' WHERE id=?").bind(f.actor).run();
    const userChanged = await restore(backup);
    expect(userChanged.status).toBe(409);
    expect(await userChanged.text()).toMatch(/users.*username/);
    await db.prepare('UPDATE users SET username=? WHERE id=?').bind(user.username, f.actor).run();
    let injected = false;
    const key = `staggered-replay-${f.barnId}`;
    const staggered = new Proxy(db, { get(target, property) {
      if (property !== 'batch') { const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value; }
      return async (statements: D1PreparedStatement[]) => {
        if (!injected && statements.some(s => String((s as unknown as { statement?: string }).statement).includes('json_each(?)'))) {
          injected = true;
          await importBarnBackup(target, f.actor, { backup, operationKey: key, reason: 'Restauración concurrente escalonada' });
        }
        return target.batch(statements);
      };
    } });
    const replay = await importBarnBackup(staggered, f.actor, { backup, operationKey: key, reason: 'Restauración concurrente escalonada' });
    expect(injected).toBe(true);
    expect(replay).toMatchObject({ barnId: f.barnId, replayed: true });
    await checkRows(backup);
  }, 120000);

  it('no trunca más de 2000 fichas cerradas y restaura padres compartidos ausentes', async () => {
    const created = await fixture.api('/api/admin/barns', { code: 'BB-LARGE', name: 'Historial grande', capacity: 9999 });
    const barnId = (await created.json() as { barn: { id: number } }).barn.id;
    const actor = (await db.prepare("SELECT id FROM users WHERE role='administrador'").first<{ id: number }>())!.id;
    await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2005)
      INSERT INTO animals(code,animal_type,sex,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,is_active,status,exit_date,exit_type,created_by_user_id,created_at,updated_at)
      SELECT 'BB-LARGE-'||x,'lechon','macho','inicial','2026-01-01','engorde','engorde',?,0,'vendido','2026-07-01','sale',?,?,? FROM n`).bind(barnId, actor, now, now).run();
    const plan = await createOperationClaim({ operationKey: 'large-backup-feed-plan', operationType: 'feed.plan', authorUserId: actor, entityType: 'feed_plan', barnId, payload: { barnId, plannedKg: 20 }, result: { barnId, plannedKg: 20 } });
    await operationInsertStatement(db, plan).run();
    const backup = await exportBarnBackup(db, actor, barnId);
    expect(backup.tables.animals).toHaveLength(2005);
    await remove(barnId);
    // operation_log es un padre de negocio: puede recrearse si está ausente e intacto en el snapshot.
    const operation = backup.tables.operation_log[0];
    await db.prepare('DELETE FROM audit_log WHERE operation_log_id=?').bind(operation.id).run();
    await db.prepare('DELETE FROM operation_log WHERE id=?').bind(operation.id).run();
    const restored = await restore(backup);
    expect(restored.status, await restored.clone().text()).toBe(201);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM animals WHERE barn_id=?').bind(barnId).first<{ n: number }>())!.n).toBe(2005);
    expect(await db.prepare('SELECT id FROM operation_log WHERE id=?').bind(operation.id).first()).toEqual({ id: operation.id });
  }, 120000);
});
