(function initializeCommercialTestMode(root) {
  'use strict';

  const runtime = root.BIANI_RUNTIME_CONFIG || Object.freeze({ TEST_MODE: false });
  const guard = root.BianiTestMode;
  const contact = document.querySelector('[data-whatsapp-contact]');

  function enableProductionContact() {
    if (!contact) return;
    const phone = String(contact.dataset.whatsappContact || '').replace(/\D/g, '');
    contact.href = 'https://wa.me/' + phone;
    contact.target = '_blank';
    contact.rel = 'noopener noreferrer';
    contact.title = 'Contactar por WhatsApp';
  }

  if (runtime.TEST_MODE !== true) {
    enableProductionContact();
    return;
  }

  if (!guard) throw new Error('No se pudo activar la protección del catálogo de prueba.');

  const state = { lastMessage: '' };
  let previewOverlay;
  let previewText;
  let copyStatus;

  function createElement(tag, attributes, text) {
    const element = document.createElement(tag);
    Object.entries(attributes || {}).forEach(function (entry) {
      const name = entry[0];
      const value = entry[1];
      if (name === 'className') element.className = value;
      else if (name === 'style') element.style.cssText = value;
      else element.setAttribute(name, value);
    });
    if (text != null) element.textContent = String(text);
    return element;
  }

  function showPreview(message) {
    state.lastMessage = String(message || '');
    if (!previewOverlay || !previewText) return;
    previewText.value = state.lastMessage;
    copyStatus.textContent = '';
    previewOverlay.hidden = false;
    previewText.focus();
    previewText.setSelectionRange(0, 0);
  }

  function hidePreview() {
    if (previewOverlay) previewOverlay.hidden = true;
  }

  async function copyPreview() {
    if (!state.lastMessage) return;
    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(state.lastMessage);
        copied = true;
      } catch (error) {
        copied = false;
      }
    }
    if (!copied) {
      previewText.focus();
      previewText.select();
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        copied = false;
      }
    }
    copyStatus.textContent = copied
      ? 'Pedido copiado.'
      : 'No se pudo copiar automáticamente. Seleccioná el texto y copiá manualmente.';
  }

  function buildTestInterface() {
    document.body.classList.add('biani-test-mode');

    const banner = createElement('div', {
      id: 'testModeBanner',
      role: 'status',
      style: 'position:sticky;top:0;z-index:10000;width:100%;box-sizing:border-box;padding:10px 14px;background:#7f1d1d;color:#fff;text-align:center;font:800 14px/1.25 system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 2px 8px rgba(0,0,0,.22)'
    }, 'CATÁLOGO DE PRUEBA — PEDIDOS NO ENVIADOS');
    document.body.prepend(banner);

    const header = document.querySelector('header.hd');
    const search = document.querySelector('.search-banner-large');
    if (header) header.style.top = banner.offsetHeight + 'px';
    if (search) search.style.top = (banner.offsetHeight + 58) + 'px';

    previewOverlay = createElement('div', {
      id: 'testOrderPreview',
      className: 'test-order-preview',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'testOrderPreviewTitle',
      hidden: '',
      style: 'position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.72);padding:18px;overflow:auto'
    });
    const panel = createElement('div', {
      style: 'width:min(720px,100%);margin:4vh auto;background:#fff;border-radius:16px;padding:20px;box-sizing:border-box;box-shadow:0 22px 60px rgba(0,0,0,.35)'
    });
    const title = createElement('h2', { id: 'testOrderPreviewTitle', style: 'margin:0 0 8px;color:#7f1d1d;font:800 20px/1.3 system-ui,sans-serif' }, 'Vista previa del pedido de prueba');
    const warning = createElement('p', { style: 'margin:0 0 14px;color:#334155;font:600 14px/1.4 system-ui,sans-serif' }, 'Este pedido no fue enviado a WhatsApp ni a ningún destinatario.');
    previewText = createElement('textarea', {
      id: 'testOrderPreviewText',
      readonly: '',
      rows: '18',
      style: 'width:100%;box-sizing:border-box;padding:12px;border:1px solid #94a3b8;border-radius:10px;background:#f8fafc;color:#0f172a;font:14px/1.45 ui-monospace,monospace;resize:vertical'
    });
    const actions = createElement('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px' });
    const copyButton = createElement('button', {
      id: 'copyTestOrderBtn',
      type: 'button',
      style: 'border:0;border-radius:9px;padding:11px 16px;background:#166534;color:#fff;font-weight:800;cursor:pointer'
    }, 'Copiar texto del pedido');
    const closeButton = createElement('button', {
      id: 'closeTestOrderPreviewBtn',
      type: 'button',
      style: 'border:1px solid #94a3b8;border-radius:9px;padding:11px 16px;background:#fff;color:#0f172a;font-weight:700;cursor:pointer'
    }, 'Cerrar');
    copyStatus = createElement('p', {
      id: 'testOrderCopyStatus',
      role: 'status',
      style: 'min-height:20px;margin:10px 0 0;color:#166534;font:700 13px/1.4 system-ui,sans-serif'
    });
    copyButton.addEventListener('click', copyPreview);
    closeButton.addEventListener('click', hidePreview);
    previewOverlay.addEventListener('click', function (event) {
      if (event.target === previewOverlay) hidePreview();
    });
    actions.append(copyButton, closeButton);
    panel.append(title, warning, previewText, actions, copyStatus);
    previewOverlay.appendChild(panel);
    document.body.appendChild(previewOverlay);

    if (contact) {
      contact.removeAttribute('href');
      contact.removeAttribute('target');
      contact.setAttribute('role', 'link');
      contact.setAttribute('aria-disabled', 'true');
      contact.title = 'Contacto comercial deshabilitado en el catálogo de prueba';
      contact.style.cursor = 'not-allowed';
      contact.style.opacity = '.55';
    }

    const originalButton = document.getElementById('sendWaBtn');
    if (originalButton) {
      const testButton = originalButton.cloneNode(false);
      testButton.id = 'sendWaBtn';
      testButton.type = 'button';
      testButton.textContent = 'Revisar pedido (no se envía)';
      testButton.setAttribute('aria-describedby', 'testModeBanner');
      originalButton.replaceWith(testButton);
      testButton.addEventListener('click', async function (event) {
        event.preventDefault();
        if (typeof root.sendWA !== 'function') {
          throw new Error('La validación real del pedido no está disponible.');
        }
        await root.sendWA();
      });
    }
  }

  function removeBlockedHref(element) {
    if (!element || element.nodeType !== 1) return;
    const candidates = [];
    if (element.matches && element.matches('a[href]')) candidates.push(element);
    if (element.querySelectorAll) candidates.push.apply(candidates, element.querySelectorAll('a[href]'));
    candidates.forEach(function (anchor) {
      const href = anchor.getAttribute('href') || '';
      if (guard.isWhatsAppTarget(href)) {
        anchor.removeAttribute('href');
        anchor.removeAttribute('target');
        anchor.setAttribute('aria-disabled', 'true');
      }
    });
  }

  function blockWhatsAppInteraction(event) {
    const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor || !guard.isWhatsAppTarget(anchor.getAttribute('href'))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showPreview('El contacto comercial está deshabilitado en este catálogo de prueba.');
  }

  const nativeOpen = typeof root.open === 'function' ? root.open.bind(root) : function () { return null; };
  root.open = guard.createOpenGuard({
    testMode: true,
    openWindow: nativeOpen,
    onPreview: function (result) { showPreview(result.message); }
  });

  document.addEventListener('click', blockWhatsAppInteraction, true);
  document.addEventListener('auxclick', blockWhatsAppInteraction, true);
  buildTestInterface();
  removeBlockedHref(document.documentElement);

  const observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      if (record.type === 'attributes') removeBlockedHref(record.target);
      record.addedNodes.forEach(removeBlockedHref);
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['href']
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
