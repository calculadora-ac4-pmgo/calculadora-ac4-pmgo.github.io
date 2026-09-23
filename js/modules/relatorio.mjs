/* ==========================================================================
   Calculadora AC4 — módulo de exportações (relatório PDF e planilha CSV)
   Montagem pura do conteúdo: recebe as escalas já calculadas
   ([{ e, r }], com r = calcularEscala(e)) e devolve HTML ou texto.
   A interface (app.js) só injeta o resultado e dispara impressão/download.
   ========================================================================== */
import {
  fmtMoeda, fmtHoras, fmtDataHora, fmtData, fmtHora, escapeHTML, csvTextoSeguro,
} from './formato.mjs';
import { labelOrigem } from './calculo.mjs';
import { STATUS_INFO, statusEscala } from './templates.mjs';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const totais = (resultados) => ({
  mins: resultados.reduce((s, x) => s + x.r.mins, 0),
  diurno: resultados.reduce((s, x) => s + x.r.minDiurno, 0),
  noturno: resultados.reduce((s, x) => s + x.r.minNoturno, 0),
  valor: resultados.reduce((s, x) => s + x.r.valorCentavos * (x.e.qtdPm || 1), 0),
});

/**
 * Conteúdo do relatório de impressão (#printReport → PDF pelo navegador).
 * @param {Array<{e:Object, r:Object}>} resultados Escalas e seus cálculos.
 * @returns {{resumoHTML:string, tabelaHTML:string}}
 */
export function montarRelatorioImpressao(resultados) {
  const tot = totais(resultados);
  const resumoHTML = [
    `<div><span class="pr-label">Escalas:</span> <strong>${resultados.length}</strong></div>`,
    `<div><span class="pr-label">Horas totais:</span> <strong>${fmtHoras(tot.mins)}</strong></div>`,
    `<div><span class="pr-label">H. diurnas:</span> <strong>${fmtHoras(tot.diurno)}</strong></div>`,
    `<div><span class="pr-label">H. noturnas:</span> <strong>${fmtHoras(tot.noturno)}</strong></div>`,
    `<div><span class="pr-label">Valor estimado:</span> <strong>${fmtMoeda(tot.valor)}</strong></div>`,
  ].join('');

  let rows = '';
  resultados.forEach(({ e, r }, i) => {
    const qtd      = e.qtdPm || 1;
    const valor    = r.valorCentavos * qtd;
    const mesmodia = fmtData(e.inicio) === fmtData(e.fim);
    const fimStr   = mesmodia ? fmtHora(e.fim) : `${fmtData(e.fim)} ${fmtHora(e.fim)}`;
    const unidade  = e.descricao && e.descricao !== 'Escala AC4' ? escapeHTML(e.descricao) : '—';
    const origem   = escapeHTML(labelOrigem(e.origem));
    const situacao = STATUS_INFO[statusEscala(e)].label;
    const valorCell = qtd > 1
      ? `${fmtMoeda(valor)}<small>${fmtMoeda(r.valorCentavos)}/PM</small>`
      : fmtMoeda(valor);
    rows += `
        <tr>
          <td class="pr-num">${i + 1}</td>
          <td class="pr-center">${DIAS[new Date(e.inicio).getDay()]}</td>
          <td>${fmtData(e.inicio)}</td>
          <td class="pr-center">${fmtHora(e.inicio)}</td>
          <td>${fimStr}</td>
          <td class="pr-center">${fmtHoras(r.mins)}</td>
          <td>${unidade}</td>
          <td>${origem}</td>
          <td>${situacao}</td>
          <td class="pr-center">${fmtHoras(r.minDiurno)}</td>
          <td class="pr-center">${fmtHoras(r.minNoturno)}</td>
          <td class="pr-valor">${valorCell}</td>
        </tr>`;
  });

  const totalRow = resultados.length > 1 ? `
      <tfoot>
        <tr class="pr-total-row">
          <td colspan="9">TOTAL GERAL</td>
          <td class="pr-center">${fmtHoras(tot.diurno)}</td>
          <td class="pr-center">${fmtHoras(tot.noturno)}</td>
          <td class="pr-valor">${fmtMoeda(tot.valor)}</td>
        </tr>
      </tfoot>` : '';

  const tabelaHTML = `
      <table class="pr-table">
        <thead>
          <tr>
            <th>N.º</th><th>Dia</th><th>Data</th><th>Início</th>
            <th>Término</th><th>Duração</th><th>Unidade</th>
            <th>Origem Remunerado</th><th>Situação</th><th>H. Diurnas</th>
            <th>H. Noturnas</th><th>Valor Estimado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        ${totalRow}
      </table>`;
  return { resumoHTML, tabelaHTML };
}

/**
 * Planilha CSV (separador `;`, BOM UTF-8, CRLF) das escalas calculadas.
 * Campos de texto livre passam por csvTextoSeguro antes das aspas —
 * impede que "=..." digitado na Unidade vire fórmula no Excel.
 * @param {Array<{e:Object, r:Object}>} resultados
 * @returns {string}
 */
