/* ==========================================================================
   Calculadora AC4 — lançar em outros dias (v79; fluxo direto na v81)
   Janela com calendário: a partir de uma escala salva (a base), o usuário toca
   nos dias. Cada dia marcado mostra a hora de início; o painel abaixo do
   calendário mostra o dia tocado e permite trocar o horário ali mesmo. A regra
   (conflito, vigência, geração) fica em ../lote.mjs; aqui só a interface.
   Estado só via `estado`.
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
/** "18:00" → "18h"; "06:30" → "06h30". */
const horaCurta = (hhmm) => (hhmm.slice(3) === '00' ? `${hhmm.slice(0, 2)}h` : `${hhmm.slice(0, 2)}h${hhmm.slice(3)}`);

/**
 * Cria a janela "Lançar em outros dias".
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, salvar, render, haptic,
 *   clonarEscalas, aposProximoPaint, cancelarEdicao, agendarEscalas.
 * @returns {{abrir:Function, fechar:Function, ligarEventos:Function}}
 */
export function criarAgendaDias(ctx) {
  const { $, on, estado, toast, salvar, render, haptic, clonarEscalas, cancelarEdicao, agendarEscalas } = ctx;

  let base = null;
  let mesBase = 0;            // índice ano*12+mês do mês da base
  let mesAtual = 0;           // índice do mês exibido
  const marcados = new Map(); // data → horário trocado (ou null = horário da base)
  let selecionado = null;     // dia mostrado no painel
  let editando = false;       // painel com os campos de horário abertos
  let resultado = null;       // v82: { escalas, desfazer } depois de lançar

  const textoEscalas = (n) => `${n} ${n === 1 ? 'escala' : 'escalas'}`;
  const textoContador = (n) => `${n} ${n === 1 ? 'dia marcado' : 'dias marcados'}`;
  const setAviso = (msg = '') => { if ($('loteAviso')) $('loteAviso').textContent = msg; };
  const diasDoLote = () => [...marcados.keys()].sort().map((data) => ({ data, ...(marcados.get(data) ? { horario: marcados.get(data) } : {}) }));
  const rotuloDia = (data) => {
    const [a, m, d] = data.split('-').map(Number);
    return `${DIAS_SEMANA[new Date(a, m - 1, d).getDay()]} ${doisDigitos(d)}/${doisDigitos(m)}`;
  };
  const horarioDe = (data) => marcados.get(data) || undefined;
  const horarioAtual = (data) => marcados.get(data) || { hora: base.inicio.slice(11, 16), duracaoMin: duracaoMinutos(base) };

  /** Problemas do lote por data (validarLote) — recalculado a cada mudança. */
  function problemasPorData() {
    const { ok, problemas } = validarLote(estado.escalas, base, diasDoLote());
    return { ok, mapa: new Map(problemas.filter((p) => p.data).map((p) => [p.data, p.motivo])) };
  }

  function textoIntervalo(data) {
    const { inicio, fim } = escalaDoDia(base, data, horarioDe(data));
    /* Término a partir de 2 dias depois ganha a data, para não parecer no mesmo dia. */
    const dias = Math.round((parseDateTimeLocal(fim.slice(0, 10) + 'T00:00') - parseDateTimeLocal(data + 'T00:00')) / 86400000);
    const fimTexto = dias >= 2 ? `${fim.slice(8, 10)}/${fim.slice(5, 7)} ${fim.slice(11, 16)}` : fim.slice(11, 16);
    return `${rotuloDia(data)} · ${inicio.slice(11, 16)} → ${fimTexto}`;
  }

  function renderGrade(mapa) {
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
      const marcado = marcados.has(data);
      const s = situacaoDoDia(estado.escalas, base, data);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lote-dia';
      btn.dataset.data = data;
      const num = document.createElement('span');
      num.className = 'lote-dia-num';
      num.textContent = String(d);
      btn.appendChild(num);
      btn.setAttribute('aria-pressed', marcado ? 'true' : 'false');
      if (marcado) {
        const hora = document.createElement('span');
        hora.className = 'lote-dia-hora';
        hora.textContent = horaCurta(horarioAtual(data).hora);
        btn.appendChild(hora);
        if (mapa.has(data)) btn.classList.add('is-problema');
      } else if (s.estado === 'base' || s.estado === 'fora-vigencia') {
        btn.setAttribute('aria-disabled', 'true');
        btn.title = s.motivo;
        btn.classList.add(s.estado === 'base' ? 'is-base' : 'is-bloqueado');
      } else if (s.estado === 'ocupado') {
        btn.title = s.motivo;
        btn.classList.add('is-ocupado');
      }
      if (data === selecionado) btn.classList.add('is-selecionado');
      if (data === chaveHoje) btn.classList.add('is-hoje');
      fragmento.appendChild(btn);
    }
    grade.replaceChildren(fragmento);
  }

  function renderPainel(mapa) {
    const painel = $('loteDiaPainel');
    if (!painel) return;
    painel.classList.toggle('hidden', !selecionado);
    if (!selecionado) { editando = false; $('loteEditar')?.classList.add('hidden'); return; }
    const marcado = marcados.has(selecionado);
    $('loteDiaTexto').textContent = textoIntervalo(selecionado);
    let problema = marcado ? (mapa.get(selecionado) || '') : '';
    if (!marcado) problema = `Já existe escala às ${base.inicio.slice(11, 16)} neste dia.`;
    $('loteDiaProblema').textContent = problema;
    $('loteAlterar').textContent = marcado ? 'Alterar' : 'Escolher outro horário';
    $('loteAlterar').classList.toggle('hidden', editando);
    $('loteEditar').classList.toggle('hidden', !editando);
    if (editando) {
      const { inicio, fim } = escalaDoDia(base, selecionado, horarioDe(selecionado));
      $('loteHora').value = inicio.slice(11, 16);
      $('loteFim').value = fim;
    }
  }

  /* v82: depois de lançar, a janela mostra o resultado (agenda / desfazer / concluir). */
  function mostrarEtapaResultado(ativo) {
    ['loteBase', 'loteCalendario', 'loteDiaPainel', 'loteRodape', 'loteAviso'].forEach((id) => $(id)?.classList.toggle('hidden', ativo));
    $('loteResultado')?.classList.toggle('hidden', !ativo);
  }

  function renderTudo() {
    if (!base) return;
    const { ok, mapa } = problemasPorData();
    renderGrade(mapa);
    renderPainel(mapa);
    if ($('loteContador')) $('loteContador').textContent = textoContador(marcados.size);
    const lancar = $('loteLancar');
    if (lancar) {
      lancar.textContent = marcados.size ? `Lançar ${textoEscalas(marcados.size)}` : 'Lançar';
      lancar.disabled = !ok;
    }
  }

  function tocarDia(btn) {
    const data = btn.dataset.data;
    if (btn.getAttribute('aria-disabled') === 'true') { setAviso(btn.title); return; }
    setAviso();
    editando = false;
    if (marcados.has(data)) {
      if (selecionado === data) { marcados.delete(data); selecionado = null; } else { selecionado = data; }
    } else if (situacaoDoDia(estado.escalas, base, data).estado === 'ocupado') {
      selecionado = data; // não marca: o painel oferece outro horário
    } else {
      if (marcados.size >= LIMITE_LOTE) { setAviso(`Limite de ${LIMITE_LOTE} dias por lote.`); return; }
      marcados.set(data, null);
      selecionado = data;
    }
    haptic(8);
    renderTudo();
  }

  function mudarMes(delta) {
    const alvo = mesAtual + delta;
    if (alvo < mesBase - MESES_NAVEGACAO || alvo > mesBase + MESES_NAVEGACAO) return;
    mesAtual = alvo;
    renderTudo();
  }

  /* ------------------------------------------------ troca de horário do dia */
  function trocarHorario({ hora, duracaoMin }) {
    if (!selecionado) return;
    if (!marcados.has(selecionado) && marcados.size >= LIMITE_LOTE) { setAviso(`Limite de ${LIMITE_LOTE} dias por lote.`); return; }
    const atual = horarioAtual(selecionado);
    /* Campo Início apagado = sem mudança (v80, M2). */
    marcados.set(selecionado, { hora: hora || atual.hora, duracaoMin: duracaoMin ?? atual.duracaoMin });
    setAviso();
    renderTudo();
  }

  function trocarTermino(valor) {
    if (!selecionado) return;
    const hora = $('loteHora').value || horarioAtual(selecionado).hora;
    const inicio = parseDateTimeLocal(`${selecionado}T${hora}`);
    const fim = parseDateTimeLocal(valor);
    const duracaoMin = inicio && fim ? Math.round((fim - inicio) / 60000) : 0;
    if (duracaoMin <= 0) { setAviso('O término precisa ser depois do início.'); return; }
    trocarHorario({ hora, duracaoMin });
  }

  /* ------------------------------------------------------------ lançamento */
  function lancar() {
    const dlg = $('dialogLote');
    const btn = $('loteLancar');
    if (!base || !dlg?.open || btn?.disabled) return;
    if (btn) btn.disabled = true;
    const ocupados = diasDoLote().filter(({ data, horario }) => situacaoDoDia(estado.escalas, base, data, horario).estado !== 'livre');
    if (ocupados.length) {
      ocupados.forEach(({ data }) => marcados.delete(data));
      if (ocupados.some(({ data }) => data === selecionado)) selecionado = null;
      setAviso(`${ocupados.length === 1 ? '1 dia saiu' : `${ocupados.length} dias saíram`} do lote porque já tem escala no horário. Confira e toque em Lançar de novo.`);
      renderTudo();
      return;
    }
    const dias = diasDoLote();
    if (!validarLote(estado.escalas, base, dias).ok) { renderTudo(); return; }
    const novas = gerarEscalasLote(base, dias);
    const antes = clonarEscalas();
    estado.escalas.push(...novas);
    if (!salvar()) { estado.escalas = antes; render(); renderTudo(); return; }
    const ids = new Set(novas.map((e) => e.id));
    base = null;
    marcados.clear();
    selecionado = null;
    haptic([10, 30, 10]);
    render();
    const desfazer = () => {
      const restantes = estado.escalas.filter((e) => !ids.has(e.id));
      if (restantes.length === estado.escalas.length) return;
      const antesDesfazer = clonarEscalas();
      estado.escalas = restantes;
      if (!salvar()) { estado.escalas = antesDesfazer; render(); return; }
      /* Escala removida não pode continuar em edição (v80, M1). */
      if (estado.editandoId !== null && ids.has(estado.editandoId)) cancelarEdicao();
      render();
    };
    const texto = `${textoEscalas(novas.length)} ${novas.length === 1 ? 'lançada' : 'lançadas'}.`;
    resultado = { escalas: novas, desfazer };
    $('loteResultadoTexto').textContent = texto;
    mostrarEtapaResultado(true);
    toast(texto, { acao: { rotulo: 'Desfazer', fn: desfazer } });
  }

  function abrir(idBase) {
    const escala = estado.escalas.find((e) => String(e.id) === String(idBase));
    const dlg = $('dialogLote');
    if (!escala || !dlg) return;
    base = escala;
    marcados.clear();
    selecionado = null;
    editando = false;
    resultado = null;
    mostrarEtapaResultado(false);
    setAviso();
    const ini = parseDateTimeLocal(base.inicio);
    mesBase = indiceMes(ini.getFullYear(), ini.getMonth());
    mesAtual = mesBase;
    if ($('loteBase')) {
      $('loteBase').textContent = `Base: ${fmtDiaBase.format(ini).replace('.', '')} · ${base.inicio.slice(11, 16)} → ${base.fim.slice(11, 16)}. Toque nos dias; para outro horário, use “Alterar”.`;
    }
    renderTudo();
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
      if (btn) tocarDia(btn);
    });
    on('loteAlterar', 'click', () => { editando = true; renderTudo(); });
    on('loteEditarOk', 'click', () => { editando = false; renderTudo(); });
    on('loteHora', 'change', () => trocarHorario({ hora: $('loteHora').value }));
    on('loteFim', 'change', () => trocarTermino($('loteFim').value));
    document.querySelectorAll('#loteEditar .lote-dur').forEach((chip) => {
      chip.addEventListener('click', () => trocarHorario({ hora: $('loteHora').value, duracaoMin: Number(chip.dataset.horas) * 60 }));
    });
    on('loteLancar', 'click', lancar);
    on('loteAddAgenda', 'click', () => {
      const escalas = resultado?.escalas.filter((n) => estado.escalas.some((e) => e.id === n.id)) || [];
      fechar();
      if (escalas.length) agendarEscalas(escalas);
    });
    on('loteDesfazer', 'click', () => { resultado?.desfazer(); resultado = null; fechar(); });
    on('loteConcluir', 'click', () => { resultado = null; fechar(); });
  }

  return { abrir, fechar, ligarEventos };
}
