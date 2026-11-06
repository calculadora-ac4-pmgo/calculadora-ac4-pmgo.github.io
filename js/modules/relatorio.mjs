/* ==========================================================================
   Calculadora AC4 — módulo de exportações (relatório PDF e planilha CSV)
   Montagem pura do conteúdo: recebe as escalas já calculadas
   ([{ e, r }], com r = calcularEscala(e)) e devolve HTML ou texto.
   A interface (app.js) só injeta o resultado e dispara impressão/download.
   ========================================================================== */
import {
  fmtMoeda, fmtHoras, fmtDataHora, fmtData, fmtHora, fmtMesRef, escapeHTML, csvTextoSeguro,
} from './formato.mjs';
import { labelOrigem } from './calculo.mjs';
import { NORMAS, normaAtual, citacaoNorma } from './portarias.mjs';
import { STATUS_INFO, statusEscala } from './templates.mjs';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Colunas do quadro "Total por mês" (mesmo desenho no PDF do computador e no do iPhone). */
export const COLUNAS_MESES = [
  { titulo: 'Mês', largura: 34, alinhar: 'esquerda' },
  { titulo: 'Escalas', largura: 10, alinhar: 'centro' },
  { titulo: 'Horas', largura: 12, alinhar: 'centro' },
  { titulo: 'H. Diurnas', largura: 13, alinhar: 'centro' },
  { titulo: 'H. Noturnas', largura: 14, alinhar: 'centro' },
  { titulo: 'Valor Estimado', largura: 17, alinhar: 'direita' },
];

const totais = (resultados) => ({
  mins: resultados.reduce((s, x) => s + x.r.mins, 0),
  diurno: resultados.reduce((s, x) => s + x.r.minDiurno, 0),
  noturno: resultados.reduce((s, x) => s + x.r.minNoturno, 0),
  valor: resultados.reduce((s, x) => s + x.r.valorCentavos * (x.e.qtdPm || 1), 0),
});

/**
 * Frase que avisa, no relatório impresso, que a lista está filtrada. Sem filtro
 * devolve '' (a linha fica oculta). Texto puro: usar com textContent.
 * @param {{mes?:string, origem?:string, status?:string, busca?:string}} filtros
 *   Valores dos filtros ativos na tela (mês `AAAA-MM`, origem, situação, busca).
 * @returns {string}
 */
export function descreverFiltros({ mes = '', origem = '', status = '', busca = '' } = {}) {
  const partes = [];
  if (mes) partes.push(`mês ${fmtMesRef(mes)}`);
  if (origem) partes.push(`origem ${labelOrigem(origem)}`);
  if (status && STATUS_INFO[status]) partes.push(`situação ${STATUS_INFO[status].label}`);
  else if (status === 'a-receber') partes.push('situação A receber (realizadas e conferidas)');
  if (busca && busca.trim()) partes.push(`busca “${busca.trim().slice(0, 40)}”`);
  if (!partes.length) return '';
  return `Filtros aplicados: ${partes.join('; ')}. Resumo e totais consideram só as escalas filtradas.`;
}

/**
 * Colunas da tabela do relatório, na ordem. `largura` em % da largura útil do A4
 * retrato: é a mesma do CSS de impressão (css/src/95-rodape-impressao.css); o teste
 * "PDF do iPhone" confere que as duas listas não se separam.
 */
export const COLUNAS_RELATORIO = Object.freeze([
  { titulo: 'N.º', alinhar: 'centro', largura: 3.5 },
  { titulo: 'Dia', alinhar: 'centro', largura: 4 },
  { titulo: 'Data', alinhar: 'esquerda', largura: 9.5 },
  { titulo: 'Início', alinhar: 'centro', largura: 5.5 },
  { titulo: 'Término', alinhar: 'esquerda', largura: 10.5 },
  { titulo: 'Duração', alinhar: 'centro', largura: 7.5 },
  { titulo: 'Unidade', alinhar: 'esquerda', largura: 11 },
  { titulo: 'Origem Remunerado', alinhar: 'esquerda', largura: 9.5 },
  { titulo: 'Situação', alinhar: 'esquerda', largura: 8.5 },
  { titulo: 'PMs', alinhar: 'centro', largura: 4 },
  { titulo: 'H. Diurnas', alinhar: 'centro', largura: 7 },
  { titulo: 'H. Noturnas', alinhar: 'centro', largura: 7.5 },
  { titulo: 'Valor Estimado', alinhar: 'direita', largura: 12 },
]);

/**
 * Dados do relatório em texto puro (sem HTML): base comum do relatório de impressão
 * (montarRelatorioImpressao) e do PDF gerado no próprio aparelho (pdf.mjs, iPhone).
 * @param {Array<{e:Object, r:Object}>} resultados Escalas e seus cálculos.
 * @returns {{resumo:Array<[string,string]>, linhas:Array<{celulas:string[], sub:string}>,
 *   total:({diurno:string, noturno:string, valor:string}|null), normaTexto:string}}
 *   `sub` é a segunda linha do valor ("R$ x/PM") quando há mais de um PM; `total` só
 *   existe com mais de uma escala.
 */
