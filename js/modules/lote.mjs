/* ==========================================================================
   Calculadora AC4 — lançamento em lote (v79)
   Regra pura de "Lançar em outros dias": a partir de uma escala base, gera as
   escalas dos dias marcados (mesma hora e duração, ou horário trocado por dia),
   confere vigência da Portaria, conflito com escalas existentes e conflito
   entre os dias do próprio lote. Sem DOM.
   ========================================================================== */
import { tabelaParaData } from './calculo.mjs';
import { parseDateTimeLocal, toInputLocal } from './formato.mjs';
import { detectarConflitos, gerarIdEscala } from './persistencia.mjs';

export const LIMITE_LOTE = 31;

const MOTIVO_OCUPADO = 'Já existe escala neste horário.';
const MOTIVO_FORA = 'Data fora da vigência da Portaria.';
const MOTIVO_BASE = 'Escala de origem.';

/** Duração da escala base em minutos (fim − início). */
export function duracaoMinutos(base) {
  const ini = parseDateTimeLocal(base.inicio);
  const fim = parseDateTimeLocal(base.fim);
  return Math.round((fim - ini) / 60000);
}

/**
 * Intervalo da escala de um dia do lote. `data` é o dia do início (YYYY-MM-DD).
 * @param {Object} base Escala base.
 * @param {string} data Dia do início.
 * @param {{hora:string, duracaoMin:number}} [horario] Horário trocado só deste dia.
 * @returns {{inicio:string, fim:string}}
 */
export function escalaDoDia(base, data, horario) {
  const hora = horario?.hora || base.inicio.slice(11, 16);
  const duracao = horario?.duracaoMin ?? duracaoMinutos(base);
  const [a, m, d] = data.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const ini = new Date(a, m - 1, d, h, min);
  const fim = new Date(ini.getTime() + duracao * 60000);
  return { inicio: toInputLocal(ini), fim: toInputLocal(fim) };
}

/**
 * Situação de um dia no calendário.
 * @returns {{estado:'livre'|'ocupado'|'fora-vigencia'|'base', motivo:string, conflitos:Object[]}}
 */
export function situacaoDoDia(escalas, base, data, horario) {
  const cand = escalaDoDia(base, data, horario);
  if (!tabelaParaData(cand.inicio)) return { estado: 'fora-vigencia', motivo: MOTIVO_FORA, conflitos: [] };
  if (cand.inicio === base.inicio && cand.fim === base.fim) return { estado: 'base', motivo: MOTIVO_BASE, conflitos: [] };
  const { duplicadas, sobrepostas } = detectarConflitos(escalas, cand, base.id);
  const conflitos = [...duplicadas, ...sobrepostas];
  if (conflitos.length) return { estado: 'ocupado', motivo: MOTIVO_OCUPADO, conflitos };
  return { estado: 'livre', motivo: '', conflitos: [] };
}

/**
 * Valida o lote inteiro antes de lançar.
 * @param {Object[]} escalas Escalas já salvas.
 * @param {Object} base Escala base.
 * @param {{data:string, horario?:Object}[]} dias Dias marcados.
 * @returns {{ok:boolean, problemas:{data:string, motivo:string}[]}}
 */
export function validarLote(escalas, base, dias) {
  const problemas = [];
  if (!dias.length) problemas.push({ data: '', motivo: 'Nenhum dia marcado.' });
  if (dias.length > LIMITE_LOTE) problemas.push({ data: '', motivo: `Limite de ${LIMITE_LOTE} dias por lote.` });
  const vistos = new Set();
  const intervalos = [];
  dias.forEach(({ data, horario }) => {
    if (vistos.has(data)) { problemas.push({ data, motivo: 'Dia repetido.' }); return; }
    vistos.add(data);
    const s = situacaoDoDia(escalas, base, data, horario);
    if (s.estado !== 'livre') { problemas.push({ data, motivo: s.motivo }); return; }
    const c = escalaDoDia(base, data, horario);
    intervalos.push({ data, ini: parseDateTimeLocal(c.inicio), fim: parseDateTimeLocal(c.fim) });
  });
  for (let i = 0; i < intervalos.length; i++) {
    for (let j = i + 1; j < intervalos.length; j++) {
      const a = intervalos[i], b = intervalos[j];
      if (a.ini < b.fim && a.fim > b.ini) {
        problemas.push({ data: a.data, motivo: 'Sobrepõe outro dia deste lote.' });
        problemas.push({ data: b.data, motivo: 'Sobrepõe outro dia deste lote.' });
      }
    }
  }
  return { ok: problemas.length === 0, problemas };
}

/**
 * Gera as escalas do lote (não valida conflitos: chame validarLote antes).
 * @throws {Error} 'fora-vigencia' se algum dia não tiver norma da Portaria.
 */
export function gerarEscalasLote(base, dias) {
  return dias.map(({ data, horario }) => {
    const { inicio, fim } = escalaDoDia(base, data, horario);
    const tabela = tabelaParaData(inicio);
    if (!tabela) throw new Error('fora-vigencia');
    return {
      id: gerarIdEscala(), inicio, fim,
      descricao: base.descricao, origem: base.origem, qtdPm: base.qtdPm,
      status: 'planejada', tabela,
    };
  });
}
