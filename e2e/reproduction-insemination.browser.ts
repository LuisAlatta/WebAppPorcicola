import { expect, test } from './module-fixture';

for (const width of [320, 412, 1280]) {
  test(`inseminación, fechas, guardado y preñez a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    let cycle: Record<string, unknown> | null = null;
    let attempt = 0;
    let operationKey = '';
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: { user: { role: 'administrador', username: 'prueba@granja.test' } } });
      if (path === '/api/reproduction/sires') return route.fulfill({ json: { ok: true, sires: [{ id: 2, code: 'PADRE-IA', alias: null, barnId: 1, barnName: 'Galpón A', breed: 'Duroc' }] } });
      if (path === '/api/animals') return route.fulfill({ json: { animals: [{ code: url.searchParams.has('type') ? 'PADRE-IA' : 'MADRE-IA', barnName: 'Galpón A', breed: 'Duroc' }] } });
      if (path.endsWith('/events')) {
        cycle = { ...cycle, reproductiveStatus: 'gestation' };
        return route.fulfill({ json: { cycle } });
      }
      if (path === '/api/reproduction/cycles' && route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        expect(data.serviceType).toBe('inseminacion_artificial');
        expect(data.sireBreed).toBe('Duroc');
        expect(data.heatRepeatDays).toBe('18');
        if (++attempt === 1) {
          operationKey = data.operationKey;
          return route.fulfill({ status: 409, json: { error: 'No se pudo guardar el ciclo de prueba. Reintente.' } });
        }
        expect(data.operationKey).toBe(operationKey);
        cycle = { id: 'cycle-ia', femaleCode: 'MADRE-IA', femaleAlias: 'Marrana de prueba', cycleNumber: 1, cycleStatus: 'open', reproductiveStatus: 'possible_pregnancy', femalePresent: true, serviceAnchorDate: '2026-10-01', heatRepeatDays: 18, probableHeatRepeatDate: '2026-10-19', gestationDays: 114, probableFarrowingDate: '2027-01-23', dueDateSource: 'calculated', daysRemaining: 70, dueLabel: 'próximo', barnName: 'Galpón A', services: [], events: [], litter: null, weaningPlan: null };
        await pending;
        return route.fulfill({ status: 201, json: { cycles: [cycle] } });
      }
      if (path === '/api/reproduction/cycles') return route.fulfill({ json: { cycles: cycle ? [cycle] : [] } });
      return route.fulfill({ json: { ok: true, targets: [] } });
    });
    await page.goto('/reproduccion');
    await page.getByRole('button', { name: 'Registrar nuevo servicio', exact: true }).click();
    await expect(page.getByLabel('Tipo de servicio', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Repetición de celo (días)', { exact: true })).toHaveValue('21');
    await page.getByLabel('Marrana (Hembra reproductora)', { exact: true }).selectOption('MADRE-IA');
    await page.getByLabel('Fecha del servicio', { exact: true }).fill('2026-10-01');
    await page.getByLabel('Repetición de celo (días)', { exact: true }).fill('18');
    await expect(page.getByLabel('Fecha probable de repetición de celo', { exact: true })).toHaveValue('2026-10-19');
    await expect(page.getByLabel('Fecha probable de parto calculada', { exact: true })).toHaveValue('2027-01-23');
    await page.getByLabel('Verraco', { exact: true }).selectOption('PADRE-IA');
    await expect(page.getByLabel('Raza del padre/material', { exact: true })).toHaveValue('Duroc');
    await page.locator('button[data-action="save"]').click();
    await expect(page.getByText('No se pudo guardar el ciclo de prueba. Reintente.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Repetición de celo (días)', { exact: true })).toHaveValue('18');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('button[data-action="save"]').click();
    await expect(page.getByRole('dialog', { name: 'Guardando…', exact: true })).toBeVisible();
    await expect(page.locator('.reproduction-spinner')).toBeVisible();
    release();
    const success = page.getByRole('dialog', { name: 'Guardado exitoso', exact: true });
    await expect(success).toBeVisible();
    const rect = await success.boundingBox();
    expect(Math.abs(rect!.y + rect!.height / 2 - 915 / 2)).toBeLessThan(2);
    await success.getByRole('button', { name: 'Ver ciclos', exact: true }).click();
    await expect(page.locator('.reproduction-cycle')).toContainText('2026-10-19');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 600) {
      const row = await page.locator('.reproduction-palpation').boundingBox();
      const actions = await page.locator('.reproduction-palpation').locator('..').boundingBox();
      const label = await page.locator('.reproduction-palpation > span').boundingBox();
      expect(Math.abs(row!.width - actions!.width)).toBeLessThan(2);
      expect(label!.height).toBeLessThan(30);
    }
    await page.getByRole('button', { name: 'Confirmar preñez y gestación para MADRE-IA', exact: true }).click();
    await expect(success).toContainText('Preñez confirmada');
    await success.getByRole('button', { name: 'Ver ciclos', exact: true }).click();
    await expect(page.locator('.reproduction-heat-note')).toContainText('referencia histórica');
    await expect(page.getByRole('button', { name: 'Confirmar preñez y gestación para MADRE-IA', exact: true })).toBeDisabled();
    if (width === 412) await page.screenshot({ path: test.info().outputPath('reproduccion-movil.png'), fullPage: true });
  });
}
