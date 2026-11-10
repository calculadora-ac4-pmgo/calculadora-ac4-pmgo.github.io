/* ==========================================================================
   Calculadora AC4 — limite de horas no mês (v97)
   Regra pura: soma as horas de AC4 do mês e compara com o limite mensal.
   - A escala conta no mês em que começa (mesma regra do planejamento e do
     total por mês do relatório).
   - Contam as horas pagas (cada faixa arredondada para a hora mais próxima),
     como na planilha do gestor, que desconta do limite as horas já lançadas.
   - A escala conta uma vez, qualquer que seja a quantidade de PMs: o limite
     é por policial.
   O app só avisa; quem decide é quem lança. Sem DOM.
   ========================================================================== */
import { fmtMesRef, parseDateTimeLocal, toInputMonth } from './formato.mjs';

/** Limite mensal de horas de AC4 por policial (planilha do gestor, 11/2026). */
export const LIMITE_HORAS_MES = 192;

/** Mês (AAAA-MM) em que a escala começa. */
export const mesDaEscala = (escala) => toInputMonth(parseDateTimeLocal(escala.inicio) || new Date(escala.inicio));

const horasPagasDe = (resultado) => Object.values(resultado.horasPagas).reduce((s, h) => s + h, 0);

/**
 * Horas pagas das escalas que começam em `mes`.
 * @param {Array<Object>} escalas
 * @param {string} mes AAAA-MM
 * @param {Function} calcularEscala
 * @returns {number}
 */
export function horasDoMes(escalas, mes, calcularEscala) {
  return escalas
    .filter((e) => mesDaEscala(e) === mes)
    .reduce((s, e) => s + horasPagasDe(calcularEscala(e)), 0);
}

/**
 * Situação do mês diante do limite.
 * @param {number} horas
 * @param {number} [limite]
 * @returns {{horas:number, limite:number, restante:number, excedeu:boolean, excesso:number}}
 */
export function situacaoLimite(horas, limite = LIMITE_HORAS_MES) {
  return { horas, limite, restante: Math.max(0, limite - horas), excedeu: horas > limite, excesso: Math.max(0, horas - limite) };
}

/**
 * O que acontece com o mês se `nova` for gravada (na edição, no lugar da
 * escala `editandoId`). `avisar` só é verdadeiro quando o mês passa do limite
 * e a gravação aumenta as horas dele.
 * @returns {{mes:string, antes:number, depois:number, limite:number, avisar:boolean}}
 */
export function efeitoNoLimite(escalas, nova, calcularEscala, editandoId = null, limite = LIMITE_HORAS_MES) {
  const mes = mesDaEscala(nova);
  const antes = horasDoMes(escalas, mes, calcularEscala);
  const semEditada = editandoId === null ? escalas : escalas.filter((e) => e.id !== editandoId);
  const depois = horasDoMes(semEditada, mes, calcularEscala) + horasPagasDe(calcularEscala(nova));
  return { mes, antes, depois, limite, avisar: depois > limite && depois > antes };
}

/**
 * Meses que passam do limite se `novas` forem gravadas de uma vez
 * (lançar em outros dias, repetir a semana). Só entram meses em que a
 * gravação aumenta as horas e o total fica acima do limite.
 * @returns {Array<{mes:string, antes:number, depois:number, limite:number}>}
 */
export function mesesAcimaDoLimite(escalas, novas, calcularEscala, limite = LIMITE_HORAS_MES) {
  const meses = [...new Set(novas.map(mesDaEscala))].sort();
  return meses
    .map((mes) => {
      const antes = horasDoMes(escalas, mes, calcularEscala);
      return { mes, antes, depois: antes + horasDoMes(novas, mes, calcularEscala), limite };
    })
    .filter((m) => m.depois > m.limite && m.depois > m.antes);
}

/**
 * Pergunta única do limite, usada em todos os caminhos de lançamento.
 * @param {Array<{mes:string, depois:number, limite:number}>} meses Meses acima do limite (ao menos um).
 * @param {number} [qtdEscalas] Quantas escalas estão sendo gravadas.
 * @returns {string}
 */
export function perguntaLimite(meses, qtdEscalas = 1) {
  const partes = meses.map((m, i) => `${fmtMesRef(m.mes)} ${i === 0 ? 'fica com' : 'com'} ${m.depois}h`);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}` : partes[0];
  return `Com ${qtdEscalas === 1 ? 'esta escala' : 'estas escalas'}, ${lista}. O limite é de ${meses[0].limite}h por mês. Deseja continuar?`;
}
