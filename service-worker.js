const CACHE_NAME = 'blfl-shell-v1';
const PRECACHE_URLS = [
  'index.html',
  'Fishing_Log.html',
  'README.md',
  'Link.txt'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => { if (key !== CACHE_NAME) return caches.delete(key); })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // only handle GET
  const url = new URL(req.url);

  // Navigation requests: network-first, fallback to cached index.html
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return response;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Same-origin resources: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(response => {
        caches.open(CACHE_NAME).then(cache => cache.put(req, response.clone()));
        return response;
      }))
    );
    return;
  }

  // Cross-origin (APIs): try network then fallback to cache if available
  event.respondWith(
    fetch(req).then(resp => resp).catch(() => caches.match(req))
  );
});
