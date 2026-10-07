const DEFAULT_COMPLETE_COVERAGE = 95;

function parseArgentinePrice(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/^\$/, '')
    .replace(/\./g, '')
    .replace(',', '.');

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function parsePdfText(text) {
  const records = [];
  const unrecognized = [];
  const seenCodes = new Set();
  const duplicateCodes = [];

  String(text ?? '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) return;

    const match = line.match(/^(\d{2,7})\s+(.+?)\s+(\$?\s*[\d.]+,\d{2})$/);
    if (!match) {
      const looksLikeProduct = /^\d{2,7}\b/.test(line) || /\$?\s*[\d.]+,\d{2}$/.test(line);
      if (looksLikeProduct) unrecognized.push({ line: index + 1, text: line });
      return;
    }

    const price = parseArgentinePrice(match[3]);
    if (price === null || !match[2].trim()) {
      unrecognized.push({ line: index + 1, text: line });
      return;
    }

    const code = match[1];
    if (seenCodes.has(code)) duplicateCodes.push(code);
    seenCodes.add(code);
    records.push({ code, name: match[2].trim(), price });
  });

  return {
    records,
    unrecognized,
    duplicateCodes: [...new Set(duplicateCodes)]
  };
}

function baseCode(code) {
  return String(code ?? '').split('_')[0];
}

function analyzePdfImport(catalog, extraction, options = {}) {
  const coverageThreshold = options.completeCoveragePercent ?? DEFAULT_COMPLETE_COVERAGE;
  const products = Array.isArray(catalog) ? catalog : [];
  const records = Array.isArray(extraction?.records) ? extraction.records : [];
  const unrecognized = Array.isArray(extraction?.unrecognized) ? extraction.unrecognized : [];
  const duplicateCodes = Array.isArray(extraction?.duplicateCodes) ? extraction.duplicateCodes : [];
  const activeProducts = products.filter(product => !product.outOfStock);
  const catalogByCode = new Map();

  products.forEach(product => {
    catalogByCode.set(String(product.code), product);
    const rootCode = baseCode(product.code);
    if (!catalogByCode.has(rootCode)) catalogByCode.set(rootCode, product);
  });

  const pdfCodes = new Set(records.map(record => String(record.code)));
  const changes = [];
  let matched = 0;
  let priceChanges = 0;
  let newProducts = 0;
  let reactivated = 0;

  records.forEach(record => {
    const current = catalogByCode.get(String(record.code));
    if (!current) {
      newProducts++;
      changes.push({ type: 'new', code: record.code, name: record.name, op: null, np: record.price });
      return;
    }

    matched++;
    if (Math.abs(Number(current.price) - record.price) > 0.01) {
      priceChanges++;
      changes.push({
        type: Number(current.price) < record.price ? 'up' : 'dn',
        code: String(current.code),
        name: record.name,
        op: Number(current.price),
        np: record.price
      });
    } else if (current.outOfStock) {
      reactivated++;
      changes.push({
        type: 'reactivate',
        code: String(current.code),
        name: record.name,
        op: Number(current.price),
        np: record.price
      });
    }
  });

  const coverage = activeProducts.length === 0
    ? 0
    : (activeProducts.filter(product => pdfCodes.has(String(product.code)) || pdfCodes.has(baseCode(product.code))).length / activeProducts.length) * 100;
  const oosCandidates = activeProducts.filter(product => (
    !pdfCodes.has(String(product.code)) && !pdfCodes.has(baseCode(product.code))
  ));
  const hasExtractionErrors = unrecognized.length > 0 || duplicateCodes.length > 0;
  const suspiciouslySmall = records.length === 0 || coverage < coverageThreshold;
  const allowOutOfStock = !hasExtractionErrors && !suspiciouslySmall && coverage >= coverageThreshold;

  if (allowOutOfStock) {
    oosCandidates.forEach(product => {
      changes.push({
        type: 'oos',
        code: String(product.code),
        name: product.name,
        op: Number(product.price),
        np: Number(product.price)
      });
    });
  }

  const errors = [];
  if (records.length === 0) errors.push('No se detectaron registros de productos válidos.');
  if (duplicateCodes.length) errors.push(`Hay códigos duplicados: ${duplicateCodes.join(', ')}.`);
  if (unrecognized.length) errors.push(`Hay ${unrecognized.length} registros con formato no reconocido.`);

  return {
    recordsDetected: records.length,
    matched,
    priceChanges,
    newProducts,
    reactivated,
    oosCandidates: oosCandidates.length,
    unrecognized: unrecognized.length,
    coverage,
    coverageThreshold,
    suspiciouslySmall,
    allowOutOfStock,
    canApply: records.length > 0 && duplicateCodes.length === 0 && unrecognized.length === 0,
    errors,
    changes
  };
}

function applyPdfChangesTransaction(catalog, analysis, createNewProduct) {
  if (!analysis?.canApply) throw new Error('La importación PDF no superó la validación.');
  if (!Array.isArray(analysis.changes)) throw new Error('El conjunto de cambios es inválido.');

  const nextCatalog = catalog.map(product => ({ ...product }));
  const indexByCode = new Map(nextCatalog.map((product, index) => [String(product.code), index]));

  analysis.changes.forEach(change => {
    if (change.type === 'new') {
      if (typeof createNewProduct !== 'function') throw new Error('No se puede crear el producto nuevo.');
      const product = createNewProduct(change);
      if (!product || !product.code || !Number.isFinite(product.price)) throw new Error(`Producto nuevo inválido: ${change.code}`);
      nextCatalog.push(product);
      indexByCode.set(String(product.code), nextCatalog.length - 1);
      return;
    }

    const index = indexByCode.get(String(change.code));
    if (index === undefined) throw new Error(`Producto inexistente durante la aplicación: ${change.code}`);
    if (change.type === 'oos') {
      if (!analysis.allowOutOfStock) throw new Error('El marcado sin stock no fue autorizado por la validación.');
      nextCatalog[index].outOfStock = true;
      return;
    }

    if (!Number.isFinite(change.np)) throw new Error(`Precio inválido para ${change.code}`);
    nextCatalog[index].price = change.np;
    nextCatalog[index].outOfStock = false;
  });

  return nextCatalog;
}

const PdfImport = {
  parseArgentinePrice,
  parsePdfText,
  analyzePdfImport,
  applyPdfChangesTransaction
};

if (typeof window !== 'undefined') window.PdfImport = PdfImport;
else globalThis.PdfImport = PdfImport;
