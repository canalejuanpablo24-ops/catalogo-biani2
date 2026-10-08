import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/services/sale-mode.service.js';

const SaleMode = globalThis.SaleMode;
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const unitOnly = {
  code: '100', name: 'Producto unitario', price: 100, unidad_min: 2, outOfStock: false
};
const displayOnly = {
  code: '200', name: 'Producto por display', sale_modes: ['display'],
  display_price: 2400, display_min: 1, units_per_display: 24, outOfStock: false
};
const bothModes = {
  code: '300', name: 'Producto mixto', sale_modes: ['unit', 'display'],
  unit_price: 120, unit_min: 3,
  display_price: 2400, display_min: 1, units_per_display: 24,
  outOfStock: false
};

test('producto legado queda disponible solo por Unidad', () => {
  assert.deepEqual(SaleMode.getSaleOptions(unitOnly), [{
    mode: 'unit', label: 'Unidad', price: 100, minQty: 2, unitsPerDisplay: null
  }]);
});

test('producto explícito solo por Display no expone Unidad', () => {
  const options = SaleMode.getSaleOptions(displayOnly);
  assert.equal(options.length, 1);
  assert.equal(options[0].mode, 'display');
  assert.equal(options[0].price, 2400);
  assert.equal(options[0].unitsPerDisplay, 24);
});

test('producto con ambas opciones conserva precios y mínimos independientes', () => {
  const options = SaleMode.getSaleOptions(bothModes);
  assert.deepEqual(options.map(option => option.mode), ['unit', 'display']);
  assert.equal(options[0].minQty, 3);
  assert.equal(options[1].minQty, 1);
});

test('cantidad mínima se redondea al múltiplo válido del modo', () => {
  const unitOption = SaleMode.getSaleOption(bothModes, 'unit');
  assert.equal(SaleMode.normalizeSaleQuantity(1, unitOption), 3);
  assert.equal(SaleMode.normalizeSaleQuantity(4, unitOption), 6);
});

test('cambiar de Unidad a Display normaliza una cantidad incompatible', () => {
  const selection = SaleMode.selectSaleMode(bothModes, 'display', 4);
  assert.equal(selection.mode, 'display');
  assert.equal(selection.qty, 4);

  const backToUnit = SaleMode.selectSaleMode(bothModes, 'unit', selection.qty);
  assert.equal(backToUnit.qty, 6);
});

test('total usa el precio del modo seleccionado', () => {
  assert.equal(SaleMode.getSaleSubtotal(bothModes, 'unit', 3), 360);
  assert.equal(SaleMode.getSaleSubtotal(bothModes, 'display', 2), 4800);
});

test('selección del carrito conserva explícitamente el modo', () => {
  const selection = SaleMode.createCartSelection(bothModes, 'display', 2);
  const restored = JSON.parse(JSON.stringify(selection));
  assert.equal(restored.sale_mode, 'display');
  assert.equal(restored.sale_mode_label, 'Display');
  assert.equal(restored.units_per_display, 24);
  assert.equal(restored.total, 4800);
});

test('resumen de WhatsApp identifica Unidad y Display', () => {
  const displaySelection = SaleMode.createCartSelection(bothModes, 'display', 2);
  const unitSelection = SaleMode.createCartSelection(bothModes, 'unit', 3);
  const formatter = value => `$${value.toFixed(2)}`;
  assert.match(SaleMode.formatWhatsAppSale(displaySelection, formatter), /Modo: Display · Cantidad: 2 displays \(24 u\. c\/u\) · Total: \$4800\.00/);
  assert.match(SaleMode.formatWhatsAppSale(unitSelection, formatter), /Modo: Unidad · Cantidad: 3 unidades · Total: \$360\.00/);
});

test('producto sin stock no puede generar una selección de compra', () => {
  const unavailable = { ...bothModes, outOfStock: true };
  assert.equal(SaleMode.canPurchase(unavailable, 'unit'), false);
  assert.equal(SaleMode.createCartSelection(unavailable, 'unit', 3), null);
  assert.equal(SaleMode.changeSaleQuantity(unavailable, 'unit', 3, 1).qty, 0);
});

test('Display incompleto se oculta en lugar de inferir datos comerciales', () => {
  const incomplete = { ...displayOnly };
  delete incomplete.units_per_display;
  assert.deepEqual(SaleMode.getSaleOptions(incomplete), []);
});

test('catálogo activo integra modo, total, WhatsApp y persistencia validada', () => {
  assert.match(indexSource, /window\.SaleMode\.selectSaleMode/);
  assert.match(indexSource, /window\.SaleMode\.createCartSelection/);
  assert.match(indexSource, /window\.OrderValidation\.formatOrderMessage/);
  assert.match(indexSource, /src\/services\/order-validation\.service\.js/);
  assert.match(indexSource, /window\.CartPersistence\.createCartSnapshot/);
  assert.match(indexSource, /restorePersistentCart\(\)/);
});
