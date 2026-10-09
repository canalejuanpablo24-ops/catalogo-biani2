import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/services/test-mode.service.js');

const service = globalThis.BianiTestMode;

test('reconoce todos los destinos de WhatsApp y no bloquea otros destinos', () => {
  assert.equal(service.isWhatsAppTarget('https://wa.me/5492954324063?text=hola'), true);
  assert.equal(service.isWhatsAppTarget('https://api.whatsapp.com/send?text=hola'), true);
  assert.equal(service.isWhatsAppTarget('whatsapp://send?text=hola'), true);
  assert.equal(service.isWhatsAppTarget('WHATSAPP:send?text=hola'), true);
  assert.equal(service.isWhatsAppTarget('https://example.com/wa.me/5492'), false);
  assert.equal(service.isWhatsAppTarget('/catalogo'), false);
});

test('TEST_MODE intercepta WhatsApp, conserva el mensaje y nunca llama a window.open', () => {
  const opened = [];
  const previews = [];
  const guardedOpen = service.createOpenGuard({
    testMode: true,
    openWindow: function () { opened.push(Array.from(arguments)); },
    onPreview: preview => previews.push(preview)
  });

  const result = guardedOpen('https://wa.me/5492954324063?text=Pedido%20de%20prueba', '_blank');

  assert.equal(result, null);
  assert.deepEqual(opened, []);
  assert.equal(previews.length, 1);
  assert.equal(previews[0].message, 'Pedido de prueba');
});

test('fuera de TEST_MODE conserva la apertura de producción sin cambiar argumentos', () => {
  const opened = [];
  const guardedOpen = service.createOpenGuard({
    testMode: false,
    openWindow: function () {
      opened.push(Array.from(arguments));
      return 'production-window';
    },
    onPreview: () => assert.fail('No debe mostrar vista previa fuera de TEST_MODE')
  });

  const result = guardedOpen('https://wa.me/5492954324063?text=Pedido', '_blank');

  assert.equal(result, 'production-window');
  assert.deepEqual(opened, [['https://wa.me/5492954324063?text=Pedido', '_blank']]);
});

test('la configuración de prueba es fija y no consulta parámetros de URL', async () => {
  const { readFile } = await import('node:fs/promises');
  const [config, controller, html] = await Promise.all([
    readFile(new URL('../src/config/runtime.config.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/test-mode.controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);

  assert.match(config, /TEST_MODE:\s*true/);
  assert.match(config, /Object\.freeze/);
  assert.match(config, /writable:\s*false/);
  assert.match(config, /configurable:\s*false/);
  assert.doesNotMatch(config + controller, /location\.search|URLSearchParams/);
  assert.match(controller, /CATÁLOGO DE PRUEBA — PEDIDOS NO ENVIADOS/);
  assert.doesNotMatch(html, /<a\s+href=["'](?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com)|<a\s+href=["']whatsapp:/i);
});
