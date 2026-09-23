/* Limpeza única ao chegar numa versão nova: desregistra Service Workers
   antigos, apaga caches de versões anteriores e recarrega a página uma vez.
   Roda só em HTTPS (igual ao registro do SW em app.js) e só uma vez por
   versão, marcada em localStorage — sem ciclo de recarregamento. */
(() => {
  const VERSAO = '68';
  const CACHE_ATUAL = 'ac4-v68';
  const CHAVE = 'pmgoForceUpdate';
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  try { if (localStorage.getItem(CHAVE) === VERSAO) return; } catch { return; }

  const limparCaches = () => ('caches' in window
    ? window.caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('ac4-') && k !== CACHE_ATUAL).map((k) => window.caches.delete(k))))
    : Promise.resolve([]));

  Promise.all([
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister()))),
    limparCaches(),
  ]).then(([desregistrados, apagados]) => {
    try {
      localStorage.setItem(CHAVE, VERSAO);
      localStorage.removeItem('pmgoNovidadesVistas');
    } catch { return; }
    // Recarrega só se havia algo antigo a remover.
    if (desregistrados.some(Boolean) || apagados.some(Boolean)) location.reload();
  }).catch((e) => console.error('AC4: falha na limpeza de atualização', e));
})();
