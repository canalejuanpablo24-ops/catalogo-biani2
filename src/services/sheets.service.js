/**
 * Google Sheets Integration & Catalog Data Service
 * GitHub Pages-safe: a single central sheet, strict validation and last-known-good fallback.
 */
import { parseCSV, processCSVRows } from './csv.parser.js';
import { normalizeCategory } from '../utils/formatters.js';

const CACHE_SCHEMA_VERSION = 2;
const MIN_VALID_PRODUCTS = 10;

export class SheetsService {
  constructor(tenantConfig) {
    this.config = tenantConfig;
    this.cacheKey = `${tenantConfig.id}:catalog:last-known-good:v${CACHE_SCHEMA_VERSION}`;
  }

  async fetchJsonResource(url) {
    try {
      const separator = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${separator}v=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.warn(`No se pudo cargar ${url}:`, error.message);
      return {};
    }
  }

  async loadFallbackProducts() {
    try {
      const res = await fetch(`${this.config.fallbackDataPath}?v=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('No se pudo cargar el catálogo incluido:', error.message);
      return [];
    }
  }

  readLastKnownGood() {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || !Array.isArray(cached.products) || cached.products.length < MIN_VALID_PRODUCTS) {
        return null;
      }
      return cached;
    } catch (error) {
      console.warn('La copia local del catálogo no es válida:', error.message);
      return null;
    }
  }

  saveLastKnownGood(products, updatedAt) {
    if (!Array.isArray(products) || products.length < MIN_VALID_PRODUCTS) return;
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        updatedAt,
        products
      }));
    } catch (error) {
      console.warn('No se pudo guardar la copia de respaldo:', error.message);
    }
  }

  normalizeFallbackProducts(fallbackProducts, imageMap) {
    return fallbackProducts.map((product) => {
      const code = String(product.code ?? '').trim();
      const image = imageMap[code] || product.image || '';
      let category = product.category || 'Varios';

      if (!image.trim()) {
        category = 'Nuevos y Sin Imagen';
      } else {
        category = normalizeCategory(category, product.name, image);
      }

      return {
        code,
        name: product.name || `PRODUCTO ${code}`,
        price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
        category,
        image,
        unidad_min: Math.max(1, Number(product.unidad_min) || 1),
        qty: 0,
        outOfStock: Boolean(product.outOfStock)
      };
    }).filter((product) => product.code && product.name);
  }

  isValidCatalog(products) {
    if (!Array.isArray(products) || products.length < MIN_VALID_PRODUCTS) return false;
    const validRows = products.filter((product) => product.code && product.name && Number.isFinite(Number(product.price)));
    return validRows.length >= MIN_VALID_PRODUCTS && validRows.length / products.length >= 0.9;
  }

  async fetchLiveCatalog(baseProducts, categoryMap, imageMap) {
    const sheetId = String(this.config.defaultSheetId || '').trim();
    if (!sheetId) throw new Error('No hay una planilla central configurada');

    const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv`;
    const response = await fetch(`${csvUrl}&v=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' }
    });

    if (!response.ok) throw new Error(`Google Sheets respondió HTTP ${response.status}`);
    const csvText = await response.text();
    const csvRows = parseCSV(csvText);
    if (!Array.isArray(csvRows) || csvRows.length <= 1) {
      throw new Error('La planilla está vacía o no contiene filas válidas');
    }

    const products = processCSVRows(csvRows, baseProducts, categoryMap, imageMap);
    if (!this.isValidCatalog(products)) {
      throw new Error('La actualización fue rechazada porque produjo un catálogo vacío o incompleto');
    }
    return products;
  }

  async loadDatabase() {
    const [categoryMap, imageMap, descriptionMap, fallbackRaw] = await Promise.all([
      this.fetchJsonResource('code_to_category.json'),
      this.fetchJsonResource('code_to_image.json'),
      this.fetchJsonResource('code_to_description.json'),
      this.loadFallbackProducts()
    ]);

    for (const code in categoryMap) {
      categoryMap[code] = normalizeCategory(categoryMap[code]);
    }

    const bundledProducts = this.normalizeFallbackProducts(fallbackRaw, imageMap);
    const cached = this.readLastKnownGood();
    const safeFallback = cached?.products?.length ? cached.products : bundledProducts;

    try {
      const products = await this.fetchLiveCatalog(bundledProducts, categoryMap, imageMap);
      const updatedAt = new Date().toISOString();
      this.saveLastKnownGood(products, updatedAt);
      return {
        products,
        isFallback: false,
        lastUpdated: updatedAt,
        error: null,
        source: 'google-sheets',
        codeToCat: categoryMap,
        codeToImg: imageMap,
        codeToDesc: descriptionMap
      };
    } catch (error) {
      console.warn('No se pudo actualizar desde Google Sheets:', error.message);
      if (!this.isValidCatalog(safeFallback)) {
        throw new Error(`No existe un catálogo válido disponible. ${error.message}`);
      }

      return {
        products: safeFallback,
        isFallback: true,
        lastUpdated: cached?.updatedAt || new Date().toISOString(),
        error: `No se pudo actualizar la lista. Se muestra la última versión válida. ${error.message}`,
        source: cached ? 'last-known-good' : 'bundled-fallback',
        codeToCat: categoryMap,
        codeToImg: imageMap,
        codeToDesc: descriptionMap
      };
    }
  }
}
