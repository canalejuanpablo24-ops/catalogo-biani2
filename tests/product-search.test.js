import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import '../src/services/product-search.service.js';
import '../src/services/category-filter.service.js';

const ProductSearch = globalThis.ProductSearch;
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CategoryFilter = globalThis.CategoryFilter;

const sample = [
  { code: '34', name: 'ALFA. GUAYMALLEN SIMPLE X 38 GRS. BLANCO', category: 'Alfajores' },
  { code: '35', name: 'ALFA. GUAYMALLEN SIMPLE X 38 GRS. NEGRO', category: 'Alfajores' },
  { code: '134', name: 'Producto irrelevante 34 unidades', category: 'Varios' },
  { code: '501', name: 'Alfajor premium', category: 'Alfajores' },
  { code: '777', name: 'Galletitas SIN TACC', category: 'Galletitas' }
];
ProductSearch.prepareAll(sample, () => '', true);

function search(products, query, options = {}) {
  const compiled = ProductSearch.compileQuery(query);
  return CategoryFilter.filterProducts(products, {
    category: options.category || '',
    onlySinTacc: Boolean(options.onlySinTacc),
    query,
    scoreProduct: product => ProductSearch.scoreProduct(product, compiled)
  });
}

test('el catálogo usa un único listener con debounce para el buscador', () => {
  assert.equal((indexSource.match(/sinpInput\.addEventListener\('input'/g) || []).length, 1);
  assert.doesNotMatch(indexSource, /let st2;/);
  assert.match(indexSource, /compileQuery\(trimmedQ\)/);
  assert.match(indexSource, /120\);/);
});

test('código exacto 34 tiene prioridad absoluta', () => {
  const result = search(sample, '34');
  assert.equal(result[0].code, '34');
  assert.ok(ProductSearch.scoreProduct(sample[0], '34') > ProductSearch.scoreProduct(sample[2], '34'));
});

test('código exacto 35 tiene prioridad absoluta', () => {
  assert.equal(search(sample, '35')[0].code, '35');
});

test('código parcial conserva coincidencias por código', () => {
  const codes = search(sample, '3').map(product => product.code);
  assert.ok(codes.includes('34'));
  assert.ok(codes.includes('35'));
  assert.ok(codes.includes('134'));
});

test('mantiene marca, nombre y palabras parciales', () => {
  assert.deepEqual(search(sample, 'guaymallen').slice(0, 2).map(product => product.code), ['34', '35']);
  assert.ok(search(sample, 'alfaj').some(product => product.code === '501'));
});

test('tolera guaymayen y alfahor', () => {
  assert.deepEqual(search(sample, 'guaymayen').slice(0, 2).map(product => product.code), ['34', '35']);
  assert.ok(search(sample, 'alfahor').some(product => product.code === '501'));
});

test('combina búsqueda con categoría', () => {
  const result = search(sample, 'alfajor', { category: 'Alfajores' });
  assert.equal(result[0].code, '501');
  assert.ok(result.every(product => product.category === 'Alfajores'));
  assert.equal(search(sample, 'guaymallen', { category: 'Galletitas' }).length, 0);
});

test('combina búsqueda con SIN TACC', () => {
  assert.deepEqual(search(sample, 'galletitas', { onlySinTacc: true }).map(product => product.code), ['777']);
  assert.equal(search(sample, 'guaymallen', { onlySinTacc: true }).length, 0);
});

function legacyNormalize(value) {
  return String(value || '').toLowerCase().replace(/ñ/g, 'n').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function legacyLevenshtein(a, b) {
  const row = Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let i = 1; i <= b.length; i++) {
    let previous = i;
    for (let j = 1; j <= a.length; j++) {
      const value = b[i - 1] === a[j - 1]
        ? row[j - 1]
        : Math.min(row[j - 1] + 1, previous + 1, row[j] + 1);
      row[j - 1] = previous;
      previous = value;
    }
    row[a.length] = previous;
  }
  return row[a.length];
}

function legacyPhonetic(value) {
  let text = legacyNormalize(value).replace(/\s+/g, '');
  const replacements = [
    ['v', 'b'], ['z', 's'], ['c', 's'], ['k', 'c'], ['q', 'c'],
    ['ge', 'je'], ['gi', 'ji'], ['ll', 'y'], ['h', '']
  ];
  for (const pair of replacements) text = text.split(pair[0]).join(pair[1]);
  return text;
}

