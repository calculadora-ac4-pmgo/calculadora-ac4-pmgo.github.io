/* ==========================================================================
   Calculadora AC4 — "Repetir a semana" (v95)
   Cartão que oferece repetir as escalas da semana (regra em repetir-semana.mjs)
   e janela de conferência: o usuário vê dia e horário de cada escala, desmarca
   o que não quiser e confirma. Estado só via `estado`.
   ========================================================================== */
import { fmtMoeda, fmtHora, fmtData, parseDateTimeLocal, escapeHTML } from '../formato.mjs';
import { mesesAcimaDoLimite, perguntaLimite } from '../limite-horas.mjs';
import { sugestaoRepetirSemana, gerarEscalasSemana, itemSelecionavel } from '../repetir-semana.mjs';

const diaCurtoBR = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const dataDe = (v) => parseDateTimeLocal(v) || new Date(v);
const diaCurto = (iso) => {
  const t = diaCurtoBR.format(dataDe(iso)).replace('.', '');
  return t[0].toLocaleUpperCase('pt-BR') + t.slice(1);
};
const textoEscalas = (n) => `${n} ${n === 1 ? 'escala' : 'escalas'}`;

/**
 * Texto do cartão.
 * @param {{origem:string, itens:Array}} sugestao
 * @returns {string}
 */
export function textoCartaoRepetir(sugestao) {
  const n = sugestao.itens.filter(itemSelecionavel).length;
  const quais = n === 1 ? 'a escala' : `as ${n} escalas`;
  return sugestao.origem === 'passada'
    ? `Repetir nesta semana ${quais} da semana passada?`
    : `Repetir na próxima semana ${quais} desta semana?`;
}

/** "Qui 12/11 · 18:00 → Sex 08:00" */
export function textoItemRepetir(item) {
  const mudouDia = item.inicio.slice(0, 10) !== item.fim.slice(0, 10);
  return `${diaCurto(item.inicio)} ${fmtData(item.inicio).slice(0, 5)} · ${fmtHora(item.inicio)} → ${mudouDia ? `${diaCurto(item.fim)} ` : ''}${fmtHora(item.fim)}`;
}

/**
 * Cria o cartão e a janela "Repetir a semana".
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, salvar, render, haptic,
 *   clonarEscalas, cancelarEdicao, calcularEscala, lerLocal, STORAGE.
 * @returns {{renderRepetirSemana:Function, ligarEventos:Function}}
 */
