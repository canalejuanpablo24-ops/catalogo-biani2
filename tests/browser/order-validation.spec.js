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

async function addFirstProduct(page) {
  const card = page.locator('#grid .card').filter({ has: page.locator('button.btn-ver') }).first();
  await expect(card).toBeVisible();
  await card.locator('button.btn-ver').click();
  const code = (await page.locator('#pm-code').innerText()).replace('#', '').trim();
  await page.locator('#pm-add-btn').click();
  await expect.poll(async () => Number(await page.locator('#ccnt').innerText())).toBeGreaterThan(0);
  return code;
}

async function fillCustomer(page, suffix = '') {
  await page.locator('#cartBtn').click();
  await page.locator('#c-name').fill('José & María ' + suffix);
  await page.locator('#c-dni').fill('20-12345678-9');
  await page.locator('#c-dir').fill('Calle Ñandú 123');
  await page.locator('#c-obs').fill('Entregar rápido 😊');
}

async function confirmSync(page) {
  await page.evaluate(() => eval(
    "catalogSyncState = { status: 'confirmed', message: 'Sincronización controlada', checkedAt: Date.now() }"
  ));
}

async function storedItems(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('biani_cart_v1') || '{"items":[]}').items);
}

test('@all sincronización fallida bloquea el envío y conserva el carrito', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  await fillCustomer(page);

  await expect.poll(() => page.evaluate(() => eval('catalogSyncState.status'))).toBe('failed');
  let dialogText = '';
  page.once('dialog', async dialog => {
    dialogText = dialog.message();
    await dialog.accept();
  });
  await page.locator('#sendWaBtn').click();

  await expect.poll(() => dialogText).toContain('No se pudo confirmar');
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);
  expect((await storedItems(page)).length).toBe(1);
});

test('@all producto sin stock bloquea y no se borra sin permiso', async ({ page }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  await fillCustomer(page);
  await confirmSync(page);
  await page.evaluate(productCode => {
    const product = eval('prods').find(item => String(item.code) === productCode);
    product.outOfStock = true;
  }, code);

  let dialogText = '';
  page.once('dialog', async dialog => {
    dialogText = dialog.message();
    await dialog.dismiss();
  });
  await page.locator('#sendWaBtn').click();

  await expect.poll(() => dialogText).toContain('sin stock');
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);
  expect((await storedItems(page)).some(item => String(item.code) === code)).toBe(true);
});

test('@all producto eliminado o modo inválido bloquean el envío', async ({ page }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  await fillCustomer(page);
  await confirmSync(page);

  await page.evaluate(productCode => {
    eval('prods = prods.filter(item => String(item.code) !== productCode)');
  }, code);
  let missingText = '';
  page.once('dialog', async dialog => {
    missingText = dialog.message();
    await dialog.dismiss();
  });
  await page.locator('#sendWaBtn').click();
  await expect.poll(() => missingText).toContain('ya no existe');
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);
  expect((await storedItems(page)).some(item => String(item.code) === code)).toBe(true);
});

test('@all precio y mínimo cambiados requieren aceptación y actualizan la vista previa', async ({ page }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  await fillCustomer(page);
  await confirmSync(page);

  const current = await page.evaluate(productCode => {
    const product = eval('prods').find(item => String(item.code) === productCode);
    product.price = Number(product.price) + 123;
    product.unidad_min = Number(product.unidad_min || 1) + 5;
    return { price: product.price, minimum: product.unidad_min };
  }, code);

  let confirmation = '';
  page.once('dialog', async dialog => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await page.locator('#sendWaBtn').click();

  await expect.poll(() => confirmation).toContain('precio');
  expect(confirmation).toContain('mínimo');
  await expect(page.locator('#testOrderPreview')).toBeVisible();
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);

  const message = await page.locator('#testOrderPreviewText').inputValue();
  const expectedTotal = current.price * current.minimum;
  expect(message).toContain('TOTAL: $' + expectedTotal.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }));
  const stored = (await storedItems(page)).find(item => String(item.code) === code);
  expect(stored.price_at_save).toBe(current.price);
  expect(stored.min_qty_at_save).toBe(current.minimum);
});

test('@all cambio de unidades por display requiere aceptación explícita sin abrir WhatsApp', async ({ page }) => {
  await openCatalog(page);
  const code = await addFirstProduct(page);
  await fillCustomer(page);
  await confirmSync(page);

  await page.evaluate(productCode => {
    const product = eval('prods').find(item => String(item.code) === productCode);
    product.sale_modes = ['display'];
    product.display_price = 2400;
    product.display_min = 1;
    product.units_per_display = 12;
    product.sale_mode = 'display';
    product.qty = 1;
    eval('updCart()');
  }, code);
  await page.evaluate(productCode => {
    const product = eval('prods').find(item => String(item.code) === productCode);
    product.units_per_display = 24;
  }, code);

  let confirmation = '';
  page.once('dialog', async dialog => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await page.locator('#sendWaBtn').click();

  await expect.poll(() => confirmation).toContain('unidades por display');
  await expect(page.locator('#testOrderPreview')).toBeVisible();
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);
  const message = await page.locator('#testOrderPreviewText').inputValue();
  expect(message).toContain('Display');
  expect(message).toContain('24 u. c/u');
});

test('@all pulsaciones repetidas generan una sola vista previa y preservan Unicode', async ({ page }) => {
  await openCatalog(page);
  await addFirstProduct(page);
  await fillCustomer(page, '😊');
  await confirmSync(page);

  await page.evaluate(() => {
    eval('sendWA()');
    eval('sendWA()');
  });

  await expect(page.locator('#testOrderPreview')).toBeVisible();
  expect(await page.evaluate(() => window.__openedWhatsAppUrls.length)).toBe(0);
  const message = await page.locator('#testOrderPreviewText').inputValue();
  expect(message).toContain('José & María 😊');
  expect(message).toContain('Calle Ñandú 123');
  expect(message).toContain('Entregar rápido 😊');
});
