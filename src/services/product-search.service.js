(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProductSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const cache = new WeakMap();

  function normalizeText(value) {
    if (!value) return '';
    return String(value)
      .toLowerCase()
      .replace(/\ufffd/g, 'n')
      .replace(/ñ/g, 'n')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizePhonetic(value) {
    let text = normalizeText(value).replace(/\s+/g, '');
    const replacements = [
      ['v', 'b'], ['z', 's'], ['ge', 'je'], ['gi', 'ji'],
      ['ll', 'y'], ['h', ''], ['k', 'c'], ['q', 'c'], ['c', 's']
    ];
    for (const pair of replacements) text = text.split(pair[0]).join(pair[1]);
    return text;
  }

  function stripPlural(word) {
    if (!word || word.length <= 3) return word;
    if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    return word;
  }

  function boundedLevenshtein(a, b, limit) {
    if (a === b) return 0;
    if (!a.length) return b.length <= limit ? b.length : limit + 1;
    if (!b.length) return a.length <= limit ? a.length : limit + 1;
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    if (a.length > b.length) {
      const swap = a;
      a = b;
      b = swap;
    }

    let previous = Array.from({ length: a.length + 1 }, function (_, index) { return index; });
    let current = new Array(a.length + 1);

    for (let row = 1; row <= b.length; row++) {
      current[0] = row;
      let rowMin = current[0];
      const bChar = b.charCodeAt(row - 1);
      for (let column = 1; column <= a.length; column++) {
        const cost = a.charCodeAt(column - 1) === bChar ? 0 : 1;
        const value = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + cost
        );
        current[column] = value;
        if (value < rowMin) rowMin = value;
      }
      if (rowMin > limit) return limit + 1;
      const swap = previous;
      previous = current;
      current = swap;
    }
    return previous[a.length];
  }

  function compileQuery(query) {
    if (query && query.__bianiCompiledSearch === true) return query;
    const normalized = normalizeText(query);
    const words = normalized.split(' ').filter(Boolean);
    return {
      __bianiCompiledSearch: true,
      raw: String(query == null ? '' : query),
      normalized: normalized,
      noSpace: normalized.replace(/\s+/g, ''),
      words: words,
      phoneticWords: words.map(normalizePhonetic),
      numericOnly: /^\d+$/.test(normalized)
    };
  }

  function prepareProduct(product, extraDescription, force) {
    if (!product || typeof product !== 'object') return null;
    if (!force && cache.has(product)) return cache.get(product);

    const code = String(product.code == null ? '' : product.code).toLowerCase().trim();
    const name = normalizeText(product.name || '');
    const category = normalizeText(product.category || '');
    const description = normalizeText(extraDescription || '');
    const image = normalizeText(product.image || '');
    const fullTarget = [code, name, category, description, image].filter(Boolean).join(' ');
    const words = Array.from(new Set(fullTarget.split(' ').filter(Boolean)));
    const prepared = {
      code: code,
      name: name,
      fullTarget: fullTarget,
      noSpaceTarget: fullTarget.replace(/\s+/g, ''),
      words: words,
      phoneticWords: words.map(normalizePhonetic)
    };
    cache.set(product, prepared);
    return prepared;
  }

  function prepareAll(products, getDescription, force) {
    (Array.isArray(products) ? products : []).forEach(function (product) {
      const description = typeof getDescription === 'function' ? getDescription(product) : '';
      prepareProduct(product, description, force);
    });
  }

  function directCodeScore(code, query) {
    if (!query.normalized || !code) return 0;
    if (code === query.normalized) return 1000000;
    if (code.startsWith(query.normalized)) return 900000 - Math.min(code.length, 999);
    if (code.includes(query.normalized)) return 800000 - Math.min(code.length, 999);
    return 0;
  }

  function wordScore(queryWord, queryPhonetic, targetWord, targetPhonetic) {
    if (queryWord === targetWord) return 1;
    if (targetWord.includes(queryWord)) return queryWord.length / targetWord.length;
    if (queryWord.includes(targetWord)) return targetWord.length / queryWord.length;
    if (queryPhonetic && targetPhonetic && queryPhonetic === targetPhonetic) return 0.95;
    if (queryPhonetic && targetPhonetic && targetPhonetic.includes(queryPhonetic) && queryPhonetic.length >= 3) return 0.85;

    const qStem = stripPlural(queryWord);
    const tStem = stripPlural(targetWord);
    if (qStem === tStem) return 0.92;

    const maxLength = Math.max(queryWord.length, targetWord.length);
    if (maxLength < 3) return 0;
    const limit = maxLength <= 4 ? 1 : (maxLength <= 7 ? 2 : 3);
    const distance = boundedLevenshtein(queryWord, targetWord, limit);
    if (distance > limit) return 0;
    const similarity = 1 - (distance / maxLength);
    if (maxLength <= 4 && similarity >= 0.75) return similarity * 0.8;
    if (maxLength > 4 && similarity >= 0.65) return similarity * 0.8;
    return 0;
  }

  function scoreProduct(product, query, extraDescription) {
    const compiled = compileQuery(query);
    if (!compiled.normalized) return 1;
    const prepared = prepareProduct(product, extraDescription, false);
    if (!prepared) return 0;

    const codeScore = directCodeScore(prepared.code, compiled);
    if (codeScore) return codeScore;

    if (prepared.name.includes(compiled.normalized)) return 10000;
    if (prepared.fullTarget.includes(compiled.normalized)) return 8000;
    if (prepared.noSpaceTarget.includes(compiled.noSpace)) return 5000;

    // Los números se comparan de forma determinista; nunca se aplica distancia
    // ortográfica a códigos o cantidades.
    if (compiled.numericOnly) return 0;

    let score = 0;
    let matchedWords = 0;
    for (let queryIndex = 0; queryIndex < compiled.words.length; queryIndex++) {
      let best = 0;
      for (let targetIndex = 0; targetIndex < prepared.words.length; targetIndex++) {
        const match = wordScore(
          compiled.words[queryIndex],
          compiled.phoneticWords[queryIndex],
          prepared.words[targetIndex],
          prepared.phoneticWords[targetIndex]
        );
        if (match > best) best = match;
        if (best === 1) break;
      }
      if (best >= 0.5) {
        score += Math.round(best * 200);
        matchedWords++;
      }
    }

    if (compiled.words.length > 1 && matchedWords < compiled.words.length && score < 500) return 0;
    return matchedWords ? score : 0;
  }

  return {
    normalizeText: normalizeText,
    normalizePhonetic: normalizePhonetic,
    boundedLevenshtein: boundedLevenshtein,
    compileQuery: compileQuery,
    prepareProduct: prepareProduct,
    prepareAll: prepareAll,
    scoreProduct: scoreProduct
  };
});
