/* ==========================================================================
   Calculadora AC4 — módulo de regras de negócio
   Regras (Portaria SSP nº 621/2026):
   - Vermelha: dia de INÍCIO é sex/sáb/dom.
   - Noturno: [22:00, 05:00) minuto a minuto.
   Funções puras, sem acesso ao DOM.
   ========================================================================== */
import { parseDateTimeLocal } from './formato.mjs';

export const PORTARIA_ATUAL = 'Portaria SSP nº 621/2026';
export const VALORES_OFICIAIS = { valAD: '30', valAN: '33', valVD: '40', valVN: '45' };

/* Tabela oficial em centavos por hora — fallback quando nenhuma tabela
   vigente é injetada (testes, contexto sem DOM). */
export const TABELA_OFICIAL = Object.freeze({
  portaria: PORTARIA_ATUAL,
  valores: Object.freeze({ AD: 3000, AN: 3300, VD: 4000, VN: 4500 }),
});

export const tabelaEscalaValida = (t) =>
  t && t.valores && ['AD', 'AN', 'VD', 'VN'].every((k) => Number.isFinite(t.valores[k]) && t.valores[k] > 0);

/* Calcula minutos por categoria e valor de uma escala.
   Usa a tabela congelada no lançamento (e.tabela) quando válida — preserva o
   histórico se a Portaria mudar; caso contrário usa a tabela vigente. */
export function calcularEscala(e, tabelaVigente = TABELA_OFICIAL) {
  const ini = parseDateTimeLocal(e.inicio) || new Date(e.inicio);
  const fim = parseDateTimeLocal(e.fim) || new Date(e.fim);
  const mins = Math.max(1, Math.round((fim - ini) / 60000));
  const cont = { AD: 0, AN: 0, VD: 0, VN: 0 };
  const tabela = tabelaEscalaValida(e.tabela) ? e.tabela : tabelaVigente;
  const vermelha = [5, 6, 0].includes(ini.getDay());

  /* Minuto-do-dia incrementado com aritmética modular — Goiás não tem
     horário de verão, então não há saltos de relógio no intervalo. */
  let td = ini.getHours() * 60 + ini.getMinutes();
  for (let i = 0; i < mins; i++) {
    const noturno = td >= 22 * 60 || td < 5 * 60;
    cont[vermelha ? (noturno ? 'VN' : 'VD') : (noturno ? 'AN' : 'AD')]++;
    td = (td + 1) % 1440;
  }

  const centavosMinuto = Object.keys(cont).reduce((s, k) => s + cont[k] * tabela.valores[k], 0);
  return {
    mins, cont,
    minDiurno: cont.AD + cont.VD,
    minNoturno: cont.AN + cont.VN,
    minVermelha: cont.VD + cont.VN,
    valorCentavos: Math.round(centavosMinuto / 60),
    tabela,
  };
}

/* Mapa de origem do remunerado → rótulo legível */
export function labelOrigem(v) {
  return {
    AC4: 'AC4', AGETOP: 'AGETOP', DETRAN: 'DETRAN', PREFEITURAS: 'Prefeituras',
    GOINFRA: 'GOINFRA', FREAP: 'FREAP', CONVENIO_ENEM: 'Conv. ENEM',
    CONVENIO_TRE: 'Conv. TRE', CONVENIO_UEG: 'Conv. UEG',
    CONVENIO_SEDUC: 'Conv. SEDUC', CONVENIO_SAMU: 'Conv. SAMU',
    CONVENIO_AGR: 'Conv. AGR', FAZENDARIO_SEC_ECON: 'Faz./Sec. Econ.', GEAI: 'GEAI',
  }[v] || v || 'AC4';
}
