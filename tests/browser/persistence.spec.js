import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fallbackProducts = JSON.parse(
  readFileSync(new URL('../../products_fallback.json', import.meta.url), 'utf8')
);

async function openCatalog(page, options = {}) {
  await page.route('https://docs.google.com/**', route => route.abort('blockedbyclient'));
  if (options.outOfStockCode) {
    await page.route('**/products_fallback.json*', route => {
      const products = fallbackProducts.map(product => (
        String(product.code) === String(options.outOfStockCode)
          ? { ...product, outOfStock: true }
          : product
      ));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(products)
      });
    });
  }
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
}

async function addProductFromCard(page, card) {
  await card.locator('button.btn-ver').click();
  await expect(page.locator('#prodModal')).toHaveClass(/open/);
  const code = (await page.locator('#pm-code').innerText()).replace('#', '').trim();
  await page.locator('#pm-add-btn').click();
  await expect.poll(async () => Number(await page.locator('#ccnt').innerText())).toBeGreaterThan(0);
  return code;
}

async function addFirstProduct(page) {
  const card = page.locator('#grid .card').filter({ has: page.locator('button.btn-ver') }).first();
  await expect(card).toBeVisible();
  return addProductFromCard(page, card);
}

async function storedCart(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('biani_cart_v1')));
}

test('@all agregar productos y recargar restaura el carrito', async ({ page }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  const before = await storedCart(page);
  expect(before.items[0].code).toBe(code);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await expect(page.locator('#cartRestoreNotice')).toBeVisible();
  const after = await storedCart(page);
  expect(after.items[0].code).toBe(code);
  expect(after.items[0].qty).toBe(before.items[0].qty);
  expect(after.items[0].sale_mode).toBe(before.items[0].sale_mode);
  expect(after.items[0].units_per_display).toBe(before.items[0].units_per_display);
});

test('@desktop cerrar y volver a abrir mantiene el pedido', async ({ page, context }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  await page.close();

  const reopened = await context.newPage();
  await openCatalog(reopened);
  const restored = await storedCart(reopened);
  expect(restored.items.some(item => item.code === code)).toBe(true);
  await expect(reopened.locator('#cartRestoreNotice')).toBeVisible();
});

test('@desktop restaura varios productos sin duplicarlos', async ({ page }) => {
  await openCatalog(page);
  const cards = page.locator('#grid .card').filter({ has: page.locator('button.btn-ver') });
  const firstCode = await addProductFromCard(page, cards.nth(0));
  const secondCode = await addProductFromCard(page, cards.nth(1));
  expect(secondCode).not.toBe(firstCode);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  const restored = await storedCart(page);
  expect(restored.items).toHaveLength(2);
  expect(new Set(restored.items.map(item => item.code)).size).toBe(2);
});

test('@desktop restaura Unidad o Display con la configuración guardada', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  const before = await storedCart(page);
  const item = before.items[0];
  expect(['unit', 'display']).toContain(item.sale_mode);
  if (item.sale_mode === 'display') expect(item.units_per_display).toBeGreaterThan(0);
  else expect(item.units_per_display).toBeNull();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  const after = await storedCart(page);
  expect(after.items[0].sale_mode).toBe(item.sale_mode);
  expect(after.items[0].units_per_display).toBe(item.units_per_display);
});

