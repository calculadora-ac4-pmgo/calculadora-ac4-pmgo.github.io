/* ==========================================================================
   Calculadora AC4 — v77
   Módulo principal: estado, ligação dos módulos de interface (js/modules/ui/),
   render() e init(). Regras de negócio, formatação e agenda vivem em js/modules/.
   ========================================================================== */
import {
  fmtMoeda, fmtHoras, fmtData, fmtDiaSemana, fmtHora,
  parseDateTimeLocal, toInputLocal,
  toInputMonth, fmtMesRef, escapeHTML,
} from './modules/formato.mjs';
import {
  TABELA_OFICIAL, labelOrigem,
  calcularEscala as calcularEscalaBase, tabelaEscalaValida,
} from './modules/calculo.mjs';
import {
  montarICS as montarICSBase,
  gerarLinkGoogleAgenda as gerarLinkGoogleAgendaBase,
  gerarLinkOutlookAgenda as gerarLinkOutlookAgendaBase,
} from './modules/agenda.mjs';
import { desserializarEscalas } from './modules/persistencia.mjs';
import {
  statusEscala,
  botoesAcaoHTML, seletorStatusHTML, cardEscalaHTML,
} from './modules/templates.mjs';
import { criarPWA } from './modules/pwa.mjs';
import { criarAvisos } from './modules/ui/avisos.mjs';
import { criarObservabilidade } from './modules/ui/observabilidade.mjs';
import { criarAparencia } from './modules/ui/aparencia.mjs';
import { criarDados } from './modules/ui/dados.mjs';
import { criarExportacoes } from './modules/ui/exportacoes.mjs';
import { criarCompartilhar } from './modules/ui/compartilhar.mjs';
import { criarPlanejamento } from './modules/ui/planejamento.mjs';
import { criarFormulario } from './modules/ui/formulario.mjs';
import { criarModelos } from './modules/ui/modelos.mjs';

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

  /* Versão da aplicação (sincronizada pelo tools/bump-version.mjs). Serve para
     carimbar o log de erros e detectar clientes presos em cache antigo:
     se __ac4Version no console divergir do rodapé/CHANGELOG, o SW não atualizou. */
  const APP_VERSION = '77';

  const STORAGE = {
    escalas:   'pmgoEscalas',
    theme:     'pmgoTheme',
    pwaBanner: 'pmgoPwaBanner',
    pwaVisitas: 'pmgoPwaVisitas',
    modelos:   'pmgoModelos',
    metas:     'pmgoMetasMensais',
    erros:     'pmgoErros',
    versao:    'pmgoVersion',
    novidades: 'pmgoNovidadesVistas',
    schema:    'pmgoSchemaVersion',
    ultimoBackup:   'pmgoUltimoBackup',
    lembreteBackup: 'pmgoLembreteBackup',
  };

  /* ------------------------------------------------------------ estado */
  let escalas = [];
  let editandoId = null;
  let ultimaExcluida = null;
  let filtroMes = '';
  let filtroOrigem = '';
  let filtroBusca = '';
  let filtroStatus = '';
  /* Lista em partes (auditoria v67, P2-1): com centenas de escalas, montar
     todos os cards e linhas criava ~21 mil nós e ~1,5 s por render. Mostra as
     mais recentes; os totais continuam somando todas. */
  const PASSO_LISTA = 30;
  let limiteLista = PASSO_LISTA;
  let assinaturaFiltros = '';
  let modelos = [];
  let metasMensais = {};
  let versaoAnterior = null;
  let submetendo = false;
  let sheetAberto = false;
  const clonarEscalas = () => JSON.parse(JSON.stringify(escalas));
  const lerLocal = (chave) => { try { return localStorage.getItem(chave); } catch { return null; } };
  const aposProximoPaint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const esperarProximoPaint = () => new Promise((resolve) => aposProximoPaint(resolve));
  /* Ganchos de teste (window.__ac4Testes*, simulações) só existem em ambiente
     local; em produção ficam só os de suporte (__ac4Erros, __ac4Version). */
  const ambienteDeTeste = ['localhost', '127.0.0.1'].includes(location.hostname);

  /* Acesso ao estado para os módulos de interface (js/modules/ui/) e para as
     suítes de teste: módulos leem e gravam só por aqui (v74). */
  const estado = {
    get escalas() { return escalas; }, set escalas(v) { escalas = v; },
    get editandoId() { return editandoId; }, set editandoId(v) { editandoId = v; },
    get ultimaExcluida() { return ultimaExcluida; }, set ultimaExcluida(v) { ultimaExcluida = v; },
    get filtroMes() { return filtroMes; }, set filtroMes(v) { filtroMes = v; },
    get filtroOrigem() { return filtroOrigem; }, set filtroOrigem(v) { filtroOrigem = v; },
    get filtroBusca() { return filtroBusca; }, set filtroBusca(v) { filtroBusca = v; },
    get filtroStatus() { return filtroStatus; }, set filtroStatus(v) { filtroStatus = v; },
    get limiteLista() { return limiteLista; }, set limiteLista(v) { limiteLista = v; },
    get modelos() { return modelos; }, set modelos(v) { modelos = v; },
    get metasMensais() { return metasMensais; }, set metasMensais(v) { metasMensais = v; },
    get versaoAnterior() { return versaoAnterior; }, set versaoAnterior(v) { versaoAnterior = v; },
    get submetendo() { return submetendo; }, set submetendo(v) { submetendo = v; },
    get sheetAberto() { return sheetAberto; }, set sheetAberto(v) { sheetAberto = v; },
  };

  /* Módulos de interface — criados nesta ordem; quem vem depois recebe o que
     os anteriores devolvem. Um módulo de UI nunca importa outro. */
  const { toast, dialogConfirmar, haptic } = criarAvisos({ $ });
  const { registrarErro, initObservabilidade } = criarObservabilidade({ STORAGE, APP_VERSION, estado, toast });
  const { aplicarTema, initTema, initNovidades } = criarAparencia({
    $, on, STORAGE, lerLocal, APP_VERSION, estado, aposProximoPaint,
  });
  const {
    salvar, carregar, salvarModelos, salvarMetas, exportarBackup, restaurarBackup,
    pedirArmazenamentoPersistente, textoStatusBackup, lembrarBackup, ehIOS, rodandoInstalado,
  } = criarDados({
    estado, STORAGE, APP_VERSION, lerLocal, toast, dialogConfirmar, registrarErro,
    render: () => render(), renderModelos: () => renderModelos(), cancelarEdicao: () => cancelarEdicao(),
    clonarEscalas,
  });
  const { exportarCSV, imprimirRelatorio, agendarEscalas, agendarEscalaItem } = criarExportacoes({
    $, estado, toast, haptic, escalasOrdenadas, aposProximoPaint,
    /* consts definidas mais abaixo: chamadas só no momento do uso */
    calcularEscala: (e) => calcularEscala(e), montarICS: (lista) => montarICS(lista),
    gerarLinkGoogleAgenda: (e) => gerarLinkGoogleAgenda(e),
    gerarLinkOutlookAgenda: (e, corporativo) => gerarLinkOutlookAgenda(e, corporativo),
    isMobileViewport: () => isMobileViewport(),
  });
  const { abrirShareSheet, copiarResumo, compartilharWhatsApp, compartilharNativo, initFeedback } = criarCompartilhar({
    $, on, toast, haptic, escalasOrdenadas, textoStatusBackup, aposProximoPaint, APP_VERSION, ambienteDeTeste,
    calcularEscala: (e) => calcularEscala(e),
  });
  const planejamento = criarPlanejamento({
    $, on, estado, toast, salvarMetas, render: () => render(), calcularEscala: (e) => calcularEscala(e),
  });
  const { atualizarSelectMes, renderPlanejamento } = planejamento;
  const formulario = criarFormulario({
    $, on, estado, toast, dialogConfirmar, haptic, salvar, clonarEscalas, aposProximoPaint, esperarProximoPaint,
    pedirArmazenamentoPersistente, agendarEscalaItem, PASSO_LISTA,
    /* definidos mais abaixo: chamadas só no momento do uso */
    render: () => render(), calcularEscala: (e) => calcularEscala(e),
    mostrarInstalacaoAposConversao: () => pwa.mostrarInstalacaoAposConversao(),
  });
  const {
    isMobileViewport, setDetalhesAvancados, abrirPainelLancamentoMobile, cancelarEdicao,
    atualizarResumoLancamento, sincronizarTodosControlesDataHora,
  } = formulario;
  const modelosFavoritos = criarModelos({
    $, on, estado, toast, dialogConfirmar, salvarModelos, aposProximoPaint, isMobileViewport,
    abrirPainelLancamentoMobile, setDetalhesAvancados, sincronizarTodosControlesDataHora, atualizarResumoLancamento,
    atualizarResumoFim: formulario.atualizarResumoFim, atualizarChipsDuracao: formulario.atualizarChipsDuracao,
    lerQtdPm: formulario.lerQtdPm,
  });
  const { renderModelos } = modelosFavoritos;

  /* -------------------------------------------- tabela de valores */
  /* Pontes para os módulos — injetam a tabela vigente lida do DOM,
     mantendo as assinaturas originais nos pontos de uso. */
  /* Cache do cálculo (auditoria v67, P2-1): o laço minuto a minuto é caro e
     cada render() pede o mesmo cálculo várias vezes (lista, painel do mês,
     histórico). O resultado depende só de início, fim e da tabela aplicada —
     tudo na chave. Resultados congelados: nenhum chamador os altera. */
  const cacheCalculo = new Map();
  const LIMITE_CACHE_CALCULO = 5000;
  const calcularEscala = (e) => {
    const vigente = TABELA_OFICIAL;
    const t = tabelaEscalaValida(e.tabela) ? e.tabela : vigente;
    const v = t.valores;
    const chave = `${e.inicio}|${e.fim}|${v.AD}|${v.AN}|${v.VD}|${v.VN}|${t.portaria || ''}`;
    let r = cacheCalculo.get(chave);
    if (!r) {
      if (cacheCalculo.size >= LIMITE_CACHE_CALCULO) cacheCalculo.clear();
      r = Object.freeze(calcularEscalaBase(e, vigente));
      cacheCalculo.set(chave, r);
    }
    return r;
  };
  const montarICS = (lista) => montarICSBase(lista, TABELA_OFICIAL);
  const gerarLinkGoogleAgenda = (e) => gerarLinkGoogleAgendaBase(e, TABELA_OFICIAL);
  const gerarLinkOutlookAgenda = (e, corporativo) => gerarLinkOutlookAgendaBase(e, TABELA_OFICIAL, corporativo);

  function escalasOrdenadas() {
    let lista = escalas
      .map((e) => [+(parseDateTimeLocal(e.inicio) || new Date(e.inicio)), e])
      .sort((a, b) => a[0] - b[0])
      .map(([, e]) => e);
    if (filtroMes) lista = lista.filter((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === filtroMes);
    if (filtroOrigem) lista = lista.filter((e) => (e.origem || 'AC4') === filtroOrigem);
    if (filtroStatus) lista = lista.filter((e) => statusEscala(e) === filtroStatus);
    if (filtroBusca) {
      const termo = filtroBusca.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
      lista = lista.filter((e) => `${e.descricao || ''} ${labelOrigem(e.origem || 'AC4')}`
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(termo));
    }
    return lista;
  }

  /* ----------------------------------------------------------- render */
  function render() {
    atualizarSelectMes();
    const lista = escalasOrdenadas();
    const resultados = lista.map((e) => ({ e, r: calcularEscala(e) }));

    const totMins    = resultados.reduce((s, x) => s + x.r.mins, 0);
    const totDiurno  = resultados.reduce((s, x) => s + x.r.minDiurno, 0);
    const totNoturno = resultados.reduce((s, x) => s + x.r.minNoturno, 0);
    const totValor   = resultados.reduce((s, x) => s + x.r.valorCentavos * (x.e.qtdPm || 1), 0);

    $('totHoras').textContent    = fmtHoras(totMins);
    $('totDiurnas').textContent  = fmtHoras(totDiurno);
    $('totNoturnas').textContent = fmtHoras(totNoturno);
    $('totValor').textContent    = fmtMoeda(totValor);
    $('mobileTotal').textContent = fmtMoeda(totValor);
    $('pctDiurnas').textContent  = totMins ? `${((totDiurno  / totMins) * 100).toFixed(1).replace('.', ',')}% do total` : '0% do total';
    $('pctNoturnas').textContent = totMins ? `${((totNoturno / totMins) * 100).toFixed(1).replace('.', ',')}% do total` : '0% do total';

    const filtrosAtivos = !!(filtroMes || filtroOrigem || filtroBusca || filtroStatus);
    const assinatura = [filtroMes, filtroOrigem, filtroStatus, filtroBusca].join('|');
    if (assinatura !== assinaturaFiltros) { assinaturaFiltros = assinatura; limiteLista = PASSO_LISTA; }
    const visiveis = resultados.slice(-limiteLista);
    const ocultas = resultados.length - visiveis.length;
    const sufixo = filtroMes ? ` em ${fmtMesRef(filtroMes)}` : ' no período';
    $('totQtd').textContent = `${lista.length} escala${lista.length === 1 ? '' : 's'}${sufixo}`;
    /* Resumo compacto do card de Valor (mobile): "96h · 8 escalas" */
    if ($('metricResumoMobile')) {
      $('metricResumoMobile').textContent = `${fmtHoras(totMins)} · ${lista.length} escala${lista.length === 1 ? '' : 's'}`;
    }
    $('btnClearAll').classList.toggle('hidden', escalas.length === 0);
    $('btnRepeatLast')?.classList.toggle('hidden', escalas.length === 0);
    renderPlanejamento();

    const container = $('listaEscalas');
    if (!lista.length) {
      const msg = filtrosAtivos ? 'Nenhuma escala corresponde aos filtros. Ajuste a busca ou o período.' : 'Preencha o formulário acima para iniciar o cálculo.';
      container.innerHTML = `
        <div class="empty-state">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>
          </svg>
          <h3>Nenhuma escala lançada</h3>
          <p>${escapeHTML(msg)}</p>
        </div>`;
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="escala-table">
          <thead><tr>
            <th>Dia</th><th>Data</th><th>Início</th><th>Término</th>
            <th>Tipo</th><th>Situação</th><th>Horas</th><th>Valor</th><th>Ações</th>
          </tr></thead>
          <tbody>`;

    visiveis.forEach(({ e, r }) => {
      const qtd = e.qtdPm || 1;
      const valorTotal = r.valorCentavos * qtd;
      const tipoChips = [];
      if (r.minVermelha > 0) tipoChips.push('<span class="chip chip-red">Vermelha</span>');
      if (r.minVermelha < r.mins) tipoChips.push('<span class="chip chip-blue">Azul</span>');
      tipoChips.push(r.minNoturno > 0
        ? `<span class="chip chip-night">${fmtHoras(r.minNoturno)} noturno</span>`
        : '<span class="chip chip-day">Diurno</span>');
      if (qtd > 1) tipoChips.push(`<span class="chip chip-neutral">${qtd} PMs</span>`);
      tipoChips.push(`<span class="chip chip-origem">${escapeHTML(labelOrigem(e.origem))}</span>`);

      const fimStr = fmtData(e.inicio) === fmtData(e.fim) ? fmtHora(e.fim) : `${fmtData(e.fim)} ${fmtHora(e.fim)}`;
      const unidadeTexto = e.descricao && e.descricao !== 'Escala AC4' ? e.descricao : '-';
      const unidadeNota = `<span class="table-note">Unidade: ${escapeHTML(unidadeTexto)}</span>`;

      html += `
        <tr>
          <td data-label="Dia">${fmtDiaSemana(e.inicio)}</td>
          <td data-label="Data">${fmtData(e.inicio)}${unidadeNota}</td>
          <td data-label="Início">${fmtHora(e.inicio)}</td>
          <td data-label="Término">${fimStr}</td>
          <td data-label="Tipo"><div class="chips">${tipoChips.join('')}</div></td>
          <td data-label="Situação">${seletorStatusHTML(e, 'table-status')}</td>
          <td data-label="Horas">${fmtHoras(r.mins)}</td>
          <td data-label="Valor" class="value-cell">${fmtMoeda(valorTotal)}${qtd > 1 ? `<span class="table-note">${fmtMoeda(r.valorCentavos)}/PM</span>` : ''}</td>
          <td data-label="Ações">${botoesAcaoHTML(e.id)}</td>
        </tr>`;
    });
    html += '</tbody>';
    if (lista.length > 1) {
      html += `
        <tfoot>
          <tr class="table-total-row">
            <td colspan="6">Total geral (${lista.length} escalas)</td>
            <td>${fmtHoras(totMins)}</td>
            <td class="value-cell">${fmtMoeda(totValor)}</td>
            <td></td>
          </tr>
        </tfoot>`;
    }
    html += '</table></div>';

    /* Cards enxutos (mobile) — vêm antes da tabela no DOM; CSS mostra um ou
       outro conforme a largura. Mesma fonte de dados, sem tocar no desktop. */
    const cardsMobile = `<div class="escala-cards" role="list" aria-label="Escalas lançadas">${visiveis.map(({ e, r }) => cardEscalaHTML(e, r)).join('')}</div>`;
    const anteriores = ocultas
      ? `<div class="lista-anteriores">
          <button class="btn btn-outline btn-sm" data-acao="anteriores" type="button">Mostrar ${Math.min(ocultas, PASSO_LISTA)} escalas anteriores</button>
          <span>${ocultas} escala${ocultas === 1 ? '' : 's'} mais antiga${ocultas === 1 ? '' : 's'} fora da lista · os totais incluem todas</span>
        </div>`
      : '';
    container.innerHTML = anteriores + cardsMobile + html;
  }

  /* -------------------------------------------- PWA (js/modules/pwa.mjs) */
  const pwa = criarPWA({
    $, on, toast, dialogConfirmar, haptic, APP_VERSION, STORAGE, lerLocal,
    ambienteDeTeste, ehIOS, rodandoInstalado, totalEscalas: () => escalas.length,
  });

  /* -------------------------------------------------------------- init */
  function init() {
    initObservabilidade();
    initTema();
    carregar();
    pwa.initPWA();
    pwa.initAtualizacoesPWA();
    initNovidades();
    renderModelos();
    setDetalhesAvancados(false);

    $('escalaInicio').value = toInputLocal(new Date());
    sincronizarTodosControlesDataHora();

    formulario.ligarEventos();
    modelosFavoritos.ligarEventos();
    planejamento.ligarEventos();

    on('btnTheme', 'click', () =>
      aplicarTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    on('btnPrint',     'click', imprimirRelatorio);
    on('btnExportCsv', 'click', exportarCSV);
    on('btnShare',     'click', abrirShareSheet);

    on('mobileShare', 'click', abrirShareSheet);

    on('shareWA',     'click', () => { $('dialogShare')?.close(); compartilharWhatsApp(); });
    on('shareNative', 'click', () => { $('dialogShare')?.close(); compartilharNativo(); });
    on('shareCopy',   'click', () => { $('dialogShare')?.close(); copiarResumo(); });
    on('shareIcsOpt', 'click', () => { $('dialogShare')?.close(); agendarEscalas(escalasOrdenadas()); });
    on('agendaCancelar', 'click', () => $('dialogAgenda')?.close());
    on('footerPrivacidade', 'click', (ev) => { ev.preventDefault(); $('dialogPrivacidade')?.showModal(); });
    on('privacidadeFechar', 'click', () => $('dialogPrivacidade')?.close());
    initFeedback();
    on('shareCsvOpt', 'click', () => { $('dialogShare')?.close(); exportarCSV(); });
    on('sharePdfOpt', 'click', () => { $('dialogShare')?.close(); imprimirRelatorio(); });
    on('shareBackupOpt', 'click', () => { $('dialogShare')?.close(); exportarBackup(); });
    on('shareRestoreOpt', 'click', () => { $('dialogShare')?.close(); $('restoreInput')?.click(); });
    on('restoreInput', 'change', async (ev) => {
      await restaurarBackup(ev.target.files?.[0]);
      ev.target.value = '';
    });
    on('shareClose',  'click', () => $('dialogShare')?.close());

    render();

    window.addEventListener('storage', (ev) => {
      if (ev.key !== STORAGE.escalas) return;
      escalas = desserializarEscalas(ev.newValue).escalas;
      cancelarEdicao();
      render();
      toast('Dados atualizados por outra aba.');
    });

    /* Depois do primeiro uso da tela, para não competir com novidades/instalação. */
    setTimeout(() => lembrarBackup(), 4000);
    if (ambienteDeTeste) {
      window.__ac4LembrarBackup = lembrarBackup;
      window.__ac4StatusBackup = textoStatusBackup;
    }
  }

  /* Derruba a barreira de primeiro paint (CWV F-02): o <html> nasce com
     .app-pending (conteúdo em visibility:hidden, mas ocupando espaço) e só
     revela após o init() montar o estado real — sem repaint intermediário. */
  function revelarAplicacao() {
    document.documentElement.classList.remove('app-pending');
    document.documentElement.classList.add('app-ready');
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      init();
    } finally {
      /* Mesmo se init() falhar, a tela nunca fica permanentemente invisível. */
      revelarAplicacao();
    }
    const ano = new Date().getFullYear();
    document.querySelectorAll('.footer-year').forEach((el) => { el.textContent = ano; });
    const printYear = $('printYear');
    if (printYear) printYear.textContent = ano;
  });
  /* Suítes de regressão: módulo carregado sob demanda só em localhost —
     não vai para o aparelho do usuário. tests/*.mjs aguardam esta promessa. */
  if (ambienteDeTeste) {
    window.__ac4TestesProntos = import('./modules/testes.mjs').then(({ instalarTestes }) => instalarTestes({
      calcularEscala, escalasOrdenadas, montarICS,
      gerarLinkOutlookAgenda, salvar, render, $, STORAGE,
      estado,
    }));
  }
})();
