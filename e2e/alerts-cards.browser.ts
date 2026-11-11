import { expect, test } from './module-fixture';

test('agenda en tarjetas pagina y conserva el motivo cuando falla la atención', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'responsable', username: 'responsable@prueba.pe' } } }));
  await page.route('**/api/finance/barns', route => route.fulfill({ json: { barns: [{ id: 1, name: 'Galpón A' }] } }));
  await page.route('**/api/notifications', route => route.fulfill({ json: { notifications: [], unreadCount: 0 } }));
  await page.route('**/api/alerts?**', route => route.fulfill({ json: {
    alerts: Array.from({ length: 13 }, (_, index) => ({
      id: index + 1, key: `manual-${index}`, type: 'manual', sourceType: 'manual', sourceId: String(index + 1),
      dueDate: '2026-11-11', bucket: 'today', title: `Aviso ${index + 1}`, details: {}, eventLink: '/animales',
      animalCode: null, barnName: 'Galpón A', status: 'pending', priority: 'normal', resolutionReason: null,
    })), counts: {},
  } }));
  await page.route('**/api/alerts/13/attend', route => route.fulfill({ status: 409, json: { error: 'El aviso cambió; reintente.' } }));
  await page.goto('/alertas');
  const list = page.getByRole('list', { name: 'Agenda operativa y avisos' });
  await expect(list.locator('article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Página siguiente de avisos' }).click();
  await expect(list.locator('article')).toHaveCount(1);
  await expect(list).toContainText('Aviso 13');
  await list.getByRole('button', { name: 'Atender', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Motivo o detalle de atención en galpón:').fill('Verificado en galpón');
  await dialog.getByRole('button', { name: 'Marcar como atendido' }).click();
  await expect(dialog.getByRole('alert')).toContainText('El aviso cambió');
  await expect(dialog.getByLabel('Motivo o detalle de atención en galpón:')).toHaveValue('Verificado en galpón');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(list).toContainText('Aviso 13');
});
