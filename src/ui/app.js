/**
 * BIANI Catalog V2 - Main Application Entry Point
 */
import TENANT_CONFIG from '../config/tenant.config.js';
import { SheetsService } from '../services/sheets.service.js';
import { CartService } from '../services/cart.service.js';
import { formatCurrency, parseProductInfo, formatDateTime } from '../utils/formatters.js';

const PRODUCT_PLACEHOLDER = 'icon-192.png';

function createTextElement(tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value == null ? '' : String(value);
  return element;
}

function safeImageSource(value) {
  const src = value == null ? '' : String(value).trim();
  if (!src || /[\u0000-\u001F\u007F]/.test(src) || src.includes('\\')) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(src)) return src;
  if (/^https?:\/\//i.test(src) || /^\/\//.test(src)) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return '';
  return src;
}

class CatalogApp {
  constructor() {
    this.config = TENANT_CONFIG;
    this.sheetsService = new SheetsService(this.config);
    this.cartService = new CartService(this.config);
    
    this.products = [];
    this.filteredProducts = [];
    this.currentGroup = '';
    this.currentCategory = '';
    this.searchQuery = '';
    this.isOnlySinTacc = false;
    this.sortBy = 'default';

    this.init();
  }

  async init() {
    this.updateHeaderBranding();
    this.bindEvents();
    this.registerServiceWorker();
    await this.loadCatalogData();
  }

