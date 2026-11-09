import { afterAll, expect, it } from 'vitest';
import { healthFixture } from './health-test-helpers';
import { listAlerts, reconcileAlerts } from '../worker/alerts';
import { registerFeedPlan } from '../worker/feed-plans';

let fixture: Awaited<ReturnType<typeof healthFixture>>;
afterAll(async () => fixture?.runtime.dispose());

it('avisa un turno programado sin entregas y resuelve al cancelar el plan', async () => {
  fixture = await healthFixture('feed-plan-alerts');
  const { db } = fixture;
  const body = { effectiveDate: '2026-11-08', shiftCode: 'manana', barnId: 1, stageCode: 'preinicio', feedCode: 'preinicio', plannedKg: 10, reason: 'Programación', operationKey: 'plan-alert-missing' };
  await registerFeedPlan(db, 1, body);
  await reconcileAlerts(db, { today: '2026-11-09' });
  const read = () => listAlerts(db, { type: 'feeding', status: 'pending', asOf: '2026-11-09' });
  expect((await read()).alerts).toHaveLength(1);
  expect((await read()).alerts[0].details).toMatchObject({ plannedKg: 10, servedKg: 0, pendingKg: 10 });
  expect((await listAlerts(db, { type: 'feeding' }, { allowedBarnNames: [] })).alerts).toEqual([]);
  await registerFeedPlan(db, 1, { ...body, plannedKg: 0, reason: 'Cancelar', operationKey: 'plan-alert-cancel' });
  expect((await read()).alerts).toHaveLength(0);
  expect(await db.prepare('SELECT COUNT(*) n FROM feed_movements').first()).toMatchObject({ n: 0 });
}, 60000);

it('cancela la identidad del plan anterior aunque cambie la ración configurada', async () => {
  const { db } = fixture;
  const body = { effectiveDate: '2026-11-09', shiftCode: 'tarde', barnId: 1, stageCode: 'preinicio', feedCode: 'preinicio', plannedKg: 20, reason: 'Plan original', operationKey: 'plan-before-ration-change' };
  const original = await registerFeedPlan(db, 1, body);
  await db.prepare("UPDATE stage_versions SET ration_name='Alimento gestación' WHERE code='preinicio'").run();
  const cancelled = await registerFeedPlan(db, 1, { ...body, plannedKg: 0, reason: 'Cancelar ración anterior', operationKey: 'plan-after-ration-change' });
  expect(cancelled.plan).toMatchObject({ id: original.plan.id, feedCode: 'preinicio', plannedKg: 0, version: 2 });
  expect((await listAlerts(db, { type: 'feeding', status: 'pending', asOf: '2026-11-09' })).alerts).toHaveLength(0);
});
