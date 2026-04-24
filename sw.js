/*
  ╔══════════════════════════════════════════════════════════════╗
  ║  NEURAL SYNC — Service Worker  (v2 — Resilient)             ║
  ║                                                              ║
  ║  WHY THE FIRST VERSION FAILED OFFLINE:                      ║
  ║  cache.addAll() is all-or-nothing. If even ONE URL in       ║
  ║  the list fails (e.g. a Google Fonts URL that changed),     ║
  ║  the entire install fails silently — nothing gets cached    ║
  ║  and the app can't open offline.                            ║
  ║                                                              ║
  ║  THE FIX — two changes:                                     ║
  ║  1. Cache each file individually with try/catch so one      ║
  ║     failure can't kill the whole install.                   ║
  ║  2. Remove external font URLs from precache — the fetch     ║
  ║     handler caches them automatically on first request.     ║
  ║                                                              ║
  ║  TO PUSH AN UPDATE TO PLAYERS:                              ║
  ║  Change 'neural-sync-v2' to 'neural-sync-v3' (or any new   ║
  ║  name). Players see the UPDATE banner automatically.        ║
  ╚══════════════════════════════════════════════════════════════╝
*/

const CACHE_NAME = 'neural-sync-v2';

const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
];

const OPTIONAL_FILES = [
  './icon-192.png',
  './icon-512.png',
  './sw.js',
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache each file individually — one failure won't abort the rest
      for (const url of CORE_FILES) {
        try {
          await cache.add(url);
          console.log('[SW] Cached:', url);
        } catch (err) {
          console.warn('[SW] Could not cache:', url, err.message);
        }
      }
      for (const url of OPTIONAL_FILES) {
        try { await cache.add(url); } catch (_) {}
      }
      console.log('[SW] Install complete — offline ready');
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: remove old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH: Cache-First, auto-cache new resources ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  if (!url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Serve from cache instantly if available
      if (cached) return cached;

      // Not cached — go to network and cache the result
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'error')
            return response;
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone))
            .catch(() => {});
          return response;
        })
        .catch(() => {
          // Offline + not cached — serve the game shell for page navigations
          if (event.request.destination === 'document' || event.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
          return new Response('', { status: 503 });
        });
    })
  );
});

/* ── MESSAGE: trigger immediate update ── */
self.addEventListener('message', event => {
  if (event.data?.action === 'skipWaiting') self.skipWaiting();
});
