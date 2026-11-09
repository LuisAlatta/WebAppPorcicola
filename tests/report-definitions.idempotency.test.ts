import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { duplicateReportDefinition, saveReportDefinition } from '../worker/reports';

const runtime = new Miniflare({
  workers: [{ config: {
    name: 'report-definitions-idempotency-test',
    compatibilityDate: '2026-07-01',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } }, modulesRoot: '/' },
    env: { DB: { type: 'd1', id: 'report-definitions-idempotency' } },
  } }],
});

let db: D1Database;

const definition = (name: string) => ({
  source: 'animals',
  name,
  purpose: 'Revisar animales activos',
  columns: ['animalCode', 'status'],
});

describe('Idempotencia de definiciones de informes', () => {
  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)').run();
    await db.prepare(`CREATE TABLE operation_log (
        id TEXT PRIMARY KEY, operation_key TEXT NOT NULL, operation_type TEXT NOT NULL,
        author_user_id INTEGER NOT NULL REFERENCES users(id), entity_type TEXT NOT NULL,
        entity_id INTEGER, barn_id INTEGER, content_hash TEXT NOT NULL, payload TEXT NOT NULL,
        result_payload TEXT NOT NULL, effective_date TEXT NOT NULL, recorded_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'committed', version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(author_user_id, operation_key)
      )`).run();
    await db.prepare(`CREATE TABLE report_definitions (
        id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL, purpose TEXT NOT NULL, definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`).run();
    await db.prepare('INSERT INTO users(id) VALUES(1)').run();
  });

  afterAll(async () => runtime.dispose());

  beforeEach(async () => {
    await db.prepare('DELETE FROM report_definitions').run();
    await db.prepare('DELETE FROM operation_log').run();
  });

  it('reproduce la creación y duplicación sin insertar una segunda definición', async () => {
    const original = await saveReportDefinition(db, 1, 'administrador', definition('Informe base'), { operationKey: 'report-create-1' });
    const originalReplay = await saveReportDefinition(db, 1, 'administrador', definition('Informe base'), { operationKey: 'report-create-1' });
    expect(originalReplay).toMatchObject({ id: original.id, replayed: true });

    const duplicate = await duplicateReportDefinition(db, 1, 'administrador', original.id, 'report-duplicate-1');
    const duplicateReplay = await duplicateReportDefinition(db, 1, 'administrador', original.id, 'report-duplicate-1');
    expect(duplicateReplay).toMatchObject({ id: duplicate.id, replayed: true });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM report_definitions').first()).toMatchObject({ count: 2 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM operation_log').first()).toMatchObject({ count: 2 });
  });

  it('rechaza una clave de guardado reutilizada con contenido distinto sin escribir', async () => {
    const first = await saveReportDefinition(db, 1, 'administrador', definition('Informe inicial'), { operationKey: 'report-change-1' });
    await expect(saveReportDefinition(db, 1, 'administrador', definition('Informe editado'), { operationKey: 'report-change-1' }))
      .rejects.toMatchObject({ status: 409 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM report_definitions WHERE id<>?').bind(first.id).first()).toMatchObject({ count: 0 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM operation_log WHERE operation_key=?').bind('report-change-1').first()).toMatchObject({ count: 1 });
  });

  it('reproduce una actualización con la misma clave sin aplicar una segunda escritura', async () => {
    const original = await saveReportDefinition(db, 1, 'administrador', definition('Informe base'), { operationKey: 'report-update-create' });
    const update = await saveReportDefinition(db, 1, 'administrador', definition('Informe actualizado'), { id: original.id, operationKey: 'report-update-1' });
    const replay = await saveReportDefinition(db, 1, 'administrador', definition('Informe actualizado'), { id: original.id, operationKey: 'report-update-1' });
    expect(update).toMatchObject({ id: original.id, replayed: false });
    expect(replay).toMatchObject({ id: original.id, replayed: true });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM report_definitions').first()).toMatchObject({ count: 1 });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM operation_log WHERE operation_key=?').bind('report-update-1').first()).toMatchObject({ count: 1 });
    expect(await db.prepare('SELECT name FROM report_definitions WHERE id=?').bind(original.id).first()).toMatchObject({ name: 'Informe actualizado' });
  });
});
