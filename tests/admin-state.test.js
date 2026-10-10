import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/services/admin-state.service.js';

const {
  readAdminState,
  writeAdminState,
  reconstructCatalog,
  recordAddedProduct,
  recordProductEdit,
  recordProductDeletion,
  recordOrder
} = globalThis.AdminState;

const KEYS = {
  order: 'biani_order',
  edits: 'biani_edits',
  del: 'biani_del',
  add: 'biani_add'
};

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function baseCatalog() {
  return [
    { code: '100', name: 'Producto A', price: 100, category: 'Varios', qty: 0 },
    { code: '200', name: 'Producto B', price: 200, category: 'Varios', qty: 0 },
    { code: '300', name: 'Producto C', price: 300, category: 'Varios', qty: 0 }
  ];
}

function reload(storage, base = baseCatalog(), canonicalEdits = {}, fallbackOrder = []) {
  const state = readAdminState(storage, KEYS);
  writeAdminState(storage, KEYS, state);
  return reconstructCatalog(base, canonicalEdits, state, fallbackOrder);
}

function persist(storage, state) {
  return writeAdminState(storage, KEYS, state);
}

test('alta administrativa persiste después de recargar', () => {
  const storage = new MemoryStorage();
  const product = { code: '900', name: 'Producto nuevo', price: 900, category: 'Varios', qty: 0 };
  const state = recordAddedProduct(readAdminState(storage, KEYS), product, ['900', '100', '200', '300']);
  persist(storage, state);

  const catalog = reload(storage);
  assert.equal(catalog.filter(item => item.code === '900').length, 1);
  assert.equal(catalog[0].code, '900');
  assert.equal(catalog[0].outOfStock, false);
});

test('edición de producto existente persiste después de recargar', () => {
  const storage = new MemoryStorage();
  const state = recordProductEdit(readAdminState(storage, KEYS), '100', { name: 'Producto A editado', price: 150 });
  persist(storage, state);

  const catalog = reload(storage);
  assert.equal(catalog.find(item => item.code === '100').name, 'Producto A editado');
  assert.equal(catalog.find(item => item.code === '100').price, 150);
});

test('eliminación administrativa sigue aplicada después de recargar', () => {
  const storage = new MemoryStorage();
  const state = recordProductDeletion(readAdminState(storage, KEYS), '200');
  persist(storage, state);

  const catalog = reload(storage);
  assert.equal(catalog.some(item => item.code === '200'), false);
  assert.deepEqual(readAdminState(storage, KEYS).deleted, ['200']);
});

test('orden administrativo guardado se mantiene después de recargar', () => {
  const storage = new MemoryStorage();
  const state = recordOrder(readAdminState(storage, KEYS), ['300', '100', '200']);
  persist(storage, state);

  const catalog = reload(storage, baseCatalog(), {}, ['100', '200', '300']);
  assert.deepEqual(catalog.map(item => item.code), ['300', '100', '200']);
});

test('producto nuevo puede editarse inmediatamente sin crear estado duplicado', () => {
  const storage = new MemoryStorage();
  let state = recordAddedProduct(readAdminState(storage, KEYS), {
    code: '900', name: 'Nuevo', price: 900, category: 'Varios'
  });
  state = recordProductEdit(state, '900', { name: 'Nuevo editado', price: 950 });
  persist(storage, state);

  const saved = readAdminState(storage, KEYS);
  assert.equal(saved.added[0].name, 'Nuevo editado');
  assert.equal(saved.added[0].price, 950);
  assert.equal(saved.edits['900'], undefined);
  assert.equal(reconstructCatalog(baseCatalog(), {}, saved).find(item => item.code === '900').name, 'Nuevo editado');
});

test('producto nuevo puede editarse después de una recarga', () => {
  const storage = new MemoryStorage();
  let state = recordAddedProduct(readAdminState(storage, KEYS), {
    code: '900', name: 'Nuevo', price: 900, category: 'Varios'
  });
  persist(storage, state);
  assert.ok(reload(storage).some(item => item.code === '900'));

  state = recordProductEdit(readAdminState(storage, KEYS), '900', { name: 'Editado tras recarga', price: 975 });
  persist(storage, state);
  const catalog = reload(storage);
  assert.equal(catalog.find(item => item.code === '900').name, 'Editado tras recarga');
  assert.equal(catalog.find(item => item.code === '900').price, 975);
});

test('producto nuevo no se convierte en agotado al reconstruir sobre una sincronización externa', () => {
  const storage = new MemoryStorage();
  const product = { code: '900', name: 'Nuevo', price: 900, category: 'Varios' };
  persist(storage, recordAddedProduct(readAdminState(storage, KEYS), product));

  const synchronizedCatalog = [...baseCatalog(), { ...product, outOfStock: true }];
  const catalog = reload(storage, synchronizedCatalog);
  assert.equal(catalog.filter(item => item.code === '900').length, 1);
  assert.equal(catalog.find(item => item.code === '900').outOfStock, false);
});

test('secuencia alta, edición y eliminación no deja productos fantasma', () => {
  const storage = new MemoryStorage();
  let state = recordAddedProduct(readAdminState(storage, KEYS), {
    code: '900', name: 'Nuevo', price: 900, category: 'Varios'
  });
  state = recordProductEdit(state, '900', { name: 'Nuevo editado' });
  state = recordProductDeletion(state, '900');
  persist(storage, state);

  const saved = readAdminState(storage, KEYS);
  assert.equal(saved.added.some(item => item.code === '900'), false);
  assert.equal(saved.edits['900'], undefined);
  assert.deepEqual(saved.deleted, ['900']);
  assert.equal(reload(storage).some(item => item.code === '900'), false);
});

test('múltiples recargas normalizan duplicados y conservan un catálogo determinista', () => {
  const storage = new MemoryStorage({
    [KEYS.add]: JSON.stringify([
      { code: '900', name: 'Versión vieja', price: 1 },
      { code: '900', name: 'Versión final', price: 2 }
    ]),
    [KEYS.order]: JSON.stringify(['900', '100', '900', '100', '200', '300'])
  });

  const first = reload(storage);
  const second = reload(storage);
  const third = reload(storage);

  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.equal(third.filter(item => item.code === '900').length, 1);
  assert.equal(third.find(item => item.code === '900').name, 'Versión final');
  assert.equal(new Set(third.map(item => item.code)).size, third.length);
  assert.deepEqual(readAdminState(storage, KEYS).order, ['900', '100', '200', '300']);
});

test('precedencia: base, canónico, PDF de sesión, admin, eliminación y orden local', () => {
  const storage = new MemoryStorage();
  let state = recordProductEdit(readAdminState(storage, KEYS), '100', { price: 400, name: 'Admin' });
  state = recordProductDeletion(state, '200');
  state = recordOrder(state, ['300', '100', '200']);
  persist(storage, state);

  const canonicalCatalog = reconstructCatalog(
    baseCatalog(),
    { '100': { price: 150, name: 'Canónico' }, '300': { price: 350 } },
    {}
  );
  const pdfSessionCatalog = canonicalCatalog.map(item => (
    item.code === '100' ? { ...item, price: 250, name: 'PDF' }
      : item.code === '300' ? { ...item, price: 375 }
        : item
  ));
  const catalog = reload(storage, pdfSessionCatalog);

  assert.deepEqual(catalog.map(item => item.code), ['300', '100']);
  assert.equal(catalog.find(item => item.code === '300').price, 375);
  assert.equal(catalog.find(item => item.code === '100').price, 400);
  assert.equal(catalog.find(item => item.code === '100').name, 'Admin');
});
