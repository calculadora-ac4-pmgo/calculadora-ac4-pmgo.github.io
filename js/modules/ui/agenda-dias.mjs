/* ==========================================================================
   Calculadora AC4 — lançar em outros dias (v79)
   Janela com calendário: a partir de uma escala salva (a base), o usuário toca
   nos dias e revisa antes de lançar. A regra (conflito, vigência, geração)
   fica em ../lote.mjs; aqui só a interface. Estado só via `estado`.
   ========================================================================== */
import { LIMITE_LOTE, duracaoMinutos, escalaDoDia, gerarEscalasLote, situacaoDoDia, validarLote } from '../lote.mjs';
import { parseDateTimeLocal } from '../formato.mjs';

const MESES_NAVEGACAO = 3;
const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtDiaBase = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const doisDigitos = (n) => String(n).padStart(2, '0');
const chaveData = (a, m, d) => `${a}-${doisDigitos(m + 1)}-${doisDigitos(d)}`;
const indiceMes = (a, m) => a * 12 + m;

/**
 * Cria a janela "Lançar em outros dias".
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, salvar, render, haptic,
 *   clonarEscalas, aposProximoPaint, cancelarEdicao.
 * @returns {{abrir:Function, ligarEventos:Function}}
 */
export function criarAgendaDias(ctx) {
  const { $, on, estado, toast, salvar, render, haptic, clonarEscalas, cancelarEdicao } = ctx;

  let base = null;
  let mesBase = 0;      // índice ano*12+mês do mês da base
  let mesAtual = 0;     // índice do mês exibido
  const marcados = new Map(); // data → horário trocado (ou null = horário da base)
  let editando = null;        // data cujo horário está sendo trocado

  const textoEscalas = (n) => `${n} ${n === 1 ? 'escala' : 'escalas'}`;
  const setAviso = (msg = '') => { if ($('loteAviso')) $('loteAviso').textContent = msg; };
  const diasDoLote = () => [...marcados.keys()].sort().map((data) => ({ data, ...(marcados.get(data) ? { horario: marcados.get(data) } : {}) }));
  const rotuloDia = (data) => {
    const [a, m, d] = data.split('-').map(Number);
    return `${DIAS_SEMANA[new Date(a, m - 1, d).getDay()]} ${doisDigitos(d)}/${doisDigitos(m)}`;
  };

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
    if (btn.getAttribute('aria-disabled') === 'true') { setAviso(btn.title); return; }
    setAviso();
    if (marcados.has(data)) {
      marcados.delete(data);
    } else {
      if (marcados.size >= LIMITE_LOTE) { setAviso(`Limite de ${LIMITE_LOTE} dias por lote.`); return; }
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

  /* ------------------------------------------------ revisão e lançamento */
  function mostrarEtapa(revisao) {
    $('loteCalendario')?.classList.toggle('hidden', revisao);
    $('loteRevisao')?.classList.toggle('hidden', !revisao);
    if (!revisao) { editando = null; $('loteEditar')?.classList.add('hidden'); renderGrade(); atualizarContador(); }
  }

  function renderRevisao() {
    const lista = $('loteLista');
    if (!lista || !base) return;
    const dias = diasDoLote();
    const { ok, problemas } = validarLote(estado.escalas, base, dias);
    const problemaPorData = new Map(problemas.filter((p) => p.data).map((p) => [p.data, p.motivo]));
    const fragmento = document.createDocumentFragment();
    dias.forEach(({ data, horario }) => {
      const { inicio, fim } = escalaDoDia(base, data, horario);
      const li = document.createElement('li');
      li.dataset.data = data;
      if (data === editando) li.classList.add('is-editando');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lote-item';
      btn.setAttribute('aria-label', `Trocar horário de ${rotuloDia(data)}`);
      const texto = document.createElement('span');
      texto.className = 'lote-item-texto';
      /* Término a partir de 2 dias depois ganha a data, para não parecer no mesmo dia. */
      const dias = Math.round((parseDateTimeLocal(fim.slice(0, 10) + 'T00:00') - parseDateTimeLocal(data + 'T00:00')) / 86400000);
      const fimTexto = dias >= 2 ? `${fim.slice(8, 10)}/${fim.slice(5, 7)} ${fim.slice(11, 16)}` : fim.slice(11, 16);
      texto.textContent = `${rotuloDia(data)} · ${inicio.slice(11, 16)} → ${fimTexto}`;
      btn.appendChild(texto);
      if (problemaPorData.has(data)) {
        const prob = document.createElement('span');
        prob.className = 'lote-problema';
        prob.textContent = problemaPorData.get(data);
        btn.appendChild(prob);
      }
      li.appendChild(btn);
      fragmento.appendChild(li);
    });
    lista.replaceChildren(fragmento);
    const lancar = $('loteLancar');
    if (lancar) {
      lancar.textContent = `Lançar ${textoEscalas(dias.length)}`;
      lancar.disabled = !ok;
    }
  }

  function intervaloEditado() {
    return escalaDoDia(base, editando, marcados.get(editando) || undefined);
  }

  function editarDia(data) {
    editando = data;
    const { inicio, fim } = intervaloEditado();
    $('loteEditarTitulo').textContent = `Horário de ${rotuloDia(data)}`;
    $('loteHora').value = inicio.slice(11, 16);
    $('loteFim').value = fim;
    $('loteEditar').classList.remove('hidden');
    renderRevisao();
  }

  function trocarHorario({ hora, duracaoMin }) {
    if (!editando) return;
    const atual = marcados.get(editando) || { hora: base.inicio.slice(11, 16), duracaoMin: duracaoMinutos(base) };
    marcados.set(editando, { hora: hora ?? atual.hora, duracaoMin: duracaoMin ?? atual.duracaoMin });
    $('loteFim').value = intervaloEditado().fim;
    setAviso();
    renderRevisao();
  }

  function trocarTermino(valor) {
    if (!editando) return;
    const hora = $('loteHora').value || base.inicio.slice(11, 16);
    const inicio = parseDateTimeLocal(`${editando}T${hora}`);
    const fim = parseDateTimeLocal(valor);
    const duracaoMin = inicio && fim ? Math.round((fim - inicio) / 60000) : 0;
    if (duracaoMin <= 0) { setAviso('O término precisa ser depois do início.'); return; }
    trocarHorario({ hora, duracaoMin });
  }

  function lancar() {
    const dlg = $('dialogLote');
    const btn = $('loteLancar');
    if (!base || !dlg?.open || btn?.disabled) return;
    if (btn) btn.disabled = true;
    const ocupados = diasDoLote().filter(({ data, horario }) => situacaoDoDia(estado.escalas, base, data, horario).estado !== 'livre');
    if (ocupados.length) {
      ocupados.forEach(({ data }) => marcados.delete(data));
      setAviso(`${ocupados.length === 1 ? '1 dia saiu' : `${ocupados.length} dias saíram`} do lote porque já tem escala no horário. Confira e toque em Lançar de novo.`);
      renderRevisao();
      return;
    }
    const dias = diasDoLote();
    if (!validarLote(estado.escalas, base, dias).ok) { renderRevisao(); return; }
    const novas = gerarEscalasLote(base, dias);
    const antes = clonarEscalas();
    estado.escalas.push(...novas);
    if (!salvar()) { estado.escalas = antes; render(); renderRevisao(); return; }
    const ids = new Set(novas.map((e) => e.id));
    base = null;
    marcados.clear();
    dlg.close();
    haptic([10, 30, 10]);
    render();
    toast(`${textoEscalas(novas.length)} ${novas.length === 1 ? 'lançada' : 'lançadas'}.`, {
      acao: { rotulo: 'Desfazer', fn: () => {
        const restantes = estado.escalas.filter((e) => !ids.has(e.id));
        if (restantes.length === estado.escalas.length) return;
        const antesDesfazer = clonarEscalas();
        estado.escalas = restantes;
        if (!salvar()) { estado.escalas = antesDesfazer; render(); return; }
        /* Escala removida não pode continuar em edição (v80, M1). */
        if (estado.editandoId !== null && ids.has(estado.editandoId)) cancelarEdicao();
        render();
      } },
    });
  }

  function abrir(idBase) {
    const escala = estado.escalas.find((e) => String(e.id) === String(idBase));
    const dlg = $('dialogLote');
    if (!escala || !dlg) return;
    base = escala;
    marcados.clear();
    editando = null;
    setAviso();
    const ini = parseDateTimeLocal(base.inicio);
    mesBase = indiceMes(ini.getFullYear(), ini.getMonth());
    mesAtual = mesBase;
    if ($('loteBase')) {
      $('loteBase').textContent = `Base: ${fmtDiaBase.format(ini).replace('.', '')} · ${base.inicio.slice(11, 16)} → ${base.fim.slice(11, 16)}. Toque nos dias para lançar a mesma escala.`;
    }
    mostrarEtapa(false);
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
    on('loteRevisar', 'click', () => { setAviso(); mostrarEtapa(true); renderRevisao(); });
    on('loteVoltar', 'click', () => { setAviso(); mostrarEtapa(false); });
    on('loteLista', 'click', (ev) => {
      const li = ev.target.closest('li[data-data]');
      if (li) editarDia(li.dataset.data);
    });
    on('loteHora', 'change', () => trocarHorario({ hora: $('loteHora').value }));
    on('loteFim', 'change', () => trocarTermino($('loteFim').value));
    document.querySelectorAll('#loteEditar .lote-dur').forEach((chip) => {
      chip.addEventListener('click', () => trocarHorario({ hora: $('loteHora').value, duracaoMin: Number(chip.dataset.horas) * 60 }));
    });
    on('loteEditarOk', 'click', () => { editando = null; $('loteEditar').classList.add('hidden'); renderRevisao(); });
    on('loteLancar', 'click', lancar);
  }

  return { abrir, ligarEventos };
}
