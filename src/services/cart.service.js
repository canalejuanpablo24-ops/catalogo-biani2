/**
 * Cart Service Module
 * Handles cart state, item quantity validation, persistence, totals, and WhatsApp order generator.
 */
import { formatCurrency } from '../utils/formatters.js';

export class CartService {
  /**
   * @param {object} tenantConfig 
   */
  constructor(tenantConfig) {
    this.config = tenantConfig;
    this.cartKey = tenantConfig.localStorageKeys.cart;
    this.items = this.loadCart();
  }

  /**
   * Load cart from LocalStorage
   * @returns {Array<object>}
   */
  loadCart() {
    try {
      const raw = localStorage.getItem(this.cartKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("Failed to load cart from localStorage:", e);
      return [];
    }
  }

  /**
   * Save cart to LocalStorage
   */
  saveCart() {
    try {
      localStorage.setItem(this.cartKey, JSON.stringify(this.items));
    } catch (e) {
      console.warn("Failed to save cart to localStorage:", e);
    }
  }

  /**
   * Get all items in cart
   * @returns {Array<object>}
   */
  getItems() {
    return this.items;
  }

  /**
   * Add a product to cart or increase quantity
   * @param {object} product 
   * @param {number} qtyToAdd 
   */
  addItem(product, qtyToAdd = 1) {
    if (!product || !product.code) return;
    
    const minQty = product.unidad_min || 1;
    const existing = this.items.find(item => item.code === product.code);

    if (existing) {
      existing.qty += qtyToAdd;
    } else {
      const initialQty = Math.max(qtyToAdd, minQty);
      this.items.push({
        code: product.code,
        name: product.name,
        price: product.price || 0,
        qty: initialQty,
        unidad_min: minQty,
        category: product.category || 'Varios',
        image: product.image || ''
      });
    }

    this.saveCart();
  }

  /**
   * Update item quantity
   * @param {string} code 
   * @param {number} newQty 
   */
  updateQuantity(code, newQty) {
    const itemIndex = this.items.findIndex(i => i.code === code);
    if (itemIndex === -1) return;

    if (newQty <= 0) {
      this.items.splice(itemIndex, 1);
    } else {
      this.items[itemIndex].qty = newQty;
    }

    this.saveCart();
  }

  /**
   * Remove item from cart
   * @param {string} code 
   */
  removeItem(code) {
    this.items = this.items.filter(i => i.code !== code);
    this.saveCart();
  }

  /**
   * Clear all items in cart
   */
  clearCart() {
    this.items = [];
    this.saveCart();
  }

  /**
   * Get total item count
   * @returns {number}
   */
  getTotalCount() {
    return this.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  }

  /**
   * Get total price calculation
   * @returns {number}
   */
  getTotalPrice() {
    return this.items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 0)), 0);
  }

  /**
   * Check if order meets minimum order threshold
   * @returns {boolean}
   */
  meetsMinimumOrder() {
    const min = this.config.minOrderAmount || 0;
    return this.getTotalPrice() >= min;
  }

  /**
   * Generate clean formatted WhatsApp order message
   * @param {object} customerInfo { name, address, notes }
   * @returns {string}
   */
  buildWhatsAppMessage(customerInfo = {}) {
    if (this.items.length === 0) return "";

    const { name, nameOrCompany, address, notes } = customerInfo;
    const storeName = this.config.name || "BIANI";
    
    let msg = `🛒 *NUEVO PEDIDO - ${storeName.toUpperCase()}*\n`;
    msg += `-------------------------------------------\n`;

    if (name || nameOrCompany) {
      msg += `👤 *Cliente:* ${name || nameOrCompany}\n`;
    }
    if (address) {
      msg += `📍 *Dirección:* ${address}\n`;
    }
    msg += `📅 *Fecha:* ${new Date().toLocaleDateString('es-AR')}\n`;
    msg += `-------------------------------------------\n\n`;

    msg += `*DETALLE DE PRODUCTOS:*\n`;

    this.items.forEach((item, idx) => {
      const unitPrice = formatCurrency(item.price);
      const subtotal = formatCurrency((item.price || 0) * item.qty);
      msg += `${idx + 1}. *[Cod. ${item.code}]* ${item.name}\n`;
      msg += `   └ ${item.qty} u. x ${unitPrice} = *${subtotal}*\n`;
    });

    const totalStr = formatCurrency(this.getTotalPrice());

    msg += `\n-------------------------------------------\n`;
    msg += `💵 *TOTAL GENERAL: ${totalStr}*\n`;

    if (notes) {
      msg += `\n📝 *Notas:* ${notes}\n`;
    }

    msg += `-------------------------------------------\n`;
    msg += `_Enviado desde el catálogo online ${this.config.name}_`;

    return msg;
  }

  /**
   * Get direct WhatsApp URL with prefilled order text
   * @param {object} customerInfo 
   * @returns {string}
   */
  getWhatsAppUrl(customerInfo = {}) {
    const text = this.buildWhatsAppMessage(customerInfo);
    const phone = (this.config.whatsappNumber || '').replace(/[^\d]/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
}
