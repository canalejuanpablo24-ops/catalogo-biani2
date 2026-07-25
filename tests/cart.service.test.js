import test from 'node:test';
import assert from 'node:assert/strict';
import { CartService } from '../src/services/cart.service.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const dummyConfig = {
  name: 'BIANI',
  whatsappNumber: '5492954324063',
  minOrderAmount: 5000,
  localStorageKeys: { cart: 'test_cart' }
};

test('addItem should add product with correct minimum units and calculate totals', () => {
  localStorageMock.clear();
  const cart = new CartService(dummyConfig);
  const prod = { code: '101', name: 'PRODUCTO A', price: 1000, unidad_min: 2, image: 'a.jpg' };

  cart.addItem(prod, 1); // Should use unidad_min = 2
  assert.equal(cart.getItems().length, 1);
  assert.equal(cart.getItems()[0].qty, 2);
  assert.equal(cart.getTotalPrice(), 2000);
});

test('updateQuantity should modify or remove items', () => {
  localStorageMock.clear();
  const cart = new CartService(dummyConfig);
  const prod = { code: '101', name: 'PRODUCTO A', price: 1000, unidad_min: 1 };
  cart.addItem(prod, 5);

  cart.updateQuantity('101', 3);
  assert.equal(cart.getItems()[0].qty, 3);

  cart.updateQuantity('101', 0);
  assert.equal(cart.getItems().length, 0);
});

test('meetsMinimumOrder should validate threshold', () => {
  localStorageMock.clear();
  const cart = new CartService(dummyConfig);
  const prod = { code: '101', name: 'PRODUCTO A', price: 2000, unidad_min: 1 };
  
  cart.addItem(prod, 2); // 4000 total < 5000 min
  assert.equal(cart.meetsMinimumOrder(), false);

  cart.addItem(prod, 1); // 6000 total >= 5000 min
  assert.equal(cart.meetsMinimumOrder(), true);
});

test('buildWhatsAppMessage should format order text with item details and total', () => {
  localStorageMock.clear();
  const cart = new CartService(dummyConfig);
  cart.addItem({ code: '101', name: 'FECOVITA VINO TORO', price: 2500, unidad_min: 1 }, 2);

  const msg = cart.buildWhatsAppMessage({ name: 'Pablo Canale', address: 'Calle 123' });
  assert.ok(msg.includes('NUEVO PEDIDO - BIANI'));
  assert.ok(msg.includes('Pablo Canale'));
  assert.ok(msg.includes('FECOVITA VINO TORO'));
  assert.ok(msg.includes('5.000,00'));
});
