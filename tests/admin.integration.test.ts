import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-admin-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'admin-database' } },
    },
  }],
});

describe('Módulo exclusivo de administración · T05', () => {
  let db: D1Database;
  let adminToken: string;
  let adminId: number;

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');

    // Ejecutar migraciones 0001 y 0002
    const migrationFiles = ['0001_initial_schema.sql', '0002_administration_schema.sql', '0003_events_audit_schema.sql'];
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

    // Inicializar primer administrador con bootstrap
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

    const initData = await initRes.json() as { ok: boolean; token: string; user: { id: number } };
    adminToken = initData.token;
    adminId = initData.user.id;
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('CA-27: exclusividad administrativa — solo el administrador puede gestionar cuentas y galpones', async () => {
    // 1. El administrador crea cuentas de los otros tres perfiles
    // Crear Usuario responsable asignado a Galpón A (id: 1)
    const respRes = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          username: 'responsable1@granja.pe',
          name: 'Carlos Responsable',
          role: 'responsable',
          password: 'ClaveResponsable1!',
          barnIds: [1],
        }),
      }),
      { DB: db },
    );
    expect(respRes.status).toBe(201);
    const respData = await respRes.json() as { user: { id: number } };

    // Crear Operario
    const operRes = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          username: 'operario1@granja.pe',
          name: 'Pedro Operario',
          role: 'operario',
          password: 'ClaveOperario1!',
          barnIds: [1],
        }),
      }),
      { DB: db },
    );
    expect(operRes.status).toBe(201);

    // Crear Médico Veterinario
    const vetRes = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          username: 'veterinario1@granja.pe',
          name: 'Dra. María Veterinaria',
          role: 'veterinario',
          password: 'ClaveVeterinaria1!',
          barnIds: [1],
        }),
      }),
      { DB: db },
    );
    expect(vetRes.status).toBe(201);

    // 2. Obtener sesiones para cada uno de los tres perfiles no administradores
    const loginAndGetToken = async (username: string, password: string) => {
      const res = await worker.fetch(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }),
        { DB: db },
      );
      const data = await res.json() as { token: string };
      return data.token;
    };

    const respToken = await loginAndGetToken('responsable1@granja.pe', 'ClaveResponsable1!');
    const operToken = await loginAndGetToken('operario1@granja.pe', 'ClaveOperario1!');
    const vetToken = await loginAndGetToken('veterinario1@granja.pe', 'ClaveVeterinaria1!');

    // 3. Probar que intento de crear cuenta con cada uno de los 3 perfiles es rechazado con 403 Forbidden
    for (const [rol, token] of [
      ['responsable', respToken],
      ['operario', operToken],
      ['veterinario', vetToken],
    ] as const) {
      const intentoCrear = await worker.fetch(
        new Request('http://localhost/api/admin/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            username: `hacker_${rol}@granja.pe`,
            name: 'Intruso',
            role: 'operario',
            password: 'PasswordIntruso1!',
          }),
        }),
        { DB: db },
      );
      expect(intentoCrear.status).toBe(403);
      const err = await intentoCrear.json() as { error: string };
      expect(err.error).toContain('solo el Administrador');

      // Intentar reasignar un galpón directamente
      const intentoReasignar = await worker.fetch(
        new Request('http://localhost/api/admin/barns/1/team', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            responsableId: respData.user.id,
            operarioId: 1,
            veterinarioId: 1,
          }),
        }),
        { DB: db },
      );
      expect(intentoReasignar.status).toBe(403);
    }

    // 4. Intento sin token es rechazado con 401 Unauthorized
    const sinToken = await worker.fetch(
      new Request('http://localhost/api/admin/users'),
      { DB: db },
    );
    expect(sinToken.status).toBe(401);
  });

  it('CA-28: gestión de equipo del galpón, sustitución de veterinario y pérdida de acceso inmediata', async () => {
    // Escenario CA-28:
    // 1. Asignar Galpón A (1) y Galpón B (2) a un Usuario responsable (Carlos Responsable)
    // 2. Galpón A: Operario Pedro, Médico Veterinario Dra. María (veterinario1)
    // 3. Galpón B: Operario Jorge (operario2), Médico Veterinario Dra. Ana (veterinario2)
    // 4. Sustituir al veterinario de Galpón A por Dr. Lucas (veterinario3)
    // 5. Verificar que Carlos ve A y B; cada profesional ve sus galpones asignados;
    //    el cambio se registra en historial y la Dra. María pierde acceso inmediato a A.

    // Crear Operario 2, Veterinario 2 y Veterinario 3
    const op2Res = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ username: 'operario2@granja.pe', name: 'Jorge Operario', role: 'operario', password: 'ClaveOperario2!', barnIds: [2] }),
      }),
      { DB: db },
    );
    const op2Data = await op2Res.json() as { user: { id: number } };

    const vet2Res = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ username: 'veterinario2@granja.pe', name: 'Dra. Ana Veterinaria', role: 'veterinario', password: 'ClaveVeterinaria2!', barnIds: [2] }),
      }),
      { DB: db },
    );
    const vet2Data = await vet2Res.json() as { user: { id: number } };

    const vet3Res = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ username: 'veterinario3@granja.pe', name: 'Dr. Lucas Veterinario', role: 'veterinario', password: 'ClaveVeterinaria3!', barnIds: [] }),
      }),
      { DB: db },
    );
    const vet3Data = await vet3Res.json() as { user: { id: number } };

    // Obtener IDs de usuarios existentes
    const usersListRes = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      { DB: db },
    );
    const usersData = await usersListRes.json() as { users: { id: number; username: string }[] };
    const respUser = usersData.users.find((u) => u.username === 'responsable1@granja.pe')!;
    const op1User = usersData.users.find((u) => u.username === 'operario1@granja.pe')!;
    const vet1User = usersData.users.find((u) => u.username === 'veterinario1@granja.pe')!;

    // Asignar A y B al Usuario responsable
    await worker.fetch(
      new Request(`http://localhost/api/admin/users/${respUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ barnIds: [1, 2] }),
      }),
      { DB: db },
    );

    // Asignar equipo inicial completo a Galpón A (responsable, op1, vet1) y activar
    const teamARes = await worker.fetch(
      new Request('http://localhost/api/admin/barns/1/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          responsableId: respUser.id,
          operarioId: op1User.id,
          veterinarioId: vet1User.id,
          activate: true,
        }),
      }),
      { DB: db },
    );
    expect(teamARes.status).toBe(200);

    // Asignar equipo inicial completo a Galpón B (responsable, op2, vet2) y activar
    const teamBRes = await worker.fetch(
      new Request('http://localhost/api/admin/barns/2/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          responsableId: respUser.id,
          operarioId: op2Data.user.id,
          veterinarioId: vet2Data.user.id,
          activate: true,
        }),
      }),
      { DB: db },
    );
    expect(teamBRes.status).toBe(200);

    // Login con Dra. María (vet1): antes de la sustitución debe tener acceso a Galpón A
    const loginVet1Res = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'veterinario1@granja.pe', password: 'ClaveVeterinaria1!' }),
      }),
      { DB: db },
    );
    const loginVet1Data = await loginVet1Res.json() as { token: string; user: { barns: string[] } };
    expect(loginVet1Data.user.barns).toContain('Galpón A');

    // SUSTITUCIÓN: El Administrador sustituye al veterinario de Galpón A por Dr. Lucas (vet3)
    const replaceRes = await worker.fetch(
      new Request('http://localhost/api/admin/barns/1/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          responsableId: respUser.id,
          operarioId: op1User.id,
          veterinarioId: vet3Data.user.id,
        }),
      }),
      { DB: db },
    );
    expect(replaceRes.status).toBe(200);
    const replaceData = await replaceRes.json() as { barn: { veterinario: { id: number; name: string } } };
    expect(replaceData.barn.veterinario.id).toBe(vet3Data.user.id);

    // Verificar historial de sustitución registrado con vigencia y autor
    const historyRes = await worker.fetch(
      new Request('http://localhost/api/admin/history', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      { DB: db },
    );
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json() as { history: { barn_id: number; role: string; previous_user_id: number; new_user_id: number; changed_by_name: string }[] };
    const latestChange = historyData.history[0];
    expect(latestChange.barn_id).toBe(1);
    expect(latestChange.role).toBe('veterinario');
    expect(latestChange.previous_user_id).toBe(vet1User.id);
    expect(latestChange.new_user_id).toBe(vet3Data.user.id);
    expect(latestChange.changed_by_name).toBe('Administrador General');

    // Comprobación de accesos tras la sustitución:
    // 1. Dra. María (vet1) consulta su sesión activa: PIERDE ACCESO a Galpón A
    const meVet1Res = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${loginVet1Data.token}` },
      }),
      { DB: db },
    );
    const meVet1Data = await meVet1Res.json() as { user: { barns: string[] } };
    expect(meVet1Data.user.barns).toEqual([]); // Perdió acceso a Galpón A

    // 2. Dr. Lucas (vet3) inicia sesión: GANA ACCESO a Galpón A
    const loginVet3Res = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'veterinario3@granja.pe', password: 'ClaveVeterinaria3!' }),
      }),
      { DB: db },
    );
    const loginVet3Data = await loginVet3Res.json() as { user: { barns: string[] } };
    expect(loginVet3Data.user.barns).toContain('Galpón A');

    // 3. Carlos (Usuario responsable) sigue viendo ambos galpones A y B
    const loginRespRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'responsable1@granja.pe', password: 'ClaveResponsable1!' }),
      }),
      { DB: db },
    );
    const loginRespData = await loginRespRes.json() as { user: { barns: string[] } };
    expect(loginRespData.user.barns).toContain('Galpón A');
    expect(loginRespData.user.barns).toContain('Galpón B');
  });

  it('no permite activar un galpón con equipo incompleto', async () => {
    // Crear un nuevo galpón en preparación (Galpón C)
    const newBarnRes = await worker.fetch(
      new Request('http://localhost/api/admin/barns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ code: 'G-C', name: 'Galpón C', zone: 'Sector Maternidad', capacity: 60 }),
      }),
      { DB: db },
    );
    expect(newBarnRes.status).toBe(201);
    const newBarnData = await newBarnRes.json() as { barn: { id: number; status: string } };
    expect(newBarnData.barn.status).toBe('preparacion');

    // Intentar cambiar estado a "operativo" sin haber asignado equipo
    const tryActivateRes = await worker.fetch(
      new Request(`http://localhost/api/admin/barns/${newBarnData.barn.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'operativo' }),
      }),
      { DB: db },
    );
    expect(tryActivateRes.status).toBe(400);
    const err = await tryActivateRes.json() as { error: string };
    expect(err.error).toContain('equipo está incompleto');
  });

  it('no permite dejar a un Usuario activo sin galpones asignados sin reasignación o desactivación', async () => {
    // Crear un segundo responsable con Galpón C como su único galpón
    const r2Res = await worker.fetch(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          username: 'responsable2@granja.pe',
          name: 'Raúl Responsable 2',
          role: 'responsable',
          password: 'ClaveResponsable2!',
          barnIds: [3], // Galpón C
        }),
      }),
      { DB: db },
    );
    expect(r2Res.status).toBe(201);
    const r2Data = await r2Res.json() as { user: { id: number } };

    // Asignar equipo a Galpón C teniendo a responsable2 como responsable
    await worker.fetch(
      new Request('http://localhost/api/admin/barns/3/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          responsableId: r2Data.user.id,
          operarioId: 3, // op1
          veterinarioId: 4, // vet1
        }),
      }),
      { DB: db },
    );

    // Intentar quitarle el Galpón C reemplazándolo por otro responsable sin reasignar ni desactivar a R2
    const failReplace = await worker.fetch(
      new Request('http://localhost/api/admin/barns/3/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          responsableId: 2, // responsable1
          operarioId: 3,
          veterinarioId: 4,
        }),
      }),
      { DB: db },
    );
    expect(failReplace.status).toBe(400);
    const err = await failReplace.json() as { error: string };
    expect(err.error).toContain('quedaría sin galpones asignados');

    // Ahora reemplazar especificando la desactivación atómica de R2
    const successReplace = await worker.fetch(
      new Request('http://localhost/api/admin/barns/3/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          responsableId: 2,
          operarioId: 3,
          veterinarioId: 4,
          reassignment: { deactivatePreviousResponsable: true },
        }),
      }),
      { DB: db },
    );
    expect(successReplace.status).toBe(200);

    // Verificar que R2 quedó desactivado atómicamente
    const r2Check = await db.prepare('SELECT is_active FROM users WHERE id = ?').bind(r2Data.user.id).first() as { is_active: number };
    expect(r2Check.is_active).toBe(0);
  });

  it('invariante: impide desactivar o cambiar el rol del único administrador activo', async () => {
    // Intentar desactivar al administrador
    const tryDeactivate = await worker.fetch(
      new Request(`http://localhost/api/admin/users/${adminId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ is_active: 0 }),
      }),
      { DB: db },
    );
    expect(tryDeactivate.status).toBe(400);
    const err1 = await tryDeactivate.json() as { error: string };
    expect(err1.error).toContain('único administrador activo');

    // Intentar cambiar rol del administrador a operario
    const tryChangeRole = await worker.fetch(
      new Request(`http://localhost/api/admin/users/${adminId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ role: 'operario' }),
      }),
      { DB: db },
    );
    expect(tryChangeRole.status).toBe(400);
    const err2 = await tryChangeRole.json() as { error: string };
    expect(err2.error).toContain('único administrador activo');
  });

  it('CFG-06: permite administrar galpones (alta, edición, estado y eliminación si carece de registros)', async () => {
    // Alta de Galpón D
    const createRes = await worker.fetch(
      new Request('http://localhost/api/admin/barns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ code: 'G-D', name: 'Galpón D Engorde', zone: 'Sector Sur', capacity: 120 }),
      }),
      { DB: db },
    );
    expect(createRes.status).toBe(201);
    const createData = await createRes.json() as { barn: { id: number; capacity: number } };
    expect(createData.barn.capacity).toBe(120);

    // Edición de capacidad y zona
    const editRes = await worker.fetch(
      new Request(`http://localhost/api/admin/barns/${createData.barn.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ capacity: 150, zone: 'Sector Sur Ampliado' }),
      }),
      { DB: db },
    );
    expect(editRes.status).toBe(200);

    // Eliminación del galpón recién creado sin registros asociados
    const deleteRes = await worker.fetch(
      new Request(`http://localhost/api/admin/barns/${createData.barn.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      { DB: db },
    );
    expect(deleteRes.status).toBe(200);

    // Verificar que ya no figura en la lista
    const listRes = await worker.fetch(
      new Request('http://localhost/api/admin/barns', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      { DB: db },
    );
    const listData = await listRes.json() as { barns: { code: string }[] };
    expect(listData.barns.some((b) => b.code === 'G-D')).toBe(false);
  });
});
