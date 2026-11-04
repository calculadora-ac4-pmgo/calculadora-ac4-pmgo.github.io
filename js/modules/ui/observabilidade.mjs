/* ==========================================================================
   Calculadora AC4 — observabilidade local (v74)
   Log anônimo de erros no aparelho (máx. 20, sem dados pessoais), aviso
   discreto ao usuário e ganchos de suporte (__ac4Erros, __ac4LimparErros,
   __ac4Version). Também registra a versão anterior em estado.versaoAnterior.
   ========================================================================== */

/**
 * Cria a observabilidade.
 * @param {Object} ctx Dependências de app.js: STORAGE, APP_VERSION, estado, toast.
 * @returns {{registrarErro:Function, initObservabilidade:Function}}
 */
export function criarObservabilidade(ctx) {
  const { STORAGE, APP_VERSION, estado, toast } = ctx;

  /* ------------------------------------------------ observabilidade
     Captura erros de JS não tratados e rejeições de Promise para (a) avisar o
     usuário de forma discreta e (b) guardar um log anônimo local — máx. 20
     entradas com horário, mensagem e origem do erro, SEM dados pessoais (não
     registra conteúdo de campos). Ajuda a diagnosticar sem coletar nada em
     servidor (LGPD por minimização). Inspecione com window.__ac4Erros() e
     limpe com window.__ac4LimparErros(). */
  const MAX_ERROS_LOG = 20;
  let ultimoToastErroTs = 0;

  function registrarErro(info) {
    try {
      const log = JSON.parse(localStorage.getItem(STORAGE.erros) || '[]');
      /* v carimba a versão do app: um erro vindo de cache velho aparece com
         versão antiga, distinguindo bug real de cliente desatualizado. */
      log.push({ t: new Date().toISOString(), v: APP_VERSION, ...info });
      while (log.length > MAX_ERROS_LOG) log.shift();
      localStorage.setItem(STORAGE.erros, JSON.stringify(log));
    } catch { /* localStorage cheio/indisponível — erro não pode gerar erro */ }
    const agora = Date.now();
    if (agora - ultimoToastErroTs > 10000) {
      ultimoToastErroTs = agora;
      try { toast('Ocorreu um erro inesperado. Se persistir, recarregue a página.', { erro: true }); } catch {}
    }
  }

  function initObservabilidade() {
    window.addEventListener('error', (ev) => {
      registrarErro({
        msg: String(ev.message || 'erro').slice(0, 200),
        src: String(ev.filename || '').replace(location.origin, '').slice(0, 120),
        ln: ev.lineno || 0, col: ev.colno || 0,
      });
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const motivo = ev.reason;
      registrarErro({
        msg: String((motivo && (motivo.message || motivo)) || 'promise rejeitada').slice(0, 200),
        src: 'unhandledrejection', ln: 0, col: 0,
      });
    });
    window.__ac4Erros = () => { try { return JSON.parse(localStorage.getItem(STORAGE.erros) || '[]'); } catch { return []; } };
    window.__ac4LimparErros = () => { localStorage.removeItem(STORAGE.erros); return 'log de erros limpo'; };
    /* Métrica de versão anônima: expõe a versão em execução e registra a última
       vista. Em suporte, `__ac4Version` no console revela cache preso; a
       comparação com a versão anterior detecta se o SW acabou de atualizar. */
    window.__ac4Version = APP_VERSION;
    try {
      estado.versaoAnterior = localStorage.getItem(STORAGE.versao);
      if (estado.versaoAnterior !== APP_VERSION) {
        localStorage.setItem(STORAGE.versao, APP_VERSION);
        if (estado.versaoAnterior) console.info(`Calculadora AC4 atualizada: v${estado.versaoAnterior} → v${APP_VERSION}`);
      }
      /* Marca da limpeza forçada (force-update.js, v65–v68), aposentada na v69. */
      localStorage.removeItem('pmgoForceUpdate');
    } catch {}
  }

  return { registrarErro, initObservabilidade };
}
