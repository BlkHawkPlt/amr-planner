/* Offline cache. Cache-first for app shell + data. The deploy workflow rewrites CACHE with the commit id on every deploy, so each release gets a fresh cache. States with "pre": false in data/manifest.json are cached only when first opened. */
const CACHE = 'amr-planner-v1.0.0';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/model.js', 'js/scripts.js', 'js/dd1801.js', 'js/forms.js', 'js/data.js', 'js/app.js',
  'vendor/pdf-lib.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'forms/fields.json', 'forms/dd1801.pdf', 'forms/dd1801c.pdf', 'forms/dd175.pdf', 'forms/dd175-1.pdf', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png', 'data/manifest.json', 'data/static.json'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    try {                                   // precache every data file listed in the manifest
      const man = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
      const urls = []; man.cycles.forEach(cy => Object.values(cy.states).forEach(s => { if (s.pre !== false) urls.push(s.url); }));
      await c.addAll(urls);
    } catch (err) { /* data will be cached on first use */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('amr-planner-')) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(r, { ignoreSearch: true });
    if (hit) return hit;
    try { const res = await fetch(r); if (res.ok) (await caches.open(CACHE)).put(r, res.clone()); return res; }
    catch (err) { if (r.mode === 'navigate') return caches.match('index.html'); throw err; }
  })());
});
