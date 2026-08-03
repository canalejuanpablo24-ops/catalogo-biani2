// GitHub Pages catalog: remove legacy PWA caches and then unregister.
const CLEANUP_VERSION = '2026-08-03-01';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'CATALOG_CACHE_CLEARED', version: CLEANUP_VERSION });
    }

    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
