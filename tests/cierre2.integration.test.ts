import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-cierre2-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'cierre2-database' } },
    },
  }],
});

describe('Cierre 2: dos sesiones, permisos exclusivos y revocación inmediata', () => {
  let db: D1Database;
  let adminSessionOne: string;
  let adminSessionTwo: string;
  let responsableToken: string;
  let operarioToken: string;
  let veterinarioToken: string;
  let operarioId: number;
  let responsableId: number;
  let barnId: number;

  const api = async (path: string, init: RequestInit = {}, token = adminSessionOne) => {
    const headers = new Headers(init.headers ?? {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), { DB: db });
  };

  const login = async (username: string, password: string): Promise<string> => {
    const res = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
      { DB: db },
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { token: string };
    return data.token;
  };

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');

    const migrationFiles = [
      '0001_initial_schema.sql',
      '0002_administration_schema.sql',
      '0003_events_audit_schema.sql',
      '0004_farm_config_schema.sql','0027_location_barns.sql',
    ];

    for (const file of migrationFiles) {
      const schemaSql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      const statements = schemaSql
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('--'))
        .join(' ')
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      for (const statement of statements) {
        await db.exec(statement + ';');
      }
    }

    const bootstrapRes = await worker.fetch(
      new Request('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin.cierre2@granja.pe',
          password: 'PasswordCierre2026!',
          name: 'Administrador Cierre Dos',
        }),
      }),
      { DB: db },
    );
    const bootstrapData = await bootstrapRes.json() as { token: string };
    adminSessionOne = bootstrapData.token;
    adminSessionTwo = await login('admin.cierre2@granja.pe', 'PasswordCierre2026!');

    const barnRes = await api('/api/admin/barns', {
      method: 'POST',
      body: JSON.stringify({ code: 'C2-A', name: 'Galpón Cierre Dos', zone: 'Pruebas', capacity: 40 }),
    });
    expect(barnRes.status).toBe(201);
    const barnData = await barnRes.json() as { barn: { id: number } };
    barnId = barnData.barn.id;

    const responsableRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'responsable.cierre2@granja.pe',
        name: 'Responsable Cierre Dos',
        role: 'responsable',
        password: 'ClaveResponsableC2!',
        barnIds: [barnId],
      }),
    });
    expect(responsableRes.status).toBe(201);
    responsableId = (await responsableRes.json() as { user: { id: number } }).user.id;

    const operarioRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'operario.cierre2@granja.pe',
        name: 'Operario Cierre Dos',
        role: 'operario',
        password: 'ClaveOperarioC2!',
        barnIds: [barnId],
      }),
    });
    expect(operarioRes.status).toBe(201);
    operarioId = (await operarioRes.json() as { user: { id: number } }).user.id;

    const veterinarioRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'veterinario.cierre2@granja.pe',
        name: 'Veterinario Cierre Dos',
        role: 'veterinario',
        password: 'ClaveVeterinarioC2!',
        barnIds: [barnId],
      }),
    });
    expect(veterinarioRes.status).toBe(201);

    responsableToken = await login('responsable.cierre2@granja.pe', 'ClaveResponsableC2!');
    operarioToken = await login('operario.cierre2@granja.pe', 'ClaveOperarioC2!');
    veterinarioToken = await login('veterinario.cierre2@granja.pe', 'ClaveVeterinarioC2!');
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('la segunda sesión del administrador ve de inmediato los cambios hechos por la primera', async () => {
    const beforeRes = await api('/api/admin/users', {}, adminSessionTwo);
    expect(beforeRes.status).toBe(200);
    const before = await beforeRes.json() as { users: { username: string }[] };
    expect(before.users.map((user) => user.username)).toContain('operario.cierre2@granja.pe');

    const createRes = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'temporal.cierre2@granja.pe',
        name: 'Cuenta Temporal Cierre Dos',
        role: 'operario',
        password: 'ClaveTemporalC2!',
        barnIds: [],
      }),
    }, adminSessionOne);
    expect(createRes.status).toBe(201);

    const afterRes = await api('/api/admin/users', {}, adminSessionTwo);
    const after = await afterRes.json() as { users: { username: string }[] };
    expect(after.users.map((user) => user.username)).toContain('temporal.cierre2@granja.pe');
  });

  it('los tres perfiles no administradores reciben 403 en toda la superficie administrativa', async () => {
    const attempts: { label: string; path: string; init: RequestInit }[] = [
      { label: 'listar cuentas', path: '/api/admin/users', init: { method: 'GET' } },
      {
        label: 'crear cuenta',
        path: '/api/admin/users',
        init: {
          method: 'POST',
          body: JSON.stringify({
            username: 'intruso@granja.pe',
            name: 'Intruso',
            role: 'operario',
            password: 'ClaveIntruso1!',
            barnIds: [],
          }),
        },
      },
      { label: 'listar galpones', path: '/api/admin/barns', init: { method: 'GET' } },
      { label: 'eliminar galpón', path: `/api/admin/barns/${barnId}`, init: { method: 'DELETE' } },
      { label: 'consultar auditoría', path: '/api/admin/audit', init: { method: 'GET' } },
      {
        label: 'escribir configuración',
        path: '/api/config/settings',
        init: {
          method: 'POST',
          body: JSON.stringify({
            key: 'farm_name',
            value: 'Intento no autorizado',
            effectiveFrom: '2026-11-01',
            operationKey: 'cierre2-forbidden-config',
          }),
        },
      },
    ];

    const sessions = [
      { profile: 'responsable', token: responsableToken },
      { profile: 'operario', token: operarioToken },
      { profile: 'veterinario', token: veterinarioToken },
    ];

    for (const session of sessions) {
      for (const attempt of attempts) {
        const res = await api(attempt.path, attempt.init, session.token);
        expect(res.status, `${session.profile} intentando ${attempt.label}`).toBe(403);
      }
    }

    // La cuenta intrusa no se creó y el galpón sigue existiendo.
    const usersRes = await api('/api/admin/users', {}, adminSessionOne);
    const usersData = await usersRes.json() as { users: { username: string }[] };
    expect(usersData.users.some((user) => user.username === 'intruso@granja.pe')).toBe(false);

    const barnsRes = await api('/api/admin/barns', {}, adminSessionOne);
    const barnsData = await barnsRes.json() as { barns: { id: number }[] };
    expect(barnsData.barns.some((barn) => barn.id === barnId)).toBe(true);

    // La lectura de configuración sí está disponible para perfiles autenticados.
    const configRes = await api('/api/config', {}, operarioToken);
    expect(configRes.status).toBe(200);
  });

  it('desactivar una cuenta revoca sus sesiones de inmediato y no las revive al reactivarla', async () => {
    const meBefore = await api('/api/auth/me', {}, operarioToken);
    expect(meBefore.status).toBe(200);

    const deactivateRes = await api(`/api/admin/users/${operarioId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: 0 }),
    }, adminSessionOne);
    expect(deactivateRes.status).toBe(200);

    const meAfter = await api('/api/auth/me', {}, operarioToken);
    expect(meAfter.status).toBe(401);

    const dataAfter = await api('/api/data/resumen', {}, operarioToken);
    expect(dataAfter.status).toBe(401);

    const revoked = await db.prepare('SELECT count(*) as count FROM sessions WHERE user_id = ? AND revoked_at IS NOT NULL')
      .bind(operarioId).first() as { count: number } | null;
    expect(revoked?.count).toBeGreaterThan(0);

    const reactivateRes = await api(`/api/admin/users/${operarioId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: 1 }),
    }, adminSessionTwo);
    expect(reactivateRes.status).toBe(200);

    const meAfterReactivate = await api('/api/auth/me', {}, operarioToken);
    expect(meAfterReactivate.status).toBe(401);

    const newToken = await login('operario.cierre2@granja.pe', 'ClaveOperarioC2!');
    const meNew = await api('/api/auth/me', {}, newToken);
    expect(meNew.status).toBe(200);

    operarioToken = newToken;
  });

  it('un cambio de rol se refleja de inmediato en la sesión existente', async () => {
    const changeRes = await api(`/api/admin/users/${responsableId}`, {
      method: 'PUT',
      body: JSON.stringify({ role: 'operario', barnIds: [barnId] }),
    }, adminSessionOne);
    expect(changeRes.status).toBe(200);

    const meRes = await api('/api/auth/me', {}, responsableToken);
    expect(meRes.status).toBe(200);
    const me = await meRes.json() as { user: { role: string } };
    expect(me.user.role).toBe('operario');

    const adminRes = await api('/api/admin/users', {}, responsableToken);
    expect(adminRes.status).toBe(403);
  });

  it('cerrar sesión revoca el token en el acto', async () => {
    const logoutRes = await api('/api/auth/logout', { method: 'POST' }, veterinarioToken);
    expect(logoutRes.status).toBe(200);

    const meRes = await api('/api/auth/me', {}, veterinarioToken);
    expect(meRes.status).toBe(401);
  });
});
