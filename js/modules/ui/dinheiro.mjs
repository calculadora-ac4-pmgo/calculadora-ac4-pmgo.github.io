/* ==========================================================================
   Calculadora AC4 — "Meu dinheiro" e "Já passou?" (v89)
   Painel do topo: o valor total dividido em Recebido, A receber (realizadas e
   conferidas) e Previsto (planejadas), sobre as mesmas escalas da lista.
   Cartão "Já passou?": escalas encerradas ainda como planejadas, para marcar
   como realizadas de uma vez (com Desfazer). Estado só via `estado`.
   ========================================================================== */
import { fmtMoeda, parseDateTimeLocal } from '../formato.mjs';
import { statusEscala } from '../templates.mjs';

/** Situações que formam cada parte do painel (a chave é o valor do filtro). */
export const PARTES_DINHEIRO = Object.freeze([
  { chave: 'recebida', rotulo: 'Recebido', situacoes: ['recebida'] },
  { chave: 'a-receber', rotulo: 'A receber', situacoes: ['realizada', 'conferida'] },
  { chave: 'planejada', rotulo: 'Previsto', situacoes: ['planejada'] },
]);

/**
 * Soma valor e quantidade de escalas por parte do painel.
 * @param {Array<{e:Object, r:Object}>} resultados Escalas calculadas.
 * @returns {{total:number, partes:Array<{chave:string, rotulo:string, valor:number, qtd:number}>}}
 *   Valores em centavos; a soma das partes é sempre o total.
 */
export function resumirDinheiro(resultados) {
  const partes = PARTES_DINHEIRO.map((p) => ({ chave: p.chave, rotulo: p.rotulo, valor: 0, qtd: 0 }));
  resultados.forEach(({ e, r }) => {
    const i = PARTES_DINHEIRO.findIndex((p) => p.situacoes.includes(statusEscala(e)));
    partes[i].valor += r.valorCentavos * (e.qtdPm || 1);
    partes[i].qtd += 1;
  });
  return { total: partes.reduce((s, p) => s + p.valor, 0), partes };
}

/**
 * Escalas planejadas cujo término já passou.
 * @param {Array<Object>} escalas Todas as escalas salvas.
 * @param {Date} [agora]
 * @returns {Array<Object>}
 */
export function escalasPassadasPlanejadas(escalas, agora = new Date()) {
  return escalas.filter((e) => statusEscala(e) === 'planejada'
    && (parseDateTimeLocal(e.fim) || new Date(e.fim)) < agora);
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Cria o painel do dinheiro e o cartão de escalas passadas.
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, salvar, render, lerLocal, STORAGE.
 * @returns {{renderDinheiro:Function, renderJaPassou:Function, ligarEventos:Function}}
 */
export function criarDinheiro(ctx) {
  const { $, on, estado, toast, salvar, render, lerLocal, STORAGE } = ctx;

  function renderDinheiro(resultados) {
    const painel = $('dinheiro');
    if (!painel) return;
    painel.classList.toggle('hidden', resultados.length === 0);
    if (!resultados.length) return;
    const { total, partes } = resumirDinheiro(resultados);
    partes.forEach((p) => {
      const barra = $(`dinBarra-${p.chave}`);
      if (barra) barra.style.width = total ? `${(p.valor / total) * 100}%` : '0%';
      const valor = $(`dinValor-${p.chave}`);
      if (valor) {
        /* v100: "R$" num span à parte; em tela estreita ele some para o número caber inteiro. */
        const [moeda, ...resto] = fmtMoeda(p.valor).split(/\s/);
        const prefixo = document.createElement('span');
        prefixo.className = 'dinheiro-moeda';
        prefixo.textContent = `${moeda}\u00a0`;
        valor.replaceChildren(prefixo, resto.join(' '));
      }
      const qtd = $(`dinQtd-${p.chave}`);
      if (qtd) qtd.textContent = plural(p.qtd, 'escala', 'escalas');
      const botao = painel.querySelector(`[data-dinheiro-filtro="${p.chave}"]`);
      botao?.setAttribute('aria-pressed', estado.filtroStatus === p.chave ? 'true' : 'false');
    });
  }

  /* "Agora não" guarda os ids dispensados: o cartão só volta com escala nova. */
  const lerDispensadas = () => {
    try { return new Set(JSON.parse(lerLocal(STORAGE.jaPassouDispensadas) || '[]').map(String)); } catch { return new Set(); }
  };
  const pendentes = () => {
    const dispensadas = lerDispensadas();
    return escalasPassadasPlanejadas(estado.escalas).filter((e) => !dispensadas.has(String(e.id)));
  };

  function renderJaPassou() {
    const cartao = $('jaPassou');
    if (!cartao) return;
    const lista = pendentes();
    cartao.classList.toggle('hidden', lista.length === 0);
    if (!lista.length) return;
    $('jaPassouTexto').textContent = lista.length === 1
      ? '1 escala já passou e está como planejada.'
      : `${lista.length} escalas já passaram e estão como planejadas.`;
  }

  function marcarRealizadas() {
    const lista = pendentes();
    if (!lista.length) return;
    lista.forEach((e) => { e.status = 'realizada'; });
    if (!salvar()) { lista.forEach((e) => { e.status = 'planejada'; }); render(); return; }
    render();
    const ids = new Set(lista.map((e) => String(e.id)));
    toast(`${plural(lista.length, 'escala marcada', 'escalas marcadas')} como realizada${lista.length === 1 ? '' : 's'}.`, {
      acao: {
        rotulo: 'Desfazer',
        fn: () => {
          estado.escalas.forEach((e) => { if (ids.has(String(e.id)) && statusEscala(e) === 'realizada') e.status = 'planejada'; });
          salvar();
          render();
        },
      },
    });
  }

  function agoraNao() {
    const ids = [...new Set([...lerDispensadas(), ...escalasPassadasPlanejadas(estado.escalas).map((e) => String(e.id))])]
      .filter((id) => estado.escalas.some((e) => String(e.id) === id));
    try { localStorage.setItem(STORAGE.jaPassouDispensadas, JSON.stringify(ids)); } catch { /* volta a aparecer na próxima abertura */ }
    $('jaPassou')?.classList.add('hidden');
  }

  function filtrarPorParte(chave) {
    estado.filtroStatus = estado.filtroStatus === chave ? '' : chave;
    if ($('filtroStatus')) $('filtroStatus').value = estado.filtroStatus;
    render();
    if (estado.filtroStatus) document.querySelector('.feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function ligarEventos() {
    on('dinheiro', 'click', (ev) => {
      const btn = ev.target.closest('[data-dinheiro-filtro]');
      if (btn) filtrarPorParte(btn.dataset.dinheiroFiltro);
    });
    on('jaPassouMarcar', 'click', marcarRealizadas);
    on('jaPassouAgoraNao', 'click', agoraNao);
  }

  return { renderDinheiro, renderJaPassou, ligarEventos };
}
