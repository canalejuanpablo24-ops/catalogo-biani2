import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, parsePrice, normalizeCategory, parseProductInfo } from '../src/utils/formatters.js';

test('formatCurrency should format numbers in ARS currency style', () => {
  const formatted = formatCurrency(12345.67);
  assert.ok(formatted.includes('12.345,67') || formatted.includes('12,345.67'));
});

test('parsePrice should correctly parse Argentine format numbers (12.345,67)', () => {
  assert.equal(parsePrice('12.345,67'), 12345.67);
  assert.equal(parsePrice('$ 1.500,00'), 1500);
  assert.equal(parsePrice('250,50'), 250.5);
});

test('parsePrice should handle US format numbers (12345.67)', () => {
  assert.equal(parsePrice('12345.67'), 12345.67);
  assert.equal(parsePrice(99.99), 99.99);
  assert.equal(parsePrice(''), 0);
  assert.equal(parsePrice(null), 0);
});

test('normalizeCategory should classify missing image as "Nuevos y Sin Imagen"', () => {
  assert.equal(normalizeCategory('Alfajores', 'ALFAJOR GUAYMALLEN', ''), 'Nuevos y Sin Imagen');
});

test('normalizeCategory should normalize known category names', () => {
  assert.equal(normalizeCategory('alfajores', 'ALFAJOR', 'img.jpg'), 'Alfajores');
  assert.equal(normalizeCategory('Bebidas y Jugos', 'VINO TORO', 'img.jpg'), 'Bebidas');
  assert.equal(normalizeCategory('Desconocido', 'ITEM', 'img.jpg'), 'Varios');
});

test('parseProductInfo should extract brand and size', () => {
  const info = parseProductInfo({
    name: 'FECOVITA VINO TORO TINTO X 1 L (12)',
    category: 'Bebidas'
  });
  assert.equal(info.brand, 'FECOVITA');
  assert.equal(info.size, 'X 1 L');
});
