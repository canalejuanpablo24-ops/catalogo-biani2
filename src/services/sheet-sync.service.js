(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SheetSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const META_KEY = 'biani_sheet_sync_meta_v1';
  const CATALOG_KEY = 'biani_last_valid_sheet_catalog_v1';
  const FRESHNESS_MS = 30 * 60 * 1000;

  function normalizeCode(value) {
    return String(value == null ? '' : value).trim();
  }

  function parsePrice(value) {
    let text = String(value == null ? '' : value).trim().replace(/[^\d,.-]/g, '');
    if (!text || !/\d/.test(text)) return NaN;
    const negative = text.startsWith('-');
    text = text.replace(/-/g, '');
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalPos = Math.max(lastComma, lastDot);
    let normalized;
    if (decimalPos >= 0) {
      const fractionLength = text.length - decimalPos - 1;
      const hasBoth = lastComma >= 0 && lastDot >= 0;
      const isDecimal = hasBoth || fractionLength === 1 || fractionLength === 2;
      if (isDecimal) {
        const integer = text.slice(0, decimalPos).replace(/[.,]/g, '');
        const fraction = text.slice(decimalPos + 1).replace(/[.,]/g, '');
        normalized = integer + '.' + fraction;
      } else {
        normalized = text.replace(/[.,]/g, '');
      }
    } else {
      normalized = text;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : NaN;
  }

  function normalizedHeader(value) {
    return String(value || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function detectColumns(rows) {
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) return null;
    const first = rows[0].map(normalizedHeader);
    let codeIdx = first.findIndex(header => header.includes('cod') || header === 'id' || header.includes('codigo'));
    let nameIdx = first.findIndex(header => header.includes('art') || header.includes('nom') || header.includes('prod') || header.includes('det'));
    let categoryIdx = first.findIndex(header => header.includes('cat'));
    let priceIdx = first.findIndex(header => header.includes('prec') || header.includes('cost') || header.includes('val') || header.includes('monto'));
    let minimumIdx = first.findIndex(header => header.includes('cantidad minima') || header.includes('minima') || header.includes('minimo') || header.includes('cant_min') || header === 'min');
    const hasHeader = codeIdx !== -1 || nameIdx !== -1 || priceIdx !== -1 || categoryIdx !== -1;
    if (!hasHeader) {
      codeIdx = 0;
      nameIdx = 1;
      categoryIdx = rows[0].length === 3 ? -1 : 2;
      priceIdx = rows[0].length === 3 ? 2 : 3;
      minimumIdx = -1;
    }
    return {
      codeIdx: codeIdx === -1 ? 0 : codeIdx,
      nameIdx: nameIdx === -1 ? 1 : nameIdx,
      categoryIdx,
      priceIdx: priceIdx === -1 ? 2 : priceIdx,
      minimumIdx,
      startRowIdx: hasHeader ? 1 : 0,
      hasHeader
    };
  }

  function hasBalancedQuotes(text) {
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '"') continue;
      if (quoted && text[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    }
    return !quoted;
  }

  function referenceRule(count) {
    const safeCount = Math.max(0, Number(count) || 0);
    const allowance = Math.max(25, Math.ceil(3 * Math.sqrt(safeCount)));
    return { count: safeCount, allowance, minimum: Math.max(1, safeCount - allowance) };
  }

  function uniqueCodes(values) {
    return [...new Set((values || []).map(normalizeCode).filter(Boolean))];
  }

  function analyzeRows(rows, options = {}) {
    const reasons = [];
    const warnings = [];
    const columns = detectColumns(rows);
    if (!columns) {
      return { canApply: false, reasons: ['La respuesta no contiene filas utilizables.'], warnings, records: [], stats: { detected: 0 } };
    }

    const records = [];
    const malformedRows = [];
    const duplicateCodes = [];
    const seen = new Set();
    const maxIndex = Math.max(columns.codeIdx, columns.nameIdx, columns.priceIdx);

    for (let index = columns.startRowIdx; index < rows.length; index += 1) {
      const row = Array.isArray(rows[index]) ? rows[index] : [];
      const hasAnyValue = row.some(cell => String(cell || '').trim());
      if (!hasAnyValue) continue;
      if (row.length <= maxIndex) {
        malformedRows.push(index + 1);
        continue;
      }
      const code = normalizeCode(row[columns.codeIdx]);
      const name = String(row[columns.nameIdx] || '').trim();
      const price = parsePrice(row[columns.priceIdx]);
      if (!code || !name || !Number.isFinite(price) || price <= 0) {
        malformedRows.push(index + 1);
        continue;
      }
      if (seen.has(code)) {
        duplicateCodes.push(code);
        continue;
      }
      seen.add(code);
      records.push({ code, name, price, rowIndex: index, row });
    }

    if (!records.length) reasons.push('No se detectaron productos válidos.');
    if (duplicateCodes.length) reasons.push('Se detectaron códigos duplicados: ' + uniqueCodes(duplicateCodes).slice(0, 8).join(', ') + '.');
    if (malformedRows.length) reasons.push('Hay registros con código, nombre o precio inválido en las filas: ' + malformedRows.slice(0, 8).join(', ') + '.');

    const canonicalCodes = uniqueCodes(options.canonicalCodes);
    const lastValidCodes = uniqueCodes(options.lastValidMeta && options.lastValidMeta.codes);
    const canonicalCount = Number(options.canonicalCount) || canonicalCodes.length;
    const lastValidCount = Number(options.lastValidMeta && options.lastValidMeta.count) || lastValidCodes.length;
    const rules = [];
    if (canonicalCount > 0) rules.push({ source: 'catálogo canónico', ...referenceRule(canonicalCount) });
    if (lastValidCount > 0) rules.push({ source: 'última sincronización válida', ...referenceRule(lastValidCount) });

    for (const rule of rules) {
      if (records.length < rule.minimum) {
        reasons.push('La respuesta tiene ' + records.length + ' productos; el mínimo adaptativo respecto de ' + rule.source + ' es ' + rule.minimum + ' (variación permitida: ' + rule.allowance + ').');
      }
    }

    const receivedCodes = new Set(records.map(record => record.code));
    const continuitySources = [];
    if (canonicalCodes.length) continuitySources.push({ source: 'catálogo canónico', codes: canonicalCodes });
    if (lastValidCodes.length) continuitySources.push({ source: 'última sincronización válida', codes: lastValidCodes });
    for (const reference of continuitySources) {
      const missing = reference.codes.filter(code => !receivedCodes.has(code));
      const allowance = referenceRule(reference.codes.length).allowance;
      if (missing.length > allowance) {
        reasons.push('Faltan ' + missing.length + ' códigos respecto de ' + reference.source + '; supera la variación adaptativa de ' + allowance + '.');
      } else if (missing.length) {
        warnings.push('Hay ' + missing.length + ' códigos ausentes respecto de ' + reference.source + '.');
      }
    }

    return {
      canApply: reasons.length === 0,
      reasons,
      warnings,
      records,
      columns,
      stats: {
        detected: records.length,
        duplicateCodes: uniqueCodes(duplicateCodes),
        malformedRows,
        canonicalCount,
        lastValidCount,
        coverageCanonical: canonicalCount ? records.length / canonicalCount : null,
        coverageLastValid: lastValidCount ? records.length / lastValidCount : null
      }
    };
  }

  function analyzeCsvText(text, parseCsv, options = {}) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { canApply: false, reasons: ['La respuesta de Google Sheets está vacía.'], warnings: [], records: [], stats: { detected: 0 } };
    if (/^\s*<(?:!doctype|html)/i.test(trimmed)) return { canApply: false, reasons: ['Google Sheets devolvió HTML en lugar de CSV.'], warnings: [], records: [], stats: { detected: 0 } };
    if (!hasBalancedQuotes(trimmed)) return { canApply: false, reasons: ['El CSV está truncado o contiene comillas sin cerrar.'], warnings: [], records: [], stats: { detected: 0 } };
    let rows;
    try {
      rows = parseCsv(trimmed);
    } catch (error) {
      return { canApply: false, reasons: ['No se pudo interpretar el CSV: ' + error.message], warnings: [], records: [], stats: { detected: 0 } };
    }
    return analyzeRows(rows, options);
  }

  function createMeta(products, now = Date.now()) {
    const codes = uniqueCodes((products || []).map(product => product && product.code));
    return { version: VERSION, lastSuccessAt: now, count: codes.length, codes };
  }

  function lastSuccessAt(meta) {
    return Number(meta && (meta.lastSuccessAt || meta.last_success_at || meta.checkedAt)) || 0;
  }

  function isFresh(meta, now = Date.now(), maxAge = FRESHNESS_MS) {
    const timestamp = lastSuccessAt(meta);
    return Boolean(timestamp && now >= timestamp && now - timestamp <= maxAge);
  }

  function createCatalogSnapshot(products, now = Date.now()) {
    return {
      version: VERSION,
      savedAt: now,
      products: (products || []).map(product => ({ ...product, qty: 0 }))
    };
  }

  function validateCatalogSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== VERSION || !Array.isArray(snapshot.products) || !snapshot.products.length) return null;
    const seen = new Set();
    const products = [];
    for (const item of snapshot.products) {
      const code = normalizeCode(item && item.code);
      const name = String(item && item.name || '').trim();
      const price = Number(item && item.price);
      if (!code || !name || !Number.isFinite(price) || price <= 0 || seen.has(code)) return null;
      seen.add(code);
      products.push({ ...item, code, name, price, qty: 0 });
    }
    return { version: VERSION, savedAt: Number(snapshot.savedAt) || 0, products };
  }

  return {
    VERSION,
    META_KEY,
    CATALOG_KEY,
    FRESHNESS_MS,
    normalizeCode,
    parsePrice,
    detectColumns,
    analyzeRows,
    analyzeCsvText,
    createMeta,
    isFresh,
    lastSuccessAt,
    createCatalogSnapshot,
    validateCatalogSnapshot,
    referenceRule
  };
});
