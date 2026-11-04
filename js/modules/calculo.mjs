/* ==========================================================================
   Calculadora AC4 — módulo de regras de negócio
   Regras (Portaria vigente — ver portarias.mjs):
   - Vermelha: dia operacional do minuto é sex/sáb/dom.
   - Noturno: [22:00, 05:00) minuto a minuto.
   - Minutos entre 00:00 e 04:59 usam o dia operacional anterior.
   - Pagamento só por horas inteiras em cada faixa (AD/AN/VD/VN): a fração
     de hora não é paga — decisão do gestor em 23/09/2026 (v71).
   Funções puras, sem acesso ao DOM.
   ========================================================================== */
import { parseDateTimeLocal } from './formato.mjs';
import { NORMAS, normaParaData } from './portarias.mjs';

/**
 * Converte uma norma de portarias.mjs no formato de tabela gravado nas escalas.
 * @param {Object} n Norma.
 * @returns {Tabela} Tabela congelada `{ id, portaria, vigenciaInicio, valores }`.
 */
export const tabelaDaNorma = (n) => Object.freeze({
  id: n.id,
  portaria: n.norma,
  vigenciaInicio: n.vigenciaInicio,
  ...(n.vigenciaFim ? { vigenciaFim: n.vigenciaFim } : {}),
  valores: Object.freeze({ ...n.valores }),
});

/* Registro imutável e efetivo por data, derivado de portarias.mjs (fonte única).
   Relatórios preservam a regra aplicada porque cada escala grava sua tabela. */
export const REGRAS_NORMATIVAS = Object.freeze(NORMAS.map(tabelaDaNorma));

/* Tabela da norma mais recente — fallback quando nenhuma tabela é informada
   (testes, escala sem tabela gravada). */
export const TABELA_OFICIAL = REGRAS_NORMATIVAS[REGRAS_NORMATIVAS.length - 1];
export const PORTARIA_ATUAL = TABELA_OFICIAL.portaria;
export const REGRA_NORMATIVA_ATUAL_ID = TABELA_OFICIAL.id;
/**
 * Tabela oficial vigente na data (início da escala).
 * @param {string} valor Data ISO, com ou sem hora.
 * @returns {Tabela|null} `null` quando não há norma para a data.
 */
export function tabelaParaData(valor) {
  const n = normaParaData(valor);
  return n ? REGRAS_NORMATIVAS.find((t) => t.id === n.id) : null;
}

export function regraNormativaParaData(valor) {
  return tabelaParaData(valor);
}

/**
 * @typedef {Object} Tabela Tabela de tarifas em centavos por hora.
 * @property {string} portaria Norma de referência.
 * @property {{AD:number, AN:number, VD:number, VN:number}} valores Centavos/hora por categoria.
 */
/**
 * @typedef {Object} Escala Lançamento a calcular.
 * @property {string} inicio Início no formato `datetime-local` (`YYYY-MM-DDTHH:mm`).
 * @property {string} fim    Término no mesmo formato.
 * @property {Tabela} [tabela] Tabela congelada no lançamento (preserva histórico).
 */
/**
 * @typedef {Object} ResultadoEscala
 * @property {number} mins Total de minutos da escala.
 * @property {{AD:number, AN:number, VD:number, VN:number}} cont Minutos por categoria.
 * @property {number} minDiurno Minutos diurnos (AD+VD).
 * @property {number} minNoturno Minutos noturnos (AN+VN).
 * @property {number} minVermelha Minutos em dia vermelho (VD+VN).
 * @property {{AD:number, AN:number, VD:number, VN:number}} horasPagas Horas inteiras pagas por categoria.
 * @property {number} valorCentavos Valor total por PM, em centavos (sempre em reais inteiros com as tarifas oficiais).
 * @property {Tabela} tabela Tabela efetivamente usada no cálculo.
 */

/**
 * Valida se uma tabela tem as quatro tarifas finitas e positivas.
 * @param {Tabela} t
 * @returns {boolean}
 */