function legacyScore(product, query) {
  // Réplica del trabajo ejecutado por getProductSearchScore antes de esta tarea:
  // normalización y fonética de la consulta se repetían para cada producto.
  const normalized = legacyNormalize(query);
  const name = legacyNormalize(product.name);
  const target = legacyNormalize(
    product.code + ' ' + product.name + ' ' + product.category + ' ' + (product.image || '')
  );
  const noSpaceTarget = target.replace(/\s+/g, '');
  if (name.includes(normalized)) return 1000;
  if (target.includes(normalized)) return 800;
  if (noSpaceTarget.includes(normalized.replace(/\s+/g, ''))) return 500;

  const queryWords = normalized.split(' ').filter(Boolean);
  const queryPhonetics = queryWords.map(legacyPhonetic);
  const targetWords = target.split(' ').filter(Boolean);
  const targetPhonetics = targetWords.map(legacyPhonetic);
  let score = 0;
  let matchedWords = 0;

  for (let queryIndex = 0; queryIndex < queryWords.length; queryIndex++) {
    const queryWord = queryWords[queryIndex];
    let best = 0;
    for (let targetIndex = 0; targetIndex < targetWords.length; targetIndex++) {
      const targetWord = targetWords[targetIndex];
      let match = 0;
      if (queryWord === targetWord) match = 1;
      else if (targetWord.includes(queryWord)) match = queryWord.length / targetWord.length;
      else if (queryPhonetics[queryIndex] === targetPhonetics[targetIndex]) match = 0.95;
      else {
        const maxLength = Math.max(queryWord.length, targetWord.length);
        if (maxLength >= 3) {
          const similarity = 1 - legacyLevenshtein(queryWord, targetWord) / maxLength;
          if (maxLength <= 4 && similarity >= 0.75) match = similarity * 0.8;
          else if (maxLength > 4 && similarity >= 0.65) match = similarity * 0.8;
        }
      }
      if (match > best) best = match;
    }
    if (best >= 0.5) {
      score += Math.round(best * 200);
      matchedWords++;
    }
  }
  if (queryWords.length > 1 && matchedWords < queryWords.length && score < 500) return 0;
  return matchedWords ? score : 0;
}

function median(values) {
  return values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

test('benchmark comparativo con 2359 productos evita la regresión de rendimiento', () => {
  const canonical = JSON.parse(readFileSync(new URL('../products_fallback.json', import.meta.url), 'utf8'));
  const products = Array.from({ length: 2359 }, (_, index) => {
    const source = canonical[index % canonical.length];
    return index < canonical.length ? { ...source } : { ...source, code: String(source.code) + '-' + index };
  });
  ProductSearch.prepareAll(products, () => '', true);
  const queries = ['guaymayen', 'alfahor', 'galletitas dulces', 'chocolate almendras'];

  const measure = callback => {
    const samples = [];
    for (let round = 0; round < 5; round++) {
      const started = performance.now();
      for (const query of queries) callback(query);
      samples.push(performance.now() - started);
    }
    return median(samples);
  };

  // Calentamiento para estabilizar el JIT del runner.
  for (const query of queries) {
    products.forEach(product => legacyScore(product, query));
    const compiled = ProductSearch.compileQuery(query);
    products.forEach(product => ProductSearch.scoreProduct(product, compiled));
  }

  const beforeMs = measure(query => products.forEach(product => legacyScore(product, query)));
  const afterMs = measure(query => {
    const compiled = ProductSearch.compileQuery(query);
    products.forEach(product => ProductSearch.scoreProduct(product, compiled));
  });

  console.log('SEARCH_BENCHMARK ' + JSON.stringify({
    products: products.length,
    queries: queries.length,
    beforeMs: Number(beforeMs.toFixed(2)),
    afterMs: Number(afterMs.toFixed(2)),
    improvementPercent: Number(((beforeMs - afterMs) / beforeMs * 100).toFixed(1))
  }));

  assert.ok(afterMs < beforeMs, `se esperaba mejora: antes ${beforeMs.toFixed(2)} ms, después ${afterMs.toFixed(2)} ms`);
});
