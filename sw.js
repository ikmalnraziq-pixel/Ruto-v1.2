// Service Worker: app shell offline. Panggilan API (AI & Google) tidak pernah di-cache.
const VER = 'ruto-ai-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/main.css', 'icons/icon.svg',
  'js/main.js', 'js/config.js', 'js/util.js', 'js/icons.js', 'js/i18n.js', 'js/md.js', 'js/db.js',
  'js/crypto.js', 'js/vault.js', 'js/providers.js', 'js/google.js', 'js/sync.js', 'js/theme-init.js',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !FONT_HOSTS.includes(url.hostname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VER);
    const hit = await cache.match(req, { ignoreSearch: false });
    const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
    return Response.error();
  })());
});
