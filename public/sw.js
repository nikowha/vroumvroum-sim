// Service worker minimal : réseau d'abord (toujours la dernière version), cache en secours hors ligne.
// Nécessaire pour que l'app soit installable (PWA) sur Windows 11 / iPad.

const CACHE_NAME = 'vroumvroum-sim-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (activateEvent) => activateEvent.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (fetchEvent) => {
  const request = fetchEvent.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  fetchEvent.respondWith(
    fetch(request)
      .then((networkResponse) => {
        const responseCopy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        return networkResponse;
      })
      .catch(() => caches.match(request).then((cachedResponse) => cachedResponse ?? Response.error())),
  );
});
