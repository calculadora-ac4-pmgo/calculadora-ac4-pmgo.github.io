/* Força atualização do Service Worker para a v65.
   Roda antes de app.js (script clássico, sem defer) para desregistrar
   qualquer worker antigo antes que app.js registre o novo. Executa uma
   única vez por versão via flag em localStorage, evitando desregistrar
   o SW a cada carregamento. */
(() => {
  const VERSAO = '65';
  const CHAVE_FORCADA = 'pmgoForceUpdateV65';
  const CHAVE_NOVIDADES = 'pmgoNovidadesVistas';

  try {
    if (localStorage.getItem(CHAVE_FORCADA) !== VERSAO) {
      localStorage.removeItem(CHAVE_NOVIDADES);
      localStorage.setItem(CHAVE_FORCADA, VERSAO);

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registros) => registros.forEach((registro) => registro.unregister()))
          .catch(() => {});
      }
    }
  } catch {
    /* localStorage indisponível (modo privado etc.): app segue sem forçar. */
  }

  fetch(`./manifest.webmanifest?v=${VERSAO}`, { cache: 'reload' }).catch(() => {});
})();
