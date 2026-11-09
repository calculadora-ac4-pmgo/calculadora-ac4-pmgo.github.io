/* Service Worker — Calculadora AC4
   Estratégia (v87): os arquivos do app vêm da cópia COMPLETA da versão instalada
   (cache primeiro). Uma versão nova é baixada inteira na instalação (addAll é tudo
   ou nada) e só passa a valer quando o usuário toca em "Atualizar agora" ou reabre
   o app. Até a v86 era network-first arquivo por arquivo: se a rede falhasse no meio
   de uma atualização, o app juntava arquivos novos com antigos do cache e podia
   nem abrir (relato do gestor no iPhone, 05/11/2026). */
const CACHE = 'ac4-v94';
const SW_VERSION = '94';
const SHELL = [
  './',
  './index.html',
  './css/styles.css?v=94',
  './js/app.js?v=94',
  './js/theme.js?v=94',
  './js/inicio-seguro.js?v=94',
  // módulos importados sem query string (resolvidos pelo import de app.js)
  './js/modules/formato.mjs',
  './js/modules/calculo.mjs',
  './js/modules/portarias.mjs',
  './js/modules/agenda.mjs',
  './js/modules/persistencia.mjs',
  './js/modules/lote.mjs',
  './js/modules/templates.mjs',
  './js/modules/relatorio.mjs',
  './js/modules/pdf.mjs',
  './js/modules/ui/dinheiro.mjs',
  './js/modules/ui/proxima-escala.mjs',
  './js/modules/ui/explicar-valor.mjs',
  './js/modules/pwa.mjs',
  './js/modules/ui/avisos.mjs',
  './js/modules/ui/observabilidade.mjs',
  './js/modules/ui/aparencia.mjs',
  './js/modules/ui/dados.mjs',
  './js/modules/ui/exportacoes.mjs',
  './js/modules/ui/compartilhar.mjs',
  './js/modules/ui/planejamento.mjs',
  './js/modules/ui/formulario.mjs',
  './js/modules/ui/modelos.mjs',
  './js/modules/ui/agenda-dias.mjs',
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

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navegação (abrir o app, inclusive com ?query) sempre recebe o index.html desta versão.
    const navegacao = request.mode === 'navigate';
    const guardado = navegacao
      ? (await cache.match('./index.html')) || (await cache.match('./'))
      : await cache.match(request);
    if (guardado) return guardado;
    // Fora da cópia da versão (1ª visita, arquivo novo): busca na rede e guarda.
    try {
      const resp = await fetch(request, { cache: 'no-cache' });
      if (resp.ok) await cache.put(request, resp.clone());
      return resp;
    } catch {
      return Response.error();
    }
  })());
});