export function dadosRelatorio(resultados) {
  const tot = totais(resultados);
  const resumo = [
    ['Escalas:', String(resultados.length)],
    ['Horas totais:', fmtHoras(tot.mins)],
    ['H. diurnas:', fmtHoras(tot.diurno)],
    ['H. noturnas:', fmtHoras(tot.noturno)],
    ['Valor estimado:', fmtMoeda(tot.valor)],
  ];
  const linhas = resultados.map(({ e, r }, i) => {
    const qtd      = e.qtdPm || 1;
    const mesmodia = fmtData(e.inicio) === fmtData(e.fim);
    return {
      celulas: [
        String(i + 1),
        DIAS[new Date(e.inicio).getDay()],
        fmtData(e.inicio),
        fmtHora(e.inicio),
        mesmodia ? fmtHora(e.fim) : `${fmtData(e.fim)} ${fmtHora(e.fim)}`,
        fmtHoras(r.mins),
        e.descricao && e.descricao !== 'Escala AC4' ? e.descricao : '—',
        labelOrigem(e.origem),
        STATUS_INFO[statusEscala(e)].label,
        String(qtd),
        fmtHoras(r.minDiurno),
        fmtHoras(r.minNoturno),
        fmtMoeda(r.valorCentavos * qtd),
      ],
      sub: qtd > 1 ? `${fmtMoeda(r.valorCentavos)}/PM` : '',
    };
  });
  const total = resultados.length > 1
    ? { diurno: fmtHoras(tot.diurno), noturno: fmtHoras(tot.noturno), valor: fmtMoeda(tot.valor) }
    : null;
  /* Total por mês: só com 2 meses ou mais. A escala conta no mês em que começa. */
  const porMes = new Map();
  resultados.forEach((x) => {
    const mes = String(x.e.inicio).slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(x);
  });
  const meses = porMes.size > 1
    ? [...porMes.keys()].sort().map((mes) => {
      const t = totais(porMes.get(mes));
      return [fmtMesRef(mes), String(porMes.get(mes).length), fmtHoras(t.mins), fmtHoras(t.diurno), fmtHoras(t.noturno), fmtMoeda(t.valor)];
    })
    : [];
  const idsUsados = new Set(resultados.map(({ r }) => r.tabela && r.tabela.id));
  const usadas = NORMAS.filter((n) => idsUsados.has(n.id));
  const normaTexto = (usadas.length ? usadas : [normaAtual()]).map(citacaoNorma).join('; ');
  return { resumo, linhas, total, meses, normaTexto };
}

/**
 * Conteúdo do relatório de impressão (#printReport → PDF pelo navegador).
 * @param {Array<{e:Object, r:Object}>} resultados Escalas e seus cálculos.
 * @returns {{resumoHTML:string, mesesHTML:string, tabelaHTML:string, normaTexto:string}} `normaTexto` é
 *   texto puro (usar com textContent): normas das tabelas usadas, ou a atual.
 */
export function montarRelatorioImpressao(resultados) {
  const { resumo, linhas, total, meses, normaTexto } = dadosRelatorio(resultados);
  const resumoHTML = resumo
    .map(([rotulo, valor]) => `<div><span class="pr-label">${rotulo}</span> <strong>${valor}</strong></div>`)
    .join('');

  const mesesHTML = meses.length ? `
      <table class="pr-meses">
        <thead><tr>${COLUNAS_MESES.map((c) => `<th>${c.titulo}</th>`).join('')}</tr></thead>
        <tbody>${meses.map((m) => `<tr>${m.map((v) => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>` : '';

  let rows = '';
  linhas.forEach(({ celulas: c, sub }) => {
    const valorCell = sub ? `${c[12]}<small>${sub}</small>` : c[12];
    rows += `
        <tr>
          <td class="pr-num">${c[0]}</td>
          <td class="pr-center">${c[1]}</td>
          <td>${c[2]}</td>
          <td class="pr-center">${c[3]}</td>
          <td>${c[4]}</td>
          <td class="pr-center">${c[5]}</td>
          <td>${escapeHTML(c[6])}</td>
          <td>${escapeHTML(c[7])}</td>
          <td>${c[8]}</td>
          <td class="pr-center">${c[9]}</td>
          <td class="pr-center">${c[10]}</td>
          <td class="pr-center">${c[11]}</td>
          <td class="pr-valor">${valorCell}</td>
        </tr>`;
  });

  const totalRow = total ? `
      <tfoot>
        <tr class="pr-total-row">
          <td colspan="10">TOTAL GERAL</td>
          <td class="pr-center">${total.diurno}</td>
          <td class="pr-center">${total.noturno}</td>
          <td class="pr-valor">${total.valor}</td>
        </tr>
      </tfoot>` : '';

  const tabelaHTML = `
      <table class="pr-table">
        <thead>
          <tr>
            <th>N.º</th><th>Dia</th><th>Data</th><th>Início</th>
            <th>Término</th><th>Duração</th><th>Unidade</th>
            <th>Origem Remunerado</th><th>Situação</th><th>PMs</th>
            <th>H. Diurnas</th><th>H. Noturnas</th><th>Valor Estimado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        ${totalRow}
      </table>`;
  return { resumoHTML, mesesHTML, tabelaHTML, normaTexto };
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

  texto += `\n⚠️ _${normaAtual().norma} · Valor simulado_\n`;
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
