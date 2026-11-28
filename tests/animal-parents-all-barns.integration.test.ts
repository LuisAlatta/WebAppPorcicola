import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import worker from '../worker/index';

const runtime = new Miniflare({
  workers: [{
    config: {
      name: 'animal-parents-all-barns-test',
      compatibilityDate: '2026-07-01',
      manifest: {
        mainModule: 'index.js',
        modules: {
          'index.js': {
            type: 'esm',
            contents: 'export default { fetch() { return new Response("ok"); } };',
          },
        },
        modulesRoot: '/',
      },
      env: { DB: { type: 'd1', id: 'animal-parents-all-barns' } },
    },
  }],
});

describe('Progenitores internos de todos los galpones', () => {
  let db: D1Database;
  let adminToken: string;
  let operarioToken: string;
  let barnCId: number;
  const ids: Record<string, number> = {};

  const req = (path: string, init: RequestInit = {}, token = adminToken) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), { DB: db });
  };

  const createAnimal = async (body: Record<string, unknown>, token = adminToken, barnHeader?: string) => {
    const headers: Record<string, string> = {};
    if (barnHeader) headers['X-Barn-Ids'] = barnHeader;
    return req('/api/animals', { method: 'POST', headers, body: JSON.stringify(body) }, token);
  };

  beforeAll(async () => {
    db = await runtime.getD1Database('DB');
    for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ');
      let trigger = '';
      for (const part of sql.split(';').map(p => p.trim()).filter(Boolean)) {
        if (trigger || /^CREATE TRIGGER/i.test(part)) {
          trigger += `${part}; `;
          if (/\bEND$/i.test(part)) { await db.prepare(trigger.trim()).run(); trigger = ''; }
        } else {
          await db.prepare(part).run();
        }
      }
      if (trigger) throw new Error(`Trigger incompleto: ${file}`);
    }

    const bootstrap = await worker.fetch(new Request('http://localhost/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin-parents@granja.test', password: 'PasswordFicticio2026!', name: 'Admin prueba' }),
    }), { DB: db });
    expect(bootstrap.status, await bootstrap.clone().text()).toBe(201);
    adminToken = (await bootstrap.json() as { token: string }).token;

    const barnC = await req('/api/admin/barns', {
      method: 'POST',
      body: JSON.stringify({ code: 'G-C', name: 'Galpón C', capacity: 80 }),
    });
    expect(barnC.status, await barnC.clone().text()).toBe(201);
    barnCId = (await barnC.json() as { barn: { id: number } }).barn.id;

    const operarioCreate = await req('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'operario-a@granja.test',
        name: 'Operario A',
        role: 'operario',
        password: 'PasswordOperario2026!',
        barnIds: [1],
      }),
    });
    expect(operarioCreate.status, await operarioCreate.clone().text()).toBe(201);

    const operarioLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operario-a@granja.test', password: 'PasswordOperario2026!' }),
    }), { DB: db });
    expect(operarioLogin.status, await operarioLogin.clone().text()).toBe(200);
    operarioToken = (await operarioLogin.json() as { token: string }).token;

    const fixtures = [
      { key: 'hA', code: '001', alias: 'Lola', animalType: 'cerda', sex: 'hembra', barnId: 1 },
      { key: 'mA', code: 'M-A1', alias: 'Toro', animalType: 'verraco', sex: 'macho', barnId: 1 },
      { key: 'pA', code: 'P-A1', alias: null, animalType: 'lechon', sex: 'pendiente', barnId: 1 },
      { key: 'hB', code: '001', alias: 'Bella', animalType: 'reemplazo', sex: 'hembra', barnId: 2 },
      { key: 'mB', code: 'M-B1', alias: 'Max', animalType: 'lechon', sex: 'macho', barnId: 2 },
      { key: 'hC', code: 'H-C1', alias: 'Nube', animalType: 'cerda', sex: 'hembra', barnId: barnCId },
      { key: 'mC', code: 'M-C1', alias: 'Rey', animalType: 'verraco', sex: 'macho', barnId: barnCId },
      { key: 'hInact', code: 'H-INACT', alias: null, animalType: 'cerda', sex: 'hembra', barnId: 2 },
    ];

    for (const item of fixtures) {
      const res = await createAnimal({
        code: item.code,
        alias: item.alias,
        animalType: item.animalType,
        sex: item.sex,
        birthDate: '2024-01-10',
        entryDate: '2025-01-10',
        entryStageCode: 'reproductor',
        barnId: item.barnId,
        originType: 'inicial',
        reason: 'Carga de prueba de progenitores',
        operationKey: `seed-parent-${item.key}`,
      });
      expect(res.status, await res.clone().text()).toBe(201);
      ids[item.key] = (await res.json() as { animal: { id: number } }).animal.id;
    }

    const deactivate = await req(`/api/animals/id:${ids.hInact}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Baja lógica de prueba' }),
    });
    expect(deactivate.status, await deactivate.clone().text()).toBe(200);
  }, 90000);

  afterAll(async () => runtime.dispose());

  it('requiere autenticación y valida el filtro de sexo', async () => {
    const anon = await worker.fetch(new Request('http://localhost/api/animal-parents?sex=hembra'), { DB: db });
    expect(anon.status).toBe(401);

    const invalidSex = await req('/api/animal-parents?sex=pendiente');
    expect(invalidSex.status).toBe(400);
  });

  it('lista hembras de todos los galpones y machos de todos los galpones aunque solo esté seleccionado un galpón', async () => {
    const femalesAdmin = await req('/api/animal-parents?sex=hembra', { headers: { 'X-Barn-Ids': '1' } }, adminToken);
    expect(femalesAdmin.status, await femalesAdmin.clone().text()).toBe(200);
    const femalesAdminBody = await femalesAdmin.json() as { animals: { id: number; code: string; sex: string; barnName: string }[]; total: number };
    expect(femalesAdminBody.total).toBe(3);
    expect(femalesAdminBody.animals.map(a => `${a.code}@${a.barnName}`)).toEqual([
      '001@Galpón A',
      '001@Galpón B',
      'H-C1@Galpón C',
    ]);
    expect(femalesAdminBody.animals.every(a => a.sex === 'hembra')).toBe(true);

    const malesAdmin = await req('/api/animal-parents?sex=macho', { headers: { 'X-Barn-Ids': '1' } }, adminToken);
    expect(malesAdmin.status, await malesAdmin.clone().text()).toBe(200);
    const malesAdminBody = await malesAdmin.json() as { animals: { id: number; code: string; sex: string; barnName: string }[]; total: number };
    expect(malesAdminBody.total).toBe(3);
    expect(malesAdminBody.animals.map(a => `${a.code}@${a.barnName}`)).toEqual([
      'M-A1@Galpón A',
      'M-B1@Galpón B',
      'M-C1@Galpón C',
    ]);
    expect(malesAdminBody.animals.every(a => a.sex === 'macho')).toBe(true);

    // Operario asignado solo a Galpón A también ve los progenitores de todos los galpones,
    // mientras el padrón /api/animals mantiene el aislamiento por galpón.
    const femalesOperario = await req('/api/animal-parents?sex=hembra', { headers: { 'X-Barn-Ids': '1' } }, operarioToken);
    expect(femalesOperario.status, await femalesOperario.clone().text()).toBe(200);
    expect((await femalesOperario.json() as { total: number }).total).toBe(3);

    const malesOperario = await req('/api/animal-parents?sex=macho', { headers: { 'X-Barn-Ids': '1' } }, operarioToken);
    expect(malesOperario.status, await malesOperario.clone().text()).toBe(200);
    expect((await malesOperario.json() as { total: number }).total).toBe(3);

    const scopedPadron = await req('/api/animals?sex=hembra', { headers: { 'X-Barn-Ids': '1' } }, operarioToken);
    expect(scopedPadron.status).toBe(200);
    expect((await scopedPadron.json() as { total: number }).total).toBe(1);

    // Permite buscar por código, alias o nombre de galpón.
    const byBarn = await req('/api/animal-parents?sex=macho&q=Galpón%20C', { headers: { 'X-Barn-Ids': '1' } }, operarioToken);
    expect(byBarn.status).toBe(200);
    const byBarnBody = await byBarn.json() as { animals: { code: string }[] };
    expect(byBarnBody.animals.map(a => a.code)).toEqual(['M-C1']);
  });

  it('permite registrar y editar un animal usando madre y padre internos ubicados en otros galpones', async () => {
    const created = await createAnimal({
      code: 'CRIA-01',
      animalType: 'lechon',
      sex: 'hembra',
      birthDate: '2026-02-01',
      entryDate: '2026-02-01',
      entryStageCode: 'preinicio',
      barnId: 1,
      originType: 'nacimiento',
      motherId: ids.hB,
      fatherId: ids.mC,
      reason: 'Alta con progenitores en otros galpones',
      operationKey: 'cria-cross-barn-01',
    }, operarioToken, '1');
    expect(created.status, await created.clone().text()).toBe(201);
    const createdBody = await created.json() as { animal: { id: number; mother: { id: number; code: string } | null; father: { id: number; code: string } | null } };
    expect(createdBody.animal.mother?.id).toBe(ids.hB);
    expect(createdBody.animal.mother?.code).toBe('001');
    expect(createdBody.animal.father?.id).toBe(ids.mC);
    expect(createdBody.animal.father?.code).toBe('M-C1');

    // Edición también permite cambiar a progenitores de otros galpones.
    const updated = await req(`/api/animals/id:${createdBody.animal.id}`, {
      method: 'PUT',
      headers: { 'X-Barn-Ids': '1' },
      body: JSON.stringify({
        motherId: ids.hC,
        fatherId: ids.mB,
        reason: 'Corrección de progenitores entre galpones',
        operationKey: 'cria-cross-barn-01-edit',
      }),
    }, operarioToken);
    expect(updated.status, await updated.clone().text()).toBe(200);
    const updatedBody = await updated.json() as { animal: { mother: { id: number; code: string } | null; father: { id: number; code: string } | null } };
    expect(updatedBody.animal.mother?.id).toBe(ids.hC);
    expect(updatedBody.animal.mother?.code).toBe('H-C1');
    expect(updatedBody.animal.father?.id).toBe(ids.mB);
    expect(updatedBody.animal.father?.code).toBe('M-B1');

    // Sigue impidiendo crear animales fuera del galpón autorizado y conserva la validación de sexo.
    const forbiddenBarn = await createAnimal({
      code: 'CRIA-FORBIDDEN',
      animalType: 'lechon',
      sex: 'macho',
      entryDate: '2026-02-01',
      entryStageCode: 'preinicio',
      barnId: 2,
      originType: 'nacimiento',
      motherId: ids.hB,
      reason: 'Intento fuera de galpón',
      operationKey: 'cria-forbidden-barn',
    }, operarioToken, '1');
    expect(forbiddenBarn.status).toBe(403);

    const wrongSex = await createAnimal({
      code: 'CRIA-BAD-SEX',
      animalType: 'lechon',
      sex: 'macho',
      entryDate: '2026-02-01',
      entryStageCode: 'preinicio',
      barnId: 1,
      originType: 'nacimiento',
      motherId: ids.mC,
      reason: 'Intento con macho como madre',
      operationKey: 'cria-bad-sex',
    }, operarioToken, '1');
    expect(wrongSex.status).toBe(400);
    expect((await wrongSex.json() as { error: string }).error).toContain('sexo hembra');
  });
});
