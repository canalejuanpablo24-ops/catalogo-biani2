(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CategoryFilter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CANONICAL_CATEGORIES = [
    'Nuevos y Sin Imagen', 'Alfajores', 'Varios', 'Chocolates', 'Cereales',
    'Pastillas', 'Galletitas', 'Chicles', 'Gomitas', 'Caramelos', 'Jugos',
    'Despensa', 'Yerbas', 'Bic', 'Pilas', 'Lámparas', 'Pegamentos', 'Higiene',
    'Chupetines', 'Turrones', 'Papelería', 'Perfumería', 'Detergentes',
    'Limpieza', 'Pipas', 'Bebidas', 'Snacks'
  ];

  function cleanLabel(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function categoryKey(value) {
    return cleanLabel(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  const canonicalByKey = CANONICAL_CATEGORIES.reduce(function (map, category) {
    map[categoryKey(category)] = category;
    return map;
  }, Object.create(null));

  // Variantes triviales históricas que representan la misma categoría.
  canonicalByKey['nuevo y sin imagen'] = 'Nuevos y Sin Imagen';
  canonicalByKey['snack'] = 'Snacks';
  canonicalByKey['bebida'] = 'Bebidas';

  function normalizeCategoryName(value) {
    const cleaned = cleanLabel(value);
    if (!cleaned || categoryKey(cleaned) === 'all' || categoryKey(cleaned) === 'todos') return '';
    return canonicalByKey[categoryKey(cleaned)] || cleaned;
  }

  function listCategories(products) {
    const groups = new Map();
    (Array.isArray(products) ? products : []).forEach(function (product) {
      const name = normalizeCategoryName(product && product.category);
      const key = categoryKey(name);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { key: key, name: name, count: 0 });
      groups.get(key).count += 1;
    });
    return Array.from(groups.values()).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }

  function getCategoryCounts(products) {
    return listCategories(products).reduce(function (counts, category) {
      counts[category.name] = category.count;
      return counts;
    }, Object.create(null));
  }

  function isSinTacc(product) {
    const name = String(product && product.name || '').toLocaleUpperCase('es');
    return name.includes('SIN TACC') || name.includes('SIN TAC');
  }

  function filterProducts(products, options) {
    const settings = options || {};
    const selectedKey = categoryKey(normalizeCategoryName(settings.category));
    const query = String(settings.query || '').trim();
    let result = (Array.isArray(products) ? products : []).filter(function (product) {
      return !selectedKey || categoryKey(normalizeCategoryName(product && product.category)) === selectedKey;
    });

    if (query && typeof settings.scoreProduct === 'function') {
      result = result
        .map(function (product) {
          return { product: product, score: Number(settings.scoreProduct(product, query)) || 0 };
        })
        .filter(function (entry) { return entry.score > 0; })
        .sort(function (a, b) { return b.score - a.score; })
        .map(function (entry) { return entry.product; });
    }

    if (settings.onlySinTacc) result = result.filter(isSinTacc);
    return result;
  }

  return {
    CANONICAL_CATEGORIES: CANONICAL_CATEGORIES.slice(),
    categoryKey: categoryKey,
    normalizeCategoryName: normalizeCategoryName,
    listCategories: listCategories,
    getCategoryCounts: getCategoryCounts,
    filterProducts: filterProducts,
    isSinTacc: isSinTacc
  };
});
