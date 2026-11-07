import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'worker-auth-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'auth-database' } },
    },
  }],
});

describe('Autenticación, sesiones y primer administrador · T04', () => {
  let db: D1Database;

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    await db.exec('PRAGMA foreign_keys = ON;');

    // Cargar y ejecutar las migraciones 0001 y 0002 en orden
    const migrationFiles = ['0001_initial_schema.sql', '0002_administration_schema.sql'];
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
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('permite crear el primer administrador con bootstrap y bloquea reutilización', async () => {
    // 1. Primer intento exitoso
    const res = await worker.fetch(
      new Request('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
          name: 'Administrador Principal',
        }),
      }),
      { DB: db },
    );

    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean; user: { role: string; username: string }; token: string };
    expect(body.ok).toBe(true);
    expect(body.user.role).toBe('administrador');
    expect(body.user.username).toBe('admin@granja.pe');
    expect(body.token).toBeDefined();

    // Comprobar cookie de sesión
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');

    // 2. Segundo intento debe ser bloqueado con 403 Forbidden
    const resRepetido = await worker.fetch(
      new Request('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'otro_admin@granja.pe',
          password: 'OtraPassword123!',
          name: 'Intruso',
        }),
      }),
      { DB: db },
    );

    expect(resRepetido.status).toBe(403);
    const bodyRepetido = await resRepetido.json() as { error: string };
    expect(bodyRepetido.error).toContain('cerrado');
  });

  it('rechaza login con credenciales inválidas y acepta credenciales válidas', async () => {
    // Intento con clave incorrecta
    const resInvalido = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'ClaveEquivocada123',
        }),
      }),
      { DB: db },
    );

    expect(resInvalido.status).toBe(401);
    const bodyInvalido = await resInvalido.json() as { error: string };
    expect(bodyInvalido.error).toContain('inválidas');

    // Intento con credenciales correctas
    const resValido = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );

    expect(resValido.status).toBe(200);
    const bodyValido = await resValido.json() as { ok: boolean; user: { role: string }; token: string };
    expect(bodyValido.ok).toBe(true);
    expect(bodyValido.user.role).toBe('administrador');
    expect(bodyValido.token).toBeDefined();
  });

  it('verifica sesión activa mediante /api/auth/me tanto por cookie como por Bearer header', async () => {
    // 1. Iniciar sesión para obtener token
    const loginRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );
    const loginBody = await loginRes.json() as { token: string };
    const token = loginBody.token;

    // 2. Consulta por Authorization Bearer
    const resBearer = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: db },
    );
    expect(resBearer.status).toBe(200);
    const bodyBearer = await resBearer.json() as { ok: boolean; user: { username: string } };
    expect(bodyBearer.ok).toBe(true);
    expect(bodyBearer.user.username).toBe('admin@granja.pe');

    // 3. Consulta por Cookie
    const resCookie = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Cookie: `session=${token}` },
      }),
      { DB: db },
    );
    expect(resCookie.status).toBe(200);

    // 4. Consulta sin credenciales da 401
    const resSinAuth = await worker.fetch(
      new Request('http://localhost/api/auth/me'),
      { DB: db },
    );
    expect(resSinAuth.status).toBe(401);
  });

  it('cierra la sesión y revoca el token en base de datos', async () => {
    const loginRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );
    const { token } = await loginRes.json() as { token: string };

    // Logout
    const logoutRes = await worker.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: db },
    );
    expect(logoutRes.status).toBe(200);

    // Cookie de expiración inmediata
    const setCookie = logoutRes.headers.get('Set-Cookie');
    expect(setCookie).toContain('Max-Age=0');

    // Intentar usar el token revocado en /api/auth/me debe fallar con 401
    const meRes = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: db },
    );
    expect(meRes.status).toBe(401);
  });

  it('rechaza el acceso y las sesiones activas si la cuenta es desactivada', async () => {
    // 1. Login previo con cuenta activa
    const loginRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );
    const { token } = await loginRes.json() as { token: string };

    // 2. Desactivar cuenta directamente en D1
    await db.prepare("UPDATE users SET is_active = 0 WHERE username = 'admin@granja.pe'").run();

    // 3. Consulta con token existente debe fallar
    const meRes = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: db },
    );
    expect(meRes.status).toBe(401);

    // 4. Nuevo intento de login debe ser rechazado
    const loginIntent = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );
    expect(loginIntent.status).toBe(401);

    // Reactivar para siguientes pruebas
    await db.prepare("UPDATE users SET is_active = 1 WHERE username = 'admin@granja.pe'").run();
  });

  it('protege los datos operativos: sin sesión no se lee información', async () => {
    // Sin autenticación: 401
    const resSinSesion = await worker.fetch(
      new Request('http://localhost/api/data/resumen'),
      { DB: db },
    );
    expect(resSinSesion.status).toBe(401);

    // Con autenticación válida: 200 con datos
    const loginRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );
    const { token } = await loginRes.json() as { token: string };

    const resConSesion = await worker.fetch(
      new Request('http://localhost/api/data/resumen', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: db },
    );
    expect(resConSesion.status).toBe(200);
    const data = await resConSesion.json() as { ok: boolean; totalCabezas: number };
    expect(data.ok).toBe(true);
    expect(data.totalCabezas).toBe(142);
  });

  it('bloquea solicitudes con origen cruzado no autorizado (CSRF)', async () => {
    const resCsrf = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://sitio-malicioso.fake',
        },
        body: JSON.stringify({
          username: 'admin@granja.pe',
          password: 'PasswordSegura2026!',
        }),
      }),
      { DB: db },
    );
    expect(resCsrf.status).toBe(403);
    const body = await resCsrf.json() as { error: string };
    expect(body.error).toContain('CSRF');
  });
});
