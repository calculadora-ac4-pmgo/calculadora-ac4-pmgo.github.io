/* ==========================================================================
   Calculadora AC4 — avisos da interface (v74)
   - toast: fila única (um aviso por vez); com ação, fica 6 s, sem ação, 3,5 s.
   - dialogConfirmar: <dialog> de confirmação que devolve Promise<boolean>.
   - haptic: vibração curta, quando o aparelho suporta.
   Criado uma única vez pelo app.js (a fila de toasts precisa ser única).
   ========================================================================== */
import { escapeHTML } from '../formato.mjs';

/**
 * Cria os avisos da interface.
 * @param {Object} ctx Dependências de app.js: `$` (getElementById).
 * @returns {{toast:Function, dialogConfirmar:Function, haptic:Function}}
 */
export function criarAvisos(ctx) {
  const { $ } = ctx;

  /* --------------------------------------------------------------- toast */
  const filaToasts = [];
  let toastAtivo = null;

  function exibirProximoToast() {
    if (toastAtivo || !filaToasts.length) return;
    const { msg, erro, acao } = filaToasts.shift();
    const region = $('toastRegion');
    if (!region) return;
    const el = document.createElement('div');
    el.className = 'toast' + (erro ? ' error' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${escapeHTML(msg)}</span>`;
    let encerrado = false;
    let timer = null;
    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      el.classList.add('is-hiding');
      setTimeout(() => {
        el.remove();
        toastAtivo = null;
        exibirProximoToast();
      }, 320);
    };
    if (acao) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = acao.rotulo;
      btn.addEventListener('click', () => { acao.fn(); encerrar(); });
      el.appendChild(btn);
    }
    region.replaceChildren(el);
    toastAtivo = el;
    timer = setTimeout(encerrar, acao ? 6000 : 3500);
  }

  function toast(msg, { erro = false, acao = null } = {}) {
    filaToasts.push({ msg, erro, acao });
    exibirProximoToast();
  }

  /* ---------------------------------------- dialog de confirmação */
  function dialogConfirmar(mensagem, { textoOk = 'Confirmar', perigoso = true } = {}) {
    return new Promise((resolve) => {
      const dlg = $('dialogConfirm');
      if (!dlg) { resolve(window.confirm(mensagem)); return; }
      $('dialogMsg').textContent = mensagem;
      $('dialogOk').textContent = textoOk;
      $('dialogOk').className = `btn ${perigoso ? 'btn-danger-soft' : 'btn-primary'}`;
      dlg.showModal();

      let resolvido = false;
      function finalizar(valor) {
        if (resolvido) return;
        resolvido = true;
        $('dialogOk').removeEventListener('click', onOk);
        $('dialogCancel').removeEventListener('click', onCancel);
        dlg.removeEventListener('click', onBackdrop);
        dlg.removeEventListener('close', onClose);
        if (dlg.open) dlg.close();
        resolve(valor);
      }
      function onOk()     { finalizar(true); }
      function onCancel() { finalizar(false); }
      function onBackdrop(e) { if (e.target === dlg) finalizar(false); }
      /* Esc fecha o <dialog> nativamente sem passar pelos botões —
         sem este handler a Promise ficaria pendente e os listeners vazariam. */
      function onClose()  { finalizar(false); }
      $('dialogOk').addEventListener('click', onOk);
      $('dialogCancel').addEventListener('click', onCancel);
      dlg.addEventListener('click', onBackdrop);
      dlg.addEventListener('close', onClose);
    });
  }

  const haptic = (p = 10) => { try { navigator.vibrate?.(p); } catch { /* sem vibração */ } };

  return { toast, dialogConfirmar, haptic };
}
