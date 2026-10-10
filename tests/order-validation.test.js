import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/services/sale-mode.service.js';
import '../src/services/order-validation.service.js';

const SaleMode = globalThis.SaleMode;
const OrderValidation = globalThis.OrderValidation;
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const unitProduct = {
  code: '34',
  name: 'Alfajor Guaymallén clásico 🍫',
  price: 100,
  unidad_min: 2,
  sale_mode: 'unit',
  qty: 2,
  outOfStock: false
};
const displayProduct = {
  code: 'D1',
  name: 'Bombones edición especial',
  sale_modes: ['display'],
  display_price: 2400,
  display_min: 1,
  units_per_display: 24,
  sale_mode: 'display',
  qty: 1,
  outOfStock: false
};

function snapshot(items) {
  return { version: 1, items };
}

function savedUnit(overrides = {}) {
  return {
    code: '34',
    qty: 2,
    sale_mode: 'unit',
    units_per_display: null,
    price_at_save: 100,
    min_qty_at_save: 2,
    ...overrides
  };
}

function validate(cart, catalog = [unitProduct], status = 'confirmed') {
  return OrderValidation.validateOrder(cart, catalog, SaleMode, { status });
}

test('pedido válido se recalcula con el catálogo vigente', () => {
  const result = validate(snapshot([savedUnit()]));
  assert.equal(result.canSend, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.total, 200);
  assert.equal(result.items[0].selection.price, 100);
});

test('producto eliminado bloquea el pedido sin borrarlo', () => {
  const cart = snapshot([savedUnit()]);
  const result = validate(cart, []);
  assert.equal(result.canSend, false);
  assert.equal(result.blockers[0].type, 'missing');
  assert.equal(cart.items.length, 1);
});

test('producto sin stock bloquea el pedido', () => {
  const result = validate(snapshot([savedUnit()]), [{ ...unitProduct, outOfStock: true }]);
  assert.equal(result.canSend, false);
  assert.equal(result.blockers.some(item => item.type === 'out_of_stock'), true);
});

test('modo retirado y cantidad inválida bloquean el pedido', () => {
  const mode = validate(snapshot([{ ...savedUnit(), sale_mode: 'display' }]));
  assert.equal(mode.blockers.some(item => item.type === 'mode_unavailable'), true);

  const quantity = validate(snapshot([{ ...savedUnit(), qty: -1 }]));
  assert.equal(quantity.blockers.some(item => item.type === 'invalid_quantity'), true);
});

test('precio cambiado usa el actual y exige aceptación', () => {
  const result = validate(snapshot([savedUnit()]), [{ ...unitProduct, price: 135 }]);
  assert.equal(result.canSend, true);
  assert.equal(result.total, 270);
  assert.equal(result.changes.some(item => item.type === 'price_changed'), true);
  assert.match(OrderValidation.formatChangesMessage(result.changes, result.total), /Nuevo total: \$270,00/);
});

test('cambio de mínimo normaliza cantidad e informa ambos cambios', () => {
  const result = validate(snapshot([savedUnit({ qty: 3 })]), [{ ...unitProduct, unidad_min: 5 }]);
  assert.equal(result.items[0].selection.qty, 5);
  assert.equal(result.total, 500);
  assert.equal(result.changes.some(item => item.type === 'minimum_changed'), true);
  assert.equal(result.changes.some(item => item.type === 'quantity_changed'), true);
});

test('cambio de unidades por display requiere aceptación', () => {
  const result = validate(snapshot([{
    code: 'D1', qty: 1, sale_mode: 'display',
    units_per_display: 12, price_at_save: 2400, min_qty_at_save: 1
  }]), [displayProduct]);
  assert.equal(result.canSend, true);
  assert.equal(result.changes.some(item => item.type === 'display_units_changed'), true);
});

test('sin confirmación externa no inventa stock y bloquea', () => {
  for (const status of ['pending', 'failed', 'unknown']) {
    const result = validate(snapshot([savedUnit()]), [unitProduct], status);
    assert.equal(result.canSend, false);
    assert.equal(result.blockers.some(item => item.type === 'sync_unconfirmed'), true);
  }
});

test('códigos duplicados quedan bloqueados', () => {
  const result = validate(snapshot([savedUnit(), savedUnit()]));
  assert.equal(result.canSend, false);
  assert.equal(result.blockers.some(item => item.type === 'duplicate'), true);
});

test('WhatsApp conserva acentos, caracteres especiales y emojis', () => {
  const result = validate(snapshot([savedUnit()]));
  const message = OrderValidation.formatOrderMessage(result.items, {
    name: 'José & María 😊',
    dni: '20-123',
    address: 'Calle Ñandú 123',
    observations: 'Envío “rápido”'
  }, SaleMode, new Date(2026, 9, 8));
  const url = OrderValidation.buildWhatsAppUrl('54 9 2954-123456', message);
  const decoded = decodeURIComponent(url.split('?text=')[1]);
  assert.match(decoded, /José & María 😊/);
  assert.match(decoded, /Guaymallén clásico 🍫/);
  assert.match(decoded, /Calle Ñandú/);
  assert.match(decoded, /TOTAL: \$200,00/);
});

test('integración revalida antes de abrir WhatsApp y evita doble envío', () => {
  const validationPosition = indexSource.indexOf('OrderValidation.validateOrder');
  const openPosition = indexSource.indexOf('window.open(url');
  assert.ok(validationPosition > 0 && openPosition > validationPosition);
  assert.match(indexSource, /orderSubmissionInProgress/);
  assert.match(indexSource, /formatBlockingMessage/);
  assert.match(indexSource, /formatChangesMessage/);
  assert.doesNotMatch(indexSource, /items\.map\(getCartSelection\)\.filter\(Boolean\)/);
});
