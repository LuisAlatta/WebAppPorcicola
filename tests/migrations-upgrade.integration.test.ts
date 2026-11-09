import { readFile, readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';

const runtime = new Miniflare({ workers: [{
  config: {
    name: 'migration-upgrade-test',
    compatibilityDate: '2026-07-01',
    manifest: {
      mainModule: 'index.js',
      modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
      modulesRoot: '/',
    },
    env: { DB: { type: 'd1', id: 'migration-upgrade-database' } },
  },
}] });

afterAll(async () => runtime.dispose());

async function applyMigration(db: D1Database, name: string) {
  const sql = (await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    .replace(/^\s*--.*$/gm, '')
    .replace(/\s+/g, ' ');
  let trigger = '';

  for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) {
    if (trigger || /^CREATE TRIGGER/i.test(statement)) {
      trigger += `${statement}; `;
      if (/\bEND$/i.test(statement)) {
        await db.prepare(trigger.trim()).run();
        trigger = '';
      }
    } else {
      await db.prepare(statement).run();
    }
  }

  if (trigger) throw new Error(`Trigger incompleto en ${name}`);
}

async function seedOperation(db: D1Database, id: string, operationKey: string, type: string, entityType: string, entityId: number | null) {
  await db.prepare(`INSERT INTO operation_log
    (id,operation_key,operation_type,author_user_id,entity_type,entity_id,barn_id,content_hash,payload,result_payload,effective_date,recorded_at)
    VALUES(?,?,?,1,?,?,1,?,'{}','{}','2026-11-01','2026-11-01T12:00:00.000Z')`)
    .bind(id, operationKey, type, entityType, entityId, 'hash-'.concat(id)).run();
}

describe('Actualización de esquema desde 0001–0005', () => {
  it('aplica 0006–0025 sin perder datos legados ni romper relaciones', async () => {
    const db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');
    const migrationNames = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter(name => /^\d+.*\.sql$/.test(name))
      .sort();

    expect(migrationNames).toHaveLength(25);

    for (const name of migrationNames.slice(0, 5)) await applyMigration(db, name);

    await db.prepare(`INSERT INTO users
      (id,username,name,role,password_hash,password_salt,created_at,updated_at)
      VALUES(1,'upgrade-admin@granja.test','Admin legado','administrador','hash-admin','salt-admin','2025-12-01','2025-12-01'),
            (2,'upgrade-responsable@granja.test','Responsable legado','responsable','hash-resp','salt-resp','2025-12-01','2025-12-01'),
            (3,'upgrade-operario@granja.test','Operario legado','operario','hash-op','salt-op','2025-12-01','2025-12-01')`).run();
    await db.prepare(`INSERT INTO barns(id,code,name,capacity,created_at)
      VALUES(1,'GAL-A','Galpón A',120,'2025-12-01'),(2,'GAL-B','Galpón B',90,'2025-12-01')`).run();
    await db.prepare(`INSERT INTO user_barns(user_id,barn_id,assigned_at)
      VALUES(1,1,'2025-12-01'),(1,2,'2025-12-01'),(2,1,'2025-12-01'),(3,1,'2025-12-01')`).run();

    for (const [id, role, person] of [[1, 'responsable', 2], [2, 'operario', 3]] as const) {
      await db.prepare(`INSERT INTO barn_team_history
        (id,barn_id,role,previous_user_id,new_user_id,valid_from,valid_until,changed_by_user_id,created_at)
        VALUES(?,1,?,NULL,?,'2025-12-01',NULL,1,'2025-12-01')`).bind(id, role, person).run();
    }

    await seedOperation(db, 'legacy-inventory-open', 'legacy-open', 'inventory.initial', 'inventory_movement', 1);
    await db.prepare(`INSERT INTO inventory_movements
      (id,operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,notes,created_by_user_id,created_at)
      VALUES(1,'legacy-inventory-open','initial','2025-12-01',1,'corral_maternidad','lote_levante_a','levante','macho',12,'Saldo legado ficticio',1,'2025-12-01T12:00:00.000Z')`).run();

    const applied: string[] = [...migrationNames.slice(0, 5)];
    for (const name of migrationNames.slice(5)) {
      try {
        await applyMigration(db, name);
      } catch (error) {
        throw new Error(`Falló la migración ${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      applied.push(name);

      if (name.startsWith('0006_')) {
        await db.prepare(`INSERT INTO animals
          (id,code,animal_type,sex,birth_date,origin_type,entry_date,entry_stage_code,current_stage_code,barn_id,location_code,lot_code,created_by_user_id,created_at,updated_at)
          VALUES(1,'UPG-0001','lechon','macho','2025-10-01','inicial','2025-12-01','levante','levante',1,'corral_maternidad','lote_levante_a',1,'2025-12-01T12:00:00.000Z','2025-12-01T12:00:00.000Z')`).run();
        await db.prepare(`INSERT INTO animal_tags(animal_id,tag,valid_from,created_by_user_id,created_at)
          VALUES(1,'UPG-TAG-1','2025-12-01',1,'2025-12-01T12:00:00.000Z')`).run();
        await db.prepare(`INSERT INTO animal_type_history(animal_id,animal_type,valid_from,reason,created_by_user_id,created_at)
          VALUES(1,'lechon','2025-12-01','Alta sintética de migración',1,'2025-12-01T12:00:00.000Z')`).run();
        await db.prepare(`INSERT INTO animal_weights(animal_id,weighed_on,weight_kg,stage_code,barn_id,location_code,lot_code,recorded_by_user_id,created_at)
          VALUES(1,'2025-12-01',18,'levante',1,'corral_maternidad','lote_levante_a',1,'2025-12-01T12:00:00.000Z')`).run();
        await seedOperation(db, 'legacy-individual-entry', 'legacy-animal', 'animal.create', 'animal', 1);
        await db.prepare(`INSERT INTO inventory_movements
          (operation_log_id,movement_type,effective_date,barn_id,location_code,lot_code,stage_code,sex,quantity,animal_id,notes,created_by_user_id,created_at)
          VALUES('legacy-individual-entry','purchase','2025-12-01',1,'corral_maternidad','lote_levante_a','levante','macho',1,1,'Ficha individual sintética',1,'2025-12-01T12:00:00.000Z')`).run();
      }

      if (name.startsWith('0013_')) {
        await seedOperation(db, 'legacy-feed-purchase', 'legacy-feed', 'feed.purchase', 'feed_movement', 1);
        await db.prepare(`INSERT INTO feed_movements
          (id,operation_log_id,warehouse_id,movement_type,effective_date,feed_code,lot_code,supplier,quantity_kg,stock_delta_kg,unit_cost_minor,total_cost_minor,reason,created_by_user_id,created_at)
          VALUES(1,'legacy-feed-purchase',1,'purchase','2025-12-01','preinicio','UPG-FOOD-1','Proveedor sintético',25,25,1000,25000,'Compra previa a la actualización',1,'2025-12-01T12:00:00.000Z')`).run();
      }

      if (name.startsWith('0017_')) {
        await seedOperation(db, 'legacy-finance-entry', 'legacy-finance', 'finance.entry.create', 'financial_entry', 1001);
        await db.prepare(`INSERT INTO financial_entries
          (id,operation_log_id,direction,category,concept,operation_date,amount_minor,currency_code,counterparty,created_by_user_id,created_at)
          VALUES(1001,'legacy-finance-entry','expense','Alimento','Compra previa a la actualización','2025-12-01',25000,'PEN','Proveedor sintético',1,'2025-12-01T12:00:00.000Z')`).run();
        await db.prepare(`INSERT INTO financial_allocations
          (id,entry_id,barn_id,barn_name_snapshot,amount_minor,animal_id,animal_code_snapshot,lot_code,quantity,created_at)
          VALUES(1001,1001,1,'Galpón A',25000,1,'UPG-0001','UPG-FOOD-1',25,'2025-12-01T12:00:00.000Z')`).run();
      }

      if (name.startsWith('0021_')) {
        await db.prepare(`INSERT INTO alert_occurrences
          (id,alert_key,alert_type,source_type,source_id,due_date,due_bucket,title,detail_json,barn_id,barn_name_snapshot,status,created_by_user_id,created_at,updated_at)
          VALUES(1001,'manual:upgrade-1','manual','manual','upgrade-1','2025-12-02','upcoming','Aviso legado','{"reason":"Conservar migrando"}',1,'Galpón A','pending',2,'2025-12-01T12:00:00.000Z','2025-12-01T12:00:00.000Z')`).run();
      }
    }

    expect(applied).toEqual(migrationNames);
    expect(await db.prepare('SELECT id,username,role FROM users ORDER BY id').all()).toMatchObject({ results: [
      { id: 1, username: 'upgrade-admin@granja.test', role: 'administrador' },
      { id: 2, username: 'upgrade-responsable@granja.test', role: 'responsable' },
      { id: 3, username: 'upgrade-operario@granja.test', role: 'operario' },
    ] });
    expect(await db.prepare('SELECT id,code,name FROM barns ORDER BY id').all()).toMatchObject({ results: [
      { id: 1, code: 'GAL-A', name: 'Galpón A' },
      { id: 2, code: 'GAL-B', name: 'Galpón B' },
    ] });
    expect(await db.prepare(`SELECT h.barn_id,h.role,h.new_user_id,h.is_current,u.username
      FROM barn_team_history h JOIN users u ON u.id=h.new_user_id ORDER BY h.id`).all()).toMatchObject({ results: [
      { barn_id: 1, role: 'responsable', new_user_id: 2, is_current: 1, username: 'upgrade-responsable@granja.test' },
      { barn_id: 1, role: 'operario', new_user_id: 3, is_current: 1, username: 'upgrade-operario@granja.test' },
    ] });
    expect(await db.prepare(`SELECT animal_id,barn_id,location_code,lot_code,stage_code,valid_from,valid_until
      FROM animal_location_history WHERE animal_id=1`).first()).toMatchObject({
      animal_id: 1, barn_id: 1, location_code: 'corral_maternidad', lot_code: 'lote_levante_a', stage_code: 'levante', valid_from: '2025-12-01', valid_until: null,
    });
    expect(await db.prepare('SELECT id,operation_log_id,movement_type,quantity,animal_id FROM inventory_movements ORDER BY id').all()).toMatchObject({ results: [
      { id: 1, operation_log_id: 'legacy-inventory-open', movement_type: 'initial', quantity: 12, animal_id: null },
      { id: 2, operation_log_id: 'legacy-individual-entry', movement_type: 'purchase', quantity: 1, animal_id: 1 },
    ] });
    expect(await db.prepare('SELECT animal_id,weight_kg,weighed_time FROM animal_weights').all()).toMatchObject({ results: [
      { animal_id: 1, weight_kg: 18, weighed_time: '12:00' },
    ] });
    expect(await db.prepare('SELECT id,amount_minor,currency_code,source_type,source_id,reversal_of_id FROM financial_entries WHERE id=1001').first()).toMatchObject({
      id: 1001, amount_minor: 25000, currency_code: 'PEN', source_type: null, source_id: null, reversal_of_id: null,
    });
    expect(await db.prepare('SELECT id,warehouse_id,movement_type,quantity_kg,total_cost_minor,currency_code,reverses_movement_id FROM feed_movements WHERE id=1').first()).toMatchObject({
      id: 1, warehouse_id: 1, movement_type: 'purchase', quantity_kg: 25, total_cost_minor: 25000, currency_code: 'PEN', reverses_movement_id: null,
    });
    expect(await db.prepare('SELECT id,alert_key,alert_type,title,status,notification_created_at FROM alert_occurrences WHERE id=1001').first()).toMatchObject({
      id: 1001, alert_key: 'manual:upgrade-1', alert_type: 'manual', title: 'Aviso legado', status: 'pending', notification_created_at: null,
    });
    expect(await db.prepare(`SELECT value FROM farm_setting_versions WHERE setting_key='timezone' AND effective_from='2026-01-01'`).first()).toEqual({ value: 'America/Lima' });
    expect((await db.prepare('SELECT COUNT(*) AS count FROM report_definitions').first<{ count: number }>())?.count).toBe(0);
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  }, 60000);
});
