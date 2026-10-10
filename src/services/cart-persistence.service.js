(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CartPersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const CART_KEY = 'biani_cart_v1';
  const CUSTOMER_KEY = 'biani_customer_v1';

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).trim().slice(0, maxLength);
  }

  function parseStoredJson(value) {
    if (!value) return null;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
      return null;
    }
  }

  function createCartSnapshot(products, saleMode, now, previousValue, acceptCurrentTerms) {
    const previous = parseStoredJson(previousValue);
    const previousItems = new Map();
    if (previous && Array.isArray(previous.items)) {
      previous.items.forEach(function (item) {
        if (item && item.code != null) previousItems.set(String(item.code), item);
      });
    }

    const items = [];
    (Array.isArray(products) ? products : []).forEach(function (product) {
      if (!product || Number(product.qty) <= 0) return;
      const selection = saleMode.createCartSelection(product, product.sale_mode, product.qty);
      if (!selection) return;
      const prior = previousItems.get(String(selection.code));
      const preserveAcceptedTerms = !acceptCurrentTerms && prior && prior.sale_mode === selection.sale_mode;
      items.push({
        code: String(selection.code),
        qty: selection.qty,
        sale_mode: selection.sale_mode,
        units_per_display: preserveAcceptedTerms && prior.units_per_display !== undefined
          ? prior.units_per_display
          : selection.units_per_display,
        price_at_save: preserveAcceptedTerms && Number.isFinite(Number(prior.price_at_save))
          ? Number(prior.price_at_save)
          : selection.price,
        min_qty_at_save: preserveAcceptedTerms && Number.isSafeInteger(Number(prior.min_qty_at_save))
          ? Number(prior.min_qty_at_save)
          : selection.min_qty
      });
    });
    return {
      version: VERSION,
      saved_at: typeof now === 'number' ? now : Date.now(),
      items: items
    };
  }

  function restoreCart(catalogProducts, storedValue, saleMode) {
    const stored = parseStoredJson(storedValue);
    const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
    const byCode = new Map(catalog.map(function (product) {
      return [String(product.code), product];
    }));
    const validStoredState = stored && stored.version === VERSION && Array.isArray(stored.items);
    const rawItems = validStoredState ? stored.items : [];
    const deduplicated = new Map();
    rawItems.forEach(function (item) {
      if (item && item.code != null) deduplicated.set(String(item.code), item);
    });

    const items = [];
    const notices = [];
    if (storedValue && !validStoredState) {
      notices.push({ type: 'invalid_state', code: '', message: 'El carrito guardado era inválido y fue descartado de forma segura.' });
    }

    deduplicated.forEach(function (savedItem, code) {
      const product = byCode.get(code);
      if (!product) {
        notices.push({ type: 'missing', code: code, message: `El producto #${code} ya no existe y requiere corrección antes de enviar.` });
        return;
      }
      const productName = cleanText(product.name || ('Producto #' + code), 160);
      if (product.outOfStock) {
        notices.push({ type: 'out_of_stock', code: code, message: `${productName} quedó sin stock y requiere corrección antes de enviar.` });
        return;
      }

      const requestedMode = savedItem.sale_mode === saleMode.DISPLAY ? saleMode.DISPLAY : saleMode.UNIT;
      const option = saleMode.getSaleOptions(product).find(function (candidate) {
        return candidate.mode === requestedMode;
      });
      if (!option) {
        notices.push({ type: 'mode_unavailable', code: code, message: `${productName} ya no admite el modo de venta guardado y requiere corrección antes de enviar.` });
        return;
      }

      const savedQuantity = Number(savedItem.qty);
      if (!Number.isSafeInteger(savedQuantity) || savedQuantity <= 0) {
        notices.push({ type: 'invalid_quantity', code: code, message: `${productName} tiene una cantidad inválida y requiere corrección antes de enviar.` });
        return;
      }

      const quantity = saleMode.normalizeSaleQuantity(savedQuantity, option);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        notices.push({ type: 'invalid_quantity', code: code, message: `${productName} no puede recuperar una cantidad válida y requiere corrección antes de enviar.` });
        return;
      }

      const savedPrice = Number(savedItem.price_at_save);
      if (Number.isFinite(savedPrice) && Math.abs(savedPrice - option.price) > 0.0001) {
        notices.push({
          type: 'price_changed',
          code: code,
          message: `${productName} actualizó su precio de $${savedPrice.toLocaleString('es-AR')} a $${option.price.toLocaleString('es-AR')}.`
        });
      }
      if (quantity !== savedQuantity) {
        notices.push({
          type: 'quantity_changed',
          code: code,
          message: `La cantidad de ${productName} se ajustó de ${savedQuantity} a ${quantity} por el mínimo vigente.`
        });
      }
      const savedUnitsPerDisplay = savedItem.units_per_display == null ? null : Number(savedItem.units_per_display);
      if (requestedMode === saleMode.DISPLAY && savedUnitsPerDisplay !== option.unitsPerDisplay) {
        notices.push({
          type: 'display_changed',
          code: code,
          message: `${productName} ahora contiene ${option.unitsPerDisplay} unidades por display.`
        });
      }

      items.push({
        code: code,
        qty: quantity,
        sale_mode: option.mode,
        units_per_display: option.unitsPerDisplay,
        price: option.price,
        min_qty: option.minQty
      });
    });

    return { items: items, notices: notices };
  }

  function sanitizeCustomer(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      name: cleanText(source.name, 120),
      address: cleanText(source.address, 240),
      phone: cleanText(source.phone, 60),
      observations: cleanText(source.observations, 500)
    };
  }

  function hasCustomerData(customer) {
    const safe = sanitizeCustomer(customer);
    return Boolean(safe.name || safe.address || safe.phone || safe.observations);
  }

  return {
    VERSION: VERSION,
    CART_KEY: CART_KEY,
    CUSTOMER_KEY: CUSTOMER_KEY,
    parseStoredJson: parseStoredJson,
    createCartSnapshot: createCartSnapshot,
    restoreCart: restoreCart,
    sanitizeCustomer: sanitizeCustomer,
    hasCustomerData: hasCustomerData
  };
});
