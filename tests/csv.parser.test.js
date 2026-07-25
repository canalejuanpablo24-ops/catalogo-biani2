import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, processCSVRows } from '../src/services/csv.parser.js';

test('parseCSV should handle commas, quotes and newlines', () => {
  const csvStr = 'Código,Articulo,Precio\n101,"Producto ""Especial""",1500.50\n102,Normal,200.00';
  const rows = parseCSV(csvStr);
  
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['Código', 'Articulo', 'Precio']);
  assert.deepEqual(rows[1], ['101', 'Producto "Especial"', '1500.50']);
  assert.deepEqual(rows[2], ['102', 'Normal', '200.00']);
});

test('processCSVRows should update baseline products matching code', () => {
  const baseline = [
    { code: '101', name: 'Viejo Nombre', price: 100, category: 'Varios', image: 'img.jpg' }
  ];

  const rows = [
    ['Código', 'Articulo', 'Precio'],
    ['101', 'Nuevo Nombre', '1.250,50']
  ];

  const updated = processCSVRows(rows, baseline, {}, { '101': 'img.jpg' });
  assert.equal(updated[0].name, 'Nuevo Nombre');
  assert.equal(updated[0].price, 1250.5);
  assert.equal(updated[0].outOfStock, false);
});

test('processCSVRows should append new products not in baseline', () => {
  const rows = [
    ['Código', 'Articulo', 'Precio'],
    ['999', 'Producto Nuevo de Sheet', '500,00']
  ];

  const updated = processCSVRows(rows, [], {}, {});
  assert.equal(updated.length, 1);
  assert.equal(updated[0].code, '999');
  assert.equal(updated[0].name, 'Producto Nuevo de Sheet');
  assert.equal(updated[0].price, 500);
  assert.equal(updated[0].category, 'Nuevos y Sin Imagen');
});
