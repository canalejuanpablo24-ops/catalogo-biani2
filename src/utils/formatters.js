/**
 * Utility functions for formatting prices, text, dates and categories.
 */

/**
 * Format number into Argentine Pesos ($ 12.345,67 or $ 12.345)
 * @param {number} amount 
 * @returns {string}
 */
export function formatCurrency(amount) {
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);
}

/**
 * Robust price parsing for strings with dots or commas (e.g. "12.345,67", "$12345.67", "12,50")
 * @param {string|number} rawPrice 
 * @returns {number}
 */
export function parsePrice(rawPrice) {
  if (typeof rawPrice === 'number') {
    return isNaN(rawPrice) ? 0 : rawPrice;
  }
  if (!rawPrice) return 0;
  
  let s = String(rawPrice).replace(/[^\d.,]/g, '').trim();
  if (!s) return 0;

  if (s.includes('.') && s.includes(',')) {
    if (s.indexOf(',') < s.indexOf('.')) {
      // US style: 12,345.67
      s = s.replace(/,/g, '');
    } else {
      // ES/AR style: 12.345,67
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const result = parseFloat(s);
  return isNaN(result) ? 0 : result;
}

/**
 * Normalize raw category string to standard app categories
 * @param {string} cat 
 * @param {string} name 
 * @param {string} img 
 * @returns {string}
 */
export function normalizeCategory(cat, name = "", img = "") {
  if (!img || String(img).trim() === "") {
    return "Nuevos y Sin Imagen";
  }

  const validCats = [
    "Alfajores", "Varios", "Chocolates", "Cereales", "Pastillas", "Galletitas",
    "Chicles", "Gomitas", "Caramelos", "Jugos", "Despensa", "Yerbas", "Bic",
    "Pilas", "Lámparas", "Pegamentos", "Higiene", "Chupetines", "Turrones",
    "Nuevos y Sin Imagen", "Papelería", "Perfumería", "Detergentes", "Limpieza", "Pipas", "Bebidas", "Snacks"
  ];

  if (cat && validCats.includes(String(cat).trim())) {
    return String(cat).trim();
  }

  if (!cat) cat = "Varios";
  const clean = String(cat).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const map = {
    "nuevosysinimagen": "Nuevos y Sin Imagen",
    "alfajores": "Alfajores",
    "chocolates": "Chocolates",
    "cereales": "Cereales",
    "pastillas": "Pastillas",
    "galletitas": "Galletitas",
    "chicles": "Chicles",
    "gomitas": "Gomitas",
    "caramelos": "Caramelos",
    "jugos": "Jugos",
    "despensa": "Despensa",
    "yerbas": "Yerbas",
    "bic": "Bic",
    "pilas": "Pilas",
    "lamparas": "Lámparas",
    "pegamentos": "Pegamentos",
    "higiene": "Higiene",
    "chupetines": "Chupetines",
    "turrones": "Turrones",
    "papeleria": "Papelería",
    "perfumeria": "Perfumería",
    "detergentes": "Detergentes",
    "limpieza": "Limpieza",
    "pipas": "Pipas",
    "bebidas": "Bebidas",
    "snack": "Snacks",
    "snacks": "Snacks",
    "bizcochosy9deoro": "Galletitas",
    "fideosypastas": "Despensa",
    "caramelosychicles": "Caramelos",
    "turronesymasticables": "Turrones",
    "galletitasdulces": "Galletitas",
    "galletitassaladasytostadas": "Galletitas",
    "snacksypapas": "Snacks",
    "yerbacafeyte": "Yerbas",
    "bebidasyjugos": "Bebidas",
    "aceitesyaderezos": "Despensa",
    "conservasyenlatados": "Despensa",
    "postresyreposteria": "Despensa",
    "harinasarrozygranos": "Despensa",
    "esponjasyutensilios": "Limpieza",
    "cuidadodelaropa": "Limpieza",
    "limpiadoresydesinfectantes": "Limpieza",
    "papelesydescartables": "Limpieza",
    "desodorantesyfragancias": "Perfumería",
    "saludehigienefemenina": "Higiene",
    "jabonesycuidadocorporal": "Higiene",
    "cuidadocapilar": "Higiene",
    "higienebucal": "Higiene",
    "panalesybebe": "Higiene",
    "pilasybaterias": "Pilas",
    "iluminacionylinternas": "Lámparas",
    "bazaryferreteria": "Varios",
    "varios": "Varios"
  };

  return map[clean] || "Varios";
}

/**
 * Extract clean name, brand, and size info from raw product name
 * @param {object} p 
 * @returns {object} { brand, cleanName, size }
 */
export function parseProductInfo(p) {
  const name = p.name || "";
  let cleanName = name.replace(/SIN TACC/g, '').replace(/SIN TAC/g, '').replace(/\s+/g, ' ').trim();
  let brand = "";
  let size = "";

  const firstWordMatch = cleanName.match(/^([A-Z]{2,4})\b/);
  if (firstWordMatch) {
    brand = firstWordMatch[1];
    cleanName = cleanName.substring(brand.length).trim();
  } else {
    const knownBrands = ["ARCOR", "BAGLEY", "TERABUSI", "NESTLE", "CADBURY", "MILKA", "FERRERO", "KINDER", "POZO", "ALDO", "FECOVITA", "GUAYMALLEN"];
    for (const kb of knownBrands) {
      if (cleanName.toUpperCase().startsWith(kb)) {
        brand = kb;
        cleanName = cleanName.substring(kb.length).trim();
        break;
      }
    }
  }

  const sizePatterns = [
    /\b(X\s*\d+\s*(?:UNI|UNIDADES|UN|U|PAQ|POTES|DISCOS|U\.)\b\.?)/i,
    /\b(X\s*\d+(?:\,\d+)?\s*(?:L|ML|CC|G|KG|GR|GRS|M|CM)\b)/i,
    /\b(X\s*\d+\b)/i,
    /\b(\d+(?:\s*(?:G|KG|ML|CC|GR|GRS|L|M|CM|U))\b)/i
  ];

  for (const pattern of sizePatterns) {
    const sizeMatch = cleanName.match(pattern);
    if (sizeMatch) {
      size = sizeMatch[1];
      cleanName = cleanName.replace(size, "").replace(/\s+/g, ' ').trim();
      break;
    }
  }

  cleanName = cleanName.replace(/[-\s,X]+$/, "").replace(/^\s*-\s*/, "").replace(/\s+/g, ' ').trim();

  if (!brand) {
    brand = p.category || "BIANI";
    brand = brand.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "").trim();
  }

  return { brand, cleanName: cleanName || name, size };
}

/**
 * Friendly date/time formatter for last synced timestamp
 * @param {Date|string|number} date 
 * @returns {string}
 */
export function formatDateTime(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Desconocido";
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
