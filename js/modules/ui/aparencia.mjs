/* ==========================================================================
   Calculadora AC4 — aparência (v74)
   Tema claro/escuro (preferência salva ou do sistema) e o aviso de novidades
   da versão (#dialogNovidades, controlado por data-conteudo).
   ========================================================================== */

/**
 * Cria os controles de aparência.
 * @param {Object} ctx Dependências de app.js: $, on, STORAGE, lerLocal, APP_VERSION,
 *   estado (versaoAnterior) e aposProximoPaint.
 * @returns {{aplicarTema:Function, initTema:Function, initNovidades:Function, abrirNovidades:Function, marcarNovidadesVistas:Function, ligarFaixaPortaria:Function}}
 */
export function criarAparencia(ctx) {
  const { $, on, STORAGE, lerLocal, APP_VERSION, estado, aposProximoPaint } = ctx;

  /* --------------------------------------------------------------- tema */
  function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
    try { localStorage.setItem(STORAGE.theme, tema); } catch { /* preferência não persistirá */ }
    $('icon-sun')?.classList.toggle('hidden', tema !== 'dark');
    $('icon-moon')?.classList.toggle('hidden', tema === 'dark');
  }

  function initTema() {
    const salvo = lerLocal(STORAGE.theme);
    aplicarTema(salvo || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!lerLocal(STORAGE.theme)) aplicarTema(e.matches ? 'dark' : 'light');
    });
  }

  /* ---------------------------------------- novidades da versão */
  function marcarNovidadesVistas() {
    try { localStorage.setItem(STORAGE.novidades, APP_VERSION); } catch { /* preferência não persistirá */ }
  }

  function abrirNovidades() {
    const dlg = $('dialogNovidades');
    if (dlg && !dlg.open) dlg.showModal();
  }

  function initNovidades() {
    const dlg = $('dialogNovidades');
    if (!dlg) return;

    const fechar = () => {
      marcarNovidadesVistas();
      if (dlg.open) dlg.close();
    };
    on('footerNovidades', 'click', (ev) => { ev.preventDefault(); abrirNovidades(); });
    on('novidadesFechar', 'click', fechar);
    on('novidadesContinuar', 'click', fechar);
    dlg.addEventListener('close', marcarNovidadesVistas);

    /* Instalações novas começam direto no fluxo principal. O aviso automático
       é reservado a quem realmente acabou de receber uma atualização. */
    /* Só reabre se o CONTEÚDO do aviso mudou desde o último visto
       (data-conteudo no #dialogNovidades); versões só técnicas não repetem
       o mesmo aviso. */
    const conteudo = Number(dlg.dataset.conteudo) || Number(APP_VERSION);
    const vistoEm = Number(lerLocal(STORAGE.novidades)) || 0;
    if (estado.versaoAnterior && estado.versaoAnterior !== APP_VERSION && vistoEm < conteudo) {
      aposProximoPaint(abrirNovidades);
    }
  }

  /* ------------------------------------------ faixa da Portaria (v90) */
  /* No celular a faixa de valores fica recolhida em uma linha; o botão abre. */
  function ligarFaixaPortaria() {
    on('tariffToggle', 'click', () => {
      const faixa = $('tariffStrip');
      const aberta = !faixa.classList.contains('is-aberta');
      faixa.classList.toggle('is-aberta', aberta);
      $('tariffToggle').setAttribute('aria-expanded', aberta ? 'true' : 'false');
    });
  }

  return { aplicarTema, initTema, initNovidades, abrirNovidades, marcarNovidadesVistas, ligarFaixaPortaria };
}
