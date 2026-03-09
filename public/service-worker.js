const CACHE_NAME = 'bigasan-pos-v1';
const APP_SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/assets/logo.jpg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const isNavigate = request.mode === 'navigate';
  if (isNavigate) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/index.html')) || cache.match('/offline.html');
        })
    );
    return;
  }

  const url = new URL(request.url);
  const isStaticAsset = ['style', 'script', 'image', 'font'].includes(request.destination);
  const isSameOrigin = url.origin === self.location.origin;
  const isKnownCdn =
    url.origin.includes('cdnjs.cloudflare.com') ||
    url.origin.includes('cdn.jsdelivr.net') ||
    url.origin.includes('fonts.googleapis.com') ||
    url.origin.includes('fonts.gstatic.com');

  if (isStaticAsset || isSameOrigin || isKnownCdn) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            return response;
          })
          .catch(() => null);
      })
    );
  }
});