export function criarRepetirSemana(ctx) {
  const { $, on, estado, toast, dialogConfirmar, salvar, render, haptic, clonarEscalas, cancelarEdicao, calcularEscala, lerLocal, STORAGE } = ctx;
  let sugestao = null;   // sugestão em conferência na janela
  let marcados = new Set();
  let confirmando = false; // pergunta do limite aberta

  const valorDoItem = (item) => calcularEscala({ inicio: item.inicio, fim: item.fim }).valorCentavos * (item.base.qtdPm || 1);

  /* "Agora não" vale para a semana de destino: o cartão volta na semana seguinte. */
  const dispensada = (alvo) => lerLocal(STORAGE.repetirSemanaDispensada) === alvo;

  function sugestaoAtual() {
    const s = sugestaoRepetirSemana(estado.escalas);
    return s && s.itens.some(itemSelecionavel) && !dispensada(s.alvo) ? s : null;
  }

  function renderRepetirSemana() {
    const cartao = $('repetirSemana');
    if (!cartao) return;
    const s = sugestaoAtual();
    cartao.classList.toggle('hidden', !s);
    if (s) $('repetirSemanaTexto').textContent = textoCartaoRepetir(s);
  }

  function renderJanela() {
    const semanaFim = new Date(dataDe(`${sugestao.alvo}T00:00`));
    semanaFim.setDate(semanaFim.getDate() + 6);
    $('repetirSub').textContent = `Semana de ${fmtData(`${sugestao.alvo}T00:00`).slice(0, 5)} a ${fmtData(semanaFim).slice(0, 5)}. Desmarque o que não quiser lançar.`;
    $('repetirLista').innerHTML = sugestao.itens.map((item, i) => {
      const pode = itemSelecionavel(item);
      const unidade = item.base.descricao && item.base.descricao !== 'Escala AC4' ? item.base.descricao : '';
      const nota = [unidade, item.motivo].filter(Boolean).join(' · ');
      return `<li class="repetir-item${pode ? '' : ' is-fora'}">
          <label class="repetir-rotulo">
            <input type="checkbox" class="repetir-check" data-indice="${i}"${marcados.has(i) ? ' checked' : ''}${pode ? '' : ' disabled'}>
            <span class="repetir-textos"><span class="repetir-quando">${escapeHTML(textoItemRepetir(item))}</span>${nota ? `<span class="repetir-nota">${escapeHTML(nota)}</span>` : ''}</span>
          </label>
          <strong class="repetir-valor">${pode ? escapeHTML(fmtMoeda(valorDoItem(item))) : ''}</strong>
        </li>`;
    }).join('');
    const escolhidos = sugestao.itens.filter((_, i) => marcados.has(i));
    const total = escolhidos.reduce((t, item) => t + valorDoItem(item), 0);
    $('repetirTotal').textContent = `${textoEscalas(escolhidos.length)} · ${fmtMoeda(total)}`;
    const confirmar = $('repetirConfirmar');
    confirmar.disabled = escolhidos.length === 0;
    confirmar.textContent = escolhidos.length ? `Lançar ${textoEscalas(escolhidos.length)}` : 'Lançar';
  }

  function abrir() {
    sugestao = sugestaoAtual();
    const dlg = $('dialogRepetir');
    if (!sugestao || !dlg) return;
    marcados = new Set(sugestao.itens.map((item, i) => (item.marcado ? i : -1)).filter((i) => i >= 0));
    renderJanela();
    if (!dlg.open) dlg.showModal();
  }

  async function confirmar() {
    if (!sugestao) return;
    const novas = gerarEscalasSemana(sugestao.itens.filter((_, i) => marcados.has(i)));
    if (!novas.length) return;
    /* v98: mesmo aviso do formulário antes de o mês passar do limite de horas. */
    const acima = mesesAcimaDoLimite(estado.escalas, novas, calcularEscala);
    if (acima.length) {
      if (confirmando) return;
      confirmando = true;
      const ok = await dialogConfirmar(perguntaLimite(acima, novas.length), { textoOk: 'Continuar', perigoso: false });
      confirmando = false;
      if (!ok || !sugestao) return;
    }
    const antes = clonarEscalas();
    estado.escalas.push(...novas);
    if (!salvar()) { estado.escalas = antes; render(); return; }
    const ids = new Set(novas.map((e) => e.id));
    sugestao = null;
    $('dialogRepetir')?.close();
    haptic([10, 30, 10]);
    render();
    toast(`${textoEscalas(novas.length)} ${novas.length === 1 ? 'lançada' : 'lançadas'}.`, {
      acao: {
        rotulo: 'Desfazer',
        fn: () => {
          const restantes = estado.escalas.filter((e) => !ids.has(e.id));
          if (restantes.length === estado.escalas.length) return;
          const antesDesfazer = clonarEscalas();
          estado.escalas = restantes;
          if (!salvar()) { estado.escalas = antesDesfazer; render(); return; }
          if (estado.editandoId !== null && ids.has(estado.editandoId)) cancelarEdicao();
          render();
        },
      },
    });
  }

  function agoraNao() {
    const s = sugestaoAtual();
    if (s) { try { localStorage.setItem(STORAGE.repetirSemanaDispensada, s.alvo); } catch { /* volta na próxima abertura */ } }
    $('repetirSemana')?.classList.add('hidden');
  }

  function ligarEventos() {
    on('repetirSemanaAbrir', 'click', abrir);
    on('repetirSemanaAgoraNao', 'click', agoraNao);
    on('repetirCancelar', 'click', () => $('dialogRepetir')?.close());
    on('repetirConfirmar', 'click', confirmar);
    on('repetirLista', 'change', (ev) => {
      const caixa = ev.target.closest('.repetir-check');
      if (!caixa || !sugestao) return;
      const i = Number(caixa.dataset.indice);
      if (caixa.checked) marcados.add(i); else marcados.delete(i);
      renderJanela();
    });
  }

  return { renderRepetirSemana, ligarEventos };
}
