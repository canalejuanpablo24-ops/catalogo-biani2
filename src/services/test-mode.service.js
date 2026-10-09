(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BianiTestMode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function testModeFactory() {
  'use strict';

  const BLOCKED_WEB_HOSTS = new Set(['wa.me', 'api.whatsapp.com']);

  function isWhatsAppTarget(value) {
    const target = String(value == null ? '' : value).trim();
    if (!target) return false;
    if (/^whatsapp:(?:\/\/)?/i.test(target)) return true;
    try {
      const url = new URL(target, 'https://catalogo-biani.invalid/');
      return (url.protocol === 'http:' || url.protocol === 'https:') &&
        BLOCKED_WEB_HOSTS.has(url.hostname.toLowerCase());
    } catch (error) {
      return false;
    }
  }

  function extractOrderText(value) {
    const target = String(value == null ? '' : value).trim();
    if (!isWhatsAppTarget(target)) return '';
    try {
      return new URL(target, 'https://catalogo-biani.invalid/').searchParams.get('text') || '';
    } catch (error) {
      return '';
    }
  }

  function createOpenGuard(options) {
    const settings = options || {};
    const testMode = settings.testMode === true;
    const nativeOpen = typeof settings.openWindow === 'function'
      ? settings.openWindow
      : function () { return null; };
    const onPreview = typeof settings.onPreview === 'function'
      ? settings.onPreview
      : function () {};

    return function guardedOpen(target) {
      const args = Array.prototype.slice.call(arguments, 1);
      if (testMode && isWhatsAppTarget(target)) {
        onPreview({
          target: String(target == null ? '' : target),
          message: extractOrderText(target)
        });
        return null;
      }
      return nativeOpen.apply(this, [target].concat(args));
    };
  }

  return Object.freeze({
    isWhatsAppTarget: isWhatsAppTarget,
    extractOrderText: extractOrderText,
    createOpenGuard: createOpenGuard
  });
});
