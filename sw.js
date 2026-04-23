/*
  ╔══════════════════════════════════════════════════════════════╗
  ║  NEURAL SYNC — Service Worker                               ║
  ║                                                              ║
  ║  🎓 What is a Service Worker?                               ║
  ║  A service worker is a JavaScript file that runs in the     ║
  ║  background, separate from the web page itself.             ║
  ║  It sits between the browser and the network, acting as     ║
  ║  a programmable proxy. This gives us three superpowers:     ║
  ║                                                              ║
  ║  1. OFFLINE PLAY — intercepts network requests and          ║
  ║     serves cached files even with no internet.              ║
  ║                                                              ║
  ║  2. INSTANT LOAD — cached files load from disk, not         ║
  ║     the network — the game opens in milliseconds.           ║
  ║                                                              ║
  ║  3. AUTO-UPDATE — when you publish a new version the        ║
  ║     SW detects the changed cache name, downloads the        ║
  ║     update silently, and activates it on next launch.       ║
  ║                                                              ║
  ║  UPDATE FLOW:                                               ║
  ║  Bump CACHE_NAME (e.g. v1 → v2) whenever you publish       ║
  ║  a new version. The old cache is deleted automatically.     ║
  ╚══════════════════════════════════════════════════════════════╝
*/

const CACHE_NAME = 'neural-sync-v1';

/*
  Files to pre-cache on install.
  '.' caches the root page (index / the HTML file itself).
  We also cache the Google Fonts so they work offline.
*/
const PRECACHE = [
  '.',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap',
  'https://fonts.gstatic.com/s/orbitron/v31/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6BoWgz.woff2',
  'https://fonts.gstatic.com/s/sharetechmono/v15/J7aHnp1uDWRBEqV98dVQztYldFc7pAsEIc3Xew.woff2',
];

/* ── INSTALL: pre-cache everything ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())   // activate immediately, don't wait
  );
});

/* ── ACTIVATE: delete any old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)   // keep only current cache
          .map(k => caches.delete(k))       // delete all old ones
      )
    ).then(() => self.clients.claim())      // take control of all open tabs
  );
});

/*
  ── FETCH: Cache-First with Network Fallback ──

  Strategy:
    1. Check cache first — if found, return instantly (offline works!)
    2. If not in cache, try the network
    3. Cache the network response for next time
    4. If network also fails, return a friendly offline response

  This is called the "Stale-While-Revalidate" pattern for pages
  and "Cache-First" for assets — the standard for game PWAs.
*/
self.addEventListener('fetch', event => {
  // Only handle GET requests — skip POST etc.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;   // ✓ serve from cache

      // Not in cache — fetch from network and cache the result
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'error')
            return response;

          // Clone: response body can only be read once, so we need two copies
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Network failed AND not in cache — offline fallback
          if (event.request.destination === 'document') {
            return caches.match('./neural_sync_game.html');
          }
        });
    })
  );
});

/*
  ── MESSAGE: force update from the app ──
  The app can send { action: 'skipWaiting' } to trigger an
  immediate update without waiting for the tab to close.
*/
self.addEventListener('message', event => {
  if (event.data?.action === 'skipWaiting') self.skipWaiting();
});
