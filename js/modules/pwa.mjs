/* ==========================================================================
   Calculadora AC4 — módulo da PWA (atualização segura e instalação)
   - Atualização: o SW novo espera; o banner "Nova versão" pede confirmação e
     só então envia SKIP_WAITING. Nunca recarrega sozinho (ver v69).
   - Instalação: prompt nativo (Android/Chrome) ou instrução manual (iOS),
     oferecida só a usuários engajados.
   Estado próprio (worker em espera, prompt adiado) fica encapsulado aqui.
   ========================================================================== */

/**
 * Cria os controladores da PWA.
 * @param {Object} ctx Dependências de app.js: $, on, toast, dialogConfirmar, haptic,
 *   APP_VERSION, STORAGE, lerLocal, ambienteDeTeste, ehIOS, rodandoInstalado e
 *   totalEscalas() (quantidade de escalas salvas).
 * @returns {{initAtualizacoesPWA:Function, initPWA:Function, mostrarInstalacaoAposConversao:Function}}
 */
export function criarPWA(ctx) {
  const { $, on, toast, dialogConfirmar, haptic, APP_VERSION, STORAGE, lerLocal,
    ambienteDeTeste, ehIOS, rodandoInstalado, totalEscalas } = ctx;
  let deferredInstallPrompt = null;
  let workerAtualizacao = null;
  let atualizacaoPendente = false;
  let recarregandoPorAtualizacao = false;
  let mostrarAposConversao = () => {};

  /* -------------------------------------------- atualização segura da PWA */
  function exibirBannerAtualizacao(worker) {
    if (!worker) return;
    workerAtualizacao = worker;
    atualizacaoPendente = true;
    $('pwaBanner')?.classList.add('hidden');
    $('updateBanner')?.classList.remove('hidden', 'is-updating');
    const btn = $('updateNow');
    if (btn) { btn.disabled = false; btn.textContent = 'Atualizar agora'; }
  }

  function ocultarBannerAtualizacao() {
    $('updateBanner')?.classList.add('hidden');
  }

  function aplicarAtualizacaoPWA() {
    if (!workerAtualizacao || recarregandoPorAtualizacao) return;
    recarregandoPorAtualizacao = true;
    $('updateBanner')?.classList.add('is-updating');
    const btn = $('updateNow');
    if (btn) { btn.disabled = true; btn.textContent = 'Atualizando…'; }
    workerAtualizacao.postMessage({ type: 'SKIP_WAITING' });

    /* Rede ou navegador podem atrasar a troca do worker. O usuário recupera o
       controle sem entrar em ciclo de recarregamento. */
    setTimeout(() => {
      if (!recarregandoPorAtualizacao) return;
      recarregandoPorAtualizacao = false;
      $('updateBanner')?.classList.remove('is-updating');
      if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
      toast('Não foi possível aplicar agora. Tente novamente.', { erro: true });
    }, 8000);
  }

  function consultarVersaoWorker(worker) {
    return new Promise((resolve) => {
      if (typeof globalThis.MessageChannel !== 'function') { resolve(null); return; }
      const canal = new globalThis.MessageChannel();
      const limite = setTimeout(() => resolve(null), 1200);
      canal.port1.onmessage = (event) => {
        clearTimeout(limite);
        resolve(String(event.data?.version || '') || null);
      };
      try { worker.postMessage({ type: 'GET_VERSION' }, [canal.port2]); }
      catch { clearTimeout(limite); resolve(null); }
    });
  }

  async function avaliarWorkerAtualizacao(worker) {
    if (!worker) return;
    const versaoWorker = await consultarVersaoWorker(worker);
    if (versaoWorker === APP_VERSION) {
      /* A página atual já pertence à mesma versão. Ativa apenas o cache novo,
         sem aviso ou reload redundante. */
      worker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    exibirBannerAtualizacao(worker);
  }

  async function initAtualizacoesPWA() {
    on('updateNow', 'click', aplicarAtualizacaoPWA);
    on('updateLater', 'click', ocultarBannerAtualizacao);

    /* Gancho restrito ao ambiente local para validar a interface sem instalar
       um Service Worker real durante os testes HTTP. */
    if (ambienteDeTeste) {
      window.__ac4SimularAtualizacao = () => exibirBannerAtualizacao({
        postMessage: (mensagem) => { window.__ac4UltimaMensagemSW = mensagem; },
      });
    }

    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!recarregandoPorAtualizacao) return;
      recarregandoPorAtualizacao = false;
      window.location.reload();
    });

    try {
      const registro = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const acompanharInstalacao = (worker) => {
        if (!worker) return;
        if (worker.state === 'installed') { avaliarWorkerAtualizacao(worker); return; }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) avaliarWorkerAtualizacao(worker);
        });
      };

      if (registro.waiting && navigator.serviceWorker.controller) avaliarWorkerAtualizacao(registro.waiting);
      registro.addEventListener('updatefound', () => acompanharInstalacao(registro.installing));
      acompanharInstalacao(registro.installing);

      const verificar = () => registro.update().catch(() => {});
      verificar();
      window.addEventListener('online', verificar);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) verificar(); });
    } catch {
      /* Offline ou navegador sem suporte completo: o app segue pelo cache. */
    }
  }

  /* -------------------------------------------- PWA install prompt */
  function initPWA() {
    if (rodandoInstalado()) return;

    const dismissed = lerLocal(STORAGE.pwaBanner);
    const isIOS = ehIOS();
    let visitas = Number(lerLocal(STORAGE.pwaVisitas) || 0) + 1;
    if (!Number.isFinite(visitas)) visitas = 1;
    try { localStorage.setItem(STORAGE.pwaVisitas, String(Math.min(visitas, 99))); } catch {}
    let usuarioEngajado = visitas >= 2 || totalEscalas() > 0;

    const mostrarBotaoInstalar = () => $('shareInstallOpt')?.classList.remove('hidden');
    const ocultarBotaoInstalar = () => $('shareInstallOpt')?.classList.add('hidden');

    /* Entrada de instalação sempre disponível via Compartilhar → Instalar,
       em qualquer navegador/sistema que ainda não esteja rodando instalado. */
    mostrarBotaoInstalar();

    const instrucaoManual = () => dialogConfirmar(
      isIOS
        ? 'No Safari: toque em ⬆︎ Compartilhar e depois em “Adicionar à Tela de Início” para instalar o app.'
        : 'Para instalar: abra o menu do navegador (⋮) e toque em “Instalar app” ou “Adicionar à tela inicial”.',
      { textoOk: 'Entendi', perigoso: false }
    );

    async function instalar() {
      /* Android/Chrome: usa o prompt nativo quando disponível. */
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (outcome === 'accepted') {
          ocultarBotaoInstalar();
          $('pwaBanner')?.classList.add('hidden');
          toast('App instalado! Acesse pela tela inicial.');
        }
        return;
      }
      /* iOS e demais casos sem prompt nativo: instrução passo a passo. */
      await instrucaoManual();
    }

    /* A promoção não interrompe a primeira jornada. Ela aparece na segunda
       visita, para quem já tem escalas ou após o primeiro lançamento. */
    const mostrarBannerSeRelevante = () => {
      if (dismissed || !usuarioEngajado || atualizacaoPendente) return;
      if (isIOS || deferredInstallPrompt) $('pwaBanner')?.classList.remove('hidden');
    };
    mostrarAposConversao = () => {
      usuarioEngajado = true;
      mostrarBannerSeRelevante();
    };
    mostrarBannerSeRelevante();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      mostrarBannerSeRelevante();
      mostrarBotaoInstalar();
    });

    on('shareInstallOpt', 'click', () => { $('dialogShare')?.close(); haptic(10); instalar(); });
    on('pwaBannerInstall', 'click', instalar);
    on('pwaBannerClose', 'click', () => {
      $('pwaBanner')?.classList.add('hidden');
      try { localStorage.setItem(STORAGE.pwaBanner, '1'); } catch { /* banner apenas não persistirá */ }
    });
  }

  return {
    initAtualizacoesPWA,
    initPWA,
    mostrarInstalacaoAposConversao: () => mostrarAposConversao(),
  };
}
