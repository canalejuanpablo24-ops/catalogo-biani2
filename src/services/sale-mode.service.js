const SALE_MODE_UNIT = 'unit';
const SALE_MODE_DISPLAY = 'display';

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function explicitModes(product) {
  if (!Array.isArray(product?.sale_modes)) return null;
  return [...new Set(product.sale_modes.map(mode => String(mode).trim().toLowerCase()))];
}

function getSaleOptions(product) {
  if (!product || typeof product !== 'object') return [];
  const configuredModes = explicitModes(product);
  const modes = configuredModes === null ? [SALE_MODE_UNIT] : configuredModes;
  const options = [];

  if (modes.includes(SALE_MODE_UNIT)) {
    const price = positiveNumber(configuredModes === null ? product.price : product.unit_price);
    const minQty = positiveInteger(configuredModes === null ? (product.unidad_min || 1) : product.unit_min);
    if (price !== null && minQty !== null) {
      options.push({
        mode: SALE_MODE_UNIT,
        label: 'Unidad',
        price,
        minQty,
        unitsPerDisplay: null
      });
    }
  }

  if (modes.includes(SALE_MODE_DISPLAY)) {
    const price = positiveNumber(product.display_price);
    const minQty = positiveInteger(product.display_min);
    const unitsPerDisplay = positiveInteger(product.units_per_display);
    if (price !== null && minQty !== null && unitsPerDisplay !== null) {
      options.push({
        mode: SALE_MODE_DISPLAY,
        label: 'Display',
        price,
        minQty,
        unitsPerDisplay
      });
    }
  }

  return options;
}

function getSaleOption(product, requestedMode) {
  const options = getSaleOptions(product);
  return options.find(option => option.mode === requestedMode) || options[0] || null;
}

function normalizeSaleQuantity(quantity, option) {
  const numericQuantity = Number(quantity);
  if (!option || !Number.isFinite(numericQuantity) || numericQuantity <= 0) return 0;
  return Math.max(option.minQty, Math.ceil(numericQuantity / option.minQty) * option.minQty);
}

function selectSaleMode(product, requestedMode, currentQuantity = 0) {
  const option = getSaleOption(product, requestedMode);
  return {
    mode: option?.mode || null,
    option,
    qty: normalizeSaleQuantity(currentQuantity, option)
  };
}

function changeSaleQuantity(product, requestedMode, currentQuantity, direction) {
  const selection = selectSaleMode(product, requestedMode, currentQuantity);
  if (!selection.option || product.outOfStock) return { ...selection, qty: 0 };
  const delta = direction > 0 ? selection.option.minQty : -selection.option.minQty;
  const nextQuantity = Math.max(0, selection.qty + delta);
  return { ...selection, qty: nextQuantity };
}

function getSaleSubtotal(product, mode, quantity) {
  const option = getSaleOption(product, mode);
  if (!option) return 0;
  return option.price * normalizeSaleQuantity(quantity, option);
}

function canPurchase(product, mode) {
  return Boolean(product && !product.outOfStock && getSaleOption(product, mode));
}

function formatSaleQuantity(quantity, option) {
  const normalized = normalizeSaleQuantity(quantity, option);
  if (!option) return '0 unidades';
  if (option.mode === SALE_MODE_DISPLAY) {
    const noun = normalized === 1 ? 'display' : 'displays';
    return `${normalized} ${noun} (${option.unitsPerDisplay} u. c/u)`;
  }
  return `${normalized} ${normalized === 1 ? 'unidad' : 'unidades'}`;
}

function createCartSelection(product, requestedMode, quantity) {
  const selection = selectSaleMode(product, requestedMode, quantity);
  if (!selection.option || product?.outOfStock || selection.qty === 0) return null;
  return {
    code: String(product.code),
    name: product.name,
    sale_mode: selection.mode,
    sale_mode_label: selection.option.label,
    price: selection.option.price,
    qty: selection.qty,
    min_qty: selection.option.minQty,
    units_per_display: selection.option.unitsPerDisplay,
    total: selection.option.price * selection.qty
  };
}

function formatWhatsAppSale(selection, currencyFormatter) {
  if (!selection) return '';
  const option = {
    mode: selection.sale_mode,
    minQty: selection.min_qty,
    unitsPerDisplay: selection.units_per_display
  };
  const total = typeof currencyFormatter === 'function'
    ? currencyFormatter(selection.total)
    : String(selection.total);
  return `Modo: ${selection.sale_mode_label} · Cantidad: ${formatSaleQuantity(selection.qty, option)} · Total: ${total}`;
}

const SaleMode = {
  UNIT: SALE_MODE_UNIT,
  DISPLAY: SALE_MODE_DISPLAY,
  getSaleOptions,
  getSaleOption,
  normalizeSaleQuantity,
  selectSaleMode,
  changeSaleQuantity,
  getSaleSubtotal,
  canPurchase,
  formatSaleQuantity,
  createCartSelection,
  formatWhatsAppSale
};

if (typeof window !== 'undefined') window.SaleMode = SaleMode;
else globalThis.SaleMode = SaleMode;
