import { expect, test } from './module-fixture';

test('libro en tarjetas conserva detalle y modales de cobro y reversión', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { role: 'responsable', username: 'responsable@prueba.pe' } } }));
  await page.route('**/api/finance/barns', route => route.fulfill({ json: { barns: [{ id: 1, name: 'Galpón A' }] } }));
  await page.route('**/api/finance/entries?**', route => route.fulfill({ json: { entries: [{
    id: 12, allocationId: 1, direction: 'income', category: 'Venta', concept: 'Venta de lote', operationDate: '2026-01-01',
    amountMinor: 10000, settledMinor: 2000, outstandingMinor: 8000, entryTotalMinor: 10000, currencyCode: 'PEN',
    counterparty: 'Cliente', reference: 'F001', sourceType: null, sourceId: null, reversalOfId: null, reversedAt: null,
    responsibleName: 'Responsable', barnName: 'Galpón A', animalCode: null, lotCode: 'L01', supplyCode: null, quantity: 2,
  }], totals: [] } }));
  await page.route('**/api/finance/cashflow?**', route => route.fulfill({ json: {
    entries: [{ id: 1, financialEntryId: 12, settlementDate: '2026-01-02', amountMinor: 2000, paymentMethod: 'transferencia', direction: 'income', category: 'Venta', concept: 'Abono del lote', currencyCode: 'PEN', counterparty: 'Cliente', barnName: 'Galpón A', responsibleName: 'Responsable' }],
    totals: [],
    cashBalances: [{ currencyCode: 'PEN', openingMinor: 0, receiptsMinor: 2000, paymentsMinor: 0, closingMinor: 2000, openingBalanceIsCalculated: false }],
  } }));
  await page.goto('/finanzas');
  const card = page.getByRole('list', { name: 'Movimientos del libro financiero' });
  await expect(card).toContainText('Venta de lote');
  await card.getByRole('button', { name: 'Ver operación #12 en Galpón A' }).click();
  await expect(page.getByRole('dialog')).toContainText('F001');
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Registrar cobro de operación #12' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Saldo pendiente');
  await expect(dialog.locator('input[inputmode="decimal"]')).toHaveValue('80.00');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await card.getByRole('button', { name: 'Anular operación #12' }).click();
  await expect(dialog).toContainText('todas las asignaciones');
  await expect(dialog.getByRole('button', { name: 'Confirmar anulación' })).toBeDisabled();
  await dialog.getByLabel('Motivo de anulación:').fill('Operación duplicada');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('tab', { name: 'Pestaña Flujo de Caja: cobros y pagos efectivos' }).click();
  await expect(page.getByLabel('Saldos por moneda')).toContainText('Caja · PEN');
  await expect(page.getByRole('list', { name: 'Movimientos efectivos de caja' })).toContainText('Abono del lote');
  await expect(page.getByRole('table')).toHaveCount(0);
});