export function montarCSV(resultados) {
  const sep = ';';
  const num = (cent) => (cent / 100).toFixed(2).replace('.', ',');
  const celTexto = (s) => `"${csvTextoSeguro(s).replace(/"/g, '""')}"`;
  const linhas = [['Unidade', 'Origem', 'Situação', 'Início', 'Término', 'Qtd. PM', 'Horas', 'H. diurnas', 'H. noturnas', 'Portaria', 'Valor/PM (R$)', 'Valor total (R$)'].join(sep)];
  let total = 0;
  resultados.forEach(({ e, r }) => {
    const qtd = e.qtdPm || 1;
    const valorTotal = r.valorCentavos * qtd;
    total += valorTotal;
    linhas.push([
      celTexto(e.descricao || 'Escala AC4'),
      celTexto(e.origem || 'AC4'),
      celTexto(STATUS_INFO[statusEscala(e)].label),
      fmtDataHora(e.inicio), fmtDataHora(e.fim),
      qtd,
      (r.mins / 60).toFixed(2).replace('.', ','),
      (r.minDiurno  / 60).toFixed(2).replace('.', ','),
      (r.minNoturno / 60).toFixed(2).replace('.', ','),
      celTexto(r.tabela.portaria || ''),
      num(r.valorCentavos),
      num(valorTotal),
    ].join(sep));
  });
  linhas.push(['TOTAL', '', '', '', '', '', '', '', '', '', '', num(total)].join(sep));
  return '﻿' + linhas.join('\r\n');
}

/**
 * Texto de resumo para WhatsApp / compartilhar / copiar (formatação do WhatsApp).
 * @param {Array<{e:Object, r:Object}>} resultados Escalas e seus cálculos (≥ 1).
 * @returns {string}
 */
export function montarTextoResumo(resultados) {
  const lista = resultados.map((x) => x.e);
  const totMins  = resultados.reduce((s, x) => s + x.r.mins, 0);
  const totValor = resultados.reduce((s, x) => s + x.r.valorCentavos * (x.e.qtdPm || 1), 0);

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const SEP = '─────────────────────';

  const dataCompleta = (iso) => {
    const d = new Date(iso);
    return `${DIAS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  let texto = `📋 *SIMULAÇÃO DE ESCALAS — AC4 / PMGO*\n${SEP}\n\n`;

  resultados.forEach(({ e, r }, i) => {
    const qtd       = e.qtdPm || 1;
    const isVerm    = r.minVermelha > 0;
    const tipoEmoji = isVerm ? '🔴' : '🔵';
    const tipoNome  = isVerm ? 'Vermelha' : 'Azul';
    const mesmodia  = fmtData(e.inicio) === fmtData(e.fim);
    const fimStr    = mesmodia
      ? fmtHora(e.fim)
      : `${fmtHora(e.fim)} (${DIAS[new Date(e.fim).getDay()]}, ${String(new Date(e.fim).getDate()).padStart(2, '0')}/${String(new Date(e.fim).getMonth() + 1).padStart(2, '0')})`;

    if (lista.length > 1) {
      texto += `*${i + 1}. Escala ${tipoNome} ${tipoEmoji}*\n`;
    } else {
      texto += `*Escala ${tipoNome} ${tipoEmoji}*\n`;
    }

    texto += `📅 ${dataCompleta(e.inicio)}\n`;
    texto += `🕐 ${fmtHora(e.inicio)} → ${fimStr}\n`;

    if (r.minNoturno > 0 && r.minDiurno > 0) {
      texto += `⏱ ${fmtHoras(r.mins)}  |  Diurno: ${fmtHoras(r.minDiurno)}  /  Noturno: ${fmtHoras(r.minNoturno)}\n`;
    } else {
      texto += `⏱ ${fmtHoras(r.mins)} (${r.minNoturno > 0 ? 'Noturno' : 'Diurno'})\n`;
    }

    const unidStr = e.descricao && e.descricao !== 'Escala AC4' ? e.descricao : '—';
    const oriStr  = labelOrigem(e.origem);
    texto += `📍 Unidade: ${unidStr}  |  Origem: ${oriStr}\n`;
    texto += `📌 Situação: ${STATUS_INFO[statusEscala(e)].label}\n`;

    if (qtd > 1) {
      texto += `👮 ${qtd} PMs  ·  ${fmtMoeda(r.valorCentavos)}/PM\n`;
      texto += `💰 *${fmtMoeda(r.valorCentavos * qtd)}* (total ${qtd} PMs)\n`;
    } else {
      texto += `💰 *${fmtMoeda(r.valorCentavos)}*\n`;
    }

    if (i < resultados.length - 1) texto += `\n${SEP}\n\n`;
  });

  if (lista.length > 1) {
    texto += `\n${SEP}\n`;
    texto += `📊 *TOTAL — ${lista.length} escalas*\n`;
    texto += `⏱ ${fmtHoras(totMins)}  |  💰 *${fmtMoeda(totValor)}*\n`;
    texto += `${SEP}\n`;
  }

  texto += `\n⚠️ _Portaria SSP n.º 621/2026 · Valor simulado_\n`;
  texto += `_Sujeito à conferência administrativa — AC4 PMGO_`;
  return texto;
}

/** Dispara o download de um arquivo gerado no navegador. */
export function baixarArquivo(conteudo, nome, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
