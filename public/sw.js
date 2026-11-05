// Service worker of the installable app. `sw-manifest.js` is written by the build
// (scripts/pwaPlugin.ts) and sets `self.precache` to `{ version, files }`.
importScripts('sw-manifest.js');

const { version, files } = self.precache;
const CACHE = `mini-painter-${version}`;
const scopeUrl = (file) => new URL(file, self.registration.scope).href;

// `reload` skips the HTTP cache. Pages caches files for minutes, so a stale index.html
// could point at the last deploy's bundles, which the server no longer has.
const fresh = (file) => new Request(scopeUrl(file), { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(files.map(fresh))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('mini-painter-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

// The page decides when a waiting version takes over (see state/serviceWorkerSource.ts).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  // Every page of the app is index.html; the cached one works offline.
  const key = request.mode === 'navigate' ? scopeUrl('./') : request.url;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? fetch(request)),
  );
});
