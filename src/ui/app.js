/**
 * BIANI Catalog V2 - Main Application Entry Point
 */
import TENANT_CONFIG from '../config/tenant.config.js';
import { SheetsService } from '../services/sheets.service.js';
import { CartService } from '../services/cart.service.js';
import { formatCurrency, parseProductInfo, formatDateTime } from '../utils/formatters.js';

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
      banner.innerHTML = `⚠️ Catálogo local de respaldo (${formatDateTime(lastUpdated)}). ${error || ''}`;
    } else {
      banner.className = 'sync-banner';
      banner.innerHTML = `✅ Sincronizado en tiempo real con Google Sheets (${formatDateTime(lastUpdated)})`;
    }
  }

  buildNavigation() {
    const nav1 = document.getElementById('nav1');
    if (!nav1) return;
    nav1.innerHTML = '';

    const counts = this.getCategoryCounts();
    const totalCount = this.products.length;

    // "Todos" Tab
    const allTab = document.createElement('div');
    allTab.className = `g1tab ${this.currentGroup === '' ? 'active' : ''}`;
    allTab.innerHTML = `🏪 Todos <small>${totalCount}</small>`;
    allTab.onclick = () => this.selectGroup('', allTab);
    nav1.appendChild(allTab);

    // Group Tabs
    for (const [groupName, groupCats] of Object.entries(this.config.categoryGroups)) {
      const groupTotal = groupCats.reduce((sum, cat) => sum + (counts[cat] || 0), 0);
      const tab = document.createElement('div');
      tab.className = `g1tab ${this.currentGroup === groupName ? 'active' : ''}`;
      tab.innerHTML = `${groupName} <small>${groupTotal}</small>`;
      tab.onclick = () => this.selectGroup(groupName, tab);
      nav1.appendChild(tab);
    }

    this.renderSubcategories(counts);
  }

  renderSubcategories(counts) {
    const nav2 = document.getElementById('nav2');
    if (!nav2) return;
    nav2.innerHTML = '';

    let cats = [];
    if (!this.currentGroup) {
      cats = Object.keys(this.config.categoryIcons);
    } else {
      cats = this.config.categoryGroups[this.currentGroup] || [];
    }

    const totalSubCount = cats.reduce((sum, cat) => sum + (counts[cat] || 0), 0);

    const allSubTab = document.createElement('div');
    allSubTab.className = `g2tab ${this.currentCategory === '' ? 'active' : ''}`;
    allSubTab.innerHTML = `Todo <span class="cnt">${totalSubCount}</span>`;
    allSubTab.onclick = () => this.selectCategory('', allSubTab);
    nav2.appendChild(allSubTab);

    cats.forEach(cat => {
      const count = counts[cat] || 0;
      const icon = this.config.categoryIcons[cat] || '';
      const tab = document.createElement('div');
      tab.className = `g2tab ${this.currentCategory === cat ? 'active' : ''}`;
      tab.innerHTML = `<span class="ico">${icon}</span>${cat}<span class="cnt">${count}</span>`;
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
    grid.innerHTML = '';

    if (this.filteredProducts.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--g3);">
          <div style="font-size: 40px; margin-bottom: 12px;">🔍</div>
          <p style="font-size: 16px; font-weight: 600;">No se encontraron productos en esta categoría o búsqueda.</p>
        </div>
      `;
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
    const isNoImg = !p.image || p.image.trim() === '';

    let badgeHtml = '';
    if (isNoImg) {
      badgeHtml += `<span class="badge badge-no-img">🆕 Sin foto</span>`;
    }
    if (p.outOfStock) {
      badgeHtml += `<span class="badge badge-out">Sin Stock</span>`;
    }

    const placeholderSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
    const imgSrc = !isNoImg ? p.image : placeholderSvg;

    card.innerHTML = `
      <div class="card-img-wrap">
        <div class="badge-container">${badgeHtml}</div>
        <img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.src='${placeholderSvg}'" />
      </div>
      <div class="card-body">
        <div>
          <div class="card-code">COD: ${p.code} ${info.brand ? '· ' + info.brand : ''}</div>
          <div class="card-title" title="${p.name}">${p.name}</div>
        </div>
        <div>
          <div class="card-price-row">
            <span class="card-price">${formatCurrency(p.price)}</span>
            <span class="card-min">${p.unidad_min > 1 ? 'Mín. ' + p.unidad_min + ' u.' : ''}</span>
          </div>
          <button class="add-btn ${inCartItem ? 'in-cart' : ''}" data-code="${p.code}">
            ${inCartItem ? `✓ En carrito (${inCartItem.qty})` : '🛒 Agregar al pedido'}
          </button>
        </div>
      </div>
    `;

    const btn = card.querySelector('.add-btn');
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
    listEl.innerHTML = '';

    if (items.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--g3)">🛒 El carrito está vacío.</div>`;
      totalEl.textContent = formatCurrency(0);
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${formatCurrency(item.price)} c/u</div>
        </div>
        <div class="qty-controls">
          <button class="qty-btn dec-btn">-</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn inc-btn">+</button>
        </div>
      `;

      row.querySelector('.dec-btn').onclick = () => {
        this.cartService.updateQuantity(item.code, item.qty - 1);
        this.updateCartBadge();
        this.renderCartModal();
        this.renderProductsGrid();
      };

      row.querySelector('.inc-btn').onclick = () => {
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
