// cqrTalk Service Worker - Offline Shell & Cache
const CACHE_NAME = 'cqrtalk-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/apple-touch-icon.png'
];

// Keep runtime-cached entries (per-deploy hashed assets) bounded so the cache
// can never grow without limit across deployments.
const MAX_RUNTIME_ENTRIES = 60;

function trimRuntimeCache() {
  caches.open(CACHE_NAME).then((cache) => {
    return cache.keys();
  }).then((keys) => {
    const keepPaths = new Set(STATIC_ASSETS.map((p) => {
      try { return new URL(p, self.location.origin).pathname; } catch { return p; }
    }));
    const runtimeKeys = keys.filter((req) => {
      try { return !keepPaths.has(new URL(req.url).pathname); } catch { return true; }
    });
    const overflow = runtimeKeys.length - MAX_RUNTIME_ENTRIES;
    if (overflow > 0) {
      return caches.open(CACHE_NAME).then((cache) => {
        return Promise.all(runtimeKeys.slice(0, overflow).map((req) => cache.delete(req)));
      });
    }
  }).catch(() => {});
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Same-origin only
  if (url.origin !== self.location.origin) {
    return;
  }

  // Bypass WebSockets and API requests
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || event.request.headers.get('upgrade') === 'websocket') {
    return;
  }

  // Handle navigations with Network-First, falling back to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => {
        return caches.match('/index.html').then((cached) => cached || caches.match('/'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate for assets
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            trimRuntimeCache();
          }
        }).catch(() => {/* ignore offline fetch error */});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
          trimRuntimeCache();
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for navigation requests handled above; non-navigations fail
        return Response.error();
      });
    })
  );
});
