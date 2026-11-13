import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'barn-associations-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'barn-associations-db' } },
    },
  }],
});

async function migrate(db: D1Database) {
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
    let trigger = '';
    for (const part of sql.split(';').map((item) => item.trim()).filter(Boolean)) {
      if (trigger || /^CREATE TRIGGER/i.test(part)) {
        trigger += `${part}; `;
        if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
      } else await db.prepare(part).run();
    }
    if (trigger) throw new Error(`Trigger incompleto: ${file}`);
  }
}

interface AssociationGroup {
  key: string;
  blocking: boolean;
  actions: string[];
  count: number;
  rows: { id: string; label: string }[];
}

interface AssociationsResponse {
  barn: { id: number; name: string };
  groups: AssociationGroup[];
  blockers: { count: number; groups: string[] };
  canDelete: boolean;
  error?: string;
}

interface EvacuateResult {
  ok: true;
  mode: 'transfer' | 'delete';
  barnId: number;
  destinationBarnId: number | null;
  fichasTrasladadas: number;
  cabezasTrasladadas: number;
  fichasReasignadas: number;
  fichasEliminadas: number;
  cabezasEliminadas: number;
  desvinculadas: { group: string; label: string; count: number }[];
  reasignadas: { group: string; label: string; count: number }[];
  eliminadas: { group: string; label: string; count: number }[];
  replayed: boolean;
}

const group = (payload: AssociationsResponse, key: string): AssociationGroup => {
  const found = payload.groups.find((item) => item.key === key);
  if (!found) throw new Error(`Grupo no devuelto: ${key}`);
  return found;
};

