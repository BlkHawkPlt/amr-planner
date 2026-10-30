/* Offline cache. Cache-first for the app shell + data, with three safeguards so a new release always replaces an old one:
 *   1. the cache name is stamped with the commit id on every deploy (a fresh cache per release);
 *   2. the new cache is filled with cache:'reload' requests (GitHub Pages sends max-age=600, so a plain fetch could copy STALE files from the browser's HTTP cache into the new cache);
 *   3. when a new worker takes over from an older release it reloads every open window, so an app left open (or installed on the home screen) switches to the new version by itself.
 * version.json is never cached: the page compares it with its own build to show "Update available". States with "pre": false in data/manifest.json are cached only when first opened. */
const CACHE = 'amr-planner-v1.5.0';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/version.js', 'js/model.js', 'js/ops.js', 'js/scripts.js', 'js/dd1801.js', 'js/forms.js', 'js/data.js', 'js/app.js',
  'vendor/pdf-lib.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'forms/fields.json', 'forms/dd1801.pdf', 'forms/dd1801c.pdf', 'forms/dd175.pdf', 'forms/dd175-1.pdf',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png', 'data/manifest.json', 'data/static.json'];
const fresh = u => new Request(u, { cache: 'reload' });
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL.map(fresh));
    try {                                   // precache every data file listed in the manifest
      const man = await (await fetch('data/manifest.json', { cache: 'reload' })).json();
      const urls = []; man.cycles.forEach(cy => Object.values(cy.states).forEach(s => { if (s.pre !== false) urls.push(s.url); }));
      await c.addAll(urls.map(fresh));
    } catch (err) { /* data will be cached on first use */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter(k => k !== CACHE && k.startsWith('amr-planner-'));
    for (const k of old) await caches.delete(k);
    await self.clients.claim();
    if (old.length) {                       // upgrade from an older release: switch every open window to the new files
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach(c => { try { c.navigate(c.url); } catch (err) { /* page will update on its next launch */ } });
    }
  })());
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url); if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('/version.json')) { e.respondWith(fetch(r, { cache: 'no-store' })); return; }
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(r, { ignoreSearch: true });
    if (hit) return hit;
    try { const res = await fetch(r); if (res.ok) c.put(r, res.clone()); return res; }
    catch (err) { if (r.mode === 'navigate') return c.match('index.html'); throw err; }
  })());
});
