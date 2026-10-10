(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrderValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function orderFactory() {
  'use strict';

  function cleanText(value, fallback) {
    const text = String(value == null ? '' : value).trim();
    return text || fallback || '';
  }

  function money(value) {
    return Number(value).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function validateOrder(snapshot, catalogProducts, saleMode, syncState) {
    const blockers = [];
    const changes = [];
    const items = [];
    const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
    const byCode = new Map(catalog.map(function (product) {
      return [String(product.code), product];
    }));
    const state = syncState && typeof syncState === 'object' ? syncState : { status: 'unknown' };

    if (state.status !== 'confirmed') {
      const detail = state.status === 'pending'
        ? 'La actualización del catálogo todavía está en curso.'
        : 'No se pudo confirmar el catálogo actualizado con la fuente externa.';
      blockers.push({
        type: 'sync_unconfirmed',
        code: '',
        message: detail + ' El pedido no puede enviarse hasta verificar stock y precios.'
      });
    }

    const validSnapshot = snapshot && Array.isArray(snapshot.items);
    if (!validSnapshot) {
      blockers.push({
        type: 'invalid_cart',
        code: '',
        message: 'El carrito guardado no tiene un formato válido.'
      });
      return { blockers: blockers, changes: changes, items: items, total: 0, canSend: false };
    }

    const seenCodes = new Set();
    snapshot.items.forEach(function (saved) {
      const code = saved && saved.code != null ? String(saved.code) : '';
      if (!code) {
        blockers.push({ type: 'invalid_item', code: '', message: 'Hay un producto sin código válido en el carrito.' });
        return;
      }
      if (seenCodes.has(code)) {
        blockers.push({ type: 'duplicate', code: code, message: `El producto #${code} está duplicado en el carrito.` });
        return;
      }
      seenCodes.add(code);

      const product = byCode.get(code);
      if (!product) {
        blockers.push({ type: 'missing', code: code, message: `El producto #${code} ya no existe en el catálogo vigente.` });
        return;
      }
      const name = cleanText(product.name, `Producto #${code}`);
      if (product.outOfStock === true) {
        blockers.push({ type: 'out_of_stock', code: code, message: `${name} (#${code}) está sin stock.` });
        return;
      }

      const requestedMode = saved.sale_mode === saleMode.DISPLAY ? saleMode.DISPLAY : saleMode.UNIT;
      const option = saleMode.getSaleOptions(product).find(function (candidate) {
        return candidate.mode === requestedMode;
      });
      if (!option) {
        blockers.push({
          type: 'mode_unavailable',
          code: code,
          message: `${name} (#${code}) ya no admite el modo ${requestedMode === saleMode.DISPLAY ? 'Display' : 'Unidad'}.`
        });
        return;
      }

      const savedQuantity = Number(saved.qty);
      if (!Number.isSafeInteger(savedQuantity) || savedQuantity <= 0) {
        blockers.push({ type: 'invalid_quantity', code: code, message: `${name} (#${code}) tiene una cantidad inválida.` });
        return;
      }

      const normalizedQuantity = saleMode.normalizeSaleQuantity(savedQuantity, option);
      if (!Number.isSafeInteger(normalizedQuantity) || normalizedQuantity <= 0) {
        blockers.push({ type: 'invalid_quantity', code: code, message: `${name} (#${code}) no admite la cantidad guardada.` });
        return;
      }

      const savedPrice = Number(saved.price_at_save);
      if (Number.isFinite(savedPrice) && Math.abs(savedPrice - option.price) > 0.0001) {
        changes.push({
          type: 'price_changed',
          code: code,
          message: `${name} (#${code}): precio $${money(savedPrice)} → $${money(option.price)}.`
        });
      }

      const savedMinimum = Number(saved.min_qty_at_save);
      if (Number.isSafeInteger(savedMinimum) && savedMinimum > 0 && savedMinimum !== option.minQty) {
        changes.push({
          type: 'minimum_changed',
          code: code,
          message: `${name} (#${code}): mínimo ${savedMinimum} → ${option.minQty}.`
        });
      }

      const savedUnits = saved.units_per_display == null ? null : Number(saved.units_per_display);
      if (requestedMode === saleMode.DISPLAY && savedUnits !== option.unitsPerDisplay) {
        changes.push({
          type: 'display_units_changed',
          code: code,
          message: `${name} (#${code}): unidades por display ${savedUnits || 0} → ${option.unitsPerDisplay}.`
        });
      }

      if (normalizedQuantity !== savedQuantity) {
        changes.push({
          type: 'quantity_changed',
          code: code,
          message: `${name} (#${code}): cantidad ${savedQuantity} → ${normalizedQuantity} por la regla mínima vigente.`
        });
      }

      const selection = saleMode.createCartSelection(product, requestedMode, normalizedQuantity);
      if (!selection) {
        blockers.push({ type: 'invalid_selection', code: code, message: `${name} (#${code}) no pudo validarse para la compra.` });
        return;
      }
      items.push({ product: product, selection: selection });
    });

    const total = items.reduce(function (sum, entry) {
      return sum + entry.selection.total;
    }, 0);
    return {
      blockers: blockers,
      changes: changes,
      items: items,
      total: total,
      canSend: blockers.length === 0 && items.length > 0
    };
  }

  function formatBlockingMessage(blockers) {
    return 'No se puede enviar el pedido:\n\n' + blockers.map(function (blocker) {
      return '• ' + blocker.message;
    }).join('\n');
  }

  function formatChangesMessage(changes, total) {
    return 'El catálogo cambió desde que armaste el carrito:\n\n' +
      changes.map(function (change) { return '• ' + change.message; }).join('\n') +
      `\n\nNuevo total: $${money(total)}\n\n¿Aceptás expresamente estos cambios y querés continuar?`;
  }

  function formatOrderMessage(items, customer, saleMode, date) {
    const safeCustomer = customer || {};
    let message = '🛒 *PEDIDO BIANI*\n━━━━━━━━━━━━━━━━\n';
    message += `👤 *Cliente:* ${cleanText(safeCustomer.name)}\n`;
    message += `🆔 *DNI/CUIT:* ${cleanText(safeCustomer.dni)}\n`;
    message += `📍 *Dirección:* ${cleanText(safeCustomer.address)}\n`;
    if (cleanText(safeCustomer.phone)) message += `📞 *Teléfono:* ${cleanText(safeCustomer.phone)}\n`;
    if (cleanText(safeCustomer.observations)) message += `💬 *Obs:* ${cleanText(safeCustomer.observations)}\n`;
    message += '━━━━━━━━━━━━━━━━\n';

    let total = 0;
    items.forEach(function (entry) {
      const product = entry.product;
      const selection = entry.selection;
      total += selection.total;
      const quantity = saleMode.formatSaleQuantity(selection.qty, {
        mode: selection.sale_mode,
        minQty: selection.min_qty,
        unitsPerDisplay: selection.units_per_display
      });
      message += `▪ *${cleanText(product.name)}*\n  Cód. ${product.code} · Modo: ${selection.sale_mode_label} · Cantidad: ${quantity} · Total: $${money(selection.total)}\n`;
    });
    message += `━━━━━━━━━━━━━━━━\n💰 *TOTAL: $${money(total)}*\n📅 ${(date || new Date()).toLocaleDateString('es-AR')}`;
    return message;
  }

  function buildWhatsAppUrl(phone, message) {
    return 'https://wa.me/' + String(phone || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(message);
  }

  return {
    validateOrder: validateOrder,
    formatBlockingMessage: formatBlockingMessage,
    formatChangesMessage: formatChangesMessage,
    formatOrderMessage: formatOrderMessage,
    buildWhatsAppUrl: buildWhatsAppUrl
  };
});
