/* ==========================================================================
   Calculadora AC4 — lançar em outros dias (v79)
   Janela com calendário: a partir de uma escala salva (a base), o usuário toca
   nos dias e revisa antes de lançar. A regra (conflito, vigência, geração)
   fica em ../lote.mjs; aqui só a interface. Estado só via `estado`.
   ========================================================================== */
import { LIMITE_LOTE, situacaoDoDia } from '../lote.mjs';
import { parseDateTimeLocal } from '../formato.mjs';

const MESES_NAVEGACAO = 3;
const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtDiaBase = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

const doisDigitos = (n) => String(n).padStart(2, '0');
const chaveData = (a, m, d) => `${a}-${doisDigitos(m + 1)}-${doisDigitos(d)}`;
const indiceMes = (a, m) => a * 12 + m;

/**
 * Cria a janela "Lançar em outros dias".
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, salvar, render, haptic,
 *   clonarEscalas, aposProximoPaint.
 * @returns {{abrir:Function, ligarEventos:Function}}
 */
export function criarAgendaDias(ctx) {
  const { $, on, estado, toast, haptic } = ctx;

  let base = null;
  let mesBase = 0;      // índice ano*12+mês do mês da base
  let mesAtual = 0;     // índice do mês exibido
  const marcados = new Map(); // data → horário trocado (ou null = horário da base)

  const textoContador = (n) => `${n} ${n === 1 ? 'dia marcado' : 'dias marcados'}`;

  function atualizarContador() {
    if ($('loteContador')) $('loteContador').textContent = textoContador(marcados.size);
    if ($('loteRevisar')) $('loteRevisar').disabled = marcados.size === 0;
  }

  function renderGrade() {
    const grade = $('loteGrade');
    if (!grade || !base) return;
    const ano = Math.floor(mesAtual / 12);
    const mes = mesAtual % 12;
    const primeiro = new Date(ano, mes, 1);
    $('loteMes').textContent = fmtMes.format(primeiro);
    $('lotePrev').disabled = mesAtual <= mesBase - MESES_NAVEGACAO;
    $('loteNext').disabled = mesAtual >= mesBase + MESES_NAVEGACAO;
    const hoje = new Date();
    const chaveHoje = chaveData(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fragmento = document.createDocumentFragment();
    const vazios = (primeiro.getDay() + 6) % 7;
    for (let i = 0; i < vazios; i++) {
      const vazio = document.createElement('span');
      vazio.className = 'lote-vazio';
      fragmento.appendChild(vazio);
    }
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    for (let d = 1; d <= diasNoMes; d++) {
      const data = chaveData(ano, mes, d);
      const s = situacaoDoDia(estado.escalas, base, data);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lote-dia';
      btn.dataset.data = data;
      btn.textContent = String(d);
      btn.setAttribute('aria-pressed', marcados.has(data) ? 'true' : 'false');
      if (s.estado !== 'livre') {
        btn.setAttribute('aria-disabled', 'true');
        btn.title = s.motivo;
        btn.classList.add(s.estado === 'base' ? 'is-base' : 'is-bloqueado');
      }
      if (data === chaveHoje) btn.classList.add('is-hoje');
      fragmento.appendChild(btn);
    }
    grade.replaceChildren(fragmento);
  }

  function alternarDia(btn) {
    const data = btn.dataset.data;
    if (btn.getAttribute('aria-disabled') === 'true') { toast(btn.title); return; }
    if (marcados.has(data)) {
      marcados.delete(data);
    } else {
      if (marcados.size >= LIMITE_LOTE) { toast(`Limite de ${LIMITE_LOTE} dias por lote.`); return; }
      marcados.set(data, null);
    }
    haptic(8);
    btn.setAttribute('aria-pressed', marcados.has(data) ? 'true' : 'false');
    atualizarContador();
  }

  function mudarMes(delta) {
    const alvo = mesAtual + delta;
    if (alvo < mesBase - MESES_NAVEGACAO || alvo > mesBase + MESES_NAVEGACAO) return;
    mesAtual = alvo;
    renderGrade();
  }

  function abrir(idBase) {
    const escala = estado.escalas.find((e) => String(e.id) === String(idBase));
    const dlg = $('dialogLote');
    if (!escala || !dlg) return;
    base = escala;
    marcados.clear();
    const ini = parseDateTimeLocal(base.inicio);
    mesBase = indiceMes(ini.getFullYear(), ini.getMonth());
    mesAtual = mesBase;
    if ($('loteBase')) {
      $('loteBase').textContent = `Base: ${fmtDiaBase.format(ini).replace('.', '')} · ${base.inicio.slice(11, 16)} → ${base.fim.slice(11, 16)}. Toque nos dias para lançar a mesma escala.`;
    }
    renderGrade();
    atualizarContador();
    if (!dlg.open) dlg.showModal();
  }

  function fechar() {
    $('dialogLote')?.close();
  }

  function ligarEventos() {
    on('loteFechar', 'click', fechar);
    on('lotePrev', 'click', () => mudarMes(-1));
    on('loteNext', 'click', () => mudarMes(1));
    on('loteGrade', 'click', (ev) => {
      const btn = ev.target.closest('.lote-dia');
      if (btn) alternarDia(btn);
    });
  }

  return { abrir, ligarEventos };
}
