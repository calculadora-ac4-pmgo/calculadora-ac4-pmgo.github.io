/* ==========================================================================
   Calculadora AC4 — lançar por texto ou voz: interface (v96)
   Campo "Escreva ou dite" acima do formulário. Entende a frase com o módulo
   puro texto-escala.mjs e só preenche Início e Término; adicionar continua
   sendo um toque de quem lança. Não usa microfone nem rede: o ditado é o do
   teclado do aparelho.
   ========================================================================== */
import { fmtDataHora, fmtDiaSemana } from '../formato.mjs';
import { interpretarTextoEscala } from '../texto-escala.mjs';

/**
 * Frase de conferência depois de preencher.
 * @param {{inicio: string, fim: string}} r
 * @returns {string}
 */
export function textoConferencia(r) {
  return `Preenchi: ${fmtDiaSemana(r.inicio)}, ${fmtDataHora(r.inicio)} até ${fmtDiaSemana(r.fim)}, ${fmtDataHora(r.fim)}. Confira e adicione.`;
}

/**
 * @param {Object} ctx Dependências vindas do app.js.
 * @returns {{aplicar: Function, ligarEventos: Function}}
 */
export function criarTextoEscala(ctx) {
  const { $, on, haptic, preencherHorarios } = ctx;

  function mostrar(mensagem, erro) {
    const el = $('escalaTextoMsg');
    if (!el) return;
    el.textContent = mensagem;
    el.classList.toggle('is-erro', erro);
  }

  /* Não entendeu: avisa e não mexe nos campos. */
  function aplicar() {
    const r = interpretarTextoEscala($('escalaTexto')?.value || '');
    if (!r.ok) { mostrar(r.mensagem, true); return false; }
    if (!preencherHorarios(r.inicio, r.fim)) return false;
    mostrar(textoConferencia(r), false);
    haptic?.();
    return true;
  }

  function ligarEventos() {
    on('btnTextoEscala', 'click', aplicar);
    on('escalaTexto', 'keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      aplicar();
    });
  }

  return { aplicar, ligarEventos };
}