test('@desktop cambios de precio usan el catálogo vigente y muestran aviso', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  await page.evaluate(() => {
    const cart = JSON.parse(localStorage.getItem('biani_cart_v1'));
    cart.items[0].price_at_save -= 123;
    localStorage.setItem('biani_cart_v1', JSON.stringify(cart));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await expect(page.locator('#cartRestoreNotice')).toContainText('actualizó su precio');
  const after = await storedCart(page);
  expect(after.items[0].price_at_save).not.toBeNaN();
});

test('@desktop productos sin stock se eliminan al restaurar', async ({ page, context }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  await page.close();

  const reopened = await context.newPage();
  await openCatalog(reopened, { outOfStockCode: code });
  await expect(reopened.locator('#cartRestoreNotice')).toContainText('sin stock');
  const restored = await storedCart(reopened);
  expect(restored.items).toHaveLength(1);
  expect(restored.items[0].code).toBe(code);
  await expect(reopened.locator('#ccnt')).toHaveText('0');
  await expect(reopened.locator('#cta')).toHaveText('$0,00');
});

test('@desktop cambios de cantidad mínima ajustan y notifican', async ({ page }) => {
  await openCatalog(page);
  const card = page.locator('#grid .card').filter({ hasText: /GUAYMALLEN SIMPLE/i }).filter({
    has: page.locator('button.btn-ver')
  }).first();
  await expect(card).toBeVisible();
  await addProductFromCard(page, card);
  await page.evaluate(() => {
    const cart = JSON.parse(localStorage.getItem('biani_cart_v1'));
    cart.items[0].qty = 1;
    cart.items[0].min_qty_at_save = 1;
    localStorage.setItem('biani_cart_v1', JSON.stringify(cart));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await expect(page.locator('#cartRestoreNotice')).toContainText('cantidad');
  const restored = await storedCart(page);
  expect(restored.items[0].qty).toBeGreaterThan(1);
});

test('@desktop datos del cliente persisten pero el DNI no', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  await page.locator('#cartBtn').click();
  await page.locator('#c-name').fill('Cliente Persistente');
  await page.locator('#c-dir').fill('Calle Persistente 123');
  await page.locator('#c-phone').fill('2954 123456');
  await page.locator('#c-obs').fill('Observación persistente');
  await page.locator('#c-dni').fill('20-12345678-9');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('biani_customer_v1')));
  expect(stored).toEqual({
    name: 'Cliente Persistente',
    address: 'Calle Persistente 123',
    phone: '2954 123456',
    observations: 'Observación persistente'
  });
  expect(stored.dni).toBeUndefined();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await page.locator('#cartBtn').click();
  await expect(page.locator('#c-name')).toHaveValue('Cliente Persistente');
  await expect(page.locator('#c-dir')).toHaveValue('Calle Persistente 123');
  await expect(page.locator('#c-phone')).toHaveValue('2954 123456');
  await expect(page.locator('#c-obs')).toHaveValue('Observación persistente');
  await expect(page.locator('#c-dni')).toHaveValue('');
});

test('@desktop la vista previa usa el carrito restaurado y los datos recuperados', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  await page.locator('#cartBtn').click();
  await page.locator('#c-name').fill('Cliente Restaurado');
  await page.locator('#c-dir').fill('Calle Restaurada 456');
  await page.locator('#c-phone').fill('2954 654321');
  await page.locator('#c-obs').fill('Pedido restaurado');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await page.locator('#cartBtn').click();
  await page.locator('#c-dni').fill('20-12345678-9');
  await page.evaluate(() => eval("catalogSyncState = { status: 'confirmed', message: 'Prueba controlada', checkedAt: Date.now(), lastSuccessAt: Date.now() }"));
  await page.locator('#sendWaBtn').click();

  await expect(page.locator('#testOrderPreview')).toBeVisible();
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);
  const message = await page.locator('#testOrderPreviewText').inputValue();
  expect(message).toContain('Cliente Restaurado');
  expect(message).toContain('2954 654321');
  expect(message).toContain('Modo:');
  expect(message).toContain('TOTAL:');
});

test('@desktop vaciar elimina carrito y datos guardados', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  await page.locator('#cartBtn').click();
  await page.locator('#c-name').fill('Datos a borrar');
  await page.locator('#c-dir').fill('Dirección a borrar');
  await page.locator('#c-phone').fill('123456');
  await page.locator('#clearCartBtn').click();

  const storage = await page.evaluate(() => ({
    cart: localStorage.getItem('biani_cart_v1'),
    customer: localStorage.getItem('biani_customer_v1')
  }));
  expect(storage).toEqual({ cart: null, customer: null });
  await expect(page.locator('#ccnt')).toHaveText('0');
  await expect(page.locator('#c-name')).toHaveValue('');
  await expect(page.locator('#c-phone')).toHaveValue('');
});

test('@mobile persistencia funciona al recargar en viewport móvil', async ({ page }) => {
  await openCatalog(page);
  await expect(page.locator('#btnOpenCats')).toBeVisible();
  const beforeCount = Number(await page.locator('#ccnt').innerText());
  await addFirstProduct(page);
  const addedCount = Number(await page.locator('#ccnt').innerText());
  expect(addedCount).toBeGreaterThan(beforeCount);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await expect(page.locator('#btnOpenCats')).toBeVisible();
  await expect(page.locator('#ccnt')).toHaveText(String(addedCount));
  await expect(page.locator('#cartRestoreNotice')).toBeVisible();
});
