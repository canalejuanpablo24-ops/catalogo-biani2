import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fallbackProducts = JSON.parse(
  readFileSync(new URL('../../products_fallback.json', import.meta.url), 'utf8')
);

function csvEscape(value) {
  return '"' + String(value == null ? '' : value).replaceAll('"', '""') + '"';
}

function buildCsv(products) {
  const rows = [['codigo', 'nombre', 'precio', 'cantidad minima']];
  for (const product of products) {
    rows.push([
      product.code,
      product.name,
      Number(product.price).toFixed(2).replace('.', ','),
      product.unidad_min || 1
    ]);
  }
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

async function routeSheets(page, bodyOrHandler) {
  await page.route('https://docs.google.com/**', async route => {
    const body = typeof bodyOrHandler === 'function' ? await bodyOrHandler() : bodyOrHandler;
    if (body === null) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body });
  });
}

async function openCatalog(page) {
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

async function syncStatus(page) {
  return page.evaluate(() => eval('catalogSyncState.status'));
}

test('@desktop acepta y registra una sincronización completa válida', async ({ page }) => {
  await routeSheets(page, buildCsv(fallbackProducts));
  await openCatalog(page);
  await expect.poll(() => syncStatus(page), { timeout: 20_000 }).toBe('confirmed');

  const result = await page.evaluate(() => ({
    count: eval('prods.length'),
    lastSuccessAt: eval('catalogSyncState.lastSuccessAt'),
    storedMeta: JSON.parse(localStorage.getItem('biani_sheet_sync_meta_v1') || 'null'),
    storedCatalog: JSON.parse(localStorage.getItem('biani_last_valid_sheet_catalog_v1') || 'null')
  }));
  expect(result.count).toBe(fallbackProducts.length);
  expect(result.lastSuccessAt).toBeGreaterThan(0);
  expect(result.storedMeta.count).toBe(fallbackProducts.length);
  expect(result.storedCatalog.products).toHaveLength(fallbackProducts.length);
});

test('@desktop rechaza respuestas parciales, vacías y duplicadas sin reemplazar el catálogo', async ({ page }) => {
  const suspiciousResponses = [
    buildCsv(fallbackProducts.slice(0, 40)),
    '',
    buildCsv([...fallbackProducts, { ...fallbackProducts[0], name: 'Duplicado' }])
  ];

  for (const response of suspiciousResponses) {
    await page.unroute('https://docs.google.com/**').catch(() => {});
    await routeSheets(page, response);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loader')).toHaveClass(/hidden/);
    await expect.poll(() => syncStatus(page), { timeout: 20_000 }).toBe('failed');
    const state = await page.evaluate(() => ({
      count: eval('prods.length'),
      outOfStock: eval('prods.filter(product => product.outOfStock).length')
    }));
    expect(state.count).toBe(fallbackProducts.length);
    expect(state.outOfStock).toBe(fallbackProducts.filter(product => product.outOfStock).length);
    await page.evaluate(() => {
      localStorage.removeItem('biani_sheet_sync_meta_v1');
      localStorage.removeItem('biani_last_valid_sheet_catalog_v1');
    });
  }
});

test('@desktop conserva el último catálogo válido si la red falla', async ({ page }) => {
  let online = true;
  await routeSheets(page, () => online ? buildCsv(fallbackProducts) : null);
  await openCatalog(page);
  await expect.poll(() => syncStatus(page), { timeout: 20_000 }).toBe('confirmed');
  const before = await page.evaluate(() => eval('prods.map(product => product.code).join("|")'));

  online = false;
  await page.evaluate(() => eval('requestCatalogRefresh({ manual: true })'));
  await expect.poll(() => page.evaluate(() => eval('catalogRefreshPromise === null')), { timeout: 20_000 }).toBe(true);

  const after = await page.evaluate(() => ({
    codes: eval('prods.map(product => product.code).join("|")'),
    status: eval('catalogSyncState.status')
  }));
  expect(after.codes).toBe(before);
  expect(after.status).toBe('confirmed');
});

test('@desktop una sincronización vencida se actualiza antes de abrir WhatsApp', async ({ page }) => {
  let requests = 0;
  await routeSheets(page, () => {
    requests += 1;
    return buildCsv(fallbackProducts);
  });
  await openCatalog(page);
  await expect.poll(() => syncStatus(page), { timeout: 20_000 }).toBe('confirmed');
  const initialRequests = requests;

  const card = page.locator('#grid .card').filter({ has: page.locator('button.btn-ver') }).first();
  await card.locator('button.btn-ver').click();
  await page.locator('#pm-add-btn').click();
  await page.locator('#cartBtn').click();
  await page.locator('#c-name').fill('Cliente Sincronización');
  await page.locator('#c-dni').fill('20-12345678-9');
  await page.locator('#c-dir').fill('Calle Prueba 123');

  await page.evaluate(() => eval(
    "catalogSyncState = { ...catalogSyncState, status: 'stale', lastSuccessAt: Date.now() - SheetSync.FRESHNESS_MS - 1000, checkedAt: Date.now() - SheetSync.FRESHNESS_MS - 1000 }"
  ));
  await page.locator('#sendWaBtn').click();

  await expect.poll(() => requests, { timeout: 20_000 }).toBeGreaterThan(initialRequests);
  await expect.poll(() => page.evaluate(() => window.__openedWhatsAppUrls.length), { timeout: 20_000 }).toBe(1);
  await expect.poll(() => syncStatus(page)).toBe('confirmed');
});

test('@desktop la sincronización no pisa altas, ediciones, eliminaciones ni orden administrativo', async ({ page }) => {
  const editCode = String(fallbackProducts[0].code);
  const deleteCode = String(fallbackProducts[1].code);
  const addedCode = 'ADMIN-TEST-9000';
  await page.addInitScript(({ editCode, deleteCode, addedCode }) => {
    localStorage.setItem('biani_edits', JSON.stringify({ [editCode]: { name: 'Editado por administración' } }));
    localStorage.setItem('biani_del', JSON.stringify([deleteCode]));
    localStorage.setItem('biani_add', JSON.stringify([{
      code: addedCode,
      name: 'Alta administrativa',
      price: 999,
      category: 'Varios',
      image: '',
      qty: 0
    }]));
    localStorage.setItem('biani_order', JSON.stringify([addedCode, editCode]));
  }, { editCode, deleteCode, addedCode });
  await routeSheets(page, buildCsv(fallbackProducts));
  await openCatalog(page);
  await expect.poll(() => syncStatus(page), { timeout: 20_000 }).toBe('confirmed');

  const state = await page.evaluate(({ editCode, deleteCode, addedCode }) => ({
    firstCodes: eval('prods.slice(0, 2).map(product => String(product.code))'),
    edited: eval('prods.find(product => String(product.code) === editCode)?.name'),
    deleted: eval('prods.some(product => String(product.code) === deleteCode)'),
    added: eval('prods.filter(product => String(product.code) === addedCode).length')
  }), { editCode, deleteCode, addedCode });

  expect(state.firstCodes).toEqual([addedCode, editCode]);
  expect(state.edited).toBe('Editado por administración');
  expect(state.deleted).toBe(false);
  expect(state.added).toBe(1);
});

test('@desktop sin Google Sheets siguen funcionando catálogo, búsqueda, categorías y filtros', async ({ page }) => {
  await routeSheets(page, null);
  await openCatalog(page);
  await expect.poll(() => syncStatus(page), { timeout: 20_000 }).toBe('failed');

  await page.locator('#sinp').fill('guaymayen');
  await expect(page.locator('#grid .card').first()).toBeVisible();
  await page.locator('#nav2 .g2tab').filter({ hasText: 'Alfajores' }).click();
  await expect(page.locator('#ctitle')).toContainText('Alfajores');
  await page.locator('#stog').click();
  await expect(page.locator('#stChk')).toBeChecked();
});
