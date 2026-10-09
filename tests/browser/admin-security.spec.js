import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

async function openWithPendingAdminState(page) {
  const githubRequests = [];
  page.on('request', request => {
    if (/github\.com/i.test(request.url())) githubRequests.push({ method: request.method(), url: request.url() });
  });
  await page.route('https://docs.google.com/**', route => route.abort('blockedbyclient'));
  await page.addInitScript(({ png }) => {
    window.Sortable = class {
      destroy() {}
    };
    localStorage.setItem('biani_add', JSON.stringify([
      { code: 'TEST-ADMIN-900', name: 'Alta administrativa de prueba', price: 900, category: 'Varios', image: png, qty: 0, unidad_min: 1 }
    ]));
    localStorage.setItem('biani_edits', JSON.stringify({
      '100': { name: 'Edición administrativa de prueba', price: 150 }
    }));
    localStorage.setItem('biani_del', JSON.stringify(['200']));
    localStorage.setItem('biani_order', JSON.stringify(['TEST-ADMIN-900', '100']));
  }, { png: PNG });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  return githubRequests;
}

async function enterLocalEditMode(page) {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#adm-login')).toHaveClass(/on/);
  for (const digit of ['1', '1', '1', '4']) await page.locator(`.pin-key[data-k="${digit}"]`).click();
  await page.locator('.pin-key[data-k="ok"]').click();
  await expect(page.locator('#adm-panel')).toHaveClass(/on/);
}

test('@all PIN se presenta como barrera visual y no existe publicación GitHub', async ({ page }) => {
  const githubRequests = await openWithPendingAdminState(page);
  await page.locator('#settingsBtn').click();

  await expect(page.locator('#adm-login')).toContainText('El PIN sólo evita accesos accidentales');
  await expect(page.locator('#adm-deploy-btn')).toHaveCount(0);
  await expect(page.getByText(/Publicar en codex-desarrollo/i)).toHaveCount(0);
  await expect.poll(() => githubRequests.length).toBe(0);
});

test('@all exporta, conserva pendientes y confirma sólo contra estado canónico coincidente', async ({ page }) => {
  const githubRequests = await openWithPendingAdminState(page);
  await enterLocalEditMode(page);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#adm-export-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('biani-admin-package.json');
  const packagePath = await download.path();
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  expect(pkg.kind).toBe('biani-admin-package');
  expect(pkg.schemaVersion).toBe(1);
  expect(pkg.base.branch).toBe('codex-desarrollo');
  expect(pkg.base.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(pkg.changes.added.map(product => product.code)).toContain('TEST-ADMIN-900');
  expect(pkg.changes.edits['100'].price).toBe(150);
  expect(pkg.changes.deleted).toContain('200');
  expect(pkg.changes.order[0]).toBe('TEST-ADMIN-900');
  expect(pkg.changes.added[0].image).toBe(PNG);

  const pendingAfterExport = await page.evaluate(() => ({
    add: localStorage.getItem('biani_add'),
    edits: localStorage.getItem('biani_edits'),
    deleted: localStorage.getItem('biani_del'),
    order: localStorage.getItem('biani_order')
  }));
  expect(Object.values(pendingAfterExport).every(Boolean)).toBe(true);

  const canonical = await page.evaluate(async exportedPackage => {
    const initial = {
      kind: 'biani-admin-state',
      schemaVersion: 1,
      revision: 0,
      sourceCommit: '8d94d0027b5543f5c7719ea6192adfebf280996d',
      updatedAt: null,
      appliedPackages: [],
      state: { added: [], edits: {}, deleted: [], order: [] }
    };
    return (await window.AdminPackage.applyPackageToCanonical(initial, exportedPackage, {
      sourceCommit: initial.sourceCommit,
      now: '2026-10-08T21:00:00.000Z'
    })).document;
  }, pkg);

  await page.route('**/src/data/admin-state.json?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(canonical)
  }));
  await page.locator('#adm-confirm-input').setInputFiles({
    name: 'admin-state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(canonical))
  });

  await expect.poll(() => page.evaluate(() => localStorage.getItem('biani_add'))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('biani_edits'))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('biani_del'))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('biani_order'))).toBeNull();
  await expect.poll(() => page.evaluate(() => eval("prods.some(product => product.code === 'TEST-ADMIN-900')"))).toBe(true);
  await expect.poll(() => page.evaluate(() => eval("prods.some(product => product.code === '200')"))).toBe(false);
  await expect.poll(() => githubRequests.length).toBe(0);
});
