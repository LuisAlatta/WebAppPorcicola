import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  revokeSession,
  countAdminUsers,
  findUserByUsername,
  parseCookies,
  serializeSessionCookie,
  clearSessionCookie,
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts,
  getUserBarns,
} from './auth';

export interface Env {
  DB: D1Database;
}

function getSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookies = parseCookies(request.headers.get('Cookie'));
  return cookies['session'] || null;
}

function checkCsrf(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }
  const origin = request.headers.get('Origin');
  if (!origin) {
    // Permitir solicitudes directas o clientes móviles que no envían Origin
    return true;
  }
  try {
    const originHost = new URL(origin).host;
    const requestHost = new URL(request.url).host;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Solo procesar rutas bajo /api/
    if (!path.startsWith('/api/')) {
      return Response.json({ error: 'Ruta no encontrada' }, { status: 404 });
    }

    // Validación CSRF
    if (!checkCsrf(request)) {
      return Response.json({ error: 'Origen no autorizado (CSRF)' }, { status: 403 });
    }

    // 1. Bootstrap: Inicialización de un solo uso del primer administrador
    if (path === '/api/auth/bootstrap' && request.method === 'POST') {
      try {
        const body = await request.json() as { username?: string; password?: string; name?: string };
        const username = body.username?.trim();
        const password = body.password?.trim();
        const name = body.name?.trim();

        if (!username || !password || !name) {
          return Response.json({ error: 'Datos incompletos: username, password y name son obligatorios' }, { status: 400 });
        }

        if (password.length < 8) {
          return Response.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
        }

        const adminCount = await countAdminUsers(env.DB);
        if (adminCount > 0) {
          return Response.json(
            { error: 'El administrador inicial ya ha sido configurado. Procedimiento de inicialización cerrado' },
            { status: 403 },
          );
        }

        const { hash, salt } = await hashPassword(password);
        const now = new Date().toISOString();

        // Crear administrador y galpones base si no existen
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO users (username, name, role, password_hash, password_salt, is_active, created_at, updated_at)
            VALUES (?, ?, 'administrador', ?, ?, 1, ?, ?)
          `).bind(username.toLowerCase(), name, hash, salt, now, now),
          env.DB.prepare(`
            INSERT OR IGNORE INTO barns (id, code, name, capacity, created_at)
            VALUES (1, 'G-A', 'Galpón A', 80, ?)
          `).bind(now),
          env.DB.prepare(`
            INSERT OR IGNORE INTO barns (id, code, name, capacity, created_at)
            VALUES (2, 'G-B', 'Galpón B', 80, ?)
          `).bind(now),
        ]);

        const adminUser = await findUserByUsername(env.DB, username);
        if (!adminUser) {
          return Response.json({ error: 'Error al inicializar administrador' }, { status: 500 });
        }

        const sessionToken = await createSession(env.DB, adminUser.id);
        const cookie = serializeSessionCookie(sessionToken);

        return Response.json(
          {
            ok: true,
            user: {
              id: adminUser.id,
              username: adminUser.username,
              name: adminUser.name,
              role: adminUser.role,
              barns: ['Galpón A', 'Galpón B'],
            },
            token: sessionToken,
          },
          {
            status: 201,
            headers: { 'Set-Cookie': cookie },
          },
        );
      } catch (err) {
        return Response.json({ error: 'Error procesando solicitud: ' + String(err) }, { status: 500 });
      }
    }

    // 2. Login: Autenticación con verificación de contraseña y sesiones revocables
    if (path === '/api/auth/login' && request.method === 'POST') {
      try {
        const body = await request.json() as { username?: string; password?: string };
        const username = body.username?.trim();
        const password = body.password?.trim();

        if (!username || !password) {
          return Response.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
        }

        const rateLimitKey = `login:${username.toLowerCase()}`;
        const rateCheck = await checkRateLimit(env.DB, rateLimitKey, 5, 15 * 60 * 1000);

        if (!rateCheck.allowed) {
          return Response.json(
            { error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos' },
            { status: 429 },
          );
        }

        const user = await findUserByUsername(env.DB, username);

        if (!user || user.is_active !== 1) {
          await recordFailedAttempt(env.DB, rateLimitKey);
          return Response.json({ error: 'Credenciales inválidas o cuenta desactivada' }, { status: 401 });
        }

        const passwordValid = await verifyPassword(password, user.password_hash, user.password_salt);
        if (!passwordValid) {
          await recordFailedAttempt(env.DB, rateLimitKey);
          return Response.json({ error: 'Credenciales inválidas o cuenta desactivada' }, { status: 401 });
        }

        await resetFailedAttempts(env.DB, rateLimitKey);

        const sessionToken = await createSession(env.DB, user.id);
        const barns = await getUserBarns(env.DB, user.id);
        const cookie = serializeSessionCookie(sessionToken);

        return Response.json(
          {
            ok: true,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              role: user.role,
              barns: user.role === 'administrador' ? ['Galpón A', 'Galpón B'] : barns,
            },
            token: sessionToken,
          },
          {
            status: 200,
            headers: { 'Set-Cookie': cookie },
          },
        );
      } catch (err) {
        return Response.json({ error: 'Error procesando login: ' + String(err) }, { status: 500 });
      }
    }

    // 3. Logout: Revocación inmediata de sesión y limpieza de cookie
    if (path === '/api/auth/logout' && request.method === 'POST') {
      const token = getSessionToken(request);
      if (token) {
        await revokeSession(env.DB, token);
      }
      return Response.json(
        { ok: true, message: 'Sesión finalizada exitosamente' },
        {
          status: 200,
          headers: { 'Set-Cookie': clearSessionCookie() },
        },
      );
    }

    // 4. Me: Verificación de sesión activa
    if (path === '/api/auth/me' && request.method === 'GET') {
      const token = getSessionToken(request);
      if (!token) {
        return Response.json({ error: 'No autenticado: falta sesión' }, { status: 401 });
      }

      const session = await validateSession(env.DB, token);
      if (!session) {
        return Response.json({ error: 'Sesión inválida, expirada o revocada' }, { status: 401 });
      }

      return Response.json({
        ok: true,
        user: {
          id: session.user.id,
          username: session.user.username,
          name: session.user.name,
          role: session.user.role,
          barns: session.user.role === 'administrador' ? ['Galpón A', 'Galpón B'] : session.barns,
        },
      });
    }

    // 5. Endpoint de prueba protegido: Resumen operativo
    if (path === '/api/data/resumen' && request.method === 'GET') {
      const token = getSessionToken(request);
      if (!token) {
        return Response.json({ error: 'Acceso denegado: se requiere sesión activa' }, { status: 401 });
      }

      const session = await validateSession(env.DB, token);
      if (!session) {
        return Response.json({ error: 'Acceso denegado: sesión inválida o expirada' }, { status: 401 });
      }

      // Si el usuario no tiene galpones y no es administrador, no recibe datos
      if (session.user.role !== 'administrador' && session.barns.length === 0) {
        return Response.json({
          ok: true,
          mensaje: 'Cuenta activa sin galpones asignados',
          totalCabezas: 0,
          galpones: [],
        });
      }

      return Response.json({
        ok: true,
        perfil: session.user.role,
        galponesAutorizados: session.user.role === 'administrador' ? ['Galpón A', 'Galpón B'] : session.barns,
        totalCabezas: 142,
        cajaOperativaSoles: 14850.0,
      });
    }

    return Response.json({ error: 'Ruta no encontrada' }, { status: 404 });
  },
};

export default worker;
