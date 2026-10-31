// Keeps the buddies working offline and opening instantly: the page is fetched fresh when there's a connection,
// everything else (versioned with ?v=) comes from the cache. A new VERSION means a new cache.
const CACHE = 'buddies-%VERSION%';
const CORE = ['./', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png',
  'meshes.bin?v=%VERSION%', 'scene.js?v=%VERSION%', 'shell.js?v=%VERSION%'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('buddies-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // weather and place search go straight to the network
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return r; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  })));
});
