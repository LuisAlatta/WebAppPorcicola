import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthFixture } from './health-test-helpers';
import { createAnimal, transferAnimal } from '../worker/animals';
import { retireLocation, saveLocation } from '../worker/config';
import { assertLocationForBarn } from '../worker/locations';

describe('Ubicaciones vinculadas al galpón físico', () => {
  let fixture: Awaited<ReturnType<typeof healthFixture>>;
  beforeAll(async () => { fixture = await healthFixture('location-barns'); });
  afterAll(async () => { await fixture?.runtime.dispose(); });

  const location = (code: string, overrides: Record<string, unknown> = {}) => ({
    code, name: code, locationType: 'corral', parentCode: 'galpon_a',
    effectiveFrom: '2026-02-01', operationKey: `loc-${code}`, ...overrides,
  });
  const animal = (code: string, overrides: Record<string, unknown> = {}) => ({
    code, animalType: 'lechon', sex: 'macho', originType: 'inicial',
    barnId: 1, locationCode: 'galpon_a', entryDate: '2026-03-01', entryStageCode: 'preinicio',
    reason: 'Alta de prueba de ubicación', operationKey: `ani-${code}`, ...overrides,
  });

  it('rechaza el alta cruzada y no agrega ficha, stock ni operación', async () => {
    const response = await fixture.api('/api/animals', animal('CRUZADO', { locationCode: 'galpon_b' }));
    expect(response.status).toBe(400);
    expect(await fixture.db.prepare("SELECT id FROM animals WHERE code='CRUZADO'").first()).toBeNull();
    expect(await fixture.db.prepare("SELECT id FROM operation_log WHERE operation_key='ani-CRUZADO'").first()).toBeNull();
  });

  it('hereda el galpón del corral y conserva el vínculo aunque cambie el nombre', async () => {
    const saved = await fixture.api('/api/config/locations', location('corral_vinculado'));
    expect(saved.status).toBe(200);
    expect((await saved.json() as { item: { barnId: number } }).item.barnId).toBe(1);
    await fixture.db.prepare("UPDATE barns SET name='Nave renombrada' WHERE id=1").run();
    const valid = await fixture.api('/api/animals', animal('CORRAL-OK', { locationCode: 'corral_vinculado' }));
    expect(valid.status).toBe(201);
    const invalid = await fixture.api('/api/animals', animal('CORRAL-CRUZADO', { barnId: 2, locationCode: 'corral_vinculado' }));
    expect(invalid.status).toBe(400);
    await fixture.db.prepare("UPDATE barns SET name='Galpón A' WHERE id=1").run();
  });

  it('requiere galpón válido en las raíces y permite registrar un vínculo explícito', async () => {
    const missing = await fixture.api('/api/config/locations', location('raiz_sin_vinculo', { locationType: 'galpon', parentCode: null }));
    expect(missing.status).toBe(400);
    const absent = await fixture.api('/api/config/locations', location('raiz_inexistente', { locationType: 'galpon', parentCode: null, barnId: 999 }));
    expect(absent.status).toBe(400);
    const valid = await fixture.api('/api/config/locations', location('raiz_explicita', { locationType: 'galpon', parentCode: null, barnId: 2 }));
    expect(valid.status).toBe(200);
    expect((await valid.json() as { item: { barnId: number } }).item.barnId).toBe(2);
  });

  it('rechaza padres inexistentes, futuros y retirados en la fecha efectiva', async () => {
    for (const parentCode of ['sin_padre', 'raiz_futura', 'raiz_retirada']) {
      if (parentCode !== 'sin_padre') {
        const created = await fixture.api('/api/config/locations', location(parentCode, {
          locationType: 'galpon', parentCode: null, barnId: 1,
          effectiveFrom: parentCode === 'raiz_futura' ? '2026-06-01' : '2026-01-01',
        }));
        expect(created.status).toBe(200);
      }
      if (parentCode === 'raiz_retirada') {
        expect((await fixture.api('/api/config/locations/retire', { code: parentCode, effectiveFrom: '2026-02-01', reason: 'Retiro de prueba', operationKey: 'retirar-raiz' })).status).toBe(200);
      }
      const response = await fixture.api('/api/config/locations', location(`hijo_${parentCode}`, { parentCode }));
      expect(response.status).toBe(400);
    }
  });

  it('rechaza ciclos de varios niveles y asociaciones contradictorias en un hijo', async () => {
    expect((await fixture.api('/api/config/locations', location('nivel_uno'))).status).toBe(200);
    expect((await fixture.api('/api/config/locations', location('nivel_dos', { parentCode: 'nivel_uno' }))).status).toBe(200);
    const cycle = await fixture.api('/api/config/locations', location('nivel_uno', { parentCode: 'nivel_dos', effectiveFrom: '2026-03-01', operationKey: 'loc-ciclo' }));
    expect(cycle.status).toBe(400);
    const conflict = await fixture.api('/api/config/locations', location('hijo_cruzado', { barnId: 2 }));
    expect(conflict.status).toBe(400);
  });

  it('valida el vínculo a la fecha del alta y conserva la validez histórica al retirar', async () => {
    expect((await fixture.api('/api/config/locations', location('corral_historico'))).status).toBe(200);
    expect((await fixture.api('/api/config/locations/retire', { code: 'corral_historico', effectiveFrom: '2026-04-01', reason: 'Retiro de prueba', operationKey: 'retirar-corral' })).status).toBe(200);
    const historic = await fixture.api('/api/config?asOf=2026-03-01');
    expect((await historic.json() as { locations: { code: string }[] }).locations.some((item) => item.code === 'corral_historico')).toBe(true);
    expect(await assertLocationForBarn(fixture.db, 1, 'corral_historico', '2026-03-01')).not.toBeNull();
    const retired = await fixture.api('/api/animals', animal('RETIRADO', { locationCode: 'corral_historico', entryDate: '2026-04-01' }));
    expect(retired.status).toBe(400);
  });

  it('impide un ciclo que aparecería con versiones de padres ya programadas', async () => {
    for (const code of ['programada_uno', 'programada_dos']) {
      const response = await fixture.api('/api/config/locations', location(code, { locationType: 'area', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' }));
      expect(response.status).toBe(200);
    }
    const future = await fixture.api('/api/config/locations', location('programada_uno', { locationType: 'area', parentCode: 'programada_dos', effectiveFrom: '2026-06-01', operationKey: 'programada-futura' }));
    expect(future.status).toBe(200);
    const cycle = await fixture.api('/api/config/locations', location('programada_dos', { locationType: 'area', parentCode: 'programada_uno', effectiveFrom: '2026-04-01', operationKey: 'programada-ciclo' }));
    expect(cycle.status).toBe(400);
  });

  it('rechaza el traslado cruzado sin cambiar ubicación ni inventario', async () => {
    expect((await fixture.api('/api/animals', animal('TRASLADO'))).status).toBe(201);
    const response = await fixture.api('/api/animals/TRASLADO/transfer', {
      destinationBarnId: 2, locationCode: 'corral_vinculado', effectiveDate: '2026-04-01',
      reason: 'Traslado de prueba', operationKey: 'traslado-cruzado',
    });
    expect(response.status).toBe(400);
    const row = await fixture.db.prepare("SELECT barn_id, location_code FROM animals WHERE code='TRASLADO'").first();
    expect(row).toMatchObject({ barn_id: 1, location_code: 'galpon_a' });
  });

  it('mantiene las restricciones de galpones al validar ubicaciones', async () => {
    expect((await fixture.api('/api/animals', animal('ACCESO'))).status).toBe(201);
    await expect(createAnimal(fixture.db, 1, animal('SIN-ACCESO', { barnId: 2, locationCode: 'galpon_b' }), { allowedBarnNames: ['Galpón A'] })).rejects.toMatchObject({ status: 403 });
    await expect(transferAnimal(fixture.db, 1, 'ACCESO', { destinationBarnId: 2, locationCode: 'galpon_b', effectiveDate: '2026-04-01', reason: 'Traslado de prueba', operationKey: 'traslado-sin-acceso' }, { allowedBarnNames: ['Galpón A'] })).rejects.toMatchObject({ status: 403 });
  });

  it.each(['raiz', 'descendiente', 'grupo', 'historia'] as const)('impide reasignar una raíz con ocupación incompatible: %s', async (kind) => {
    const rootCode = `ocupada_${kind}`;
    const root = location(rootCode, { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' });
    expect((await fixture.api('/api/config/locations', root)).status).toBe(200);
    let locationCode = rootCode;
    if (kind === 'descendiente') {
      locationCode = 'ocupado_hijo';
      expect((await fixture.api('/api/config/locations', location(locationCode, { parentCode: rootCode }))).status).toBe(200);
    }
    if (kind === 'grupo') {
      expect((await fixture.api('/api/inventory/movements', { movementType: 'initial', barnId: 1, locationCode, stageCode: 'preinicio', sex: 'macho', quantity: 3, effectiveDate: '2026-03-01', reason: 'Saldo grupal de prueba', operationKey: 'grupo-ocupado' })).status).toBe(201);
    } else {
      expect((await fixture.api('/api/animals', animal(`OCUPADO-${kind}`, { locationCode }))).status).toBe(201);
      if (kind === 'historia') {
        expect((await fixture.api(`/api/animals/OCUPADO-${kind}/transfer`, { destinationBarnId: 2, locationCode: 'galpon_b', effectiveDate: '2026-05-01', reason: 'Salida posterior de la raíz', operationKey: 'ocupado-historico-move' })).status).toBe(201);
      }
    }
    await expect(saveLocation(fixture.db, 1, { ...root, barnId: 2, effectiveFrom: '2026-04-01', operationKey: `reasignar-${kind}` })).rejects.toMatchObject({ status: 409 });
    const saved = await fixture.db.prepare('SELECT barn_id, effective_to FROM location_versions WHERE code=? ORDER BY id DESC LIMIT 1').bind(rootCode).first();
    expect(saved).toMatchObject({ barn_id: 1, effective_to: null });
    expect(await fixture.db.prepare('SELECT id FROM operation_log WHERE operation_key=?').bind(`reasignar-${kind}`).first()).toBeNull();
  });

  it('revalida la jerarquía en el lote ante dos padres concurrentes opuestos', async () => {
    for (const code of ['carrera_uno', 'carrera_dos']) {
      expect((await fixture.api('/api/config/locations', location(code, { locationType: 'area', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' }))).status).toBe(200);
    }
    let signalReady!: () => void;
    let resume!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const held = new Promise<void>((resolve) => { resume = resolve; });
    const delayedDb = new Proxy(fixture.db, { get(target, property) {
      if (property === 'prepare') return (sql: string) => {
        const statement = target.prepare(sql);
        if (!/MAX\(id\).*location_versions/.test(sql)) return statement;
        return new Proxy(statement, { get(prepared, member) {
          if (member === 'first') return async () => { signalReady(); await held; return prepared.first(); };
          const value = Reflect.get(prepared, member, prepared);
          return typeof value === 'function' ? value.bind(prepared) : value;
        } });
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const pending = saveLocation(delayedDb, 1, location('carrera_dos', { locationType: 'area', parentCode: 'carrera_uno', effectiveFrom: '2026-04-01', operationKey: 'carrera-dos-parent' }));
    const outcome = pending.then(() => null, (error: unknown) => error);
    await ready;
    try {
      await saveLocation(fixture.db, 1, location('carrera_uno', { locationType: 'area', parentCode: 'carrera_dos', effectiveFrom: '2026-04-01', operationKey: 'carrera-uno-parent' }));
    } finally { resume(); }
    expect(await outcome).toMatchObject({ status: 409 });
    expect(await fixture.db.prepare("SELECT parent_code, effective_to FROM location_versions WHERE code='carrera_dos' ORDER BY id DESC LIMIT 1").first()).toMatchObject({ parent_code: null, effective_to: null });
    expect(await fixture.db.prepare("SELECT id FROM operation_log WHERE operation_key='carrera-dos-parent'").first()).toBeNull();
  });

  it('rechaza el alta que leyó una ubicación reasignada antes de su lote', async () => {
    const root = location('raiz_alta_carrera', { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' });
    await saveLocation(fixture.db, 1, root);
    let intercepted = false;
    const delayedDb = new Proxy(fixture.db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
        if (!intercepted) {
          intercepted = true;
          await saveLocation(fixture.db, 1, { ...root, barnId: 2, effectiveFrom: '2026-02-01', operationKey: 'raiz-alta-reasignada' });
        }
        return target.batch(statements);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(createAnimal(delayedDb, 1, animal('ALTA-CARRERA', { locationCode: root.code }))).rejects.toMatchObject({ status: 409 });
    expect(intercepted).toBe(true);
    expect(await fixture.db.prepare("SELECT id FROM animals WHERE code='ALTA-CARRERA'").first()).toBeNull();
    expect(await fixture.db.prepare("SELECT id FROM operation_log WHERE operation_key='ani-ALTA-CARRERA'").first()).toBeNull();
  });

  it('permite reasignar una raíz vacía después del traslado y conserva el vínculo histórico', async () => {
    const root = location('raiz_desocupada', { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' });
    await saveLocation(fixture.db, 1, root);
    await createAnimal(fixture.db, 1, animal('DESOCUPADA', { locationCode: root.code }));
    await transferAnimal(fixture.db, 1, 'DESOCUPADA', { destinationBarnId: 2, locationCode: 'galpon_b', effectiveDate: '2026-05-01', reason: 'Vaciar ubicación antes de reasignar', operationKey: 'desocupar-raiz' });
    const saved = await saveLocation(fixture.db, 1, { ...root, barnId: 2, effectiveFrom: '2026-06-01', operationKey: 'reasignar-raiz-vacia' });
    expect(saved.item.barnId).toBe(2);
    const before = await fixture.api('/api/config?asOf=2026-04-01');
    expect((await before.json() as { locations: { code: string; barnId: number }[] }).locations.find((item) => item.code === root.code)?.barnId).toBe(1);
    expect(await fixture.db.prepare("SELECT barn_id, location_code FROM animals WHERE code='DESOCUPADA'").first()).toMatchObject({ barn_id: 2, location_code: 'galpon_b' });
  });

  it('revalida la ocupación que aparece después de preparar la reasignación', async () => {
    const root = location('raiz_ocupacion_carrera', { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' });
    await saveLocation(fixture.db, 1, root);
    let intercepted = false;
    const delayedDb = new Proxy(fixture.db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
        if (!intercepted) {
          intercepted = true;
          await createAnimal(fixture.db, 1, animal('OCUPACION-CARRERA', { locationCode: root.code }));
        }
        return target.batch(statements);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(saveLocation(delayedDb, 1, { ...root, barnId: 2, effectiveFrom: '2026-02-01', operationKey: 'raiz-ocupacion-reasignada' })).rejects.toMatchObject({ status: 409 });
    expect(intercepted).toBe(true);
    expect(await fixture.db.prepare('SELECT barn_id, effective_to FROM location_versions WHERE code=? ORDER BY id DESC LIMIT 1').bind(root.code).first()).toMatchObject({ barn_id: 1, effective_to: null });
    expect(await fixture.db.prepare("SELECT barn_id FROM animals WHERE code='OCUPACION-CARRERA'").first()).toMatchObject({ barn_id: 1 });
    expect(await fixture.db.prepare("SELECT id FROM operation_log WHERE operation_key='raiz-ocupacion-reasignada'").first()).toBeNull();
  });

  it('retira una hoja vacía y reproduce el mismo retiro sin duplicarlo', async () => {
    const code = 'hoja_retiro_vacia';
    await saveLocation(fixture.db, 1, location(code));
    const input = { effectiveFrom: '2026-04-01', reason: 'Retiro de hoja sin ocupación', operationKey: 'retirar-hoja-vacia' };
    expect((await retireLocation(fixture.db, 1, code, input)).replayed).toBe(false);
    expect((await retireLocation(fixture.db, 1, code, input)).replayed).toBe(true);
    expect(await fixture.db.prepare('SELECT COUNT(*) n FROM operation_log WHERE operation_key=?').bind(input.operationKey).first()).toMatchObject({ n: 1 });
    expect(await fixture.db.prepare('SELECT status, effective_to FROM location_versions WHERE code=?').bind(code).first()).toMatchObject({ status: 'retired', effective_to: '2026-04-01' });
  });

  it('rechaza retirar padres con hijos vigentes o programados y conserva sus versiones', async () => {
    for (const [suffix, date] of [['actual', '2026-02-01'], ['futuro', '2026-06-01']] as const) {
      const code = `padre_retiro_${suffix}`;
      await saveLocation(fixture.db, 1, location(code, { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' }));
      await saveLocation(fixture.db, 1, location(`hijo_retiro_${suffix}`, { parentCode: code, effectiveFrom: date }));
      await expect(retireLocation(fixture.db, 1, code, { effectiveFrom: '2026-04-01', reason: 'Retiro incompatible con hijos', operationKey: `retirar-padre-${suffix}` })).rejects.toMatchObject({ status: 409 });
      expect(await fixture.db.prepare('SELECT status, effective_to FROM location_versions WHERE code=?').bind(code).first()).toMatchObject({ status: 'active', effective_to: null });
    }
  });

  it('rechaza retirar una hoja ocupada y el retiro que compite con un nuevo hijo', async () => {
    const code = 'hoja_retiro_ocupada';
    await saveLocation(fixture.db, 1, location(code));
    await createAnimal(fixture.db, 1, animal('RETIRO-OCUPADA', { locationCode: code }));
    await expect(retireLocation(fixture.db, 1, code, { effectiveFrom: '2026-04-01', reason: 'Retiro incompatible con animal', operationKey: 'retirar-hoja-ocupada' })).rejects.toMatchObject({ status: 409 });
    const root = 'retiro_carrera_padre';
    await saveLocation(fixture.db, 1, location(root, { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' }));
    let intercepted = false;
    const delayedDb = new Proxy(fixture.db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
        if (!intercepted) { intercepted = true; await saveLocation(fixture.db, 1, location('retiro_carrera_hijo', { parentCode: root })); }
        return target.batch(statements);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(retireLocation(delayedDb, 1, root, { effectiveFrom: '2026-04-01', reason: 'Retiro validado antes de crear hijo', operationKey: 'retirar-padre-carrera' })).rejects.toMatchObject({ status: 409 });
    expect(intercepted).toBe(true);
    expect(await fixture.db.prepare('SELECT status, effective_to FROM location_versions WHERE code=?').bind(root).first()).toMatchObject({ status: 'active', effective_to: null });
    expect(await fixture.db.prepare("SELECT id FROM operation_log WHERE operation_key='retirar-padre-carrera'").first()).toBeNull();
  });

  it('rechaza un alta activa retroactiva que atraviesa el retiro de la ubicación', async () => {
    const code = 'alta_permanente_retirada';
    await saveLocation(fixture.db, 1, location(code));
    await retireLocation(fixture.db, 1, code, { effectiveFrom: '2026-04-01', reason: 'Ubicación retirada antes del alta retroactiva', operationKey: 'permanente-retirar' });
    await expect(createAnimal(fixture.db, 1, animal('PERMANENTE-RETIRADO', { locationCode: code }))).rejects.toMatchObject({ status: 400 });
    expect(await fixture.db.prepare("SELECT id FROM animals WHERE code='PERMANENTE-RETIRADO'").first()).toBeNull();
  });

  it('rechaza un alta activa en un corral cuyo galpón cambia en una vigencia posterior', async () => {
    const root = location('raiz_permanente', { locationType: 'galpon', parentCode: null, barnId: 1, effectiveFrom: '2026-01-01' });
    await saveLocation(fixture.db, 1, root);
    await saveLocation(fixture.db, 1, { ...root, barnId: 2, effectiveFrom: '2026-06-01', operationKey: 'permanente-root-cambio' });
    await saveLocation(fixture.db, 1, location('corral_permanente', { parentCode: root.code }));
    await expect(createAnimal(fixture.db, 1, animal('PERMANENTE-CAMBIADO', { locationCode: 'corral_permanente' }))).rejects.toMatchObject({ status: 400 });
    expect(await fixture.db.prepare("SELECT id FROM animals WHERE code='PERMANENTE-CAMBIADO'").first()).toBeNull();
  });

  it('rechaza un traslado individual cuya permanencia cruza un retiro programado', async () => {
    const root = location('destino_permanente', { locationType: 'galpon', parentCode: null, barnId: 2, effectiveFrom: '2026-01-01' });
    await saveLocation(fixture.db, 1, root);
    await retireLocation(fixture.db, 1, root.code, { effectiveFrom: '2026-06-01', reason: 'Retiro del destino programado', operationKey: 'permanente-destino-retirar' });
    await createAnimal(fixture.db, 1, animal('PERMANENTE-TRASLADO'));
    await expect(transferAnimal(fixture.db, 1, 'PERMANENTE-TRASLADO', { destinationBarnId: 2, locationCode: root.code, effectiveDate: '2026-05-01', reason: 'Traslado antes del retiro futuro', operationKey: 'permanente-traslado' })).rejects.toMatchObject({ status: 400 });
    expect(await fixture.db.prepare("SELECT barn_id, location_code FROM animals WHERE code='PERMANENTE-TRASLADO'").first()).toMatchObject({ barn_id: 1, location_code: 'galpon_a' });
    expect(await fixture.db.prepare("SELECT id FROM operation_log WHERE operation_key='permanente-traslado'").first()).toBeNull();
  });
});
