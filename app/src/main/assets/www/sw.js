// Codebreaker service worker: offline app shell + turn-alert notifications.
const CACHE = 'cb-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './fonts/space-grotesk-latin-600-normal.woff2', './fonts/space-grotesk-latin-700-normal.woff2',
  './fonts/jetbrains-mono-latin-700-normal.woff2', './fonts/jetbrains-mono-latin-800-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first (so updates show up straight away), falling back to the cache when offline.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const r = await Promise.race([fetch(e.request), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
      if (r.ok) { const c = await caches.open(CACHE); c.put(e.request, r.clone()); }
      return r;
    } catch (err) {
      return (await caches.match(e.request, { ignoreSearch: true })) || caches.match('./index.html');
    }
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(w => w.postMessage({ refresh: true }));
    await self.registration.showNotification(d.title || 'Codebreaker', {
      body: d.body || "It's your move!", tag: d.tag, renotify: true,
      icon: 'icon-192.png', badge: 'icon-192.png', data: { game: d.game }
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const g = e.notification.data && e.notification.data.game;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { w.postMessage({ open: g }); return w.focus(); }
    return self.clients.openWindow('./' + (g ? '#g=' + g : ''));
  })());
});
