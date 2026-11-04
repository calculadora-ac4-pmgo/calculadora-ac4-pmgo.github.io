/* ==========================================================================
   Calculadora AC4 — compartilhamento e feedback (v74)
   Folha "Compartilhar" (WhatsApp, compartilhar nativo, copiar resumo, status
   do backup) e o canal de feedback por e-mail (mailto, sem backend).
   ========================================================================== */
import { montarTextoResumo } from '../relatorio.mjs';

/**
 * Cria o compartilhamento e o canal de feedback.
 * @param {Object} ctx Dependências de app.js: $, on, toast, haptic, calcularEscala,
 *   escalasOrdenadas, textoStatusBackup, aposProximoPaint, APP_VERSION e ambienteDeTeste.
 * @returns {{abrirShareSheet:Function, copiarResumo:Function, compartilharWhatsApp:Function,
 *   compartilharNativo:Function, gerarTextoResumo:Function, initFeedback:Function}}
 */
export function criarCompartilhar(ctx) {
  const { $, on, toast, haptic, calcularEscala, escalasOrdenadas, textoStatusBackup,
    aposProximoPaint, APP_VERSION, ambienteDeTeste } = ctx;

  /* ------------------------------------------------------- compartilhar */
  function gerarTextoResumo() {
    const lista = escalasOrdenadas();
    if (!lista.length) return '';
    return montarTextoResumo(lista.map((e) => ({ e, r: calcularEscala(e) })));
  }

  let resumoCompartilhamentoCache = '';
  let urlWhatsAppCache = '';

  function prepararCompartilhamento() {
    resumoCompartilhamentoCache = gerarTextoResumo();
    urlWhatsAppCache = `https://wa.me/?text=${encodeURIComponent(resumoCompartilhamentoCache)}`;
  }

  const obterResumoCompartilhamento = () => resumoCompartilhamentoCache || gerarTextoResumo();

  async function compartilharWhatsApp() {
    const lista = escalasOrdenadas();
    if (!lista.length) { toast('Adicione escalas antes de compartilhar.', { erro: true }); return; }
    const url = urlWhatsAppCache || `https://wa.me/?text=${encodeURIComponent(obterResumoCompartilhamento())}`;
    window.open(url, '_blank', 'noopener');
  }

  async function compartilharNativo() {
    const lista = escalasOrdenadas();
    if (!lista.length) { toast('Adicione escalas antes de compartilhar.', { erro: true }); return; }
    try { await navigator.share({ title: 'Relatório AC4', text: obterResumoCompartilhamento() }); }
    catch (e) { if (e.name !== 'AbortError') compartilharWhatsApp(); }
  }

  async function copiarResumo() {
    const lista = escalasOrdenadas();
    if (!lista.length) { toast('Adicione escalas antes de copiar.', { erro: true }); return; }
    try {
      await navigator.clipboard.writeText(obterResumoCompartilhamento());
      haptic([10, 10]);
      toast('Resumo copiado para a área de transferência!');
    } catch { toast('Não foi possível copiar automaticamente.', { erro: true }); }
  }

  function abrirShareSheet() {
    const lista = escalasOrdenadas();
    if (!lista.length) { toast('Adicione escalas antes de compartilhar.', { erro: true }); return; }
    const dlg = $('dialogShare');
    if (!dlg) { compartilharWhatsApp(); return; }
    resumoCompartilhamentoCache = '';
    urlWhatsAppCache = '';
    const nativeBtn = $('shareNative');
    if (nativeBtn) nativeBtn.classList.toggle('hidden', !navigator.share);
    if ($('shareBackupStatus')) $('shareBackupStatus').textContent = textoStatusBackup();
    dlg.showModal();
    aposProximoPaint(prepararCompartilhamento);
  }

  /* ------------------------------------------------ canal de feedback
     Elogios/sugestões/problemas vão direto ao mantenedor por e-mail, SEM
     backend e SEM coleta: o mailto abre no aplicativo do próprio usuário,
     que decide enviar. Coerente com a política de privacidade do app. */
  const FEEDBACK_EMAIL = 'welitonsp@gmail.com';
  let feedbackTipo = 'Elogio';

  const montarMailtoFeedback = (tipo, mensagem) => {
    const assunto = `[Calculadora AC4] ${tipo}`;
    const corpo = `${mensagem}\n\n—\nTipo: ${tipo}\nCalculadora AC4 v${APP_VERSION} · enviado pelo canal de feedback do app`;
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  };
  /* Exposto para o smoke test validar o link sem navegar para fora da página. */
  if (ambienteDeTeste) window.__ac4MailtoFeedback = montarMailtoFeedback;

  function selecionarTipoFeedback(botao) {
    feedbackTipo = botao.dataset.tipo || 'Elogio';
    document.querySelectorAll('#fbTipos .fb-tipo').forEach((b) => {
      const ativo = b === botao;
      b.classList.toggle('is-active', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
  }

  function enviarFeedback() {
    const mensagem = ($('fbMensagem')?.value || '').trim();
    if (mensagem.length < 5) {
      toast('Escreva sua mensagem antes de enviar.', { erro: true });
      $('fbMensagem')?.focus();
      return;
    }
    haptic(10);
    window.location.href = montarMailtoFeedback(feedbackTipo, mensagem);
    $('dialogFeedback')?.close();
    toast('Abrindo seu aplicativo de e-mail…');
  }

  async function copiarEmailFeedback() {
    try {
      await navigator.clipboard.writeText(FEEDBACK_EMAIL);
      toast(`E-mail copiado: ${FEEDBACK_EMAIL}`);
    } catch { toast(`Envie para: ${FEEDBACK_EMAIL}`, { erro: false }); }
  }

  function initFeedback() {
    on('footerFeedback', 'click', (ev) => { ev.preventDefault(); $('dialogFeedback')?.showModal(); });
    on('fbFechar', 'click', () => $('dialogFeedback')?.close());
    on('fbEnviar', 'click', enviarFeedback);
    on('fbCopiarEmail', 'click', copiarEmailFeedback);
    document.querySelectorAll('#fbTipos .fb-tipo').forEach((b) => {
      b.addEventListener('click', () => selecionarTipoFeedback(b));
    });
  }

  return { abrirShareSheet, copiarResumo, compartilharWhatsApp, compartilharNativo, gerarTextoResumo, initFeedback };
}
