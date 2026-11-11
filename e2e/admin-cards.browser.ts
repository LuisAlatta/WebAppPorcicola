import { expect, test } from './module-fixture';

test('cuentas, historial y auditoría conservan datos en sus nuevas vistas', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'administrador', username: 'admin@prueba.pe' } } }));
  await page.route('**/api/admin/users', route => route.fulfill({ json: { users: [{ id: 1, name: 'Encargado', username: 'encargado@prueba.pe', role: 'responsable', is_active: 1, created_at: '2026-01-01', updated_at: '2026-11-01', barns: [{ id: 1, code: 'A', name: 'Galpón A' }] }] } }));
  await page.route('**/api/admin/barns', route => route.fulfill({ json: { barns: [] } }));
  await page.route('**/api/admin/history', route => route.fulfill({ json: { history: [{ id: 1, barn_id: 1, barn_code: 'A', barn_name: 'Galpón A', role: 'responsable', previous_user_id: null, previous_user_name: null, new_user_id: 1, new_user_name: 'Encargado', valid_from: '2026-01-01', valid_until: null, reason: 'Asignación inicial', is_current: 1, corrects_history_id: null, superseded_by_id: null, changed_by_name: 'Administrador', created_at: '2026-01-01' }] } }));
  await page.route('**/api/admin/audit?**', route => route.fulfill({ json: { audit: ['create', 'correct'].map((action, index) => ({ id: index + 1, action, entity_type: 'barn', entity_id: 1, barn_id: 1, barn_code: 'A', barn_name: 'Galpón A', actor_name: 'Administrador', reason: 'Cambio comprobado', previous_data: { name: 'Anterior' }, new_data: { name: 'Actual' }, effective_date: '2026-11-01', recorded_at: '2026-11-01', operation_key: null })) } }));
  await page.goto('/administracion');
  const accounts = page.getByRole('list', { name: 'Cuentas registradas' });
  await expect(accounts).toContainText('encargado@prueba.pe');
  await expect(accounts.getByRole('button', { name: 'Desactivar', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Historial/ }).click();
  const history = page.getByRole('list', { name: 'Historial de asignaciones' });
  await expect(history).toContainText('Asignación inicial');
  await expect(history.getByRole('button', { name: 'Corregir', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Auditoría/ }).click();
  const audit = page.getByRole('list', { name: 'Eventos de auditoría' });
  await expect(audit.locator('article')).toHaveCount(2);
  await page.getByLabel('Acción auditada').selectOption('correct');
  await expect(audit.locator('article')).toHaveCount(1);
  await audit.locator('summary').click();
  await expect(audit).toContainText('Anterior');
  await page.getByRole('button', { name: 'Quitar filtro de auditoría' }).click();
  await expect(audit.locator('article')).toHaveCount(2);
  await expect(page.getByRole('table')).toHaveCount(0);
});
