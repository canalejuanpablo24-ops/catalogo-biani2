import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/services/sheet-sync.service.js';

const Sync = globalThis.SheetSync;

function csvRows(count, options = {}) {
  const rows = [['codigo', 'nombre', 'precio']];
  for (let index = 1; index <= count; index += 1) {
    rows.push([String(index), 'Producto ' + index, options.price || '$1.234,50']);
  }
  return rows;
}

test('acepta una sincronización completa válida', () => {
  const result = Sync.analyzeRows(csvRows(100), {
    canonicalCount: 100,
    canonicalCodes: Array.from({ length: 100 }, (_, index) => String(index + 1))
  });
  assert.equal(result.canApply, true);
  assert.equal(result.records.length, 100);
});

test('bloquea una respuesta parcial y conserva criterio adaptativo', () => {
  const result = Sync.analyzeRows(csvRows(20), {
    canonicalCount: 100,
    canonicalCodes: Array.from({ length: 100 }, (_, index) => String(index + 1)),
    lastValidMeta: { count: 98, codes: Array.from({ length: 98 }, (_, index) => String(index + 1)) }
  });
  assert.equal(result.canApply, false);
  assert.match(result.reasons.join(' '), /mínimo adaptativo|Faltan/);
});

test('bloquea una respuesta vacía', () => {
  const result = Sync.analyzeCsvText('', () => []);
  assert.equal(result.canApply, false);
  assert.match(result.reasons[0], /vacía/);
});

test('bloquea códigos duplicados en vez de renombrarlos', () => {
  const rows = csvRows(60);
  rows.push(['34', 'Duplicado', '$2.000,00']);
  const result = Sync.analyzeRows(rows, { canonicalCount: 60 });
  assert.equal(result.canApply, false);
  assert.deepEqual(result.stats.duplicateCodes, ['34']);
});

test('detecta extracción truncada o corrupta', () => {
  const result = Sync.analyzeCsvText('codigo,nombre,precio\n34,"Producto roto,$1.000', () => []);
  assert.equal(result.canApply, false);
  assert.match(result.reasons[0], /truncado|comillas/);
});

test('interpreta precios argentinos con varios separadores de miles', () => {
  assert.equal(Sync.parsePrice('$1.234.567,89'), 1234567.89);
  assert.equal(Sync.parsePrice('$1.234.567'), 1234567);
  assert.equal(Sync.parsePrice('1,234,567.89'), 1234567.89);
  assert.equal(Sync.parsePrice('12,50'), 12.5);
});

test('permite variaciones pequeñas legítimas sin usar un porcentaje fijo', () => {
  const rows = csvRows(194);
  const result = Sync.analyzeRows(rows, {
    canonicalCount: 200,
    canonicalCodes: Array.from({ length: 200 }, (_, index) => String(index + 1)),
    lastValidMeta: { count: 196, codes: Array.from({ length: 196 }, (_, index) => String(index + 1)) }
  });
  assert.equal(result.canApply, true);
  assert.ok(result.warnings.length > 0);
});

test('la última sincronización válida vence a los 30 minutos', () => {
  const now = Date.now();
  const meta = Sync.createMeta([{ code: '1' }, { code: '2' }], now);
  assert.equal(Sync.isFresh(meta, now + Sync.FRESHNESS_MS), true);
  assert.equal(Sync.isFresh(meta, now + Sync.FRESHNESS_MS + 1), false);
});

test('rechaza snapshots locales duplicados o inválidos', () => {
  assert.equal(Sync.validateCatalogSnapshot({ version: 1, products: [] }), null);
  assert.equal(Sync.validateCatalogSnapshot({
    version: 1,
    products: [
      { code: '1', name: 'Uno', price: 10 },
      { code: '1', name: 'Duplicado', price: 20 }
    ]
  }), null);
});

test('crea un snapshot válido sin cantidades de carrito', () => {
  const snapshot = Sync.createCatalogSnapshot([{ code: '1', name: 'Uno', price: 10, qty: 7 }], 123);
  const validated = Sync.validateCatalogSnapshot(snapshot);
  assert.equal(validated.savedAt, 123);
  assert.equal(validated.products[0].qty, 0);
});