describe('Datos asociados al galpón · CFG-06', () => {
  let db: D1Database;
  let adminToken: string;
  let adminId: number;

  const api = (path: string, init: { method?: string; body?: Record<string, unknown> } = {}) => worker.fetch(
    new Request(`http://localhost${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
    { DB: db },
  );

  const createBarn = async (code: string, name: string) => {
    const res = await api('/api/admin/barns', { body: { code, name, capacity: 80 } });
    expect(res.status).toBe(201);
    return (await res.json() as { barn: { id: number } }).barn.id;
  };

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');
    await migrate(db);

    const bootstrap = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin-asoc@granja.test', password: 'Asociadas2026!', name: 'Administrador Asociadas' }),
    }), { DB: db });
    expect(bootstrap.status).toBe(201);
    const data = await bootstrap.json() as { token: string; user: { id: number } };
    adminToken = data.token;
    adminId = data.user.id;
  });

  afterAll(async () => { await runtime.dispose(); });

  it('distingue lo que se elimina en cascada de lo que bloquea, y desvincular la auditoría libera el galpón', async () => {
    const barnId = await createBarn('G-AS1', 'Galpón con trazabilidad');
    const now = new Date().toISOString();

    await db.batch([
      db.prepare('INSERT INTO barn_pens (barn_id, code, name, capacity, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(barnId, 'C-1', 'Corral 1', 10, now),
      db.prepare(`INSERT INTO barn_team_history (barn_id, role, new_user_id, valid_from, changed_by_user_id, created_at, is_current)
        VALUES (?, 'responsable', ?, '2026-01-05', ?, ?, 1)`).bind(barnId, adminId, adminId, now),
      db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, actor_user_id, barn_id, reason, effective_date, recorded_at)
        VALUES ('barn', ?, 'update', ?, ?, 'Alta de responsable', '2026-01-05', ?)`)
        .bind(barnId, adminId, barnId, now),
    ]);

    const first = await api(`/api/admin/barns/${barnId}/associations`) as Response;
    expect(first.status).toBe(200);
    const view = await first.json() as AssociationsResponse;

    // Cascada: se van con el galpón, no lo bloquean.
    expect(group(view, 'pens').blocking).toBe(false);
    expect(group(view, 'team_history').blocking).toBe(false);
    expect(group(view, 'team_history').actions).toEqual([]);

    // Trazabilidad: bloquea y solo admite desvincular.
    const audit = group(view, 'audit');
    expect(audit.blocking).toBe(true);
    expect(audit.count).toBe(1);
    expect(audit.actions).toEqual(['detach']);
    expect(view.canDelete).toBe(false);
    expect(view.blockers.groups).toEqual(['audit']);

    // El borrado sigue protegido mientras quede auditoría apuntando al galpón.
    const blocked = await api(`/api/admin/barns/${barnId}`, { method: 'DELETE' });
    expect(blocked.status).toBe(409);
    expect((await blocked.json() as { error: string }).error).toMatch(/auditoría/i);

    const detached = await api(`/api/admin/barns/${barnId}/associations/resolve`, {
      body: { group: 'audit', recordId: audit.rows[0].id, action: 'detach', reason: 'El galpón se cierra y su trazabilidad se conserva', operationKey: 'asoc-detach-0001' },
    });
    expect(detached.status).toBe(200);

    const kept = await db.prepare('SELECT id, barn_id, entity_type, entity_id, reason FROM audit_log WHERE id = ?')
      .bind(Number(audit.rows[0].id)).first<{ id: number; barn_id: number | null; entity_type: string; entity_id: number; reason: string }>();
    expect(kept?.barn_id).toBeNull();
    expect(kept?.entity_type).toBe('barn');
    expect(kept?.entity_id).toBe(barnId);

    const second = await api(`/api/admin/barns/${barnId}/associations`);
    const after = await second.json() as AssociationsResponse;
    expect(after.canDelete).toBe(true);
    expect(after.blockers.count).toBe(0);

    const removed = await api(`/api/admin/barns/${barnId}`, { method: 'DELETE' });
    expect(removed.status).toBe(200);

    const cascade = await db.batch([
      db.prepare('SELECT count(*) AS n FROM barn_pens WHERE barn_id = ?').bind(barnId),
      db.prepare('SELECT count(*) AS n FROM barn_team_history WHERE barn_id = ?').bind(barnId),
    ]);
    expect(Number((cascade[0] as { results: { n: number }[] }).results[0].n)).toBe(0);
    expect(Number((cascade[1] as { results: { n: number }[] }).results[0].n)).toBe(0);
  });

  it('un movimiento de cabezas solo se resuelve reasignando, nunca desvinculando', async () => {
    const sourceId = await createBarn('G-AS2', 'Galpón con libro');
    const targetId = await createBarn('G-AS3', 'Galpón destino');
    const now = new Date().toISOString();

    await db.prepare(`INSERT INTO inventory_movements (movement_type, effective_date, barn_id, stage_code, sex, quantity, created_by_user_id, created_at)
      VALUES ('purchase', '2026-02-01', ?, 'engorde', 'hembra', 12, ?, ?)`).bind(sourceId, adminId, now).run();

    const view = await (await api(`/api/admin/barns/${sourceId}/associations`)).json() as AssociationsResponse;
    const movements = group(view, 'inventory_movements');
    expect(movements.blocking).toBe(true);
    expect(movements.actions).toEqual(['reassign']);
    expect(group(view, 'stock').count).toBe(12);

    const refused = await api(`/api/admin/barns/${sourceId}/associations/resolve`, {
      body: { group: 'inventory_movements', recordId: movements.rows[0].id, action: 'detach', reason: 'Intento de desvincular', operationKey: 'asoc-detach-0002' },
    });
    expect(refused.status).toBe(400);

    const withoutTarget = await api(`/api/admin/barns/${sourceId}/associations/resolve`, {
      body: { group: 'inventory_movements', recordId: movements.rows[0].id, action: 'reassign', reason: 'Reasignar sin destino', operationKey: 'asoc-target-0002' },
    });
    expect(withoutTarget.status).toBe(400);

    const detachedAll = await api(`/api/admin/barns/${sourceId}/vacate`, {
      body: { mode: 'detach', reason: 'Desvincular lo que admite quedar sin galpón', operationKey: 'asoc-vacate-0002' },
    });
    expect(detachedAll.status).toBe(200);
    const detachResult = await detachedAll.json() as { affected: { group: string }[]; skipped: { group: string; count: number }[] };
    expect(detachResult.affected.map((item) => item.group)).not.toContain('inventory_movements');
    expect(detachResult.skipped.map((item) => item.group)).toEqual(['stock']);
    expect(detachResult.skipped[0].count).toBe(12);

    const reassigned = await api(`/api/admin/barns/${sourceId}/vacate`, {
      body: { mode: 'reassign', targetBarnId: targetId, reason: 'El libro del galpón mal creado pasa al correcto', operationKey: 'asoc-vacate-0003' },
    });
    expect(reassigned.status).toBe(200);
    const reassignResult = await reassigned.json() as { affected: { group: string; count: number }[] };
    expect(reassignResult.affected.find((item) => item.group === 'inventory_movements')?.count).toBe(1);

    const moved = await db.prepare('SELECT barn_id FROM inventory_movements WHERE barn_id IN (?, ?)').bind(sourceId, targetId).all<{ barn_id: number }>();
    expect((moved.results ?? []).map((row) => row.barn_id)).toEqual([targetId]);

    const afterView = await (await api(`/api/admin/barns/${sourceId}/associations`)).json() as AssociationsResponse;
    expect(afterView.canDelete).toBe(true);

    const replay = await api(`/api/admin/barns/${sourceId}/vacate`, {
      body: { mode: 'reassign', targetBarnId: targetId, reason: 'El libro del galpón mal creado pasa al correcto', operationKey: 'asoc-vacate-0003' },
    });
    expect(((await replay.json()) as { replayed: boolean }).replayed).toBe(true);
  });

  it('vaciar y eliminar en una sola acción traslada el saldo, resuelve el historial y cierra el galpón', async () => {
    const sourceId = await createBarn('G-AS6', 'Galpón por cerrar');
    const targetId = await createBarn('G-AS7', 'Galpón receptor');
    const now = new Date().toISOString();

    await db.batch([
      db.prepare(`INSERT INTO inventory_movements (movement_type, effective_date, barn_id, stage_code, sex, quantity, created_by_user_id, created_at)
        VALUES ('purchase', '2026-02-01', ?, 'engorde', 'hembra', 12, ?, ?)`).bind(sourceId, adminId, now),
      db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, actor_user_id, barn_id, reason, effective_date, recorded_at)
        VALUES ('barn', ?, 'update', ?, ?, 'Alta del galpón', '2026-02-01', ?)`)
        .bind(sourceId, adminId, sourceId, now),
    ]);

    const refused = await api(`/api/admin/barns/${sourceId}`, { method: 'DELETE' });
    expect(refused.status).toBe(409);

    const invalidTarget = await api(`/api/admin/barns/${sourceId}/evacuate-and-delete`, {
      body: { destinationBarnId: 'no-numerico', reason: 'El galpón se cierra y su ganado pasa al receptor', operationKey: 'asoc-evac-0001' },
    });
    expect(invalidTarget.status).toBe(400);

    const selfTarget = await api(`/api/admin/barns/${sourceId}/evacuate-and-delete`, {
      body: { destinationBarnId: sourceId, reason: 'El galpón se cierra y su ganado pasa al receptor', operationKey: 'asoc-evac-0002' },
    });
    expect(selfTarget.status).toBe(400);

    const evacuated = await api(`/api/admin/barns/${sourceId}/evacuate-and-delete`, {
      body: { destinationBarnId: targetId, reason: 'El galpón se cierra y su ganado pasa al receptor', operationKey: 'asoc-evac-0003' },
    });
    expect(evacuated.status).toBe(200);
    const result = await evacuated.json() as EvacuateResult;
    expect(result.cabezasTrasladadas).toBe(12);
    expect(result.reasignadas.map((item) => item.group)).toEqual(expect.arrayContaining(['inventory_movements']));
    expect(result.desvinculadas.map((item) => item.group)).toEqual(expect.arrayContaining(['audit']));

    expect(await db.prepare('SELECT id FROM barns WHERE id = ?').bind(sourceId).first()).toBeNull();

    const headsAtTarget = await db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN movement_type IN ('sale','death','transfer_out') THEN -quantity ELSE quantity END), 0) AS n
      FROM inventory_movements WHERE barn_id = ?`).bind(targetId).first<{ n: number }>();
    expect(Number(headsAtTarget?.n)).toBe(12);

    const stillAtSource = await db.prepare('SELECT count(*) AS n FROM inventory_movements WHERE barn_id = ?')
      .bind(sourceId).first<{ n: number }>();
    expect(Number(stillAtSource?.n)).toBe(0);

    const auditTrail = await db.batch([
      db.prepare('SELECT count(*) AS n FROM audit_log WHERE barn_id = ?').bind(sourceId),
      db.prepare('SELECT count(*) AS n FROM audit_log WHERE barn_id IS NULL'),
    ]);
    expect(Number((auditTrail[0] as { results: { n: number }[] }).results[0].n)).toBe(0);
    expect(Number((auditTrail[1] as { results: { n: number }[] }).results[0].n)).toBeGreaterThan(0);

    const replay = await api(`/api/admin/barns/${sourceId}/evacuate-and-delete`, {
      body: { destinationBarnId: targetId, reason: 'El galpón se cierra y su ganado pasa al receptor', operationKey: 'asoc-evac-0003' },
    });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { replayed: boolean }).replayed).toBe(true);
  });

  it('traslada las fichas vivas con traslado real y reasigna las ya cerradas', async () => {
    const sourceId = await createBarn('G-AS8', 'Galpón con fichas');
    const targetId = await createBarn('G-AS9', 'Galpón receptor de fichas');
    const now = new Date().toISOString();

    // La ficha viva se crea por la API: alta real, con su movimiento de entrada y su historial.
    const created = await api('/api/animals', {
      body: {
        code: 'A-VIVA1',
        animalType: 'lechon',
        sex: 'hembra',
        entryDate: '2026-01-10',
        entryStageCode: 'preinicio',
        barnId: sourceId,
        originType: 'compra',
        purchaseAmount: '1.00',
        purchaseCurrencyCode: 'PEN',
        reason: 'Alta de ficha para cerrar el galpón',
        operationKey: 'asoc-alta-0010',
      },
    });
    expect(created.status).toBe(201);

    // La ficha ya salida no se traslada: se reasigna junto con el resto del historial.
    await db.prepare(`
      INSERT INTO animals (code, animal_type, sex, status, origin_type, entry_date, entry_stage_code,
        current_stage_code, barn_id, is_active, exit_date, exit_type, created_by_user_id, created_at, updated_at)
      VALUES ('A-CERR1', 'lechon', 'hembra', 'vendido', 'nacimiento', '2026-01-10', 'preinicio', 'preinicio', ?, 0, '2026-03-01', 'sale', ?, ?, ?)`)
      .bind(sourceId, adminId, now, now).run();

    const view = await (await api(`/api/admin/barns/${sourceId}/associations`)).json() as AssociationsResponse;
    expect(group(view, 'animals').count).toBe(1);
    expect(group(view, 'animals').actions).toEqual(['transfer']);

    const evacuated = await api(`/api/admin/barns/${sourceId}/evacuate-and-delete`, {
      body: { destinationBarnId: targetId, reason: 'Se cierra el galpón y sus fichas pasan al receptor', operationKey: 'asoc-evac-0010' },
    });
    expect(evacuated.status).toBe(200);
    const result = await evacuated.json() as EvacuateResult;
    expect(result.fichasTrasladadas).toBe(1);
    expect(result.fichasReasignadas).toBe(1);

    const moved = await db.prepare('SELECT code, barn_id FROM animals WHERE code IN (?, ?) ORDER BY code')
      .bind('A-CERR1', 'A-VIVA1').all<{ code: string; barn_id: number }>();
    expect(moved.results ?? []).toEqual([
      { code: 'A-CERR1', barn_id: targetId },
      { code: 'A-VIVA1', barn_id: targetId },
    ]);

    expect(await db.prepare('SELECT id FROM barns WHERE id = ?').bind(sourceId).first()).toBeNull();
  });

  it('rechaza grupos y identificadores que no corresponden al galpón', async () => {
    const barnId = await createBarn('G-AS4', 'Galpón validado');
    const otherId = await createBarn('G-AS5', 'Galpón aparte');
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO barn_pens (barn_id, code, name, capacity, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(otherId, 'C-9', 'Corral ajeno', 10, now).run();

    const unknownGroup = await api(`/api/admin/barns/${barnId}/associations/resolve`, {
      body: { group: 'barns', recordId: '1', action: 'delete', reason: 'Intento de tabla no permitida', operationKey: 'asoc-bad-0004' },
    });
    expect(unknownGroup.status).toBe(400);

    const foreignRow = await (await api(`/api/admin/barns/${otherId}/associations`)).json() as AssociationsResponse;
    const wrongBarn = await api(`/api/admin/barns/${barnId}/associations/resolve`, {
      body: { group: 'pens', recordId: group(foreignRow, 'pens').rows[0].id, action: 'delete', reason: 'Borrar un corral de otro galpón', operationKey: 'asoc-bad-0005' },
    });
    expect(wrongBarn.status).toBe(409);

    const injection = await api(`/api/admin/barns/${barnId}/associations/resolve`, {
      body: { group: 'pens', recordId: '1; DROP TABLE barns', action: 'delete', reason: 'Intento de inyección', operationKey: 'asoc-bad-0006' },
    });
    expect(injection.status).toBe(400);
  });

  it('sin galpón destino borra los datos del galpón y conserva el libro financiero, almacenes y trazas', async () => {
    const barnId = await createBarn('G-AS10', 'Galpón por borrar sin destino');
    const now = new Date().toISOString();

    const created = await api('/api/animals', {
      body: {
        code: 'A-DEL1',
        animalType: 'lechon',
        sex: 'hembra',
        entryDate: '2026-01-10',
        entryStageCode: 'preinicio',
        barnId,
        originType: 'compra',
        purchaseAmount: '1.00',
        purchaseCurrencyCode: 'PEN',
        reason: 'Alta de ficha para borrar el galpón sin destino',
        operationKey: 'asoc-del-alta-0001',
      },
    });
    expect(created.status).toBe(201);

    const female = await db.prepare('SELECT id FROM animals WHERE code = ?').bind('A-DEL1').first<{ id: number }>();
    const femaleId = Number(female?.id);

    await db.batch([
      db.prepare(`INSERT INTO inventory_movements (movement_type, effective_date, barn_id, stage_code, sex, quantity, created_by_user_id, created_at)
        VALUES ('purchase', '2026-02-01', ?, 'engorde', 'hembra', 12, ?, ?)`).bind(barnId, adminId, now),
      db.prepare(`INSERT INTO reproduction_cycles (id, female_animal_id, cycle_number, cycle_status, reproductive_status,
        cycle_opened_on, gestation_days, probable_farrowing_date, barn_id, created_by_user_id, created_at, updated_at)
        VALUES ('CYC-DEL1', ?, 1, 'farrowed', 'empty', '2026-01-15', 114, '2026-05-09', ?, ?, ?, ?)`)
        .bind(femaleId, barnId, adminId, now, now),
      db.prepare(`INSERT INTO litters (id, cycle_id, female_animal_id, parity_number, farrowing_date, barn_id,
        male_alive, female_alive, unsexed_alive, male_stillborn, female_stillborn, unsexed_stillborn,
        live_count, stillborn_count, total_born, created_by_user_id, created_at)
        VALUES ('LIT-DEL1', 'CYC-DEL1', ?, 1, '2026-05-09', ?, 1, 1, 0, 0, 0, 0, 2, 0, 2, ?, ?)`)
        .bind(femaleId, barnId, adminId, now),
      // Referencias que antes rompían el borrado: la ficha y un movimiento apuntan a la camada.
      db.prepare("UPDATE animals SET litter_id = 'LIT-DEL1' WHERE id = ?").bind(femaleId),
      db.prepare(`INSERT INTO inventory_movements (movement_type, effective_date, barn_id, stage_code, sex, quantity, litter_id, created_by_user_id, created_at)
        VALUES ('birth', '2026-05-09', ?, 'lactancia', 'hembra', 2, 'LIT-DEL1', ?, ?)`).bind(barnId, adminId, now),
      db.prepare(`INSERT INTO operation_log (id, operation_key, operation_type, author_user_id, entity_type, entity_id,
        barn_id, content_hash, payload, result_payload, effective_date, recorded_at)
        VALUES ('op-del-health-1', 'asoc-del-health-0001', 'health.event', ?, 'health_event', 1, ?, 'hash', '{}', '{}', '2026-02-02', ?)`)
        .bind(adminId, barnId, now),
      db.prepare(`INSERT INTO health_events (operation_log_id, event_type, effective_date, product, created_by_user_id, created_at)
        VALUES ('op-del-health-1', 'treatment', '2026-02-02', 'Antibiótico', ?, ?)`).bind(adminId, now),
      db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, actor_user_id, barn_id, reason, effective_date, recorded_at)
        VALUES ('barn', ?, 'update', ?, ?, 'Alta del galpón', '2026-02-01', ?)`)
        .bind(barnId, adminId, barnId, now),
      db.prepare('INSERT INTO barn_pens (barn_id, code, name, capacity, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(barnId, 'C-DEL', 'Corral por borrar', 10, now),
      db.prepare('INSERT INTO feed_warehouses (code, name, barn_id, is_active, created_by_user_id, created_at) VALUES (?, ?, ?, 1, ?, ?)')
        .bind('ALM-DEL', 'Almacén del galpón', barnId, adminId, now),
    ]);

    const healthEvent = await db.prepare("SELECT id FROM health_events WHERE operation_log_id = 'op-del-health-1'")
      .first<{ id: number }>();
    await db.prepare(`INSERT INTO health_event_animals (health_event_id, animal_id, animal_code_snapshot, barn_id,
      barn_name_snapshot, stage_code_snapshot) VALUES (?, ?, 'A-DEL1', ?, 'Galpón por borrar sin destino', 'preinicio')`)
      .bind(Number(healthEvent?.id), femaleId, barnId).run();

    const view = await (await api(`/api/admin/barns/${barnId}/associations`)).json() as AssociationsResponse;
    const stockCount = group(view, 'stock').count;
    expect(stockCount).toBeGreaterThan(0);
    expect(view.canDelete).toBe(false);

    const deleted = await api(`/api/admin/barns/${barnId}/evacuate-and-delete`, {
      body: { destinationBarnId: null, reason: 'El galpón se abrió por error y sus datos se borran', operationKey: 'asoc-del-0001' },
    });
    expect(deleted.status).toBe(200);
    const result = await deleted.json() as EvacuateResult;
    expect(result.mode).toBe('delete');
    expect(result.destinationBarnId).toBeNull();
    expect(result.fichasEliminadas).toBe(1);
    expect(result.cabezasEliminadas).toBe(stockCount);
    expect(result.eliminadas.map((item) => item.group)).toEqual(expect.arrayContaining(['stock', 'animals', 'inventory_movements', 'litters', 'reproduction_cycles', 'health_events']));
    expect(result.desvinculadas.map((item) => item.group)).toEqual(expect.arrayContaining(['audit', 'feed_warehouses']));

    expect(await db.prepare('SELECT id FROM barns WHERE id = ?').bind(barnId).first()).toBeNull();
    expect(await db.prepare('SELECT id FROM animals WHERE code = ?').bind('A-DEL1').first()).toBeNull();
    expect(await db.prepare("SELECT id FROM litters WHERE id = 'LIT-DEL1'").first()).toBeNull();
    expect(await db.prepare("SELECT id FROM reproduction_cycles WHERE id = 'CYC-DEL1'").first()).toBeNull();
    expect(await db.prepare("SELECT id FROM health_events WHERE operation_log_id = 'op-del-health-1'").first()).toBeNull();
    expect(await db.prepare("SELECT id FROM health_event_animals WHERE health_event_id = ?")
      .bind(Number(healthEvent?.id)).first()).toBeNull();

    const counts = await db.batch([
      db.prepare('SELECT count(*) AS n FROM inventory_movements WHERE barn_id = ?').bind(barnId),
      db.prepare('SELECT count(*) AS n FROM audit_log WHERE barn_id = ?').bind(barnId),
      db.prepare('SELECT count(*) AS n FROM barn_pens WHERE barn_id = ?').bind(barnId),
    ]);
    expect(Number((counts[0] as { results: { n: number }[] }).results[0].n)).toBe(0);
    expect(Number((counts[1] as { results: { n: number }[] }).results[0].n)).toBe(0);
    expect(Number((counts[2] as { results: { n: number }[] }).results[0].n)).toBe(0);

    const warehouse = await db.prepare('SELECT barn_id FROM feed_warehouses WHERE code = ?').bind('ALM-DEL').first<{ barn_id: number | null }>();
    expect(warehouse?.barn_id).toBeNull();

    const replay = await api(`/api/admin/barns/${barnId}/evacuate-and-delete`, {
      body: { destinationBarnId: null, reason: 'El galpón se abrió por error y sus datos se borran', operationKey: 'asoc-del-0001' },
    });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { replayed: boolean }).replayed).toBe(true);
  });
});
