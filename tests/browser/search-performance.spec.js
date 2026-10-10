import { test, expect } from '@playwright/test';

async function openCatalog(page) {
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
  await expect(page.locator('#pcnt')).not.toHaveText('0');
}

async function searchFor(page, query) {
  await page.locator('#sinp').fill(query);
  await expect.poll(() => page.evaluate(() => window.__searchPerf && window.__searchPerf.lastQuery)).toBe(query);
}

async function firstCode(page) {
  return (await page.locator('#grid .card-subtitle').first().innerText()).replace('#', '').trim();
}

async function selectCategory(page, category) {
  if (await page.locator('#btnOpenCats').isVisible()) {
    await page.locator('#btnOpenCats').click();
    await expect(page.locator('#catalogSidebar')).toHaveClass(/open/);
  }
  await page.locator('#nav2 .g2tab').filter({ hasText: category }).click();
}

test('@all códigos exactos 34 y 35 tienen prioridad absoluta', async ({ page }) => {
  await openCatalog(page);
  await searchFor(page, '34');
  await expect(page.locator('#grid .card').first()).toBeVisible();
  expect(await firstCode(page)).toBe('34');

  await searchFor(page, '35');
  expect(await firstCode(page)).toBe('35');
});

test('@all código parcial conserva resultados por código antes de coincidencias de texto', async ({ page }) => {
  await openCatalog(page);
  await searchFor(page, '3');
  const firstCodes = await page.locator('#grid .card-subtitle').evaluateAll(nodes =>
    nodes.slice(0, 10).map(node => node.textContent.replace('#', '').trim())
  );
  expect(firstCodes.length).toBeGreaterThan(0);
  expect(firstCodes.every(code => code.includes('3'))).toBe(true);
});

test('@all búsquedas normales y tolerantes encuentran Guaymallén y Alfajor', async ({ page }) => {
  await openCatalog(page);
  for (const query of ['guaymallen', 'guaymayen', 'alfajor', 'alfahor']) {
    await searchFor(page, query);
    await expect(page.locator('#grid .card').first(), query).toBeVisible();
    await expect.poll(async () => Number((await page.locator('#pcnt').innerText()).replace(/\D/g, ''))).toBeGreaterThan(0);
  }
});

test('@all búsqueda respeta categoría y SIN TACC', async ({ page }) => {
  await openCatalog(page);
  await selectCategory(page, 'Alfajores');
  await searchFor(page, 'guaymayen');
  await expect(page.locator('#ctitle')).toContainText('Alfajores');
  await expect(page.locator('#grid .card').first()).toBeVisible();

  await page.locator('#clearSearchBtn').click();
  if (await page.locator('#btnOpenCats').isVisible()) {
    await page.locator('#btnOpenCats').click();
    await expect(page.locator('#catalogSidebar')).toHaveClass(/open/);
  }
  await page.locator('#nav2 .g2tab[data-c=""]').click();
  await page.locator('#stog').click();
  await expect(page.locator('#stChk')).toBeChecked();
  await searchFor(page, 'sin tacc');
  await expect(page.locator('#grid .card').first()).toBeVisible();
  const visibleCards = page.locator('#grid .card');
  const visibleCount = await visibleCards.count();
  expect(visibleCount).toBeGreaterThan(0);
  await expect(page.locator('#grid .card .stbdg')).toHaveCount(visibleCount);
});

test('@all escritura rápida no duplica búsquedas ni congela la interfaz', async ({ page }, testInfo) => {
  await openCatalog(page);
  const productCount = await page.evaluate(() => eval('prods.length'));
  const beforeExecutions = await page.evaluate(() => window.__searchPerf.executions);
  const startedAt = Date.now();
  await page.locator('#sinp').pressSequentially('guaymayen', { delay: 8 });
  await expect.poll(() => page.evaluate(() => window.__searchPerf.lastQuery)).toBe('guaymayen');
  const elapsedMs = Date.now() - startedAt;
  const metrics = await page.evaluate(() => ({ ...window.__searchPerf }));

  expect(metrics.executions - beforeExecutions).toBe(1);
  expect(metrics.lastDuration).toBeLessThan(1000);
  expect(elapsedMs).toBeLessThan(2000);
  await expect(page.locator('#grid .card').first()).toBeVisible();

  console.log('SEARCH_BROWSER_METRIC ' + JSON.stringify({
    project: testInfo.project.name,
    products: productCount,
    query: 'guaymayen',
    computationMs: Number(metrics.lastDuration.toFixed(2)),
    inputToResultMs: elapsedMs,
    executions: metrics.executions - beforeExecutions
  }));
});
