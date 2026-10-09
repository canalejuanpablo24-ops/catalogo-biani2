import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/services/admin-state.service.js';
import '../src/services/admin-package.service.js';

const COMMIT = '8d94d0027b5543f5c7719ea6192adfebf280996d';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function canonical(overrides = {}) {
  return {
    kind: 'biani-admin-state',
    schemaVersion: 1,
    revision: 0,
    sourceCommit: COMMIT,
    updatedAt: null,
    appliedPackages: [],
    state: { added: [], edits: {}, deleted: [], order: [] },
    ...overrides
  };
}

async function build(changes, document = canonical(), packageId = 'package-test-0001') {
  return globalThis.AdminPackage.buildPackage(changes, {
    repository: 'canalejuanpablo24-ops/catalogo-biani2',
    canonicalDocument: document,
    packageId,
    exportedAt: '2026-10-08T20:00:00.000Z'
  });
}

test('exportación versionada conserva altas, ediciones, bajas, orden e imágenes', async () => {
  const pkg = await build({
    added: [{ code: '900', name: 'Nuevo', price: 900, category: 'Varios', image: PNG, unidad_min: 1 }],
    edits: { '100': { name: 'Editado', price: 150, image: 'imagenes/existente.webp' } },
    deleted: ['200'],
    order: ['900', '100', '300']
  });

  assert.equal(pkg.kind, 'biani-admin-package');
  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.base.commit, COMMIT);
  assert.match(pkg.base.adminStateSha256, /^[0-9a-f]{64}$/);
  assert.equal(pkg.changes.added[0].image, PNG);
  assert.deepEqual(pkg.changes.deleted, ['200']);
  assert.deepEqual(pkg.changes.order, ['900', '100', '300']);
  assert.equal(pkg.meta.embeddedImageBytes, 8);
});

test('rechaza rutas peligrosas, MIME falso y operaciones incompatibles', async () => {
  await assert.rejects(() => build({
    added: [{ code: '900', name: 'Nuevo', price: 1, category: 'Varios', image: '../secreto' }],
    edits: {}, deleted: [], order: ['900']
  }), /Ruta de imagen no permitida/);

  await assert.rejects(() => build({
    added: [{ code: '900', name: 'Nuevo', price: 1, category: 'Varios', image: 'data:image/png;base64,QUJDRA==' }],
    edits: {}, deleted: [], order: ['900']
  }), /MIME declarado/);

  await assert.rejects(() => build({
    added: [{ code: '900', name: 'Nuevo', price: 1, category: 'Varios', image: '' }],
    edits: {}, deleted: ['900'], order: []
  }), /operaciones incompatibles/);
});

test('rechaza imágenes que superan el límite por archivo', async () => {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const oversized = Buffer.concat([header, Buffer.alloc(globalThis.AdminPackage.MAX_IMAGE_BYTES + 1)]).toString('base64');
  await assert.rejects(() => build({
    added: [{ code: '900', name: 'Nuevo', price: 1, category: 'Varios', image: `data:image/png;base64,${oversized}` }],
    edits: {}, deleted: [], order: ['900']
  }), /límite de 5 MiB/);
});

test('estado canónico prevalece sobre sincronización y orden PDF', async () => {
  const pkg = await build({
    added: [{ code: '900', name: 'Alta', price: 900, category: 'Varios', image: '' }],
    edits: { '100': { name: 'Administrativo', price: 150 } },
    deleted: ['200'],
    order: ['900', '300', '100']
  });
  const applied = await globalThis.AdminPackage.applyPackageToCanonical(canonical(), pkg, {
    sourceCommit: COMMIT,
    now: '2026-10-08T20:01:00.000Z'
  });

  const synchronized = [
    { code: '100', name: 'Sheet A', price: 100, category: 'Varios' },
    { code: '200', name: 'Sheet B reaparecido', price: 200, category: 'Varios' },
    { code: '300', name: 'Sheet C', price: 300, category: 'Varios' }
  ];
  const catalog = globalThis.AdminState.reconstructCatalog(
    synchronized,
    {},
    applied.document.state,
    ['300', '200', '100']
  );

  assert.deepEqual(catalog.map(product => product.code), ['900', '300', '100']);
  assert.equal(catalog.some(product => product.code === '200'), false);
  assert.equal(catalog.find(product => product.code === '100').name, 'Administrativo');
  assert.equal(catalog.find(product => product.code === '100').price, 150);
});

test('detecta conflictos de revisión y contenido', async () => {
  const first = await build({ added: [], edits: { '100': { price: 150 } }, deleted: [], order: ['100'] });
  const applied = await globalThis.AdminPackage.applyPackageToCanonical(canonical(), first, { sourceCommit: COMMIT });

  const stale = await build({ added: [], edits: { '100': { price: 175 } }, deleted: [], order: ['100'] }, canonical(), 'package-test-0002');
  await assert.rejects(
    () => globalThis.AdminPackage.applyPackageToCanonical(applied.document, stale, { sourceCommit: COMMIT }),
    /estado administrativo canónico cambió/
  );

  const tampered = structuredClone(first);
  tampered.changes.edits['100'].price = 999;
  await assert.rejects(
    () => globalThis.AdminPackage.applyPackageToCanonical(applied.document, tampered, { sourceCommit: COMMIT }),
    /identificador del paquete ya existe con otro contenido/
  );
});

test('reimportar el mismo paquete es idempotente y verificable', async () => {
  const pkg = await build({ added: [], edits: { '100': { price: 150 } }, deleted: [], order: ['100'] });
  const first = await globalThis.AdminPackage.applyPackageToCanonical(canonical(), pkg, { sourceCommit: COMMIT });
  const second = await globalThis.AdminPackage.applyPackageToCanonical(first.document, pkg, { sourceCommit: COMMIT });

  assert.equal(second.alreadyApplied, true);
  assert.equal(second.document.revision, 1);
  assert.equal(second.document.appliedPackages.length, 1);
  assert.equal(globalThis.AdminPackage.publishedEntry(second.document, pkg.packageId, first.packageSha256), true);
});

test('SHA-256 se usa para integridad e idempotencia, no como autenticación', async () => {
  const pkg = await build({ added: [], edits: {}, deleted: [], order: [] });
  const digest = await globalThis.AdminPackage.sha256Hex(globalThis.AdminPackage.stableStringify(pkg));
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'signature'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'author'), false);
});

test('el catálogo público no contiene publicación ni credenciales GitHub', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const forbidden of [
    'api.github.com',
    'Personal Access Token',
    'adm-deploy-btn',
    'deployToGitHub',
    'Authorization'
  ]) {
    assert.equal(html.includes(forbidden), false, `No debe aparecer ${forbidden}`);
  }
  assert.match(html, /El PIN sólo evita accesos accidentales/);
  assert.match(html, /biani-admin-package\.json/);
});
