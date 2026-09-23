/* ==========================================================================
   Calculadora AC4 — módulo de templates da lista de escalas
   HTML dos cards (mobile), botões de ação e seletor de situação. Funções
   puras: recebem a escala e o resultado do cálculo, devolvem HTML.
   Todo dado que vem do armazenamento (id, descrição) passa por escapeHTML —
   ids chegam de backups restaurados e não são confiáveis.
   ========================================================================== */
import {
  fmtMoeda, fmtHoras, fmtData, fmtDiaSemana, fmtHora, parseDateTimeLocal, escapeHTML,
} from './formato.mjs';
import { STATUS_ESCALA } from './persistencia.mjs';

export const STATUS_INFO = Object.freeze({
  planejada: { label: 'Planejada', curto: 'Planejadas' },
  realizada: { label: 'Realizada', curto: 'Realizadas' },
  conferida: { label: 'Conferida', curto: 'Conferidas' },
  recebida: { label: 'Recebida', curto: 'Recebidas' },
});

export const statusEscala = (e) => STATUS_ESCALA.includes(e?.status) ? e.status : 'planejada';

export const rotuloQuantidadePm = (qtd) => `${qtd} ${qtd === 1 ? 'PM' : 'PMs'}`;

export const fmtDiaSemanaLinha = (iso) =>
  fmtDiaSemana(iso)
    .split('-')
    .map((parte) => parte ? parte[0].toLocaleUpperCase('pt-BR') + parte.slice(1) : parte)
    .join('-');

export const fmtMoedaLinha = (centavos) => fmtMoeda(centavos).replace(/ /g, ' ');

/* Botões de ação de uma escala — reusados na tabela (desktop) e nos
   cards enxutos (mobile). A delegação em #listaEscalas trata ambos. */
export const botoesAcaoHTML = (idBruto) => {
  const id = escapeHTML(String(idBruto));
  return `
    <div class="escala-actions">
      <button class="btn-icon gcal" data-acao="agenda" data-id="${id}" title="Adicionar esta escala à agenda" aria-label="Adicionar esta escala à agenda">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4"/></svg>
      </button>
      <button class="btn-icon" data-acao="duplicar" data-id="${id}" title="Duplicar para o dia seguinte" aria-label="Duplicar">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
      </button>
      <button class="btn-icon" data-acao="editar" data-id="${id}" title="Editar" aria-label="Editar">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </button>
      <button class="btn-icon delete" data-acao="remover" data-id="${id}" title="Excluir" aria-label="Excluir">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
      </button>
    </div>`;
};

export const seletorStatusHTML = (e, classe = '') => {
  const atual = statusEscala(e);
  return `<label class="status-control ${classe}">
      <span class="sr-only">Situação da escala</span>
      <select class="status-select status-select--${atual}" data-status-id="${escapeHTML(String(e.id))}" aria-label="Situação da escala">
        ${STATUS_ESCALA.map((status) => `<option value="${status}"${status === atual ? ' selected' : ''}>${STATUS_INFO[status].label}</option>`).join('')}
      </select>
    </label>`;
};

export const botoesCardMobileHTML = (idBruto, statusHTML = '') => {
  const id = escapeHTML(String(idBruto));
  return `
    <div class="ec-card-actions" aria-label="Ações da escala">
      ${statusHTML}
      <button class="ec-action-btn" data-acao="editar" data-id="${id}" type="button">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        <span>Editar</span>
      </button>
      <details class="ec-more">
        <summary class="ec-action-btn" aria-label="Mais ações desta escala">
          <svg class="icon icon-sm" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          <span>Mais</span>
        </summary>
        <div class="ec-more-menu">
          <button data-acao="agenda" data-id="${id}" type="button">Adicionar à agenda</button>
          <button data-acao="duplicar" data-id="${id}" type="button">Duplicar para amanhã</button>
          <button class="delete" data-acao="remover" data-id="${id}" type="button">Excluir escala</button>
        </div>
      </details>
    </div>`;
};

/* Formatadores reaproveitados: toLocaleDateString() cria um Intl novo por
   chamada — caro com centenas de cards (auditoria v67, P2-1). */
const diaSemanaCurtoBR = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const mesCurtoBR = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const siglaData = (fmt, data) => fmt.format(data).replace('.', '').toUpperCase();

/**
 * Card de escala (mobile): leitura confortável + ações grandes.
 * Estrutura própria — o desktop segue usando a tabela, sem alteração.
 * @param {Object} e Escala.
 * @param {Object} r Resultado de `calcularEscala(e)`.
 * @returns {string} HTML do card.
 */
export const cardEscalaHTML = (e, r) => {
  const qtd = e.qtdPm || 1;
  const valorTotal = r.valorCentavos * qtd;
  const inicio = parseDateTimeLocal(e.inicio) || new Date(e.inicio);
  const dataLinha = `${siglaData(diaSemanaCurtoBR, inicio)} · ${String(inicio.getDate()).padStart(2, '0')} ${siglaData(mesCurtoBR, inicio)}`;
  const mudouDia = fmtData(e.inicio) !== fmtData(e.fim);
  const fimDia = mudouDia
    ? `${siglaData(diaSemanaCurtoBR, parseDateTimeLocal(e.fim) || new Date(e.fim))} `
    : '';
  const horarioLinha = `${fmtHora(e.inicio)} → ${fimDia}${fmtHora(e.fim)}`;
  const resumo = `${fmtData(e.inicio)} - ${fmtDiaSemanaLinha(e.inicio)} - ${fmtHoras(r.mins)} - ${fmtMoedaLinha(valorTotal)}`;
  const duracaoLinha = r.mins % 60 === 0 ? `${r.mins / 60} ${r.mins === 60 ? 'hora' : 'horas'}` : fmtHoras(r.mins);
  const unidade = e.descricao && e.descricao !== 'Escala AC4' ? e.descricao : '';
  /* Layout v65: identificação à esquerda, valor alinhado à direita (leitura
     em "F", como extratos bancários) e situação + ações numa única linha. */
  return `
      <div class="escala-card escala-card--${statusEscala(e)}" role="listitem" aria-label="${escapeHTML(resumo)}">
        <div class="ec-card-main">
          <div class="ec-card-head">
            <div class="ec-date-line">${escapeHTML(dataLinha)}</div>
            <div class="ec-card-info">
              <div class="ec-time">${escapeHTML(horarioLinha)}</div>
              <div class="ec-duration">${escapeHTML(duracaoLinha)}${unidade ? ` <span class="ec-unit">· ${escapeHTML(unidade)}</span>` : ''}</div>
            </div>
          </div>
          <div class="ec-card-amount">
            ${qtd === 1
              ? `<div class="ec-money">${fmtMoedaLinha(r.valorCentavos)}</div>`
              : `<div class="ec-total">${fmtMoedaLinha(valorTotal)}</div>
                 <div class="ec-qtd">${rotuloQuantidadePm(qtd)}</div>
                 <div class="ec-per-pm">${fmtMoedaLinha(r.valorCentavos)} por PM</div>`}
          </div>
        </div>
        ${botoesCardMobileHTML(e.id, seletorStatusHTML(e, 'ec-status'))}
      </div>`;
};