  updateHeaderBranding() {
    document.title = this.config.fullName;
    const logoBox = document.getElementById('logoBox');
    if (logoBox) logoBox.textContent = this.config.logoText;
    
    const logoText = document.getElementById('logoText');
    if (logoText) logoText.textContent = this.config.name;

    const logoSubtitle = document.getElementById('logoSubtitle');
    if (logoSubtitle) logoSubtitle.textContent = this.config.subtitle;
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('PWA ServiceWorker ready:', reg.scope))
          .catch(err => console.warn('PWA ServiceWorker error:', err));
      });
    }
  }

  showLoader(show) {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.toggle('hidden', !show);
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1000;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'background:#0f172a;color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    if (type === 'warn') toast.style.background = '#f59e0b';
    if (type === 'error') toast.style.background = '#ef4444';
    if (type === 'ok') toast.style.background = '#10b981';

    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  async loadCatalogData() {
    this.showLoader(true);
    try {
      const res = await this.sheetsService.loadDatabase();
      this.products = res.products || [];
      
      this.renderSyncStatus(res.isFallback, res.lastUpdated, res.error);
      this.buildNavigation();
      this.applyFilters();
      this.updateCartBadge();
    } catch (e) {
      console.error("Critical error initializing catalog:", e);
      this.showToast("Error cargando el catálogo.", "error");
    } finally {
      this.showLoader(false);
    }
  }

  renderSyncStatus(isFallback, lastUpdated, error) {
    const banner = document.getElementById('syncBanner');
    if (!banner) return;

    if (isFallback) {
      banner.className = 'sync-banner fallback';
      banner.textContent = `⚠️ Catálogo local de respaldo (${formatDateTime(lastUpdated)}). ${error || ''}`;
    } else {
      banner.className = 'sync-banner';
      banner.textContent = `✅ Sincronizado en tiempo real con Google Sheets (${formatDateTime(lastUpdated)})`;
    }
  }

  buildNavigation() {
    const nav1 = document.getElementById('nav1');
    if (!nav1) return;
    nav1.replaceChildren();

    const counts = this.getCategoryCounts();
    const totalCount = this.products.length;

    // "Todos" Tab
    const allTab = document.createElement('div');
    allTab.className = `g1tab ${this.currentGroup === '' ? 'active' : ''}`;
    allTab.append(document.createTextNode('🏪 Todos '), createTextElement('small', '', totalCount));
    allTab.onclick = () => this.selectGroup('', allTab);
    nav1.appendChild(allTab);

    // Group Tabs
    for (const [groupName, groupCats] of Object.entries(this.config.categoryGroups)) {
      const groupTotal = groupCats.reduce((sum, cat) => sum + (counts[cat] || 0), 0);
      const tab = document.createElement('div');
      tab.className = `g1tab ${this.currentGroup === groupName ? 'active' : ''}`;
      tab.append(document.createTextNode(groupName + ' '), createTextElement('small', '', groupTotal));
      tab.onclick = () => this.selectGroup(groupName, tab);
      nav1.appendChild(tab);
    }

    this.renderSubcategories(counts);
  }

  renderSubcategories(counts) {
    const nav2 = document.getElementById('nav2');
    if (!nav2) return;
    nav2.replaceChildren();

    let cats = [];
    if (!this.currentGroup) {
      cats = Object.keys(this.config.categoryIcons);
    } else {
      cats = this.config.categoryGroups[this.currentGroup] || [];
    }

    const totalSubCount = cats.reduce((sum, cat) => sum + (counts[cat] || 0), 0);

    const allSubTab = document.createElement('div');
    allSubTab.className = `g2tab ${this.currentCategory === '' ? 'active' : ''}`;
    allSubTab.append(document.createTextNode('Todo '), createTextElement('span', 'cnt', totalSubCount));
    allSubTab.onclick = () => this.selectCategory('', allSubTab);
    nav2.appendChild(allSubTab);

    cats.forEach(cat => {
      const count = counts[cat] || 0;
      const icon = this.config.categoryIcons[cat] || '';
      const tab = document.createElement('div');
      tab.className = `g2tab ${this.currentCategory === cat ? 'active' : ''}`;
      tab.append(
        createTextElement('span', 'ico', icon),
        document.createTextNode(cat),
        createTextElement('span', 'cnt', count)
      );
      tab.onclick = () => this.selectCategory(cat, tab);
      nav2.appendChild(tab);
    });
  }

  getCategoryCounts() {
    const counts = {};
    this.products.forEach(p => {
      const cat = p.category || 'Varios';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }

  selectGroup(groupName, tabEl) {
    document.querySelectorAll('.g1tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    this.currentGroup = groupName;
    this.currentCategory = '';
    this.renderSubcategories(this.getCategoryCounts());
    this.applyFilters();
  }

  selectCategory(catName, tabEl) {
    document.querySelectorAll('.g2tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    this.currentCategory = catName;
    this.applyFilters();

    const titleEl = document.getElementById('ctitle');
    if (titleEl) titleEl.textContent = catName || (this.currentGroup || 'Catálogo BIANI');
  }

  applyFilters() {
    let result = [...this.products];

    if (this.currentCategory) {
      result = result.filter(p => p.category === this.currentCategory);
    } else if (this.currentGroup) {
      const groupCats = this.config.categoryGroups[this.currentGroup] || [];
      result = result.filter(p => groupCats.includes(p.category));
    }

    if (this.isOnlySinTacc) {
      result = result.filter(p => p.name.includes('SIN TACC') || p.name.includes('SIN TAC'));
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      result = result.filter(p => {
        const nameNorm = (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const codeNorm = String(p.code).toLowerCase();
        const brandNorm = (parseProductInfo(p).brand || '').toLowerCase();
        return nameNorm.includes(q) || codeNorm.includes(q) || brandNorm.includes(q);
      });
    }

    // Sort
    if (this.sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'price-asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (this.sortBy === 'price-desc') {
      result.sort((a, b) => b.price - a.price);
    }

    this.filteredProducts = result;
    this.renderProductsGrid();
  }

  renderProductsGrid() {
    const grid = document.getElementById('grid');
    const countEl = document.getElementById('pcnt');
    if (!grid) return;

    if (countEl) countEl.textContent = this.filteredProducts.length.toLocaleString('es-AR');
    grid.replaceChildren();

    if (this.filteredProducts.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px;color:var(--g3)';
      const icon = createTextElement('div', '', '🔍');
      icon.style.cssText = 'font-size:40px;margin-bottom:12px';
      const message = createTextElement('p', '', 'No se encontraron productos en esta categoría o búsqueda.');
      message.style.cssText = 'font-size:16px;font-weight:600';
      empty.append(icon, message);
      grid.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    this.filteredProducts.forEach(p => {
      frag.appendChild(this.createProductCard(p));
    });
    grid.appendChild(frag);
  }

  createProductCard(p) {
    const card = document.createElement('div');
    card.className = 'card';

    const info = parseProductInfo(p);
    const inCartItem = this.cartService.getItems().find(i => i.code === p.code);
    const imageSource = safeImageSource(p.image);
    const isNoImg = !imageSource;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'card-img-wrap';
    const badges = document.createElement('div');
    badges.className = 'badge-container';
    if (isNoImg) badges.appendChild(createTextElement('span', 'badge badge-no-img', '🆕 Sin foto'));
    if (p.outOfStock) badges.appendChild(createTextElement('span', 'badge badge-out', 'Sin Stock'));

    const image = document.createElement('img');
    image.src = imageSource || PRODUCT_PLACEHOLDER;
    image.alt = String(p.name || '');
    image.loading = 'lazy';
    image.onerror = () => {
      image.onerror = null;
      image.src = PRODUCT_PLACEHOLDER;
    };
    imageWrap.append(badges, image);

    const body = document.createElement('div');
    body.className = 'card-body';
    const identity = document.createElement('div');
    const code = `COD: ${p.code}${info.brand ? ' · ' + info.brand : ''}`;
    const title = createTextElement('div', 'card-title', p.name);
    title.title = String(p.name || '');
    identity.append(createTextElement('div', 'card-code', code), title);

    const purchase = document.createElement('div');
    const priceRow = document.createElement('div');
    priceRow.className = 'card-price-row';
    priceRow.append(
      createTextElement('span', 'card-price', formatCurrency(p.price)),
      createTextElement('span', 'card-min', p.unidad_min > 1 ? 'Mín. ' + p.unidad_min + ' u.' : '')
    );
    const btn = createTextElement(
      'button',
      `add-btn ${inCartItem ? 'in-cart' : ''}`,
      inCartItem ? `✓ En carrito (${inCartItem.qty})` : '🛒 Agregar al pedido'
    );
    btn.type = 'button';
    btn.dataset.code = String(p.code || '');
    purchase.append(priceRow, btn);
    body.append(identity, purchase);
    card.append(imageWrap, body);

    btn.onclick = () => {
      this.cartService.addItem(p, 1);
      this.updateCartBadge();
      this.renderProductsGrid();
      this.showToast(`Agregado: ${p.name}`, "ok");
    };

    return card;
  }

  updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    const totalCount = this.cartService.getTotalCount();
    if (badge) {
      badge.textContent = totalCount;
      badge.style.display = totalCount > 0 ? 'flex' : 'none';
    }
  }

  bindEvents() {
    // Search input
    const searchInp = document.getElementById('searchInp');
    const clearBtn = document.getElementById('clearSearch');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
        this.applyFilters();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInp) searchInp.value = '';
        this.searchQuery = '';
        clearBtn.style.display = 'none';
        this.applyFilters();
      });
    }

    // Sort select
    const sortSel = document.getElementById('sortSel');
    if (sortSel) {
      sortSel.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.applyFilters();
      });
    }

    // Cart Button & Modal
    const cartBtn = document.getElementById('cartBtn');
    const cartModal = document.getElementById('cartModal');
    const closeCart = document.getElementById('closeCart');
    if (cartBtn && cartModal) {
      cartBtn.onclick = () => {
        this.renderCartModal();
        cartModal.classList.add('active');
      };
    }
    if (closeCart && cartModal) {
      closeCart.onclick = () => cartModal.classList.remove('active');
    }

    // Checkout WhatsApp button
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
      checkoutBtn.onclick = () => {
        if (this.cartService.getItems().length === 0) return;
        const custName = document.getElementById('custName')?.value || '';
        const custAddr = document.getElementById('custAddr')?.value || '';
        const url = this.cartService.getWhatsAppUrl({ name: custName, address: custAddr });
        window.open(url, '_blank');
      };
    }

    // Clear Cart button
    const clearCartBtn = document.getElementById('clearCartBtn');
    if (clearCartBtn) {
      clearCartBtn.onclick = () => {
        if (confirm("¿Deseas vaciar el carrito?")) {
          this.cartService.clearCart();
          this.updateCartBadge();
          this.renderCartModal();
          this.renderProductsGrid();
        }
      };
    }
  }

  renderCartModal() {
    const listEl = document.getElementById('cartList');
    const totalEl = document.getElementById('cartTotal');
    if (!listEl || !totalEl) return;

    const items = this.cartService.getItems();
    listEl.replaceChildren();

    if (items.length === 0) {
      const empty = createTextElement('div', '', '🛒 El carrito está vacío.');
      empty.style.cssText = 'text-align:center;padding:30px;color:var(--g3)';
      listEl.appendChild(empty);
      totalEl.textContent = formatCurrency(0);
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      const info = document.createElement('div');
      info.className = 'cart-item-info';
      info.append(
        createTextElement('div', 'cart-item-name', item.name),
        createTextElement('div', 'cart-item-price', `${formatCurrency(item.price)} c/u`)
      );
      const controls = document.createElement('div');
      controls.className = 'qty-controls';
      const decrement = createTextElement('button', 'qty-btn dec-btn', '-');
      decrement.type = 'button';
      const increment = createTextElement('button', 'qty-btn inc-btn', '+');
      increment.type = 'button';
      controls.append(decrement, createTextElement('span', 'qty-val', item.qty), increment);
      row.append(info, controls);

      decrement.onclick = () => {
        this.cartService.updateQuantity(item.code, item.qty - 1);
        this.updateCartBadge();
        this.renderCartModal();
        this.renderProductsGrid();
      };

      increment.onclick = () => {
        this.cartService.updateQuantity(item.code, item.qty + 1);
        this.updateCartBadge();
        this.renderCartModal();
        this.renderProductsGrid();
      };

      listEl.appendChild(row);
    });

    totalEl.textContent = formatCurrency(this.cartService.getTotalPrice());
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CatalogApp();
});
