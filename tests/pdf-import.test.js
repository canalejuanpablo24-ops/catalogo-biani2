import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/services/pdf-import.service.js';

const {
  analyzePdfImport,
  applyPdfChangesTransaction,
  parseArgentinePrice,
  parsePdfText
} = globalThis.PdfImport;

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function catalog(size = 20) {
  return Array.from({ length: size }, (_, index) => ({
    code: String(100 + index),
    name: `Producto ${index + 1}`,
    price: 100 + index,
    category: 'Varios',
    qty: 0,
    outOfStock: false
  }));
}

function extractionFor(products, count = products.length) {
  return {
    records: products.slice(0, count).map(product => ({
      code: product.code,
      name: product.name,
      price: product.price
    })),
    unrecognized: [],
    duplicateCodes: []
  };
}

test('PDF completo válido habilita candidatos sin stock con cobertura suficiente', () => {
  const products = catalog(20);
  const analysis = analyzePdfImport(products, extractionFor(products, 19));

  assert.equal(analysis.recordsDetected, 19);
  assert.equal(analysis.matched, 19);
  assert.equal(analysis.coverage, 95);
  assert.equal(analysis.oosCandidates, 1);
  assert.equal(analysis.allowOutOfStock, true);
  assert.equal(analysis.canApply, true);
  assert.equal(analysis.changes.filter(change => change.type === 'oos').length, 1);
});

test('PDF parcial permite cambios válidos pero bloquea todo falso sin stock', () => {
  const products = catalog(20);
  const extraction = extractionFor(products, 4);
  extraction.records[0].price = 999;
  const analysis = analyzePdfImport(products, extraction);

  assert.equal(analysis.coverage, 20);
  assert.equal(analysis.suspiciouslySmall, true);
  assert.equal(analysis.allowOutOfStock, false);
  assert.equal(analysis.canApply, true);
  assert.equal(analysis.priceChanges, 1);
  assert.equal(analysis.oosCandidates, 16);
  assert.equal(analysis.changes.some(change => change.type === 'oos'), false);
});

test('PDF vacío queda bloqueado y no genera cambios', () => {
  const extraction = parsePdfText('Encabezado de lista\nSin productos');
  const analysis = analyzePdfImport(catalog(), extraction);

  assert.equal(analysis.recordsDetected, 0);
  assert.equal(analysis.canApply, false);
  assert.equal(analysis.allowOutOfStock, false);
  assert.deepEqual(analysis.changes, []);
  assert.match(analysis.errors[0], /No se detectaron/);
});

test('extracción corrupta bloquea la aplicación completa', () => {
  const extraction = parsePdfText('100 Producto válido 100,00\n101 Producto roto $NO-ES-PRECIO\n102 Producto sin centavos 200');
  const analysis = analyzePdfImport(catalog(), extraction);

  assert.equal(extraction.records.length, 1);
  assert.equal(extraction.unrecognized.length, 2);
  assert.equal(analysis.canApply, false);
  assert.equal(analysis.allowOutOfStock, false);
  assert.equal(analysis.changes.some(change => change.type === 'oos'), false);
});

test('parser acepta precios argentinos con varios separadores de miles', () => {
  assert.equal(parseArgentinePrice('$1.234.567,89'), 1234567.89);
  assert.equal(parseArgentinePrice('12.345,67'), 12345.67);
  assert.equal(parseArgentinePrice('999,00'), 999);

  const extraction = parsePdfText('123 Producto costoso $1.234.567,89');
  assert.equal(extraction.records[0].price, 1234567.89);
});

test('aplicación transaccional no muta el catálogo original si falla', () => {
  const products = catalog(2);
  const original = structuredClone(products);
  const analysis = {
    canApply: true,
    allowOutOfStock: false,
    changes: [
      { type: 'up', code: '100', np: 250 },
      { type: 'new', code: '999', name: 'Inválido', np: 300 }
    ]
  };

  assert.throws(
    () => applyPdfChangesTransaction(products, analysis, () => ({ code: '', price: Number.NaN })),
    /Producto nuevo inválido/
  );
  assert.deepEqual(products, original);
});

test('la transacción rechaza cambios sin stock si la cobertura no los autorizó', () => {
  const products = catalog(2);
  const original = structuredClone(products);
  const analysis = {
    canApply: true,
    allowOutOfStock: false,
    changes: [{ type: 'oos', code: '100', np: 100 }]
  };

  assert.throws(
    () => applyPdfChangesTransaction(products, analysis, () => null),
    /marcado sin stock no fue autorizado/
  );
  assert.deepEqual(products, original);
});

test('la interfaz exige confirmación y usa la aplicación transaccional', () => {
  assert.match(indexSource, /window\.confirm\(`Confirmá la importación PDF:/);
  assert.match(indexSource, /applyPdfChangesTransaction\(prods, pdfAnalysis/);
  assert.match(indexSource, /document\.getElementById\('appBtn'\)\.disabled = !pdfAnalysis\.canApply/);
});
