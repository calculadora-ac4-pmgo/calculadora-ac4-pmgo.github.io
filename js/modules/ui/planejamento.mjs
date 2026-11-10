/* ==========================================================================
   Calculadora AC4 — planejamento do mês e filtros (v75)
   Seletor de mês, painel do mês (valor, horas, comparação, situações, meta),
   histórico dos últimos 6 meses, meta mensal e os filtros da lista
   (mês, origem, situação e busca). Estado só via `estado`.
   ========================================================================== */
import { toInputMonth, parseDateTimeLocal, fmtMesRef, fmtMoeda, fmtHoras } from '../formato.mjs';
import { STATUS_ESCALA } from '../persistencia.mjs';
import { STATUS_INFO, statusEscala } from '../templates.mjs';
import { horasDoMes, mesSoDeSecao, situacaoLimite } from '../limite-horas.mjs';

/**
 * Textos da linha "Horas no mês" do Planejamento (v97).
 * @param {{horas:number, limite:number, restante:number, excedeu:boolean, excesso:number}} s
 * @returns {{valor:string, nota:string}}
 */
export function textosLimiteHoras(s) {
  const nota = s.excedeu ? `${s.excesso}h acima do limite` : s.restante === 0 ? 'No limite' : `Restam ${s.restante}h`;
  return { valor: `${s.horas}h de ${s.limite}h`, nota };
}

/**
 * Cria o planejamento do mês.
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, salvarMetas, calcularEscala e render.
 * @returns {{atualizarSelectMes:Function, renderPlanejamento:Function, renderHistorico:Function,
 *   mesPainelAtual:Function, abrirMetaMensal:Function, salvarMetaMensal:Function,
 *   removerMetaMensal:Function, ligarEventos:Function}}
 */
