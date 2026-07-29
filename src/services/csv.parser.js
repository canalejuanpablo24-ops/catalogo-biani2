/**
 * RFC 4180 Compliant CSV Parser & Product Data Extractor
 */
import { parsePrice, normalizeCategory } from '../utils/formatters.js';

/**
 * Parses raw CSV string into 2D array of cells.
 * @param {string} text 
 * @returns {Array<Array<string>>}
 */
export function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];
  
  const lines = [];
  let row = [""];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    lines.push(row);
  }
  
  return lines;
}

/**
 * Process parsed CSV rows and merge with baseline products array.
 * @param {Array<Array<string>>} rows 
 * @param {Array<object>} prods 
 * @param {object} codeToCat 
 * @param {object} codeToImg 
 * @param {object} options
 * @returns {Array<object>}
 */
export function processCSVRows(rows, prods = [], codeToCat = {}, codeToImg = {}, options = {}) {
  if (!rows || rows.length === 0) return prods;

  // Normalize header strings of the first row to check if it's a header
  const firstRow = rows[0].map(h => (h || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  
  let codeIdx = firstRow.findIndex(h => h.includes('cod') || h.includes('id'));
  let nameIdx = firstRow.findIndex(h => h.includes('art') || h.includes('nom') || h.includes('prod') || h.includes('det'));
  let catIdx = firstRow.findIndex(h => h.includes('cat'));
  let priceIdx = firstRow.findIndex(h => h.includes('prec') || h.includes('cost') || h.includes('val') || h.includes('monto'));
  let minIdx = firstRow.findIndex(h => h.includes('cantidad minima') || h.includes('minima') || h.includes('minimo') || h.includes('cant_min') || h.includes('min'));
  
  let hasHeader = (codeIdx !== -1 || nameIdx !== -1 || priceIdx !== -1 || catIdx !== -1);
  let startRowIdx = hasHeader ? 1 : 0;
  
  if (!hasHeader) {
    const colCount = rows[0].length;
    codeIdx = 0;
    nameIdx = 1;
    if (colCount === 3) {
      catIdx = -1;
      priceIdx = 2;
    } else {
      catIdx = 2;
      priceIdx = 3;
    }
  } else {
    if (codeIdx === -1) codeIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (priceIdx === -1) priceIdx = 2;
  }
  
  for (let i = startRowIdx; i < rows.length; i++) {
    const r = rows[i];
    if (r.length <= Math.max(codeIdx, nameIdx, priceIdx)) continue;
    
    const code = r[codeIdx] ? r[codeIdx].trim() : "";
    const name = r[nameIdx] ? r[nameIdx].trim() : "";
    if (!code || !name) continue;

    const price = parsePrice(r[priceIdx]);
    const codeStr = String(code);
    const matchedProds = prods.filter(p => String(p.code) === codeStr || String(p.code).startsWith(codeStr + "_"));

    if (matchedProds.length > 0) {
      matchedProds.forEach(p => {
        p.name = name;
        p.price = price;
        p.outOfStock = false;
        if (minIdx !== -1 && r[minIdx]) {
          p.unidad_min = parseInt(r[minIdx]) || 1;
        }
      });
    } else if (options.allowAppend ?? true) {
      const image = codeToImg[code] || "";
      let cat = "Nuevos y Sin Imagen";
      if (image && image.trim() !== "") {
        cat = codeToCat[code] || "";
        if (!cat && catIdx !== -1 && catIdx !== priceIdx && r[catIdx]) {
          cat = r[catIdx].trim();
        }
        cat = normalizeCategory(cat || "Varios", name, image);
      }

      prods.push({
        code: code,
        name: name,
        category: cat,
        price: price,
        image: image,
        qty: 0,
        outOfStock: false,
        unidad_min: (minIdx !== -1 && r[minIdx]) ? (parseInt(r[minIdx]) || 1) : 1
      });
    }
  }

  return prods;
}
