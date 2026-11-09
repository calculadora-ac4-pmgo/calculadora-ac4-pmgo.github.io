/* ==========================================================================
   Calculadora AC4 — repetir a semana (v95)
   Regra pura: quando a semana atual está vazia e a passada tem escalas, sugere
   repetir a passada nesta semana; quando a atual tem escalas e a próxima está
   vazia, sugere repetir a atual na próxima. Mesmo dia da semana e horário,
   7 dias depois. A semana vai de segunda a domingo, pelo início da escala.
   Sem DOM.
   ========================================================================== */
import { tabelaParaData } from './calculo.mjs';
import { parseDateTimeLocal, toInputLocal } from './formato.mjs';
import { detectarConflitos, gerarIdEscala } from './persistencia.mjs';

const MOTIVOS = Object.freeze({
  ocupado: 'Já existe escala neste horário.',
  'fora-vigencia': 'Data fora da vigência da Portaria.',
  passou: 'Este dia já passou.',
});

/**
 * Segunda-feira 00:00 da semana de `data`.
 * @param {Date} data
 * @returns {Date}
 */
export function inicioDaSemana(data) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const maisDias = (data, dias) => {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
};
const dataDe = (v) => parseDateTimeLocal(v) || new Date(v);
const escalasDaSemana = (escalas, segunda) => {
  const fim = maisDias(segunda, 7);
  return escalas
    .filter((e) => { const ini = dataDe(e.inicio); return ini >= segunda && ini < fim; })
    .sort((a, b) => dataDe(a.inicio) - dataDe(b.inicio));
};

/**
 * Sugestão de repetição, ou `null` quando não há o que sugerir.
 * @param {Array<Object>} escalas Todas as escalas salvas.
 * @param {Date} [agora]
 * @returns {{origem:'passada'|'atual', alvo:string, itens:Array<{base:Object, inicio:string, fim:string, estado:'livre'|'ocupado'|'fora-vigencia'|'passou', motivo:string, marcado:boolean}>}|null}
 *   `alvo` é a segunda-feira (AAAA-MM-DD) da semana que receberá as escalas.
 */
export function sugestaoRepetirSemana(escalas, agora = new Date()) {
  const atual = inicioDaSemana(agora);
  const daAtual = escalasDaSemana(escalas, atual);
  let origem, fonte, alvo;
  if (!daAtual.length) {
    fonte = escalasDaSemana(escalas, maisDias(atual, -7));
    origem = 'passada';
    alvo = atual;
  } else {
    if (escalasDaSemana(escalas, maisDias(atual, 7)).length) return null;
    fonte = daAtual;
    origem = 'atual';
    alvo = maisDias(atual, 7);
  }
  if (!fonte.length) return null;
  const itens = fonte.map((base) => {
    const inicio = toInputLocal(maisDias(dataDe(base.inicio), 7));
    const fim = toInputLocal(maisDias(dataDe(base.fim), 7));
    let estado = 'livre';
    if (!tabelaParaData(inicio)) estado = 'fora-vigencia';
    else {
      const { duplicadas, sobrepostas } = detectarConflitos(escalas, { inicio, fim });
      if (duplicadas.length || sobrepostas.length) estado = 'ocupado';
      else if (dataDe(fim) <= agora) estado = 'passou';
    }
    return { base, inicio, fim, estado, motivo: MOTIVOS[estado] || '', marcado: estado === 'livre' };
  });
  return { origem, alvo: toInputLocal(alvo).slice(0, 10), itens };
}

/** Itens que o usuário pode marcar (livres ou de dia que já passou). */
export const itemSelecionavel = (item) => item.estado === 'livre' || item.estado === 'passou';

/**
 * Gera as escalas novas a partir dos itens escolhidos.
 * @param {Array<Object>} itens Itens de `sugestaoRepetirSemana`.
 * @returns {Array<Object>} Escalas planejadas, com id novo e a norma da data.
 */
export function gerarEscalasSemana(itens) {
  return itens.filter(itemSelecionavel).map(({ base, inicio, fim }) => ({
    id: gerarIdEscala(), inicio, fim,
    descricao: base.descricao, origem: base.origem, qtdPm: base.qtdPm,
    status: 'planejada', tabela: tabelaParaData(inicio),
  }));
}
