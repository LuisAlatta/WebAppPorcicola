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
});
