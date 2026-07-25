/**
 * Google Sheets Integration & Catalog Data Service
 */
import { parseCSV, processCSVRows } from './csv.parser.js';
import { normalizeCategory } from '../utils/formatters.js';

export class SheetsService {
  /**
   * @param {object} tenantConfig 
   */
  constructor(tenantConfig) {
    this.config = tenantConfig;
  }

  /**
   * Load JSON resource safely
   * @param {string} url 
   * @returns {Promise<object>}
   */
  async fetchJsonResource(url) {
    try {
      const res = await fetch(`${url}?v=${Date.now()}`);
      if (!res.ok) return {};
      return await res.json();
    } catch (e) {
      console.warn(`Failed to load JSON resource: ${url}`, e.message);
      return {};
    }
  }

  /**
   * Load local baseline fallback products
   * @returns {Promise<Array<object>>}
   */
  async loadFallbackProducts() {
    try {
      const res = await fetch(`${this.config.fallbackDataPath}?v=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error("Failed to load local fallback catalog:", e.message);
      return [];
    }
  }

  /**
   * Load complete catalog from fallback + Google Sheets (if configured)
   * @param {string} customSheetId 
   * @returns {Promise<{ products: Array<object>, isFallback: boolean, lastUpdated: string, error?: string }>}
   */
  async loadDatabase(customSheetId = "") {
    const sheetId = customSheetId || localStorage.getItem(this.config.localStorageKeys.sheetId) || this.config.defaultSheetId;
    
    // 1. Fetch JSON mappings in parallel
    const [catRes, imgRes, descRes, fallbackProds] = await Promise.all([
      this.fetchJsonResource('code_to_category.json'),
      this.fetchJsonResource('code_to_image.json'),
      this.fetchJsonResource('code_to_description.json'),
      this.loadFallbackProducts()
    ]);

    // Normalize category mappings
    for (const c in catRes) {
      catRes[c] = normalizeCategory(catRes[c]);
    }

    // Process baseline products
    let products = fallbackProds.map(p => {
      let image = imgRes[p.code] || p.image || "";
      let cat = p.category || "Varios";
      
      if (!image || image.trim() === "") {
        cat = "Nuevos y Sin Imagen";
      } else {
        cat = normalizeCategory(cat, p.name, image);
      }

      return {
        code: String(p.code),
        name: p.name || `PRODUCTO ${p.code}`,
        price: typeof p.price === 'number' ? p.price : 0,
        category: cat,
        image: image,
        unidad_min: p.unidad_min || 1,
        qty: 0,
        outOfStock: false
      };
    });

    let isFallback = true;
    let lastUpdated = new Date().toISOString();
    let errorMsg = null;

    // 2. Fetch live data from Google Sheets if sheetId exists
    if (sheetId) {
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
          throw new Error(`Google Sheets respondió con código de estado ${response.status}`);
        }
        
        const csvText = await response.text();
        const csvRows = parseCSV(csvText);

        if (csvRows.length > 1) {
          products = processCSVRows(csvRows, products, catRes, imgRes);
          isFallback = false;
        } else {
          errorMsg = "La hoja de Google Sheets está vacía o no contiene filas válidas.";
        }
      } catch (e) {
        console.warn("Falla al conectar con Google Sheets. Usando datos de respaldo locales:", e.message);
        errorMsg = `No se pudo conectar con la planilla (${e.message}). Se cargó el catálogo local de respaldo.`;
      }
    }

    return {
      products,
      isFallback,
      lastUpdated,
      error: errorMsg,
      codeToCat: catRes,
      codeToImg: imgRes,
      codeToDesc: descRes
    };
  }
}
