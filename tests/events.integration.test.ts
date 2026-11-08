import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-events-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'events-database' } },
    },
  }],
});

describe('Eventos idempotentes, correcciones y auditoría · T06 (ACC-04, GES-03)', () => {
  let db: D1Database;
  let adminToken: string;
  let adminId: number;
  let operarioToken: string;
  let respUserId: number;
  let op1UserId: number;
  let op2UserId: number;
  let vet1UserId: number;
  let vet2UserId: number;

  const api = async (path: string, init: RequestInit = {}, token = adminToken) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), { DB: db });
  };

  const createBarn = async (code: string): Promise<number> => {
    const res = await api('/api/admin/barns', {
      method: 'POST',
      body: JSON.stringify({ code, name: `Galpón ${code}`, zone: 'Pruebas', capacity: 50 }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { barn: { id: number } };
    return data.barn.id;
  };

  const createUser = async (body: Record<string, unknown>): Promise<number> => {
    const res = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    expect(res.status).toBe(201);
    const data = await res.json() as { user: { id: number } };
    return data.user.id;
  };

  const teamPayload = (barnId: number, veterinarioId: number, extra: Record<string, unknown> = {}) => ({
    responsableId: respUserId,
    operarioId: op1UserId,
    veterinarioId,
    activate: true,
    reason: 'Alta inicial de equipo',
    effectiveDate: '2026-11-01',
    ...extra,
    barnId,
  });

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');

    const migrationFiles = [
      '0001_initial_schema.sql',
      '0002_administration_schema.sql',
      '0003_events_audit_schema.sql',
    ];

    for (const file of migrationFiles) {
      const schemaSql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      const cleanSql = schemaSql
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('--'))
        .join(' ');

      const statements = cleanSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await db.exec(stmt + ';');
      }
    }

    const initRes = await worker.fetch(
      new Request('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
          name: 'Administrador General',
        }),
      }),
      { DB: db },
    );
    const initData = await initRes.json() as { token: string; user: { id: number } };
    adminToken = initData.token;
    adminId = initData.user.id;

    respUserId = await createUser({
      username: 'responsable@granja.pe',
      name: 'Carla Responsable',
      role: 'responsable',
      password: 'ClaveResponsable1!',
      barnIds: [1],
    });

    op1UserId = await createUser({
      username: 'operario1@granja.pe',
      name: 'Pedro Operario',
      role: 'operario',
      password: 'ClaveOperario1!',
      barnIds: [1],
    });

    op2UserId = await createUser({
      username: 'operario2@granja.pe',
      name: 'Jorge Operario',
      role: 'operario',
      password: 'ClaveOperario2!',
      barnIds: [1],
    });

    vet1UserId = await createUser({
      username: 'veterinario1@granja.pe',
      name: 'Dra. María Veterinaria',
      role: 'veterinario',
      password: 'ClaveVeterinaria1!',
      barnIds: [1],
    });

    vet2UserId = await createUser({
      username: 'veterinario2@granja.pe',
      name: 'Dr. Lucas Veterinario',
      role: 'veterinario',
      password: 'ClaveVeterinaria2!',
      barnIds: [1],
    });

    const loginRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'operario1@granja.pe', password: 'ClaveOperario1!' }),
      }),
      { DB: db },
    );
    const loginData = await loginRes.json() as { token: string };
    operarioToken = loginData.token;
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('ACC-04: misma clave y mismo contenido devuelven el resultado anterior sin duplicar el evento', async () => {
    const barnId = await createBarn('EV-T1');
    const key = 't06-assign-evt-0001';
    const body = teamPayload(barnId, vet1UserId, { operationKey: key });

    const first = await api(`/api/admin/barns/${barnId}/team`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(200);
    const firstData = await first.json() as { barn: { veterinario: { id: number } }; replayed: boolean };
    expect(firstData.replayed).toBe(false);
    expect(firstData.barn.veterinario.id).toBe(vet1UserId);

    const log = await db.prepare(`
      SELECT operation_key, operation_type, author_user_id, content_hash, effective_date, recorded_at, version
      FROM operation_log WHERE operation_key = ?
    `).bind(key).first() as {
      operation_key: string;
      operation_type: string;
      author_user_id: number;
      content_hash: string;
      effective_date: string;
      recorded_at: string;
      version: number;
    } | null;

    expect(log).not.toBeNull();
    expect(log!.operation_type).toBe('barn.team.assign');
    expect(log!.author_user_id).toBe(adminId);
    expect(log!.content_hash).toHaveLength(64);
    expect(log!.effective_date).toBe('2026-11-01');
    expect(log!.version).toBe(1);
    expect(new Date(log!.recorded_at).toISOString()).toBe(log!.recorded_at);

    const countBefore = await db.prepare(`
      SELECT
        (SELECT count(*) FROM operation_log WHERE operation_key = ?) as ops,
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(key, barnId, barnId).first() as { ops: number; audits: number; history: number };
    expect(countBefore.ops).toBe(1);
    expect(countBefore.audits).toBe(1);
    expect(countBefore.history).toBe(3);

    // Reintento tras pérdida de respuesta: mismo formulario, misma clave.
    const retry = await api(`/api/admin/barns/${barnId}/team`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    expect(retry.status).toBe(200);
    const retryData = await retry.json() as { barn: { veterinario: { id: number } }; replayed: boolean };
    expect(retryData.replayed).toBe(true);
    expect(retryData.barn.veterinario.id).toBe(vet1UserId);

    const countAfter = await db.prepare(`
      SELECT
        (SELECT count(*) FROM operation_log WHERE operation_key = ?) as ops,
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(key, barnId, barnId).first() as { ops: number; audits: number; history: number };
    expect(countAfter).toEqual(countBefore);
  });

  it('ACC-04: contenido distinto con la misma clave produce 409 y no escribe nada', async () => {
    const barnId = await createBarn('EV-T2');
    const key = 't06-assign-evt-0002';

    const first = await api(`/api/admin/barns/${barnId}/team`, {
      method: 'PUT',
      body: JSON.stringify(teamPayload(barnId, vet1UserId, { operationKey: key })),
    });
    expect(first.status).toBe(200);

    const conflict = await api(`/api/admin/barns/${barnId}/team`, {
      method: 'PUT',
      body: JSON.stringify(teamPayload(barnId, vet2UserId, { operationKey: key })),
    });
    expect(conflict.status).toBe(409);
    const error = await conflict.json() as { error: string };
    expect(error.error).toContain('Conflicto');

    const counts = await db.prepare(`
      SELECT
        (SELECT count(*) FROM operation_log WHERE operation_key = ?) as ops,
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(key, barnId, barnId).first() as { ops: number; audits: number; history: number };
    expect(counts).toEqual({ ops: 1, audits: 1, history: 3 });

    const barn = await db.prepare('SELECT veterinario_id FROM barns WHERE id = ?').bind(barnId).first() as { veterinario_id: number };
    expect(barn.veterinario_id).toBe(vet1UserId);
  });

  it('ACC-04: cinco reenvíos concurrentes de la misma clave producen un solo evento', async () => {
    const barnId = await createBarn('EV-T3');
    const key = 't06-assign-evt-0003';
    const body = JSON.stringify(teamPayload(barnId, vet1UserId, { operationKey: key }));

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api(`/api/admin/barns/${barnId}/team`, { method: 'PUT', body })),
    );

    const statuses = responses.map((res) => res.status);
    expect(statuses.every((status) => status === 200)).toBe(true);

    const payloads = await Promise.all(responses.map((res) => res.json() as Promise<{ replayed: boolean }>));
    expect(payloads.filter((item) => item.replayed === false)).toHaveLength(1);
    expect(payloads.filter((item) => item.replayed === true)).toHaveLength(4);

    const counts = await db.prepare(`
      SELECT
        (SELECT count(*) FROM operation_log WHERE operation_key = ?) as ops,
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(key, barnId, barnId).first() as { ops: number; audits: number; history: number };
    expect(counts).toEqual({ ops: 1, audits: 1, history: 3 });
  });

  it('GES-03: corrige una asignación conservando el registro original, autor, motivo y fechas', async () => {
    const barnId = await createBarn('EV-T4');
    const assign = await api(`/api/admin/barns/${barnId}/team`, {
      method: 'PUT',
      body: JSON.stringify(teamPayload(barnId, vet1UserId, { operationKey: 't06-assign-evt-0004' })),
    });
    expect(assign.status).toBe(200);

    const original = await db.prepare(`
      SELECT id, new_user_id, valid_from FROM barn_team_history
      WHERE barn_id = ? AND role = 'veterinario' AND is_current = 1
      ORDER BY id DESC LIMIT 1
    `).bind(barnId).first() as { id: number; new_user_id: number; valid_from: string };
    expect(original.new_user_id).toBe(vet1UserId);

    const correctionKey = 't06-correct-evt-0001';
    const reason = 'Corrección: el titular registrado no correspondía al turno';
    const correction = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: vet2UserId,
        reason,
        effectiveDate: '2026-11-02',
        operationKey: correctionKey,
      }),
    });
    expect(correction.status).toBe(200);
    const correctionData = await correction.json() as {
      barn: { veterinario: { id: number } };
      correctedHistoryId: number;
      newHistoryId: number;
      replayed: boolean;
    };
    expect(correctionData.replayed).toBe(false);
    expect(correctionData.barn.veterinario.id).toBe(vet2UserId);
    expect(correctionData.correctedHistoryId).toBe(original.id);

    const superseded = await db.prepare(`
      SELECT new_user_id, is_current, superseded_by_id, valid_until
      FROM barn_team_history WHERE id = ?
    `).bind(original.id).first() as {
      new_user_id: number;
      is_current: number;
      superseded_by_id: number;
      valid_until: string | null;
    };
    expect(superseded.new_user_id).toBe(vet1UserId); // el registro original no se reescribe
    expect(superseded.is_current).toBe(0);
    expect(superseded.superseded_by_id).toBe(correctionData.newHistoryId);
    expect(superseded.valid_until).toBe('2026-11-02T05:00:00.000Z');

    const newRow = await db.prepare(`
      SELECT corrects_history_id, previous_user_id, new_user_id, valid_from, changed_by_user_id, reason, is_current
      FROM barn_team_history WHERE id = ?
    `).bind(correctionData.newHistoryId).first() as {
      corrects_history_id: number;
      previous_user_id: number;
      new_user_id: number;
      valid_from: string;
      changed_by_user_id: number;
      reason: string;
      is_current: number;
    };
    expect(newRow.corrects_history_id).toBe(original.id);
    expect(newRow.previous_user_id).toBe(vet1UserId);
    expect(newRow.new_user_id).toBe(vet2UserId);
    expect(newRow.valid_from).toBe('2026-11-02T05:00:00.000Z');
    expect(newRow.changed_by_user_id).toBe(adminId);
    expect(newRow.reason).toBe(reason);
    expect(newRow.is_current).toBe(1);

    // Acceso del titular corregido: gana el nuevo, pierde el anterior.
    const vet1Barns = await db.prepare('SELECT count(*) as count FROM user_barns WHERE user_id = ? AND barn_id = ?')
      .bind(vet1UserId, barnId).first() as { count: number };
    const vet2Barns = await db.prepare('SELECT count(*) as count FROM user_barns WHERE user_id = ? AND barn_id = ?')
      .bind(vet2UserId, barnId).first() as { count: number };
    expect(vet1Barns.count).toBe(0);
    expect(vet2Barns.count).toBe(1);

    // Auditoría consultable por el responsable con el registro original disponible.
    const auditRes = await api(`/api/admin/audit?entityType=barn&entityId=${barnId}`);
    expect(auditRes.status).toBe(200);
    const auditData = await auditRes.json() as {
      audit: {
        action: string;
        actor_name: string;
        reason: string;
        effective_date: string;
        recorded_at: string;
        operation_key: string;
        previous_data: { historyId: number; new_user_id: number } | null;
        new_data: { new_user_id: number } | null;
      }[];
    };
    const auditEntry = auditData.audit.find((item) => item.action === 'correct');
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.actor_name).toBe('Administrador General');
    expect(auditEntry!.reason).toBe(reason);
    expect(auditEntry!.effective_date).toBe('2026-11-02');
    expect(new Date(auditEntry!.recorded_at).toISOString()).toBe(auditEntry!.recorded_at);
    expect(auditEntry!.operation_key).toBe(correctionKey);
    expect(auditEntry!.previous_data?.historyId).toBe(original.id);
    expect(auditEntry!.previous_data?.new_user_id).toBe(vet1UserId);
    expect(auditEntry!.new_data?.new_user_id).toBe(vet2UserId);

    // El reintento devuelve el resultado anterior, incluso con la fila ya corregida.
    const countsBeforeRetry = await db.prepare(`
      SELECT
        (SELECT count(*) FROM operation_log WHERE operation_key = ?) as ops,
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(correctionKey, barnId, barnId).first() as { ops: number; audits: number; history: number };

    const retry = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: vet2UserId,
        reason,
        effectiveDate: '2026-11-02',
        operationKey: correctionKey,
      }),
    });
    expect(retry.status).toBe(200);
    const retryData = await retry.json() as { replayed: boolean; barn: { veterinario: { id: number } } };
    expect(retryData.replayed).toBe(true);
    expect(retryData.barn.veterinario.id).toBe(vet2UserId);

    const countsAfterRetry = await db.prepare(`
      SELECT
        (SELECT count(*) FROM operation_log WHERE operation_key = ?) as ops,
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(correctionKey, barnId, barnId).first() as { ops: number; audits: number; history: number };
    expect(countsAfterRetry).toEqual(countsBeforeRetry);
    expect(countsAfterRetry.audits).toBe(2); // alta de equipo + corrección
    expect(countsAfterRetry.history).toBe(4); // 3 altas + 1 corrección

    // Misma clave con otro motivo: conflicto sin escribir.
    const conflict = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: vet2UserId,
        reason: 'Otro motivo distinto para la misma clave',
        effectiveDate: '2026-11-02',
        operationKey: correctionKey,
      }),
    });
    expect(conflict.status).toBe(409);

    // Nueva clave sobre la fila ya corregida: se rechaza y se conserva el historial.
    const stale = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: vet1UserId,
        reason: 'Intento de reescribir la corrección anterior',
        effectiveDate: '2026-11-03',
        operationKey: 't06-correct-evt-0002',
      }),
    });
    expect(stale.status).toBe(409);
    const finalCount = await db.prepare('SELECT count(*) as count FROM barn_team_history WHERE barn_id = ?')
      .bind(barnId).first() as { count: number };
    expect(finalCount.count).toBe(4);
  });

  it('rechaza correcciones inválidas sin escribir y restringe la auditoría al administrador', async () => {
    const barnId = await createBarn('EV-T5');
    const assign = await api(`/api/admin/barns/${barnId}/team`, {
      method: 'PUT',
      body: JSON.stringify(teamPayload(barnId, vet1UserId, { operationKey: 't06-assign-evt-0005' })),
    });
    expect(assign.status).toBe(200);

    const original = await db.prepare(`
      SELECT id FROM barn_team_history
      WHERE barn_id = ? AND role = 'veterinario' AND is_current = 1
      ORDER BY id DESC LIMIT 1
    `).bind(barnId).first() as { id: number };

    const before = await db.prepare(`
      SELECT
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(barnId, barnId).first() as { audits: number; history: number };

    // Motivo vacío: validación 400, sin escritura.
    const withoutReason = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: vet2UserId,
        reason: '   ',
        effectiveDate: '2026-11-02',
        operationKey: 't06-correct-invalid-0001',
      }),
    });
    expect(withoutReason.status).toBe(400);
    const reasonError = await withoutReason.json() as { error: string };
    expect(reasonError.error).toContain('motivo');

    // Usuario con perfil equivocado: 400, sin escritura.
    const wrongRole = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: op2UserId,
        reason: 'Selección equivocada de usuario en el formulario',
        effectiveDate: '2026-11-02',
        operationKey: 't06-correct-invalid-0002',
      }),
    });
    expect(wrongRole.status).toBe(400);

    // Fecha efectiva inválida: 400, sin escritura.
    const badDate = await api(`/api/admin/barns/${barnId}/team/correction`, {
      method: 'POST',
      body: JSON.stringify({
        historyId: original.id,
        role: 'veterinario',
        newUserId: vet2UserId,
        reason: 'Fecha escrita de forma ambigua en el formulario',
        effectiveDate: '02/11/2026',
        operationKey: 't06-correct-invalid-0003',
      }),
    });
    expect(badDate.status).toBe(400);

    const after = await db.prepare(`
      SELECT
        (SELECT count(*) FROM audit_log WHERE entity_type = 'barn' AND entity_id = ?) as audits,
        (SELECT count(*) FROM barn_team_history WHERE barn_id = ?) as history
    `).bind(barnId, barnId).first() as { audits: number; history: number };
    expect(after).toEqual(before);

    // La auditoría no está disponible para otros perfiles ni sin sesión.
    const forbidden = await api(`/api/admin/audit?entityType=barn&entityId=${barnId}`, {}, operarioToken);
    expect(forbidden.status).toBe(403);

    const anonymous = await worker.fetch(new Request(`http://localhost/api/admin/audit`), { DB: db });
    expect(anonymous.status).toBe(401);
  });
});
