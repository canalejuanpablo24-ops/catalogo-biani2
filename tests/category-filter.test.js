import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/services/category-filter.service.js';

const CategoryFilter = globalThis.CategoryFilter;
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const products = [
  { code: '1', name: 'Alfajor SIN TACC', category: ' Alfajores ' },
  { code: '2', name: 'Alfajor clásico', category: 'ALFAJORES' },
  { code: '3', name: 'Agua mineral', category: 'Bebidas' },
  { code: '4', name: 'Gaseosa cola', category: ' bebidas ' },
  { code: '5', name: 'Gomitas frutales SIN TAC', category: 'Gomitas' }
];

function scoreProduct(product, query) {
  return product.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')) ? 10 : 0;
}

test('listado contiene únicamente las categorías reales con sus cantidades', () => {
  assert.deepEqual(CategoryFilter.listCategories(products), [
    { key: 'alfajores', name: 'Alfajores', count: 2 },
    { key: 'bebidas', name: 'Bebidas', count: 2 },
    { key: 'gomitas', name: 'Gomitas', count: 1 }
  ]);
});

test('normaliza y deduplica mayúsculas, espacios y acentos triviales', () => {
  assert.equal(CategoryFilter.categoryKey('  PERFUMERÍA '), 'perfumeria');
  assert.equal(CategoryFilter.normalizeCategoryName(' perfumeria '), 'Perfumería');
  assert.equal(CategoryFilter.listCategories(products).filter(category => category.name === 'Bebidas').length, 1);
});

test('filtra por categoría sin modificar el catálogo original', () => {
  const result = CategoryFilter.filterProducts(products, { category: 'alfajores' });
  assert.deepEqual(result.map(product => product.code), ['1', '2']);
  assert.equal(products.length, 5);
});

test('combina categoría y búsqueda tolerando la función de puntaje existente', () => {
  const result = CategoryFilter.filterProducts(products, {
    category: 'Bebidas',
    query: 'cola',
    scoreProduct
  });
  assert.deepEqual(result.map(product => product.code), ['4']);
});

test('combina categoría y filtro SIN TACC', () => {
  const result = CategoryFilter.filterProducts(products, {
    category: 'Alfajores',
    onlySinTacc: true
  });
  assert.deepEqual(result.map(product => product.code), ['1']);
});

test('Todos conserva el conjunto completo y permite los demás filtros', () => {
  assert.equal(CategoryFilter.filterProducts(products, { category: '' }).length, products.length);
  assert.deepEqual(CategoryFilter.filterProducts(products, {
    category: 'Todos',
    query: 'agua',
    scoreProduct
  }).map(product => product.code), ['3']);
});

test('categoría sin resultados devuelve un estado vacío determinístico', () => {
  assert.deepEqual(CategoryFilter.filterProducts(products, {
    category: 'Papelería',
    query: 'inexistente',
    scoreProduct
  }), []);
  assert.match(indexSource, /No hay productos que coincidan con/);
});

test('interfaz móvil expone un drawer accesible y conserva la selección de sesión', () => {
  assert.match(indexSource, /id="btnOpenCats"[^>]+aria-controls="catalogSidebar"/);
  assert.match(indexSource, /id="catalogSidebar"[^>]+aria-label="Categorías de productos"/);
  assert.match(indexSource, /@media \(max-width: 850px\)[\s\S]+\.catalog-sidebar\.open/);
  assert.match(indexSource, /sessionStorage\.setItem\('biani_selected_category', curC\)/);
  assert.match(indexSource, /aria-expanded/);
});

test('integración aplica categoría, búsqueda y SIN TACC en una sola operación', () => {
  assert.match(indexSource, /CategoryFilter\.filterProducts\(prods, \{/);
  assert.match(indexSource, /category: curC,[\s\S]+query: trimmedQ,[\s\S]+onlySinTacc: st/);
  const selCategory = indexSource.slice(indexSource.indexOf('function selC('), indexSource.indexOf('function stripSpanishPlural'));
  assert.doesNotMatch(selCategory, /q\s*=\s*''/);
});
