// Network-first for the app shell so updates arrive when online; cache fallback keeps it working offline.
const V = 'hf-v3';
const SHELL = ['./', './index.html', './app.js', './core.js', './vendor/supabase.js', './i18n/sk.yml', './i18n/cs.yml', './styles.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;   // Supabase API calls go straight to the network
  // always revalidate with the server (no stale HTTP cache after an update); offline → cached copy
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request.url, { cache: 'no-cache' });
  e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
