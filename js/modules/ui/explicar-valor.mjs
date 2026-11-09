/* ==========================================================================
   Calculadora AC4 — "Explicar o valor" (v94)
   Tocar no valor de uma escala abre a conta faixa por faixa: horas de cada
   faixa × tarifa, com o arredondamento à vista ("13h59 conta como 14h").
   ========================================================================== */
import { fmtMoeda, fmtHoras, fmtDataHora, escapeHTML } from '../formato.mjs';
import { detalharValor } from '../calculo.mjs';

const ROTULOS = Object.freeze({
  AD: 'Diurna · escala azul',
  AN: 'Noturna · escala azul',
  VD: 'Diurna · escala vermelha',
  VN: 'Noturna · escala vermelha',
});

/**
 * Textos de uma linha da conta.
 * @param {{chave:string, minutos:number, horasPagas:number, arredondado:boolean, tarifaCentavos:number, subtotalCentavos:number}} linha
 * @returns {{rotulo:string, conta:string, nota:string, subtotal:string}}
 */
export function textosLinhaValor(linha) {
  return {
    rotulo: ROTULOS[linha.chave],
    conta: `${linha.horasPagas}h × ${fmtMoeda(linha.tarifaCentavos)}`,
    nota: linha.arredondado ? `${fmtHoras(linha.minutos)} conta como ${linha.horasPagas}h` : '',
    subtotal: fmtMoeda(linha.subtotalCentavos),
  };
}

/**
 * Cria o diálogo "Como o valor foi calculado".
 * @param {Object} ctx Dependências de app.js: $, on, estado, calcularEscala.
 * @returns {{abrir:Function, ligarEventos:Function}}
 */
export function criarExplicarValor(ctx) {
  const { $, on, estado, calcularEscala } = ctx;

  function abrir(id) {
    const escala = estado.escalas.find((e) => String(e.id) === String(id));
    const dlg = $('dialogValor');
    if (!escala || !dlg) return;
    const r = calcularEscala(escala);
    const d = detalharValor(r, escala.qtdPm || 1);
    $('valorSub').textContent = `${fmtDataHora(escala.inicio)} até ${fmtDataHora(escala.fim)} · ${fmtHoras(r.mins)}`;
    const linhas = d.linhas.map((linha) => {
      const t = textosLinhaValor(linha);
      return `<li class="valor-linha">
          <span class="valor-faixa">${escapeHTML(t.rotulo)}<span class="valor-conta">${escapeHTML(t.conta)}</span>${t.nota ? `<span class="valor-arredondou">${escapeHTML(t.nota)}</span>` : ''}</span>
          <strong class="valor-subtotal">${escapeHTML(t.subtotal)}</strong>
        </li>`;
    }).join('');
    const pms = d.qtdPm > 1
      ? `<li class="valor-linha valor-linha--pm"><span class="valor-faixa">Por PM<span class="valor-conta">× ${d.qtdPm} PMs</span></span><strong class="valor-subtotal">${escapeHTML(fmtMoeda(d.porPmCentavos))}</strong></li>`
      : '';
    $('valorLinhas').innerHTML = linhas + pms;
    $('valorTotal').textContent = fmtMoeda(d.totalCentavos);
    $('valorNota').textContent = `Cada faixa é arredondada para a hora mais próxima (30 minutos sobem). Valores da ${r.tabela.portaria}.`;
    if (!dlg.open) dlg.showModal();
  }

  function ligarEventos() {
    on('valorFechar', 'click', () => $('dialogValor')?.close());
    on('dialogValor', 'click', (ev) => { if (ev.target === $('dialogValor')) $('dialogValor').close(); });
  }

  return { abrir, ligarEventos };
}
