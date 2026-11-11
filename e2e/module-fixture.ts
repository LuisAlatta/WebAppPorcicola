import { test as base } from '@playwright/test';
export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

// Las pruebas de módulos entran con ambos galpones; el selector se prueba por separado.
export const test = base.extend({
  page: async ({ page }, providePage) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      await page.route('**/api/barns', route => route.fulfill({ json: { barns: [{ id: 1, name: 'Galpón A' }, { id: 2, name: 'Galpón B' }] } }));
      return goto(url, options);
    };
    await page.addLocatorHandler(page.getByRole('heading', { name: 'Galpones', exact: true }), async () => {
      await page.getByRole('checkbox').nth(0).check();
      await page.getByRole('checkbox').nth(1).check();
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    });
    await providePage(page);
  },
});
