/* ==========================================================================
   Calculadora AC4 — lançar por texto ou voz (v96)
   Regra pura: lê uma frase curta como "sexta 18 às 8" e devolve início e
   término. Entende o dia (hoje, amanhã, dia da semana, "dia 13" ou 13/11) e
   duas horas (18, 18h, 18:01, 18h30, "18 e 1", meio-dia, meia-noite). Término
   menor ou igual ao início passa para o dia seguinte. Se faltar algo ou
   sobrar dúvida, não devolve horário nenhum: quem lança confere e corrige.
   Sem DOM, sem rede: o ditado é o do teclado do aparelho.
   ========================================================================== */
import { toInputLocal } from './formato.mjs';

export const MOTIVOS_TEXTO = Object.freeze({
  vazio: 'Escreva o dia e as horas. Exemplo: sexta 18 às 8.',
  dia: 'Não entendi o dia. Diga hoje, amanhã, o dia da semana ou a data (13/11).',
  data: 'Essa data não existe. Confira o dia e o mês.',
  horas: 'Não entendi as horas. Diga o início e o término. Exemplo: sexta 18 às 8.',
  hora: 'Hora fora do relógio. Use de 0 a 23 e minutos de 0 a 59.',
});

const DIAS_SEMANA = [
  ['domingo', 'dom'], ['segunda', 'seg'], ['terca', 'ter'], ['quarta', 'qua'],
  ['quinta', 'qui'], ['sexta', 'sex'], ['sabado', 'sab'],
];

const normalizar = (texto) => String(texto ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/-feira|\bfeira\b/g, ' ')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const meiaNoite = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const dataValida = (ano, mes, dia) => {
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
};

/* Devolve { data, resto } | { erro } | null (nenhum dia no texto). */
function lerDia(texto, agora) {
  const hoje = meiaNoite(agora);
  const tirar = (re) => texto.replace(re, ' ');

  let m = texto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = m[3] ? Number(m[3]) : hoje.getFullYear();
    if (m[3] && m[3].length === 2) ano += 2000;
    let data = dataValida(ano, mes, dia);
    if (!data) return { erro: 'data' };
    /* Sem ano: data muito para trás é do ano que vem (ex.: "05/01" em novembro). */
    if (!m[3] && (hoje - data) / 864e5 > 180) data = dataValida(ano + 1, mes, dia);
    if (!data) return { erro: 'data' };
    return { data, resto: tirar(m[0]) };
  }

  m = texto.match(/\bdia (\d{1,2})\b/);
  if (m) {
    const dia = Number(m[1]);
    let data = dataValida(hoje.getFullYear(), hoje.getMonth() + 1, dia);
    /* "dia 2" dito no fim do mês é do mês seguinte. */
    if (!data || (hoje - data) / 864e5 > 15) {
      const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
      data = dataValida(prox.getFullYear(), prox.getMonth() + 1, dia);
    }
    if (!data) return { erro: 'data' };
    return { data, resto: tirar(m[0]) };
  }

  if (/\bdepois de amanha\b/.test(texto)) {
    return { data: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2), resto: tirar(/\bdepois de amanha\b/) };
  }
  if (/\bamanha\b/.test(texto)) {
    return { data: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1), resto: tirar(/\bamanha\b/) };
  }
  if (/\bhoje\b/.test(texto)) return { data: hoje, resto: tirar(/\bhoje\b/) };

  for (let i = 0; i < DIAS_SEMANA.length; i += 1) {
    const re = new RegExp(`\\b(?:${DIAS_SEMANA[i].join('|')})\\b`);
    if (re.test(texto)) {
      /* Próxima ocorrência do dia, contando hoje. */
      const dias = (i - hoje.getDay() + 7) % 7;
      return { data: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias), resto: tirar(re) };
    }
  }
  return null;
}

/* Devolve a lista de horas do texto: [{ h, min }]. */
function lerHoras(texto) {
  const limpo = texto
    .replace(/\bmeio dia\b/g, ' 12:00 ')
    .replace(/\bmeia noite\b/g, ' 0:00 ')
    .replace(/(\d{1,2})\s*(?:h|hs|hrs|horas?)?\s*e meia\b/g, ' $1:30 ');
  const re = /(\d{1,2})(?::(\d{1,2})|\s*(?:hs|hrs|horas?|h)\b\s*(?:e\s+)?(\d{1,2})?(?:\s*(?:min|minutos?)\b)?|\s*h(\d{1,2})|\s+e\s+(\d{1,2})\b(?!\s*(?::|h)))?/g;
  const horas = [];
  let m;
  while ((m = re.exec(limpo)) !== null) {
    horas.push({ h: Number(m[1]), min: Number(m[2] ?? m[3] ?? m[4] ?? m[5] ?? 0) });
  }
  return horas;
}

/**
 * Interpreta uma frase de lançamento.
 * @param {string} texto Ex.: "sexta 18 às 8", "amanhã 18:01 às 8", "13/11 8 às 23".
 * @param {Date} [agora]
 * @returns {{ok: true, inicio: string, fim: string} | {ok: false, motivo: string, mensagem: string}}
 */
export function interpretarTextoEscala(texto, agora = new Date()) {
  const falha = (motivo) => ({ ok: false, motivo, mensagem: MOTIVOS_TEXTO[motivo] });
  const t = normalizar(texto);
  if (!t) return falha('vazio');

  const dia = lerDia(t, agora);
  if (!dia) return falha('dia');
  if (dia.erro) return falha(dia.erro);

  const horas = lerHoras(dia.resto);
  if (horas.length !== 2) return falha('horas');
  if (horas.some(({ h, min }) => h > 23 || min > 59)) return falha('hora');

  const [a, b] = horas;
  const { data } = dia;
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate(), a.h, a.min);
  const fim = new Date(data.getFullYear(), data.getMonth(), data.getDate(), b.h, b.min);
  if (fim <= inicio) fim.setDate(fim.getDate() + 1);
  return { ok: true, inicio: toInputLocal(inicio), fim: toInputLocal(fim) };
}
