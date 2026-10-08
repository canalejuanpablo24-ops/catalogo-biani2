import { test, expect } from '@playwright/test';

const categories = [
  'Alfajores', 'Bebidas', 'Bic', 'Caramelos', 'Cereales', 'Chicles',
  'Chocolates', 'Chupetines', 'Despensa', 'Detergentes', 'Galletitas',
  'Gomitas', 'Higiene', 'Jugos', 'Lámparas', 'Limpieza',
  'Nuevos y Sin Imagen', 'Papelería', 'Pastillas', 'Pegamentos',
  'Perfumería', 'Pilas', 'Pipas', 'Snacks', 'Turrones', 'Varios', 'Yerbas'
];

async function openCatalog(page) {
  const pageErrors = [];
  const cspErrors = [];

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (/content security policy|refused to/i.test(text)) cspErrors.push(text);
  });

  await page.route('https://docs.google.com/**', route => route.abort('blockedbyclient'));
  await page.addInitScript(() => {
    window.__openedWhatsAppUrls = [];
    window.open = url => {
      window.__openedWhatsAppUrls.push(String(url));
      return null;
    };
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await expect(page.locator('#nav2 .g2tab')).toHaveCount(28);
  await expect(page.locator('#pcnt')).not.toHaveText('0');

  return {
    assertCleanRuntime() {
      expect(pageErrors, 'uncaught browser errors').toEqual([]);
      expect(cspErrors, 'CSP browser errors').toEqual([]);
    }
  };
}

function categoryButton(page, category) {
  if (!category) return page.locator('#nav2 .g2tab[data-c=""]');
  return page.locator('#nav2 .g2tab').filter({ hasText: category });
}

async function selectCategory(page, category) {
  if (await page.locator('#btnOpenCats').isVisible()) {
    await page.locator('#btnOpenCats').click();
    await expect(page.locator('#catalogSidebar')).toHaveClass(/open/);
  }
  await categoryButton(page, category).click();
}

async function numericProductCount(page) {
  return Number((await page.locator('#pcnt').innerText()).replace(/\D/g, ''));
}

test('@desktop desktop muestra la navegación lateral completa', async ({ page }) => {
  const runtime = await openCatalog(page);
  await expect(page.locator('#catalogSidebar')).toBeVisible();
  await expect(page.locator('#btnOpenCats')).toBeHidden();

  const sidebar = await page.locator('#catalogSidebar').boundingBox();
  const grid = await page.locator('#grid').boundingBox();
  expect(sidebar).not.toBeNull();
  expect(grid).not.toBeNull();
  expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(grid.x);

  runtime.assertCleanRuntime();
});

for (const category of categories) {
  test(`@all categoría: ${category}`, async ({ page }) => {
    const runtime = await openCatalog(page);
    const button = categoryButton(page, category);
    await expect(button).toHaveCount(1);
    await selectCategory(page, category);

    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ctitle')).toHaveText(category);
    await expect.poll(() => numericProductCount(page)).toBeGreaterThan(0);
    await expect(page.locator('#grid .card').first()).toBeVisible();
    await expect(page.locator('#grid .empty')).toHaveCount(0);

    runtime.assertCleanRuntime();
  });
}

test('@all búsqueda y filtros combinados funcionan juntos', async ({ page }) => {
  const runtime = await openCatalog(page);
  await page.locator('#stChk').check();

  let selectedCategory = '';
  for (const category of categories) {
    await selectCategory(page, category);
    if (await numericProductCount(page) > 0) {
      selectedCategory = category;
      break;
    }
  }

  expect(selectedCategory, 'debe existir una categoría con productos SIN TACC').not.toBe('');
  const productTitle = (await page.locator('#grid .card-title').first().innerText()).trim();
  const keyword = productTitle.split(/\s+/).find(word => word.length >= 4) || productTitle;

  await page.locator('#sinp').fill(keyword);
  await expect(page.locator('#ctitle')).toContainText(selectedCategory);
  await expect(page.locator('#ctitle')).toContainText('Búsqueda');
  await expect.poll(() => numericProductCount(page)).toBeGreaterThan(0);
  await expect(page.locator('#stog')).toHaveClass(/active/);

  await page.locator('#sinp').fill('producto-inexistente-zzzz-9999');
  await expect(page.locator('#grid .empty')).toBeVisible();
  await expect(page.locator('#grid .empty')).toContainText(selectedCategory);
  await expect(page.locator('#grid .empty')).toContainText('SIN TACC');

  await page.locator('#clearSearchBtn').click();
  await page.locator('#stChk').uncheck();
  await selectCategory(page, '');
  await expect(page.locator('#ctitle')).toHaveText('Catálogo BIANI');
  await expect.poll(() => numericProductCount(page)).toBeGreaterThan(0);

  runtime.assertCleanRuntime();
});

test('@all carrito genera un pedido de WhatsApp sin abrir el servicio externo', async ({ page }) => {
  const runtime = await openCatalog(page);

  const buyableCard = page.locator('#grid .card').filter({
    has: page.locator('button.btn-ver')
  }).first();
  await expect(buyableCard).toBeVisible();
  await buyableCard.locator('button.btn-ver').click();

  await expect(page.locator('#prodModal')).toHaveClass(/open/);
  await expect(page.locator('#pm-add-btn')).toBeEnabled();
  await page.locator('#pm-add-btn').click();
  await expect.poll(async () => Number(await page.locator('#ccnt').innerText())).toBeGreaterThan(0);

  await page.locator('#cartBtn').click();
  await expect(page.locator('#cp')).toHaveClass(/open/);
  await expect(page.locator('#ci .cit')).toHaveCount(1);
  await expect(page.locator('#cta')).not.toHaveText('$0');

  await page.locator('#c-name').fill('Cliente Prueba E2E');
  await page.locator('#c-dni').fill('20-12345678-9');
  await page.locator('#c-dir').fill('Calle Prueba 123');
  await page.locator('#c-obs').fill('Validación automática sin envío real');
  await page.locator('#sendWaBtn').click();

  await expect.poll(() => page.evaluate(() => window.__openedWhatsAppUrls[0] || '')).toContain('https://wa.me/');
  const openedUrl = await page.evaluate(() => window.__openedWhatsAppUrls[0]);
  const message = new URL(openedUrl).searchParams.get('text');

  expect(message).toContain('PEDIDO BIANI');
  expect(message).toContain('Cliente Prueba E2E');
  expect(message).toContain('Modo:');
  expect(message).toContain('Cantidad:');
  expect(message).toContain('TOTAL:');

  runtime.assertCleanRuntime();
});

test('@mobile móvil abre y cierra el selector y mantiene dos columnas utilizables', async ({ page }) => {
  const runtime = await openCatalog(page);
  await expect(page.locator('#btnOpenCats')).toBeVisible();
  await expect(page.locator('#btnOpenCats')).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#btnOpenCats').click();
  await expect(page.locator('#catalogSidebar')).toHaveClass(/open/);
  await expect(page.locator('#btnOpenCats')).toHaveAttribute('aria-expanded', 'true');

  await categoryButton(page, 'Alfajores').click();
  await expect(page.locator('#catalogSidebar')).not.toHaveClass(/open/);
  await expect(page.locator('#mobileSelectedCat')).toHaveText('Alfajores');

  const cards = page.locator('#grid .card');
  await expect(cards).toHaveCount(40);
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x);
  expect(second.x + second.width).toBeLessThanOrEqual(390);

  runtime.assertCleanRuntime();
});