export function criarPlanejamento(ctx) {
  const { $, on, estado, toast, salvarMetas, calcularEscala, render } = ctx;

  /* -------------------------------------------------------- filtro por mês */
  function atualizarSelectMes() {
    const sel = $('filtroMes');
    if (!sel) return;
    const meses = new Set(estado.escalas.map((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio))));
    const antigo = sel.value;
    sel.innerHTML = '<option value="">Todos os meses</option>';
    [...meses].sort().forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = fmtMesRef(m);
      if (m === antigo) opt.selected = true;
      sel.appendChild(opt);
    });
    estado.filtroMes = meses.has(antigo) ? antigo : '';
    if (sel.value !== estado.filtroMes) sel.value = estado.filtroMes;
  }

  const mesPainelAtual = () => {
    if (estado.filtroMes) return estado.filtroMes;
    const atual = toInputMonth(new Date());
    if (estado.escalas.some((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === atual)) return atual;
    const meses = estado.escalas.map((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio))).sort();
    return meses.at(-1) || atual;
  };
  const mesAnterior = (mes) => {
    const [ano, numero] = mes.split('-').map(Number);
    return toInputMonth(new Date(ano, numero - 2, 1, 12));
  };

  function resumoPlanejamento(lista) {
    const resultados = lista.map((e) => calcularEscala(e));
    return {
      qtd: lista.length,
      mins: resultados.reduce((s, r) => s + r.mins, 0),
      diurno: resultados.reduce((s, r) => s + r.minDiurno, 0),
      noturno: resultados.reduce((s, r) => s + r.minNoturno, 0),
      valor: resultados.reduce((s, r, i) => s + r.valorCentavos * (lista[i].qtdPm || 1), 0),
    };
  }

  function renderPlanejamento() {
    const mes = mesPainelAtual();
    const listaMes = estado.escalas.filter((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === mes);
    const listaAnterior = estado.escalas.filter((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === mesAnterior(mes));
    const atual = resumoPlanejamento(listaMes);
    const anterior = resumoPlanejamento(listaAnterior);
    $('planningMonth').textContent = fmtMesRef(mes);
    $('planningValue').textContent = fmtMoeda(atual.valor);
    $('planningHours').textContent = `${fmtHoras(atual.mins)} · ${atual.qtd} escala${atual.qtd === 1 ? '' : 's'}`;

    /* v97: horas pagas do mês (só escalas individuais, v99) diante do limite mensal. */
    const limite = situacaoLimite(horasDoMes(estado.escalas, mes, calcularEscala));
    const textosLimite = textosLimiteHoras(limite);
    $('planningLimiteValor').textContent = textosLimite.valor;
    $('planningLimiteNota').textContent = textosLimite.nota;
    $('planningLimite').classList.toggle('is-acima', limite.excedeu);
    /* v99: mês só com escalas de mais de um PM é planejamento da seção; sem linha de horas. */
    $('planningLimite').classList.toggle('hidden', mesSoDeSecao(estado.escalas, mes));

    const comparacao = $('planningComparison');
    comparacao.className = 'planning-comparison';
    if (!anterior.qtd) {
      comparacao.textContent = 'Sem dados do mês anterior';
    } else {
      const variacao = anterior.valor ? ((atual.valor - anterior.valor) / anterior.valor) * 100 : 0;
      const sinal = variacao > 0 ? '↑' : variacao < 0 ? '↓' : '→';
      comparacao.textContent = `${sinal} ${Math.abs(variacao).toFixed(0)}% em relação a ${fmtMesRef(mesAnterior(mes))}`;
      comparacao.classList.add(variacao > 0 ? 'is-up' : variacao < 0 ? 'is-down' : 'is-flat');
    }

    const totalHoras = atual.diurno + atual.noturno;
    const pctDia = totalHoras ? (atual.diurno / totalHoras) * 100 : 50;
    $('planningDayBar').style.width = `${pctDia}%`;
    $('planningNightBar').style.width = `${100 - pctDia}%`;
    $('planningDayLabel').textContent = `Dia ${fmtHoras(atual.diurno)}`;
    $('planningNightLabel').textContent = `Noite ${fmtHoras(atual.noturno)}`;

    const contagens = Object.fromEntries(STATUS_ESCALA.map((status) => [status, 0]));
    listaMes.forEach((e) => { contagens[statusEscala(e)] += 1; });
    $('planningStatusGrid').innerHTML = STATUS_ESCALA.map((status) => `
      <button class="planning-status planning-status--${status}" type="button" data-status-filter="${status}" aria-label="Filtrar escalas ${STATUS_INFO[status].curto.toLocaleLowerCase('pt-BR')}">
        <strong>${contagens[status]}</strong><span>${STATUS_INFO[status].curto}</span>
      </button>`).join('');

    const meta = estado.metasMensais[mes];
    const progresso = $('planningProgress');
    progresso.classList.toggle('hidden', !meta);
    $('btnPlanningGoal').textContent = meta ? 'Editar meta' : 'Definir meta';
    if (meta) {
      const metasAtivas = [];
      const percentuais = [];
      if (meta.valorCentavos > 0) {
        metasAtivas.push(fmtMoeda(meta.valorCentavos));
        percentuais.push((atual.valor / meta.valorCentavos) * 100);
      }
      if (meta.horas > 0) {
        metasAtivas.push(`${String(meta.horas).replace('.', ',')}h`);
        percentuais.push(((atual.mins / 60) / meta.horas) * 100);
      }
      const percentual = Math.max(0, Math.min(100, Math.min(...percentuais)));
      $('planningProgressLabel').textContent = `Meta: ${metasAtivas.join(' · ')}`;
      $('planningProgressValue').textContent = `${Math.round(percentual)}%`;
      $('planningProgressBar').style.width = `${percentual}%`;
      $('planningProgressTrack').setAttribute('aria-valuenow', String(Math.round(percentual)));
    }

    renderHistorico(mes);

  }

  /* Histórico dos últimos 6 meses até o mês do painel. Barras em HTML/CSS,
     sem biblioteca: altura via CSSOM (a CSP bloqueia style inline). */
  /* Sem "R$" por barra (cabe em 390px); a unidade vai no título do gráfico. */
  const reaisCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const mesCurto = (mes) => {
    const [ano, numero] = mes.split('-').map(Number);
    return new Date(ano, numero - 1, 1, 12).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  };

  function renderHistorico(mesFinal) {
    const figura = $('planningHistory');
    if (!figura) return;
    const meses = [mesFinal];
    while (meses.length < 6) meses.unshift(mesAnterior(meses[0]));
    const porMes = new Map(meses.map((m) => [m, []]));
    estado.escalas.forEach((e) => porMes.get(toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)))?.push(e));
    const serie = meses.map((m) => ({ mes: m, ...resumoPlanejamento(porMes.get(m)) }));
    const comDados = serie.filter((s) => s.qtd);

    /* Tendência exige ao menos dois meses com escalas. */
    figura.classList.toggle('hidden', comDados.length < 2);
    if (comDados.length < 2) return;

    const maximo = Math.max(...serie.map((s) => s.valor), 1);
    const media = comDados.reduce((s, x) => s + x.valor, 0) / comDados.length;
    $('planningHistoryAvg').textContent = `Média ${fmtMoeda(Math.round(media))}`;
    const barras = $('planningHistoryBars');
    barras.innerHTML = serie.map((s) => `
      <li class="planning-history-col${s.mes === mesFinal ? ' is-current' : ''}${s.qtd ? '' : ' is-empty'}">
        <span class="planning-history-value" aria-hidden="true">${s.qtd ? reaisCompacto.format(s.valor / 100) : '—'}</span>
        <span class="planning-history-track" aria-hidden="true"><span class="planning-history-bar"></span></span>
        <span class="planning-history-month" aria-hidden="true">${mesCurto(s.mes)}</span>
        <span class="sr-only">${fmtMesRef(s.mes)}: ${fmtMoeda(s.valor)}, ${s.qtd} escala${s.qtd === 1 ? '' : 's'}</span>
      </li>`).join('');
    barras.querySelectorAll('.planning-history-bar').forEach((el, i) => {
      el.style.height = `${(serie[i].valor / maximo) * 100}%`;
    });
  }

  function abrirMetaMensal() {
    const mes = mesPainelAtual();
    const meta = estado.metasMensais[mes] || {};
    $('planningGoalMonth').textContent = fmtMesRef(mes);
    $('planningGoalValue').value = meta.valorCentavos ? (meta.valorCentavos / 100).toFixed(2) : '';
    $('planningGoalHours').value = meta.horas || '';
    $('planningGoalClear').classList.toggle('hidden', !estado.metasMensais[mes]);
    $('dialogPlanningGoal')?.showModal();
  }

  function salvarMetaMensal() {
    const mes = mesPainelAtual();
    const valorCentavos = Math.max(0, Math.round(Number($('planningGoalValue')?.value || 0) * 100));
    const horas = Math.max(0, Math.min(744, Number($('planningGoalHours')?.value || 0)));
    if (!valorCentavos && !horas) delete estado.metasMensais[mes];
    else estado.metasMensais[mes] = { valorCentavos, horas };
    if (!salvarMetas()) return false;
    $('dialogPlanningGoal')?.close();
    renderPlanejamento();
    toast(valorCentavos || horas ? 'Meta mensal salva neste aparelho.' : 'Meta mensal removida.');
    return true;
  }

  function removerMetaMensal() {
    delete estado.metasMensais[mesPainelAtual()];
    if (!salvarMetas()) return;
    $('dialogPlanningGoal')?.close();
    renderPlanejamento();
    toast('Meta mensal removida.');
  }

  function ligarEventos() {
    on('btnPlanningGoal', 'click', abrirMetaMensal);
    on('planningToggle', 'click', () => {
      const painel = document.querySelector('.planning-panel');
      const aberto = !painel?.classList.contains('is-expanded');
      painel?.classList.toggle('is-expanded', aberto);
      $('planningToggle')?.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      const texto = $('planningToggle')?.querySelector('span');
      if (texto) texto.textContent = aberto ? 'Ocultar detalhes do mês' : 'Ver detalhes do mês';
    });
    on('planningGoalCancel', 'click', () => $('dialogPlanningGoal')?.close());
    on('planningGoalClear', 'click', removerMetaMensal);
    on('planningGoalForm', 'submit', (ev) => { ev.preventDefault(); salvarMetaMensal(); });
    on('planningStatusGrid', 'click', (ev) => {
      const btn = ev.target.closest('[data-status-filter]');
      if (!btn) return;
      estado.filtroStatus = btn.dataset.statusFilter || '';
      if ($('filtroStatus')) $('filtroStatus').value = estado.filtroStatus;
      render();
      document.querySelector('.feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    on('filtroMes', 'change', () => { estado.filtroMes = $('filtroMes')?.value || ''; render(); });
    on('filtroOrigem', 'change', () => { estado.filtroOrigem = $('filtroOrigem')?.value || ''; render(); });
    on('filtroStatus', 'change', () => { estado.filtroStatus = $('filtroStatus')?.value || ''; render(); });
    on('filtroBusca', 'input', () => { estado.filtroBusca = ($('filtroBusca')?.value || '').trim(); render(); });
  }

  return {
    atualizarSelectMes, renderPlanejamento, renderHistorico, mesPainelAtual,
    abrirMetaMensal, salvarMetaMensal, removerMetaMensal, ligarEventos,
  };
}
