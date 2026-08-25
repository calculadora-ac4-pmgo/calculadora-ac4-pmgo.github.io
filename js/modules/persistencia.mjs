/* Persistência defensiva da Calculadora AC4.
   Mantém compatibilidade com o array legado, mas valida e normaliza cada item
   antes que dados do navegador alcancem a regra de negócio ou a interface. */
import { formatarDataHoraInput, validarIntervaloEscala } from './formato.mjs';
import { tabelaEscalaValida } from './calculo.mjs';

export const STORAGE_SCHEMA_VERSION = '1';

export function gerarIdEscala() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ac4-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizarTabela(tabela) {
  if (!tabelaEscalaValida(tabela)) return undefined;
  return {
    ...(tabela.id ? { id: String(tabela.id).slice(0, 80) } : {}),
    portaria: String(tabela.portaria || '').slice(0, 160),
    ...(tabela.vigenciaInicio ? { vigenciaInicio: String(tabela.vigenciaInicio).slice(0, 10) } : {}),
    valores: Object.fromEntries(
      ['AD', 'AN', 'VD', 'VN'].map((chave) => [chave, Math.round(tabela.valores[chave])])
    ),
  };
}

export function normalizarEscala(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const intervalo = validarIntervaloEscala(item.inicio, item.fim);
  if (!intervalo.ok) return null;

  const qtd = Number.parseInt(item.qtdPm, 10);
  const tabela = normalizarTabela(item.tabela);
  return {
    id: item.id == null || item.id === '' ? gerarIdEscala() : String(item.id).slice(0, 120),
    inicio: formatarDataHoraInput(intervalo.inicio),
    fim: formatarDataHoraInput(intervalo.fim),
    descricao: String(item.descricao || 'Escala AC4').trim().slice(0, 80) || 'Escala AC4',
    origem: String(item.origem || 'AC4').slice(0, 40) || 'AC4',
    qtdPm: Number.isFinite(qtd) ? Math.min(999, Math.max(1, qtd)) : 1,
    ...(tabela ? { tabela } : {}),
  };
}

export function desserializarEscalas(raw) {
  let fonte;
  try { fonte = JSON.parse(raw || '[]'); } catch { fonte = []; }
  if (!Array.isArray(fonte)) fonte = [];
  const escalas = fonte.map(normalizarEscala).filter(Boolean);
  return { escalas, rejeitadas: fonte.length - escalas.length };
}

export function detectarConflitos(lista, candidata, ignorarId = null) {
  const alvo = validarIntervaloEscala(candidata.inicio, candidata.fim);
  if (!alvo.ok) return { duplicadas: [], sobrepostas: [] };
  const duplicadas = [], sobrepostas = [];
  lista.forEach((item) => {
    if (ignorarId !== null && String(item.id) === String(ignorarId)) return;
    const atual = validarIntervaloEscala(item.inicio, item.fim);
    if (!atual.ok) return;
    if (+atual.inicio === +alvo.inicio && +atual.fim === +alvo.fim) duplicadas.push(item);
    else if (atual.inicio < alvo.fim && atual.fim > alvo.inicio) sobrepostas.push(item);
  });
  return { duplicadas, sobrepostas };
}
