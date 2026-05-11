// Service worker: cache Google 3D Tiles locally so they are never re-fetched.
// Cache key = URL path only (strips key/session query params because tile
// content at a given path is immutable).

const CACHE = 'hannover-tiles-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (!url.includes('tile.googleapis.com')) return; // only intercept tile requests

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      // Normalize cache key: path only, no key/session params
      const parsed  = new URL(url);
      const cacheKey = parsed.origin + parsed.pathname;

      const hit = await cache.match(cacheKey);
      if (hit) {
        return hit; // serve from cache — no network request
      }

      // Not cached yet: fetch from network and store
      const response = await fetch(event.request);
      if (response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    })
  );
});
