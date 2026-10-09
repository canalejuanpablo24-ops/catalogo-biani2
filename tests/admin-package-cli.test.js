import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../src/services/admin-state.service.js';
import '../src/services/admin-package.service.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const COMMIT = '8d94d0027b5543f5c7719ea6192adfebf280996d';

test('el aplicador en simulación valida sin modificar archivos', async () => {
  const canonicalPath = path.join(ROOT, 'src', 'data', 'admin-state.json');
  const imageMapPath = path.join(ROOT, 'code_to_image.json');
  const productsPath = path.join(ROOT, 'products_fallback.json');
  const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const pkg = await globalThis.AdminPackage.buildPackage({
    added: [],
    edits: { '100': { name: 'Simulación segura', price: 150 } },
    deleted: ['200'],
    order: ['100']
  }, {
    repository: 'canalejuanpablo24-ops/catalogo-biani2',
    canonicalDocument: canonical,
    packageId: 'package-cli-test-0001',
    exportedAt: '2026-10-08T22:00:00.000Z'
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biani-admin-test-'));
  const packagePath = path.join(tempDir, 'biani-admin-package.json');
  fs.writeFileSync(packagePath, JSON.stringify(pkg));
  const before = {
    canonical: fs.readFileSync(canonicalPath),
    imageMap: fs.readFileSync(imageMapPath),
    products: fs.readFileSync(productsPath)
  };

  try {
    const output = execFileSync(process.execPath, [
      path.join(ROOT, 'scripts', 'apply-admin-package.js'),
      '--check',
      packagePath
    ], { cwd: ROOT, encoding: 'utf8' });
    const summary = JSON.parse(output);
    assert.equal(summary.mode, 'check');
    assert.equal(summary.packageId, pkg.packageId);
    assert.equal(summary.alreadyApplied, false);
    assert.match(summary.authenticityWarning, /no autentica/i);
    assert.deepEqual(fs.readFileSync(canonicalPath), before.canonical);
    assert.deepEqual(fs.readFileSync(imageMapPath), before.imageMap);
    assert.deepEqual(fs.readFileSync(productsPath), before.products);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('el aplicador declara límites y defensas de ruta', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'apply-admin-package.js'), 'utf8');
  assert.match(source, /25 \* 1024 \* 1024/);
  assert.match(source, /isSymbolicLink/);
  assert.match(source, /Ruta de escritura fuera/);
  assert.match(source, /merge-base/);
  assert.match(source, /--confirm/);
  assert.equal(source.includes('products_fallback.json'), false);
  assert.equal(COMMIT.length, 40);
});
