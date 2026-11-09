import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { attendAlert, createManualAlert } from '../worker/alerts';
import { currentFarmDate } from '../worker/events';

const runtime = new Miniflare({
  workers: [{ config: {
    name: 'alerts-attend-idempotency-test',
    compatibilityDate: '2026-07-01',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
    env: { DB: { type: 'd1', id: 'alerts-attend-idempotency' } },
  } }],
});

let db: D1Database;

describe('Idempotencia de acciones de alertas', () => {
  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)').run();
    await db.prepare('CREATE TABLE barns (id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL)').run();
    await db.prepare(`CREATE TABLE operation_log (
      id TEXT PRIMARY KEY, operation_key TEXT NOT NULL, operation_type TEXT NOT NULL,
      author_user_id INTEGER NOT NULL REFERENCES users(id), entity_type TEXT NOT NULL,
      entity_id INTEGER, barn_id INTEGER, content_hash TEXT NOT NULL, payload TEXT NOT NULL,
      result_payload TEXT NOT NULL, effective_date TEXT NOT NULL, recorded_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'committed', version INTEGER NOT NULL DEFAULT 1,
      UNIQUE(author_user_id, operation_key)
    )`).run();
    await db.prepare(`CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, operation_log_id TEXT REFERENCES operation_log(id),
      entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL REFERENCES users(id), barn_id INTEGER, reason TEXT NOT NULL,
      previous_data TEXT, new_data TEXT, effective_date TEXT NOT NULL, recorded_at TEXT NOT NULL
    )`).run();
    await db.prepare(`CREATE TABLE alert_occurrences (
      id INTEGER PRIMARY KEY, alert_key TEXT NOT NULL, alert_type TEXT NOT NULL,
      source_type TEXT NOT NULL, source_id TEXT NOT NULL, due_date TEXT NOT NULL,
      due_bucket TEXT NOT NULL, title TEXT NOT NULL, detail_json TEXT NOT NULL,
      animal_code TEXT, barn_id INTEGER, barn_name_snapshot TEXT, status TEXT NOT NULL,
      created_by_user_id INTEGER, last_seen_run TEXT, acknowledged_by_user_id INTEGER,
      acknowledged_at TEXT, resolution_reason TEXT, linked_event_type TEXT,
      linked_event_id TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT
    )`).run();
    await db.prepare('INSERT INTO users(id) VALUES(1),(2)').run();
    await db.prepare("INSERT INTO barns(id,name,status) VALUES(1,'Galpón A','activo'),(2,'Galpón B','activo')").run();
  });

  beforeEach(async () => {
    await db.prepare('DELETE FROM audit_log').run();
    await db.prepare('DELETE FROM operation_log').run();
    await db.prepare('DELETE FROM alert_occurrences').run();
    await db.prepare(`INSERT INTO alert_occurrences
      (id,alert_key,alert_type,source_type,source_id,due_date,due_bucket,title,detail_json,barn_id,barn_name_snapshot,status)
      VALUES(10,'manual:10','manual','manual','seed','${currentFarmDate()}','today','Tarea pendiente','{}',1,'Galpón A','pending')`).run();
  });

  afterAll(async () => runtime.dispose());

  it('reproduce una atención ya confirmada y conserva 409 para el mismo key con otro motivo', async () => {
    const input = { reason: 'Tarea verificada en el galpón', linkedEventType: 'manual', linkedEventId: '10', operationKey: 'alert-attend-1' };
    const first = await attendAlert(db, 1, 10, input);
    const replay = await attendAlert(db, 1, 10, input);
    expect(first).toMatchObject({ replayed: false, id: 10, status: 'attended' });
    expect(replay).toMatchObject({ replayed: true, id: 10, status: 'attended' });
    await expect(attendAlert(db, 1, 10, { ...input, reason: 'Se cambió el motivo del cierre' }))
      .rejects.toMatchObject({ status: 409 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM operation_log WHERE operation_key=?').bind(input.operationKey).first()).toMatchObject({ count: 1 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM audit_log').first()).toMatchObject({ count: 1 });
    expect(await db.prepare('SELECT status FROM alert_occurrences WHERE id=10').first()).toMatchObject({ status: 'attended' });
  });

  it('mantiene 403 para un usuario sin acceso aunque la alerta ya esté atendida', async () => {
    await attendAlert(db, 1, 10, { reason: 'Tarea verificada en el galpón', operationKey: 'alert-attend-owner' });
    await expect(attendAlert(db, 2, 10, { reason: 'Intento de otra granja', operationKey: 'alert-attend-outsider' }, { allowedBarnNames: ['Galpón B'] }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('reproduce la creación de un aviso manual sin añadir otra alerta', async () => {
    const input = { title: 'Revisar bebedero', dueDate: currentFarmDate(), reason: 'Inspección en el galpón', operationKey: 'manual-alert-replay-1' };
    const first = await createManualAlert(db, 1, input);
    const replay = await createManualAlert(db, 1, input);
    expect(first).toMatchObject({ replayed: false });
    expect(replay).toMatchObject({ replayed: true, alert: first.alert });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM alert_occurrences WHERE alert_type='manual' AND title='Revisar bebedero'").first()).toMatchObject({ count: 1 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM operation_log WHERE operation_key=?').bind(input.operationKey).first()).toMatchObject({ count: 1 });
  });

  it('devuelve a los dos requests concurrentes el mismo resultado persistido', async () => {
    const input = { title: 'Revisar comedero', dueDate: currentFarmDate(), reason: 'Inspección concurrente', operationKey: 'manual-alert-race-1' };
    let releaseBatches = () => {};
    const bothBatchesReady = new Promise<void>(resolve => { releaseBatches = resolve; });
    let batchCount = 0;
    const raceDb = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
          batchCount += 1;
          if (batchCount === 2) releaseBatches();
          await bothBatchesReady;
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as D1Database;

    const [first, second] = await Promise.all([
      createManualAlert(raceDb, 1, input),
      createManualAlert(raceDb, 1, input),
    ]);
    expect(first.alert).toEqual(second.alert);
    expect([first.replayed, second.replayed].filter(Boolean)).toHaveLength(1);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM alert_occurrences WHERE alert_type='manual' AND title='Revisar comedero'").first()).toMatchObject({ count: 1 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM operation_log WHERE operation_key=?').bind(input.operationKey).first()).toMatchObject({ count: 1 });
  });
});
