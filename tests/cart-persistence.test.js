import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/services/sale-mode.service.js';
import '../src/services/cart-persistence.service.js';

const SaleMode = globalThis.SaleMode;
const CartPersistence = globalThis.CartPersistence;
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const unitProduct = {
  code: 'U1', name: 'Producto unidad', price: 100,
  unidad_min: 2, qty: 4, sale_mode: 'unit', outOfStock: false
};
const displayProduct = {
  code: 'D1', name: 'Producto display',
  sale_modes: ['display'], display_price: 2400,
  display_min: 1, units_per_display: 24,
  qty: 2, sale_mode: 'display', outOfStock: false
};

test('agregar productos y recargar restaura códigos y cantidades', () => {
  const snapshot = CartPersistence.createCartSnapshot([unitProduct], SaleMode, 1000);
  const restored = CartPersistence.restoreCart([{ ...unitProduct, qty: 0 }], JSON.stringify(snapshot), SaleMode);
  assert.deepEqual(restored.items.map(item => ({ code: item.code, qty: item.qty })), [{ code: 'U1', qty: 4 }]);
  assert.equal(restored.notices.length, 0);
});

test('cerrar y volver a abrir conserva un estado JSON independiente', () => {
  const saved = JSON.stringify(CartPersistence.createCartSnapshot([unitProduct], SaleMode, 1000));
  const reopened = CartPersistence.restoreCart([{ ...unitProduct, qty: 0 }], saved, SaleMode);
  assert.equal(reopened.items[0].sale_mode, 'unit');
  assert.equal(reopened.items[0].price, 100);
});

test('restaura varios productos sin duplicados', () => {
  const snapshot = CartPersistence.createCartSnapshot([unitProduct, displayProduct], SaleMode, 1000);
  snapshot.items.push({ ...snapshot.items[0], qty: 6 });
  const restored = CartPersistence.restoreCart(
    [{ ...unitProduct, qty: 0 }, { ...displayProduct, qty: 0 }],
    snapshot,
    SaleMode
  );
  assert.equal(restored.items.length, 2);
  assert.equal(restored.items.find(item => item.code === 'U1').qty, 6);
});

test('conserva Unidad, Display y unidades por display', () => {
  const snapshot = CartPersistence.createCartSnapshot([unitProduct, displayProduct], SaleMode, 1000);
  const display = snapshot.items.find(item => item.code === 'D1');
  assert.equal(display.sale_mode, 'display');
  assert.equal(display.units_per_display, 24);

  const restored = CartPersistence.restoreCart(
    [{ ...unitProduct, qty: 0 }, { ...displayProduct, qty: 0 }],
    snapshot,
    SaleMode
  );
  assert.deepEqual(restored.items.map(item => item.sale_mode), ['unit', 'display']);
  assert.equal(restored.items[1].units_per_display, 24);
});

test('un cambio de precio usa el valor vigente y genera aviso', () => {
  const snapshot = CartPersistence.createCartSnapshot([unitProduct], SaleMode, 1000);
  const current = { ...unitProduct, price: 135, qty: 0 };
  const restored = CartPersistence.restoreCart([current], snapshot, SaleMode);
  assert.equal(restored.items[0].price, 135);
  assert.equal(restored.notices.some(notice => notice.type === 'price_changed'), true);
});

test('productos sin stock o inexistentes no se restauran', () => {
  const snapshot = CartPersistence.createCartSnapshot([unitProduct], SaleMode, 1000);
  snapshot.items.push({ code: 'MISSING', qty: 1, sale_mode: 'unit', price_at_save: 1, min_qty_at_save: 1 });
  const restored = CartPersistence.restoreCart([{ ...unitProduct, qty: 0, outOfStock: true }], snapshot, SaleMode);
  assert.equal(restored.items.length, 0);
  assert.deepEqual(restored.notices.map(notice => notice.type).sort(), ['missing', 'out_of_stock']);
});

test('cambios de cantidad mínima normalizan el pedido y avisan', () => {
  const snapshot = CartPersistence.createCartSnapshot([unitProduct], SaleMode, 1000);
  snapshot.items[0].qty = 3;
  const current = { ...unitProduct, unidad_min: 5, qty: 0 };
  const restored = CartPersistence.restoreCart([current], snapshot, SaleMode);
  assert.equal(restored.items[0].qty, 5);
  assert.equal(restored.notices.some(notice => notice.type === 'quantity_changed'), true);
});

test('carrito vacío no genera elementos persistidos', () => {
  const snapshot = CartPersistence.createCartSnapshot([{ ...unitProduct, qty: 0 }], SaleMode, 1000);
  assert.deepEqual(snapshot.items, []);
  assert.deepEqual(CartPersistence.restoreCart([unitProduct], snapshot, SaleMode).items, []);
});

test('datos del cliente persisten sin almacenar DNI', () => {
  const customer = CartPersistence.sanitizeCustomer({
    name: '  Ana Pérez ',
    address: ' Calle 1 ',
    phone: ' 2954 123456 ',
    observations: ' Portón azul ',
    dni: '20-12345678-9'
  });
  assert.deepEqual(customer, {
    name: 'Ana Pérez',
    address: 'Calle 1',
    phone: '2954 123456',
    observations: 'Portón azul'
  });
  assert.equal(Object.hasOwn(customer, 'dni'), false);
});

test('cantidades inválidas y modos retirados se descartan', () => {
  const invalidQuantity = CartPersistence.restoreCart([unitProduct], {
    version: 1,
    items: [{ code: 'U1', qty: -3, sale_mode: 'unit' }]
  }, SaleMode);
  assert.equal(invalidQuantity.items.length, 0);
  assert.equal(invalidQuantity.notices[0].type, 'invalid_quantity');

  const unavailableMode = CartPersistence.restoreCart([unitProduct], {
    version: 1,
    items: [{ code: 'U1', qty: 2, sale_mode: 'display' }]
  }, SaleMode);
  assert.equal(unavailableMode.items.length, 0);
  assert.equal(unavailableMode.notices[0].type, 'mode_unavailable');
});

test('integración borra almacenamiento y no persiste DNI', () => {
  assert.match(indexSource, /writeLocalStorage\(CART_STORAGE_KEY, null\)/);
  assert.match(indexSource, /writeLocalStorage\(CUSTOMER_STORAGE_KEY, null\)/);
  assert.match(indexSource, /\['c-name', 'c-dir', 'c-phone', 'c-obs'\]/);
  assert.doesNotMatch(indexSource, /localStorage\.setItem\([^\n]*dni/i);
  assert.match(indexSource, /restorePersistentCart\(\)/);
  assert.match(indexSource, /savePersistentCart\(\)/);
});
