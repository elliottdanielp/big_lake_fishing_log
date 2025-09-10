const CACHE_NAME = 'blfl-shell-v3';
const PRECACHE_URLS = [
  'index.html',
  'reel-record.html',
  'Fishing_Log.html',
  'README.md',
  'Link.txt',
  'manifest.json',
  'icon-192.svg',
  'icon-512.svg',
  // App icons (png) commonly referenced by manifest on some platforms
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Add each asset individually and ignore failures (e.g., optional images not present)
    await Promise.allSettled(PRECACHE_URLS.map(async (url) => {
      try {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (resp && resp.ok) {
          await cache.put(url, resp.clone());
        }
      } catch (e) {
        // ignore missing/failed fetches to keep install resilient
      }
    }));
  })());
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

  // Navigation requests: network-first with short timeout, fallback to cached index.html
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedIndex = await cache.match('index.html');

      // Kick off network fetch that also updates cache when it completes
      const networkFetch = fetch(req).then(async (networkResp) => {
        try { await cache.put(req, networkResp.clone()); } catch (e) { /* ignore cache put errors */ }
        return networkResp;
      }).catch(() => null);

      // If network is slow, fall back to cached index after timeout (ms)
      const TIMEOUT_MS = 2500;
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_MS));

      // Race network vs timeout
      const fastResp = await Promise.race([networkFetch, timeoutPromise]);
      if (fastResp) return fastResp;

      // Network didn't respond quickly — return cached shell if available and update cache in background
      if (cachedIndex) {
        // ensure the network fetch still runs in background to refresh cache
        networkFetch.then(()=>{});
        return cachedIndex;
      }

      // No cached shell — wait for network (or fail)
      const finalNetwork = await networkFetch;
      if (finalNetwork) return finalNetwork;
      // As a last resort return a simple 503 response
      return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
    })());
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
