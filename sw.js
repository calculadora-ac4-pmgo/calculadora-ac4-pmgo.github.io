/* Service Worker — Calculadora AC4
   Estratégia: network-first para o app shell (atualizações chegam rápido),
   com fallback ao cache quando offline. */
const CACHE = 'ac4-v67';
const SW_VERSION = '67';
const SHELL = [
  './',
  './index.html',
  './css/styles.css?v=67',
  './js/app.js?v=67',
  './js/theme.js?v=67',
  './js/force-update.js?v=67',
  // módulos importados sem query string (resolvidos pelo import de app.js)
  './js/modules/formato.mjs',
  './js/modules/calculo.mjs',
  './js/modules/agenda.mjs',
  './js/modules/persistencia.mjs',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-maskable.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/fonts/inter-latin.woff2',
  './assets/fonts/inter-latin-ext.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' ignora o cache HTTP e busca direto do servidor,
      // evitando misturar versões de HTML e JS/CSS.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

/* A nova versão aguarda o comando explícito da interface. Isso evita
   recarregar o aplicativo enquanto uma escala ainda está sendo preenchida. */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: SW_VERSION });
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Requisições de terceiros, se introduzidas no futuro, não são interceptadas.
  if (new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(async (resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          const cache = await caches.open(CACHE);
          await cache.put(request, clone);
        }
        return resp;
      })
      .catch(() =>
        caches.match(request).then((hit) => {
          if (hit) return hit;
          // Fallback de index só para navegação — devolver HTML no lugar
          // de CSS/JS quebraria a página.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
