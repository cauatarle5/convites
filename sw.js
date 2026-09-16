/* =============================================================================
 * sw.js — Service Worker da Prep ANPD (PWA offline).
 * -----------------------------------------------------------------------------
 * Estratégia: precache do app shell no install; no fetch, stale-while-revalidate
 * para GET same-origin (serve do cache e atualiza em segundo plano); navegação
 * offline cai no index.html cacheado. Recursos cross-origin (Google Fonts, o
 * backend de IA) NÃO são interceptados — vão direto para a rede.
 *
 * Bump CACHE ao mudar assets para invalidar o cache antigo.
 * ============================================================================= */
const CACHE = 'prep-anpd-v1';

const ASSETS = [
  './', './index.html', './app.css', './manifest.webmanifest',
  './src/app.js', './src/store.js', './src/srs.js', './src/priority.js',
  './src/scheduler.js', './src/views.js', './src/ui.js', './src/caderno.js',
  './src/migracao.js', './src/ia.js', './src/seed_content.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falha tudo se um recurso faltar; adicionamos tolerando ausências.
    await Promise.all(ASSETS.map(async (u) => {
      try { await cache.add(new Request(u, { cache: 'reload' })); } catch { /* ignora */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: rede direta
  if (url.pathname.startsWith('/api/')) return;    // backend de IA: nunca cachear

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    // stale-while-revalidate
    if (cached) { network; return cached; }
    const res = await network;
    if (res) return res;
    // navegação offline sem cache específico -> index.html
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
