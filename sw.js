self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Delete ALL old caches created by previous PWA versions
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      // Unregister this service worker permanently
      return self.registration.unregister();
    }).then(() => {
      // Claim all clients immediately so we can force them to reload
      return self.clients.claim();
    }).then(() => {
      // The holy grail: tell all open windows controlled by this SW to hard reload!
      return self.clients.matchAll({ type: 'window' }).then(windowClients => {
        windowClients.forEach(client => {
          client.navigate(client.url);
        });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests to network, preventing any caching
  event.respondWith(fetch(event.request, { cache: 'reload' }).catch(() => fetch(event.request)));
});