export const tabelaEscalaValida = (t) =>
  t && t.valores && ['AD', 'AN', 'VD', 'VN'].every((k) => Number.isFinite(t.valores[k]) && t.valores[k] > 0);

function diaReferenciaOperacional(data, minutoDoDia, noturno) {
  const ref = new Date(data);
  if (noturno && minutoDoDia < 5 * 60) ref.setDate(ref.getDate() - 1);
  return ref.getDay();
}

/**
 * Calcula minutos por categoria (AD/AN/VD/VN) e o valor de uma escala,
 * classificando minuto a minuto conforme a Portaria vigente. O valor
 * paga só as horas inteiras de cada categoria (a fração de hora é descartada).
 * Usa a tabela congelada no lançamento (`e.tabela`) quando válida — preserva o
 * histórico se a Portaria mudar; caso contrário usa a tabela vigente.
 * @param {Escala} e
 * @param {Tabela} [tabelaVigente] Tabela usada quando `e.tabela` é inválida.
 * @returns {ResultadoEscala}
 */
export function calcularEscala(e, tabelaVigente = TABELA_OFICIAL) {
  const ini = parseDateTimeLocal(e.inicio) || new Date(e.inicio);
  const fim = parseDateTimeLocal(e.fim) || new Date(e.fim);
  const mins = Math.max(1, Math.round((fim - ini) / 60000));
  const cont = { AD: 0, AN: 0, VD: 0, VN: 0 };
  const tabela = tabelaEscalaValida(e.tabela) ? e.tabela : tabelaVigente;

  /* Classificação minuto a minuto — Goiás não tem horário de verão, então não
     há saltos de relógio no intervalo. A madrugada até 04:59 pertence ao dia
     operacional anterior para preservar a faixa noturna iniciada às 22h. */
  for (let i = 0; i < mins; i++) {
    const atual = new Date(ini.getTime() + i * 60000);
    const td = atual.getHours() * 60 + atual.getMinutes();
    const noturno = td >= 22 * 60 || td < 5 * 60;
    const vermelha = [5, 6, 0].includes(diaReferenciaOperacional(atual, td, noturno));
    cont[vermelha ? (noturno ? 'VN' : 'VD') : (noturno ? 'AN' : 'AD')]++;
  }

  /* Só horas inteiras por categoria: 10h20 VD paga 10h; 1h30 AD + 7h AN paga
     1h AD + 7h AN. Garante valores sem centavos com as tarifas oficiais. */
  const horasPagas = { AD: 0, AN: 0, VD: 0, VN: 0 };
  Object.keys(cont).forEach((k) => { horasPagas[k] = Math.floor(cont[k] / 60); });
  const valorCentavos = Object.keys(horasPagas).reduce((s, k) => s + horasPagas[k] * tabela.valores[k], 0);
  return {
    mins, cont, horasPagas,
    minDiurno: cont.AD + cont.VD,
    minNoturno: cont.AN + cont.VN,
    minVermelha: cont.VD + cont.VN,
    valorCentavos,
    tabela,
  };
}

/**
 * Mapeia o código de origem do remunerado para um rótulo legível.
 * @param {string} v Código (ex.: `'AC4'`, `'CONVENIO_ENEM'`).
 * @returns {string} Rótulo amigável; `'AC4'` como padrão.
 */
export function labelOrigem(v) {
  return {
    AC4: 'AC4', AGETOP: 'AGETOP', DETRAN: 'DETRAN', PREFEITURAS: 'Prefeituras',
    GOINFRA: 'GOINFRA', FREAP: 'FREAP', CONVENIO_ENEM: 'Conv. ENEM',
    CONVENIO_TRE: 'Conv. TRE', CONVENIO_UEG: 'Conv. UEG',
    CONVENIO_SEDUC: 'Conv. SEDUC', CONVENIO_SAMU: 'Conv. SAMU',
    CONVENIO_AGR: 'Conv. AGR', FAZENDARIO_SEC_ECON: 'Faz./Sec. Econ.', GEAI: 'GEAI',
  }[v] || v || 'AC4';
}
