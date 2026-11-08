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
  getAllBarnNames,
} from './auth';
import {
  listAllUsers,
  createUser,
  updateUser,
  listAllBarns,
  createBarn,
  updateBarn,
  assignBarnTeam,
  correctTeamAssignment,
  updateBarnStatus,
  deleteBarn,
  getTeamHistory,
} from './admin';
import { ApiError, listAuditLog } from './events';
import {
  getConfigSnapshot,
  getConfigHistory,
  saveCatalogItem,
  saveStage,
  saveSetting,
  saveLocation,
  saveLot,
  retireCatalogItem,
  retireStage,
  retireLocation,
  retireLot,
  type ConfigHistoryEntity,
} from './config';
import {
  getInventorySnapshot,
  listInventoryMovements,
  registerMovement,
  transferInventory,
  reconcileInventory,
  correctInventoryMovement,
  previewMovementCorrection,
} from './inventory';
import {
  listAnimals,
  getAnimal,
  createAnimal,
  updateAnimal,
  changeTag,
  setAnimalAvailability,
  transferAnimal,
  registerAnimalWeight,
  correctAnimalWeight,
  registerAnimalExit,
} from './animals';
import {
  listReproductionCycles, createReproductionCycle, addReproductionService,
  recordReproductionEvent, updateReproductionCycle, createPregnantAntecedent,
} from './reproduction';

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
        const barns = user.role === 'administrador'
          ? await getAllBarnNames(env.DB)
          : await getUserBarns(env.DB, user.id);
        const cookie = serializeSessionCookie(sessionToken);

        return Response.json(
          {
            ok: true,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              role: user.role,
              barns,
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

      const sessionBarns = session.user.role === 'administrador'
        ? await getAllBarnNames(env.DB)
        : session.barns;

      return Response.json({
        ok: true,
        user: {
          id: session.user.id,
          username: session.user.username,
          name: session.user.name,
          role: session.user.role,
          barns: sessionBarns,
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

      const barns = session.user.role === 'administrador'
        ? await getAllBarnNames(env.DB)
        : session.barns;

      return Response.json({
        ok: true,
        perfil: session.user.role,
        galponesAutorizados: barns,
        totalCabezas: 142,
        cajaOperativaSoles: 14850.0,
      });
    }

    // 6. CONFIGURACIÓN VERSIONADA DE LA GRANJA (T07 · CFG-01..CFG-05)
    if (path === '/api/config' || path.startsWith('/api/config/')) {
      const token = getSessionToken(request);
      if (!token) {
        return Response.json({ error: 'No autenticado: falta sesión' }, { status: 401 });
      }

      const session = await validateSession(env.DB, token);
      if (!session) {
        return Response.json({ error: 'Sesión inválida, expirada o revocada' }, { status: 401 });
      }

      const isWrite = request.method !== 'GET';
      if (isWrite && session.user.role !== 'administrador') {
        return Response.json({ error: 'Acceso denegado: solo el Administrador configura la granja' }, { status: 403 });
      }

      try {
        if (path === '/api/config' && request.method === 'GET') {
          const snapshot = await getConfigSnapshot(env.DB, url.searchParams.get('asOf'));
          return Response.json({ ok: true, ...snapshot });
        }

        if (path === '/api/config/history' && request.method === 'GET') {
          const entity = (url.searchParams.get('entity') ?? '') as ConfigHistoryEntity;
          if (!['catalog', 'stage', 'setting', 'location', 'lot'].includes(entity)) {
            return Response.json({ error: 'Entidad de historial inválida' }, { status: 400 });
          }
          const code = url.searchParams.get('code') ?? '';
          const catalogKey = url.searchParams.get('catalogKey') ?? undefined;
          const history = await getConfigHistory(env.DB, entity, code, catalogKey);
          return Response.json({ ok: true, history });
        }

        if (path === '/api/config/settings' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof saveSetting>[2];
          const result = await saveSetting(env.DB, session.user.id, body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/stages' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof saveStage>[2];
          const result = await saveStage(env.DB, session.user.id, body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/stages/retire' && request.method === 'POST') {
          const body = await request.json() as { code?: string; effectiveFrom?: string; operationKey?: string; reason?: string };
          const result = await retireStage(env.DB, session.user.id, body.code ?? '', body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/catalogs' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof saveCatalogItem>[2];
          const result = await saveCatalogItem(env.DB, session.user.id, body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/catalogs/retire' && request.method === 'POST') {
          const body = await request.json() as {
            catalogKey?: string; code?: string; effectiveFrom?: string; operationKey?: string; reason?: string;
          };
          const result = await retireCatalogItem(env.DB, session.user.id, body.catalogKey ?? '', body.code ?? '', body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/locations' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof saveLocation>[2];
          const result = await saveLocation(env.DB, session.user.id, body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/locations/retire' && request.method === 'POST') {
          const body = await request.json() as { code?: string; effectiveFrom?: string; operationKey?: string; reason?: string };
          const result = await retireLocation(env.DB, session.user.id, body.code ?? '', body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/lots' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof saveLot>[2];
          const result = await saveLot(env.DB, session.user.id, body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        if (path === '/api/config/lots/retire' && request.method === 'POST') {
          const body = await request.json() as { code?: string; effectiveFrom?: string; operationKey?: string; reason?: string };
          const result = await retireLot(env.DB, session.user.id, body.code ?? '', body);
          return Response.json({ ok: true, item: result.item, replayed: result.replayed });
        }

        return Response.json({ error: 'Ruta de configuración no encontrada' }, { status: 404 });
      } catch (err) {
        const message = (err as Error).message || String(err);
        const status = err instanceof ApiError ? err.status : 400;
        return Response.json({ error: message }, { status });
      }
    }

    // 7. INVENTARIO INDIVIDUAL Y COLECTIVO (T08 · INV-01..INV-03)
    if (path === '/api/inventory' || path.startsWith('/api/inventory/')) {
      const token = getSessionToken(request);
      if (!token) {
        return Response.json({ error: 'No autenticado: falta sesión' }, { status: 401 });
      }

      const session = await validateSession(env.DB, token);
      if (!session) {
        return Response.json({ error: 'Sesión inválida, expirada o revocada' }, { status: 401 });
      }

      const isWrite = request.method !== 'GET';
      if (isWrite && !['administrador', 'responsable', 'operario'].includes(session.user.role)) {
        return Response.json(
          { error: 'Acceso denegado: el perfil Veterinario solo puede consultar el inventario' },
          { status: 403 },
        );
      }

      const scope = session.user.role === 'administrador'
        ? { allowedBarnNames: null }
        : { allowedBarnNames: session.barns };

      try {
        if (path === '/api/inventory' && request.method === 'GET') {
          const snapshot = await getInventorySnapshot(env.DB, {
            asOf: url.searchParams.get('asOf'),
            from: url.searchParams.get('from'),
            movementLimit: url.searchParams.get('movementLimit') !== null
              ? parseInt(url.searchParams.get('movementLimit') as string, 10)
              : undefined,
          }, scope);
          return Response.json({ ok: true, ...snapshot });
        }

        if (path === '/api/inventory/movements' && request.method === 'GET') {
          const movements = await listInventoryMovements(env.DB, {
            from: url.searchParams.get('from'),
            to: url.searchParams.get('to'),
            type: url.searchParams.get('type'),
            limit: url.searchParams.get('limit') !== null
              ? parseInt(url.searchParams.get('limit') as string, 10)
              : undefined,
          }, scope);
          return Response.json({ ok: true, movements });
        }

        if (path === '/api/inventory/movements' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof registerMovement>[2];
          const result = await registerMovement(env.DB, session.user.id, body, scope);
          return Response.json(
            { ok: true, movement: result.movement, replayed: result.replayed },
            { status: result.replayed ? 200 : 201 },
          );
        }

        if (path === '/api/inventory/transfers' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof transferInventory>[2];
          const result = await transferInventory(env.DB, session.user.id, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }

        if (path === '/api/inventory/reconciliations' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof reconcileInventory>[2];
          const result = await reconcileInventory(env.DB, session.user.id, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }

        if (path === '/api/inventory/corrections' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof correctInventoryMovement>[2];
          const result = await correctInventoryMovement(env.DB, session.user.id, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }

        if (path === '/api/inventory/corrections/preview' && request.method === 'GET') {
          const movementId = Number(url.searchParams.get('movementId'));
          const correctedQuantity = Number(url.searchParams.get('correctedQuantity'));
          const preview = await previewMovementCorrection(env.DB, movementId, correctedQuantity, scope);
          return Response.json({ ok: true, preview });
        }

        return Response.json({ error: 'Ruta de inventario no encontrada' }, { status: 404 });
      } catch (err) {
        const message = (err as Error).message || String(err);
        const status = err instanceof ApiError ? err.status : /guard_id|inventory_movements\.id/.test(message) ? 409 : 400;
        return Response.json({ error: message }, { status });
      }
    }

    // 8. CICLOS REPRODUCTIVOS (T12 · REP-01..REP-06, REP-09)
    if (path === '/api/reproduction/cycles' || path.startsWith('/api/reproduction/')) {
      const token = getSessionToken(request);
      if (!token) return Response.json({ error: 'No autenticado: falta sesión' }, { status: 401 });
      const session = await validateSession(env.DB, token);
      if (!session) return Response.json({ error: 'Sesión inválida, expirada o revocada' }, { status: 401 });
      const isWrite = request.method !== 'GET';
      if (isWrite && !['administrador', 'responsable', 'veterinario'].includes(session.user.role)) {
        return Response.json({ error: 'Acceso denegado: el Operario solo puede consultar reproducción' }, { status: 403 });
      }
      const scope = session.user.role === 'administrador' ? { allowedBarnNames: null } : { allowedBarnNames: session.barns };
      try {
        if (path === '/api/reproduction/cycles' && request.method === 'GET') {
          const result = await listReproductionCycles(env.DB, { from: url.searchParams.get('from') ?? undefined,
            to: url.searchParams.get('to') ?? undefined, status: url.searchParams.get('status') ?? undefined }, scope);
          return Response.json({ ok: true, ...result });
        }
        if (path === '/api/reproduction/cycles' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof createReproductionCycle>[2];
          const result = await createReproductionCycle(env.DB, session.user.id, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }
        if (path === '/api/reproduction/antecedents' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof createPregnantAntecedent>[2];
          const result = await createPregnantAntecedent(env.DB, session.user.id, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }
        const parts = path.split('/').filter(Boolean);
        const cycleId = parts[3] ? decodeURIComponent(parts[3]) : '';
        if (cycleId && parts.length === 4 && request.method === 'PUT') {
          const body = await request.json() as Parameters<typeof updateReproductionCycle>[3];
          const result = await updateReproductionCycle(env.DB, session.user.id, cycleId, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 200 });
        }
        if (cycleId && parts.length === 5 && parts[4] === 'services' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof addReproductionService>[3];
          const result = await addReproductionService(env.DB, session.user.id, cycleId, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }
        if (cycleId && parts.length === 5 && parts[4] === 'events' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof recordReproductionEvent>[3];
          const result = await recordReproductionEvent(env.DB, session.user.id, cycleId, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }
        return Response.json({ error: 'Ruta de reproducción no encontrada' }, { status: 404 });
      } catch (err) {
        const message = (err as Error).message || String(err);
        const status = err instanceof ApiError ? err.status : /UNIQUE constraint|uq_reproduction_open_cycle/.test(message) ? 409 : 400;
        return Response.json({ error: message }, { status });
      }
    }

    // 9. FICHAS INDIVIDUALES DE ANIMALES (T09 · ANI-01..ANI-08, INV-04)
    if (path === '/api/animals' || path.startsWith('/api/animals/')) {
      const token = getSessionToken(request);
      if (!token) {
        return Response.json({ error: 'No autenticado: falta sesión' }, { status: 401 });
      }

      const session = await validateSession(env.DB, token);
      if (!session) {
        return Response.json({ error: 'Sesión inválida, expirada o revocada' }, { status: 401 });
      }

      const isWrite = request.method !== 'GET';
      if (isWrite && !['administrador', 'responsable', 'operario'].includes(session.user.role)) {
        return Response.json(
          { error: 'Acceso denegado: el perfil Veterinario solo puede consultar las fichas' },
          { status: 403 },
        );
      }

      const scope = session.user.role === 'administrador'
        ? { allowedBarnNames: null }
        : { allowedBarnNames: session.barns };

      try {
        if (path === '/api/animals' && request.method === 'GET') {
          const barnIdParam = url.searchParams.get('barnId');
          const result = await listAnimals(env.DB, {
            q: url.searchParams.get('q'),
            type: url.searchParams.get('type'),
            sex: url.searchParams.get('sex'),
            status: url.searchParams.get('status'),
            stage: url.searchParams.get('stage'),
            location: url.searchParams.get('location'),
            lot: url.searchParams.get('lot'),
            barnId: barnIdParam !== null ? parseInt(barnIdParam, 10) : undefined,
            active: url.searchParams.get('active'),
            includeExited: url.searchParams.get('includeExited') === '1',
            limit: url.searchParams.get('limit') !== null
              ? parseInt(url.searchParams.get('limit') as string, 10)
              : undefined,
            offset: url.searchParams.get('offset') !== null
              ? parseInt(url.searchParams.get('offset') as string, 10)
              : undefined,
          }, scope);
          return Response.json({ ok: true, ...result });
        }

        if (path === '/api/animals' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof createAnimal>[2];
          const result = await createAnimal(env.DB, session.user.id, body, scope);
          return Response.json(
            { ok: true, animal: result.animal, replayed: result.replayed },
            { status: result.replayed ? 200 : 201 },
          );
        }

        const rest = path.slice('/api/animals/'.length);
        const segments = rest.split('/').filter((segment) => segment.length > 0);
        const key = segments[0] ? decodeURIComponent(segments[0]) : '';

        if (key && segments.length === 1 && request.method === 'GET') {
          const animal = await getAnimal(env.DB, key, scope);
          return Response.json({ ok: true, animal });
        }

        if (key && segments.length === 1 && request.method === 'PUT') {
          const body = await request.json() as Parameters<typeof updateAnimal>[3];
          const result = await updateAnimal(env.DB, session.user.id, key, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed });
        }

        if (key && segments.length === 2 && segments[1] === 'tags' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof changeTag>[3];
          const result = await changeTag(env.DB, session.user.id, key, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed });
        }

        if (key && segments.length === 2 && segments[1] === 'weights' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof registerAnimalWeight>[3];
          const result = await registerAnimalWeight(env.DB, session.user.id, key, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
        }

        if (key && segments.length === 4 && segments[1] === 'weights' && segments[3] === 'correction' && request.method === 'POST') {
          const weightId = Number(segments[2]);
          if (!Number.isInteger(weightId) || weightId <= 0) throw new ApiError(400, 'Pesaje inválido');
          const body = await request.json() as Parameters<typeof correctAnimalWeight>[4];
          const result = await correctAnimalWeight(env.DB, session.user.id, key, weightId, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
        }

        if (key && segments.length === 2 && segments[1] === 'deactivate' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof setAnimalAvailability>[4];
          const result = await setAnimalAvailability(env.DB, session.user.id, key, false, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed });
        }

        if (key && segments.length === 2 && segments[1] === 'reactivate' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof setAnimalAvailability>[4];
          const result = await setAnimalAvailability(env.DB, session.user.id, key, true, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed });
        }

        if (key && segments.length === 2 && segments[1] === 'transfer' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof transferAnimal>[3];
          const result = await transferAnimal(env.DB, session.user.id, key, body, scope);
          return Response.json({ ok: true, ...result }, { status: result.replayed ? 200 : 201 });
        }

        if (key && segments.length === 2 && segments[1] === 'exit' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof registerAnimalExit>[3];
          const result = await registerAnimalExit(env.DB, session.user.id, key, body, scope);
          return Response.json({ ok: true, animal: result.animal, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
        }

        return Response.json({ error: 'Ruta de animales no encontrada' }, { status: 404 });
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 400;
        return Response.json({ error: (err as Error).message || String(err) }, { status });
      }
    }

    // 9. MÓDULO EXCLUSIVO DE ADMINISTRACIÓN (T05 · ACC-06, ACC-07, ADM-01..04, CFG-06, CA-27, CA-28)
    if (path.startsWith('/api/admin/')) {
      const token = getSessionToken(request);
      if (!token) {
        return Response.json({ error: 'No autenticado: falta sesión' }, { status: 401 });
      }

      const session = await validateSession(env.DB, token);
      if (!session) {
        return Response.json({ error: 'Sesión inválida, expirada o revocada' }, { status: 401 });
      }

      // Verificación estricta de rol: Solo Administrador
      if (session.user.role !== 'administrador') {
        return Response.json(
          { error: 'Acceso denegado: solo el Administrador tiene acceso a este módulo' },
          { status: 403 },
        );
      }

      try {
        // GET /api/admin/users: Listar todas las cuentas
        if (path === '/api/admin/users' && request.method === 'GET') {
          const users = await listAllUsers(env.DB);
          return Response.json({ ok: true, users });
        }

        // POST /api/admin/users: Crear nueva cuenta
        if (path === '/api/admin/users' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof createUser>[1];
          const user = await createUser(env.DB, body);
          return Response.json({ ok: true, user }, { status: 201 });
        }

        // PUT /api/admin/users/:id: Modificar cuenta existente
        if (path.startsWith('/api/admin/users/') && request.method === 'PUT') {
          const userId = parseInt(path.replace('/api/admin/users/', ''), 10);
          if (isNaN(userId)) {
            return Response.json({ error: 'ID de usuario inválido' }, { status: 400 });
          }
          const body = await request.json() as Parameters<typeof updateUser>[2];
          const user = await updateUser(env.DB, userId, body);
          return Response.json({ ok: true, user });
        }

        // GET /api/admin/barns: Listar galpones con equipo operativo
        if (path === '/api/admin/barns' && request.method === 'GET') {
          const barns = await listAllBarns(env.DB);
          return Response.json({ ok: true, barns });
        }

        // POST /api/admin/barns: Crear nuevo galpón
        if (path === '/api/admin/barns' && request.method === 'POST') {
          const body = await request.json() as Parameters<typeof createBarn>[1];
          const barn = await createBarn(env.DB, body);
          return Response.json({ ok: true, barn }, { status: 201 });
        }

        // PUT /api/admin/barns/:id/team: Asignar o sustituir equipo operativo
        if (path.includes('/api/admin/barns/') && path.endsWith('/team') && request.method === 'PUT') {
          const parts = path.split('/');
          const barnId = parseInt(parts[4], 10);
          if (isNaN(barnId)) {
            return Response.json({ error: 'ID de galpón inválido' }, { status: 400 });
          }
          const body = await request.json() as Parameters<typeof assignBarnTeam>[3];
          const result = await assignBarnTeam(env.DB, session.user.id, barnId, body);
          return Response.json({ ok: true, barn: result.barn, replayed: result.replayed });
        }

        // POST /api/admin/barns/:id/team/correction: Corrección con historial (T06 · GES-03)
        if (path.includes('/api/admin/barns/') && path.endsWith('/team/correction') && request.method === 'POST') {
          const parts = path.split('/');
          const barnId = parseInt(parts[4], 10);
          if (isNaN(barnId)) {
            return Response.json({ error: 'ID de galpón inválido' }, { status: 400 });
          }
          const body = await request.json() as Parameters<typeof correctTeamAssignment>[3];
          const result = await correctTeamAssignment(env.DB, session.user.id, barnId, body);
          return Response.json({
            ok: true,
            barn: result.barn,
            correctedHistoryId: result.correctedHistoryId,
            newHistoryId: result.newHistoryId,
            replayed: result.replayed,
          });
        }

        // GET /api/admin/audit: Auditoría de eventos con autor, motivo y registro original
        if (path === '/api/admin/audit' && request.method === 'GET') {
          const entityType = url.searchParams.get('entityType') ?? undefined;
          const entityIdParam = url.searchParams.get('entityId');
          const barnIdParam = url.searchParams.get('barnId');
          const limitParam = url.searchParams.get('limit');

          const entityId = entityIdParam !== null ? parseInt(entityIdParam, 10) : undefined;
          const barnId = barnIdParam !== null ? parseInt(barnIdParam, 10) : undefined;

          if (entityIdParam !== null && isNaN(entityId as number)) {
            return Response.json({ error: 'entityId inválido' }, { status: 400 });
          }
          if (barnIdParam !== null && isNaN(barnId as number)) {
            return Response.json({ error: 'barnId inválido' }, { status: 400 });
          }

          const audit = await listAuditLog(env.DB, {
            entityType,
            entityId,
            barnId,
            limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
          });
          return Response.json({ ok: true, audit });
        }

        // PUT /api/admin/barns/:id/status: Cambiar estado (preparacion, operativo, inactivo)
        if (path.includes('/api/admin/barns/') && path.endsWith('/status') && request.method === 'PUT') {
          const parts = path.split('/');
          const barnId = parseInt(parts[4], 10);
          if (isNaN(barnId)) {
            return Response.json({ error: 'ID de galpón inválido' }, { status: 400 });
          }
          const body = await request.json() as { status: 'preparacion' | 'operativo' | 'inactivo' };
          await updateBarnStatus(env.DB, barnId, body.status);
          return Response.json({ ok: true, message: 'Estado del galpón actualizado exitosamente' });
        }

        // PUT /api/admin/barns/:id: Actualizar datos generales del galpón
        if (path.startsWith('/api/admin/barns/') && request.method === 'PUT') {
          const barnId = parseInt(path.replace('/api/admin/barns/', ''), 10);
          if (isNaN(barnId)) {
            return Response.json({ error: 'ID de galpón inválido' }, { status: 400 });
          }
          const body = await request.json() as Parameters<typeof updateBarn>[2];
          await updateBarn(env.DB, barnId, body);
          return Response.json({ ok: true, message: 'Galpón actualizado exitosamente' });
        }

        // DELETE /api/admin/barns/:id: Eliminar galpón sin registros
        if (path.startsWith('/api/admin/barns/') && request.method === 'DELETE') {
          const barnId = parseInt(path.replace('/api/admin/barns/', ''), 10);
          if (isNaN(barnId)) {
            return Response.json({ error: 'ID de galpón inválido' }, { status: 400 });
          }
          await deleteBarn(env.DB, barnId);
          return Response.json({ ok: true, message: 'Galpón eliminado exitosamente' });
        }

        // GET /api/admin/history: Historial de cambios de equipo
        if (path === '/api/admin/history' && request.method === 'GET') {
          const history = await getTeamHistory(env.DB);
          return Response.json({ ok: true, history });
        }

        return Response.json({ error: 'Ruta de administración no encontrada' }, { status: 404 });
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 400;
        return Response.json({ error: (err as Error).message || String(err) }, { status });
      }
    }

    return Response.json({ error: 'Ruta no encontrada' }, { status: 404 });
  },
};

export default worker;
