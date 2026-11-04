/* ==========================================================================
   Calculadora AC4 — v74
   Módulo principal: estado, UI, persistência e exportações.
   Regras de negócio, formatação e agenda vivem em js/modules/.
   ========================================================================== */
import {
  fmtMoeda, fmtHoras, fmtDataHora, fmtData, fmtDiaSemana, fmtHora,
  combinarDataHoraLocal, parseDateTimeLocal, formatarDataHoraInput, toInputLocal,
  calcularTerminoPorDuracao, validarIntervaloEscala, toInputMonth, fmtMesRef, escapeHTML,
} from './modules/formato.mjs';
import {
  TABELA_OFICIAL, regraNormativaParaData, tabelaParaData, labelOrigem,
  calcularEscala as calcularEscalaBase, tabelaEscalaValida,
} from './modules/calculo.mjs';
import {
  montarICS as montarICSBase,
  gerarLinkGoogleAgenda as gerarLinkGoogleAgendaBase,
  gerarLinkOutlookAgenda as gerarLinkOutlookAgendaBase,
} from './modules/agenda.mjs';
import {
  STATUS_ESCALA, gerarIdEscala, desserializarEscalas, detectarConflitos, aplicarNorma,
} from './modules/persistencia.mjs';
import {
  STATUS_INFO, statusEscala, rotuloQuantidadePm,
  botoesAcaoHTML, seletorStatusHTML, cardEscalaHTML,
} from './modules/templates.mjs';
import { criarPWA } from './modules/pwa.mjs';
import { criarAvisos } from './modules/ui/avisos.mjs';
import { criarObservabilidade } from './modules/ui/observabilidade.mjs';
import { criarAparencia } from './modules/ui/aparencia.mjs';
import { criarDados } from './modules/ui/dados.mjs';
import { criarExportacoes } from './modules/ui/exportacoes.mjs';
import { criarCompartilhar } from './modules/ui/compartilhar.mjs';

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

  /* Versão da aplicação (sincronizada pelo tools/bump-version.mjs). Serve para
     carimbar o log de erros e detectar clientes presos em cache antigo:
     se __ac4Version no console divergir do rodapé/CHANGELOG, o SW não atualizou. */
  const APP_VERSION = '74';

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
  let fundoInerte = [];
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

  function setDetalhesAvancados(aberto) {
    document.querySelectorAll('.advanced-field').forEach((el) => el.classList.toggle('hidden', !aberto));
    const btn = $('toggleAdvanced');
    if (!btn) return;
    btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    btn.classList.toggle('is-open', aberto);
    const titulo = btn.querySelector('span');
    if (titulo) titulo.textContent = aberto ? 'Ocultar detalhes' : 'Mais detalhes';
  }

  /* ---------------------------------------- bottom sheet mobile (lançamento) */
  const isMobileViewport = () => window.matchMedia('(max-width: 760px)').matches;

  function setFundoInerte(inerte) {
    if (inerte) {
      const alvos = document.querySelectorAll(
        'body > header, body > footer, body > .mobile-bar, #conteudo > :not(#launchPanel):not(#mobileLaunchBackdrop)'
      );
      fundoInerte = [...alvos].map((el) => ({ el, anterior: el.inert }));
      fundoInerte.forEach(({ el }) => { el.inert = true; });
      return;
    }
    fundoInerte.forEach(({ el, anterior }) => { el.inert = anterior; });
    fundoInerte = [];
  }

  function configurarSemanticaSheet(aberto) {
    const painel = $('launchPanel');
    if (!painel) return;
    if (aberto) {
      painel.setAttribute('role', 'dialog');
      painel.setAttribute('aria-modal', 'true');
      painel.setAttribute('aria-labelledby', 'mobileLaunchTitle');
      painel.setAttribute('tabindex', '-1');
      setFundoInerte(true);
    } else {
      painel.removeAttribute('role');
      painel.removeAttribute('aria-modal');
      painel.setAttribute('aria-labelledby', 'formTitle');
      painel.removeAttribute('tabindex');
      setFundoInerte(false);
    }
  }

  function setMobileSheetOpen(aberto) {
    sheetAberto = aberto;
    document.querySelector('.launch-panel')?.classList.toggle('is-open', aberto);
    $('mobileLaunchBackdrop')?.classList.toggle('is-open', aberto);
    document.body.classList.toggle('mobile-sheet-open', aberto);
    $('mobileAdd')?.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    configurarSemanticaSheet(aberto && isMobileViewport());
  }

  function abrirPainelLancamentoMobile({ foco = false } = {}) {
    setMobileSheetOpen(true);
    /* O foco automático em mobile pode abrir teclado/picker e deslocar o sheet.
       Mantemos a opção para fluxos específicos, mas sem usar por padrão. */
    window.setTimeout(() => {
      if (foco) $('escalaInicioData')?.focus({ preventScroll: true });
      else $('launchPanel')?.focus({ preventScroll: true });
    }, 260);
  }

  function fecharPainelLancamentoMobile({ devolverFoco = true } = {}) {
    if (!sheetAberto) return;
    setMobileSheetOpen(false);
    if (devolverFoco) $('mobileAdd')?.focus();
  }

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

  /* --------------------------------------------------------------- ações */
  function lerQtdPm() {
    const val = parseInt($('escalaQtdPm')?.value || '1', 10);
    /* Mesmo teto do stepper (999) também para valor digitado à mão. */
    return Number.isFinite(val) && val >= 1 ? Math.min(999, val) : 1;
  }

  function validarFormulario() {
    const inicio = $('escalaInicio').value;
    const fim    = $('escalaFim').value;
    const intervalo = validarIntervaloEscala(inicio, fim);
    const semNormaConhecida = intervalo.ok && !regraNormativaParaData(inicio);
    let ok = true;

    const marca = (fieldId, invalido) => {
      $(fieldId).classList.toggle('invalid', invalido);
      const ctrl = $(fieldId).querySelector('.control');
      if (ctrl) ctrl.setAttribute('aria-invalid', invalido ? 'true' : 'false');
      if (invalido) ok = false;
    };
    $('inicioErro').textContent = semNormaConhecida
      ? `A base normativa atual só é aplicável a partir de ${TABELA_OFICIAL.vigenciaInicio.split('-').reverse().join('/')}.`
      : 'Informe a data e hora de início.';
    marca('fieldInicio', (!intervalo.ok && intervalo.campo === 'inicio') || semNormaConhecida);
    marca('fieldFim', !intervalo.ok && intervalo.campo === 'fim');

    if (!ok) {
      toast(semNormaConhecida ? $('inicioErro').textContent : (intervalo.mensagem || 'Confira os campos obrigatórios da escala.'), { erro: true });
      return null;
    }

    const campoDesc = $('escalaDescricao');
    const descricao = (campoDesc && campoDesc.value.trim()) || 'Escala AC4';
    const origem = $('escalaOrigem')?.value || 'AC4';
    const qtdPm = lerQtdPm();
    return { inicio, fim, descricao, origem, qtdPm };
  }

  async function submeterFormulario() {
    /* Reentrância: duplo toque/Ctrl+Enter repetido não deve processar duas vezes.
       O botão é desabilitado no clique e reabilitado no finally. */
    if (submetendo) return;
    submetendo = true;
    const btn = $('btnSubmit');
    if (btn) btn.disabled = true;
    try {
      /* Entrega primeiro o feedback visual do toque. A validação, persistência
         e renderização começam após o navegador apresentar esse frame. */
      await esperarProximoPaint();
      const dados = validarFormulario();
      if (!dados) return;

      const duracaoHoras = (parseDateTimeLocal(dados.fim) - parseDateTimeLocal(dados.inicio)) / 3600000;
      if (duracaoHoras > 24) {
        const ok = await dialogConfirmar(
          `A escala tem ${duracaoHoras.toFixed(1)} horas de duração. Confirma?`,
          { textoOk: 'Confirmar', perigoso: false }
        );
        if (!ok) return;
      }

      const conflitos = detectarConflitos(escalas, dados, editandoId);
      if (conflitos.duplicadas.length || conflitos.sobrepostas.length) {
        const mensagem = conflitos.duplicadas.length
          ? 'Já existe uma escala com o mesmo início e término. Deseja adicionar mesmo assim?'
          : `Esta escala se sobrepõe a ${conflitos.sobrepostas.length} lançamento${conflitos.sobrepostas.length === 1 ? '' : 's'}. Deseja continuar?`;
        const ok = await dialogConfirmar(mensagem, { textoOk: 'Continuar', perigoso: false });
        if (!ok) return;
      }

      haptic(10);
      const escalasAntes = clonarEscalas();

      const novoRegistro = editandoId === null;
      if (!novoRegistro) {
        const idx = escalas.findIndex((e) => e.id === editandoId);
        /* Data editada pode mudar de norma: reaplica a tabela da nova data. */
        if (idx >= 0) escalas[idx] = aplicarNorma({ ...escalas[idx], ...dados }).escala;
        cancelarEdicao();
        toast('Escala atualizada.');
      } else {
        escalas.push({ id: gerarIdEscala(), ...dados, status: 'planejada', tabela: tabelaParaData(dados.inicio) || TABELA_OFICIAL });
        if ($('escalaDescricao')) $('escalaDescricao').value = '';
        if ($('escalaQtdPm'))    $('escalaQtdPm').value = '1';
        if ($('escalaOrigem'))   $('escalaOrigem').value = 'AC4';
        toast('Escala adicionada.');
      }
      if (!salvar()) { escalas = escalasAntes; render(); return; }
      render();
      if (novoRegistro) { pwa.mostrarInstalacaoAposConversao(); pedirArmazenamentoPersistente(); }
      /* No mobile, salvar com sucesso fecha o bottom sheet. */
      if (isMobileViewport()) fecharPainelLancamentoMobile();
    } finally {
      submetendo = false;
      if (btn) btn.disabled = false;
    }
  }

  function editarEscala(id) {
    const e = escalas.find((x) => x.id === id);
    if (!e) return;
    editandoId = id;
    $('escalaInicio').value = e.inicio;
    $('escalaFim').value   = e.fim;
    if ($('escalaDuracao')) $('escalaDuracao').value = '';
    if ($('escalaQtdPm'))    $('escalaQtdPm').value = e.qtdPm || 1;
    if ($('escalaDescricao')) $('escalaDescricao').value = e.descricao === 'Escala AC4' ? '' : (e.descricao || '');
    if ($('escalaOrigem'))   $('escalaOrigem').value = e.origem || 'AC4';
    setDetalhesAvancados(true);
    sincronizarTodosControlesDataHora();
    $('btnCancelEdit').classList.remove('hidden');
    $('formTitle').lastChild.textContent = ' Editar escala';
    setTituloSheet('Editar escala');
    atualizarResumoFim();
    atualizarChipsDuracao();
    atualizarResumoLancamento();
    if (isMobileViewport()) {
      /* já vem preenchido — não sobrescrever com data/hora atual */
      abrirPainelLancamentoMobile();
    } else {
      document.querySelector('.launch-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('escalaInicio').focus();
    }
  }

  /* Espelho legível do término. O datetime-local não repinta em alguns
     navegadores mobile quando o valor é setado por JS (cálculo da duração);
     este texto garante que o usuário veja o término calculado. */
  function atualizarResumoFim() {
    const el = $('fimResumo');
    if (!el) return;
    const v = $('escalaFim')?.value || '';
    el.textContent = parseDateTimeLocal(v) ? `${fmtDiaSemana(v)}, ${fmtDataHora(v)}` : '';
  }

  function formatarTerminoMobile(valor) {
    const data = parseDateTimeLocal(valor);
    if (!data) return '';
    const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace('.', '')
      .replace(/^./, (letra) => letra.toLocaleUpperCase('pt-BR'));
    const diaMes = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${diaSemana}, ${diaMes} · ${fmtHora(valor)}`;
  }

  function atualizarBotaoSubmitMobile(resultado = null, qtd = 1) {
    const label = $('btnSubmitLabel');
    const valor = $('btnSubmitResult');
    if (!label || !valor) return;
    label.textContent = editandoId === null ? 'Adicionar' : 'Salvar';
    if (!resultado) {
      valor.textContent = '';
      valor.setAttribute('aria-hidden', 'true');
      return;
    }
    valor.textContent = qtd > 1
      ? `TOTAL ${fmtMoeda(resultado.valorCentavos * qtd)}`
      : fmtMoeda(resultado.valorCentavos);
    valor.setAttribute('aria-hidden', 'false');
  }

  /* Apresentação mobile do resultado. Toda a inteligência financeira continua
     centralizada em calcularEscala(); esta função só formata seu retorno. */
  function atualizarResumoLancamento() {
    const el = $('launchResumo');
    if (!el) return;
    const inicio = $('escalaInicio')?.value || '';
    const fim = $('escalaFim')?.value || '';
    const intervalo = validarIntervaloEscala(inicio, fim);
    $('btnSaveTemplate')?.classList.toggle('hidden', !intervalo.ok);
    if (!intervalo.ok) {
      el.classList.add('is-empty');
      atualizarBotaoSubmitMobile();
      return;
    }
    const r = calcularEscala({ inicio, fim });
    const qtd = lerQtdPm();
    $('qtdMinus')?.toggleAttribute('disabled', qtd <= 1);
    $('qtdPlus')?.toggleAttribute('disabled', qtd >= 999);
    const total = r.valorCentavos * qtd;
    $('launchResultTitle').textContent = qtd === 1 ? 'VALOR ESTIMADO' : 'CUSTO TOTAL ESTIMADO';
    $('launchResultValue').textContent = fmtMoeda(total);
    $('launchResultHelper').textContent = qtd === 1
      ? 'Valor individual'
      : `${rotuloQuantidadePm(qtd)} · ${fmtMoeda(r.valorCentavos)} por PM`;
    $('launchResultDuration').textContent = r.mins % 60 === 0
      ? `${r.mins / 60} ${r.mins === 60 ? 'hora' : 'horas'}`
      : fmtHoras(r.mins);
    $('launchResultHours').textContent = `${fmtHoras(r.minDiurno)} diurnas · ${fmtHoras(r.minNoturno)} noturnas`;
    $('launchResultEnd').textContent = formatarTerminoMobile(fim);
    el.classList.remove('is-empty');
    atualizarBotaoSubmitMobile(r, qtd);
  }

  function sincronizarControlesDataHora(id) {
    const valor = $(id)?.value || '';
    const normalizado = parseDateTimeLocal(valor) ? formatarDataHoraInput(parseDateTimeLocal(valor)) : '';
    const data = $(`${id}Data`);
    const hora = $(`${id}Hora`);
    if (data) data.value = normalizado ? normalizado.slice(0, 10) : '';
    if (hora) hora.value = normalizado ? normalizado.slice(11, 16) : '';
  }

  function sincronizarTodosControlesDataHora() {
    sincronizarControlesDataHora('escalaInicio');
    sincronizarControlesDataHora('escalaFim');
  }

  function aplicarPartesDataHora(id, tipoEvento = 'input') {
    const data = $(`${id}Data`)?.value || '';
    const hora = $(`${id}Hora`)?.value || '';
    const combinado = combinarDataHoraLocal(data, hora);
    const campo = $(id);
    if (!campo || !combinado) return false;
    campo.value = formatarDataHoraInput(combinado);
    campo.dispatchEvent(new Event(tipoEvento, { bubbles: true }));
    return true;
  }

  /* Chips de duração rápida (mobile): refletem #escalaDuracao — mesma fonte de
     verdade do <select> do desktop, sem lógica de cálculo paralela. */
  function atualizarChipsDuracao() {
    const val = $('escalaDuracao')?.value || '';
    document.querySelectorAll('#durChips .dur-chip').forEach((c) => {
      const ativo = c.dataset.horas === val;
      c.classList.toggle('is-active', ativo);
      c.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
  }

  const setTituloSheet = (txt) => { const el = $('mobileLaunchTitle'); if (el) el.textContent = txt; };

  function cancelarEdicao() {
    editandoId = null;
    setTituloSheet('Nova escala AC4');
    if ($('escalaDescricao')) $('escalaDescricao').value = '';
    if ($('escalaQtdPm'))    $('escalaQtdPm').value = '1';
    if ($('escalaOrigem'))   $('escalaOrigem').value = 'AC4';
    $('btnCancelEdit').classList.add('hidden');
    $('formTitle').lastChild.textContent = ' Lançar escala';
    setDetalhesAvancados(false);
    ['fieldInicio', 'fieldFim'].forEach((f) => {
      $(f).classList.remove('invalid');
      $(f).querySelector('.control')?.removeAttribute('aria-invalid');
    });
    atualizarResumoLancamento();
  }

  function renderModelos() {
    const select = $('templateSelect');
    const wrap = $('templateSelectWrap');
    if (!select || !wrap) return;
    const selecionado = select.value;
    select.innerHTML = '<option value="">Meus modelos</option>';
    modelos.forEach((modelo) => {
      const opt = document.createElement('option');
      opt.value = modelo.id;
      opt.textContent = modelo.nome;
      select.appendChild(opt);
    });
    wrap.classList.toggle('hidden', modelos.length === 0);
    if (modelos.some((m) => m.id === selecionado)) select.value = selecionado;
    $('btnDeleteTemplate')?.classList.toggle('hidden', !select.value);
  }

  function preencherConfiguracaoRapida({ duracao, qtdPm = 1, descricao = '', origem = 'AC4' }, inicio = null) {
    if (inicio) $('escalaInicio').value = inicio;
    const horas = Number(duracao);
    if ($('escalaDuracao')) $('escalaDuracao').value = [12, 14, 24].includes(horas) ? String(horas) : '';
    const fim = calcularTerminoPorDuracao($('escalaInicio')?.value || '', horas);
    if (fim) $('escalaFim').value = fim;
    if ($('escalaQtdPm')) $('escalaQtdPm').value = String(Math.min(999, Math.max(1, Number(qtdPm) || 1)));
    if ($('escalaDescricao')) $('escalaDescricao').value = descricao === 'Escala AC4' ? '' : (descricao || '');
    if ($('escalaOrigem')) $('escalaOrigem').value = origem || 'AC4';
    sincronizarTodosControlesDataHora();
    atualizarResumoFim();
    atualizarChipsDuracao();
    atualizarResumoLancamento();
    const temDetalhes = ![12, 14, 24].includes(horas) || !!descricao || (origem && origem !== 'AC4');
    setDetalhesAvancados(temDetalhes);
  }

  function repetirUltimaEscala() {
    const ultima = [...escalas].sort((a, b) => (parseDateTimeLocal(b.inicio) || new Date(b.inicio)) - (parseDateTimeLocal(a.inicio) || new Date(a.inicio)))[0];
    if (!ultima) return;
    const inicio = parseDateTimeLocal(ultima.inicio) || new Date(ultima.inicio);
    const fim = parseDateTimeLocal(ultima.fim) || new Date(ultima.fim);
    const duracao = (fim - inicio) / 3600000;
    const proximoInicio = toInputLocal(new Date(inicio.getTime() + 24 * 3600000));
    preencherConfiguracaoRapida({ ...ultima, duracao }, proximoInicio);
    toast('Última escala preenchida para o dia seguinte. Confira e adicione.');
  }

  function abrirSalvarModelo() {
    const inicio = parseDateTimeLocal($('escalaInicio')?.value || '');
    const fim = parseDateTimeLocal($('escalaFim')?.value || '');
    const duracao = inicio && fim ? (fim - inicio) / 3600000 : 0;
    if (!(duracao > 0 && duracao <= 24)) {
      toast('Informe o início e a duração antes de salvar um modelo.', { erro: true });
      return;
    }
    $('templateName').value = '';
    $('dialogTemplate')?.showModal();
    aposProximoPaint(() => $('templateName')?.focus());
  }

  function salvarModeloAtual() {
    const nome = ($('templateName')?.value || '').trim();
    const inicio = parseDateTimeLocal($('escalaInicio')?.value || '');
    const fim = parseDateTimeLocal($('escalaFim')?.value || '');
    const duracao = inicio && fim ? (fim - inicio) / 3600000 : 0;
    if (nome.length < 2 || !(duracao > 0 && duracao <= 24)) {
      toast('Informe um nome e uma duração válida para o modelo.', { erro: true });
      return false;
    }
    const existente = modelos.find((m) => m.nome.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'));
    const modelo = {
      id: existente?.id || gerarIdEscala(),
      nome: nome.slice(0, 40),
      duracao,
      qtdPm: lerQtdPm(),
      descricao: ($('escalaDescricao')?.value || '').trim(),
      origem: $('escalaOrigem')?.value || 'AC4',
    };
    modelos = existente ? modelos.map((m) => m.id === existente.id ? modelo : m) : [...modelos, modelo].slice(-20);
    if (!salvarModelos()) return false;
    renderModelos();
    $('templateSelect').value = modelo.id;
    $('btnDeleteTemplate')?.classList.remove('hidden');
    $('dialogTemplate')?.close();
    toast(existente ? 'Modelo atualizado.' : 'Modelo salvo neste aparelho.');
    return true;
  }

  async function excluirModeloSelecionado() {
    const id = $('templateSelect')?.value || '';
    const modelo = modelos.find((m) => m.id === id);
    if (!modelo) return;
    const ok = await dialogConfirmar(`Excluir o modelo “${modelo.nome}”?`);
    if (!ok) return;
    modelos = modelos.filter((m) => m.id !== id);
    if (salvarModelos()) {
      renderModelos();
      toast('Modelo excluído.');
    }
  }

  function duplicarEscala(id) {
    const e = escalas.find((x) => x.id === id);
    if (!e) return;
    const umDia = 24 * 3600000;
    const escalasAntes = clonarEscalas();
    escalas.push({
      ...e,
      id: gerarIdEscala(),
      inicio: toInputLocal(new Date((parseDateTimeLocal(e.inicio) || new Date(e.inicio)).getTime() + umDia)),
      fim:    toInputLocal(new Date((parseDateTimeLocal(e.fim) || new Date(e.fim)).getTime() + umDia)),
    });
    if (!salvar()) { escalas = escalasAntes; render(); return; }
    haptic([10, 30, 10]);
    render();
    toast('Escala duplicada para o dia seguinte.');
  }

  function removerEscala(id) {
    const e = escalas.find((x) => x.id === id);
    if (!e) return;
    const escalasAntes = clonarEscalas();
    ultimaExcluida = e;
    escalas = escalas.filter((x) => x.id !== id);
    if (editandoId === id) cancelarEdicao();
    if (!salvar()) { escalas = escalasAntes; ultimaExcluida = null; render(); return; }
    haptic([10, 20]);
    render();
    toast('Escala removida.', {
      acao: { rotulo: 'Desfazer', fn: () => {
        if (!ultimaExcluida) return;
        const antes = clonarEscalas(), restaurada = ultimaExcluida;
        escalas.push(restaurada);
        if (!salvar()) { escalas = antes; render(); return; }
        ultimaExcluida = null;
        render();
      } },
    });
  }

  async function limparTudo() {
    if (!escalas.length) return;
    const ok = await dialogConfirmar(`Remover todas as ${escalas.length} escala${escalas.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    const escalasAntes = clonarEscalas();
    escalas = []; cancelarEdicao();
    if (!salvar()) { escalas = escalasAntes; render(); return; }
    render();
    toast('Todas as escalas foram removidas.');
  }

  /* -------------------------------------------------------- filtro por mês */
  function atualizarSelectMes() {
    const sel = $('filtroMes');
    if (!sel) return;
    const meses = new Set(escalas.map((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio))));
    const antigo = sel.value;
    sel.innerHTML = '<option value="">Todos os meses</option>';
    [...meses].sort().forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = fmtMesRef(m);
      if (m === antigo) opt.selected = true;
      sel.appendChild(opt);
    });
    filtroMes = meses.has(antigo) ? antigo : '';
    if (sel.value !== filtroMes) sel.value = filtroMes;
  }

  const mesPainelAtual = () => {
    if (filtroMes) return filtroMes;
    const atual = toInputMonth(new Date());
    if (escalas.some((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === atual)) return atual;
    const meses = escalas.map((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio))).sort();
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
    const listaMes = escalas.filter((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === mes);
    const listaAnterior = escalas.filter((e) => toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)) === mesAnterior(mes));
    const atual = resumoPlanejamento(listaMes);
    const anterior = resumoPlanejamento(listaAnterior);
    $('planningMonth').textContent = fmtMesRef(mes);
    $('planningValue').textContent = fmtMoeda(atual.valor);
    $('planningHours').textContent = `${fmtHoras(atual.mins)} · ${atual.qtd} escala${atual.qtd === 1 ? '' : 's'}`;

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

    const meta = metasMensais[mes];
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

    const agora = new Date();
    const atrasadas = listaMes.filter((e) => statusEscala(e) === 'planejada' && (parseDateTimeLocal(e.fim) || new Date(e.fim)) < agora).length;
    const alerta = $('planningAlert');
    alerta.classList.toggle('hidden', atrasadas === 0);
    alerta.textContent = atrasadas
      ? `${atrasadas} escala${atrasadas === 1 ? '' : 's'} passada${atrasadas === 1 ? '' : 's'} ainda marcada${atrasadas === 1 ? '' : 's'} como planejada${atrasadas === 1 ? '' : 's'}. Revisar`
      : '';
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
    escalas.forEach((e) => porMes.get(toInputMonth(parseDateTimeLocal(e.inicio) || new Date(e.inicio)))?.push(e));
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
    const meta = metasMensais[mes] || {};
    $('planningGoalMonth').textContent = fmtMesRef(mes);
    $('planningGoalValue').value = meta.valorCentavos ? (meta.valorCentavos / 100).toFixed(2) : '';
    $('planningGoalHours').value = meta.horas || '';
    $('planningGoalClear').classList.toggle('hidden', !metasMensais[mes]);
    $('dialogPlanningGoal')?.showModal();
  }

  function salvarMetaMensal() {
    const mes = mesPainelAtual();
    const valorCentavos = Math.max(0, Math.round(Number($('planningGoalValue')?.value || 0) * 100));
    const horas = Math.max(0, Math.min(744, Number($('planningGoalHours')?.value || 0)));
    if (!valorCentavos && !horas) delete metasMensais[mes];
    else metasMensais[mes] = { valorCentavos, horas };
    if (!salvarMetas()) return false;
    $('dialogPlanningGoal')?.close();
    renderPlanejamento();
    toast(valorCentavos || horas ? 'Meta mensal salva neste aparelho.' : 'Meta mensal removida.');
    return true;
  }

  function removerMetaMensal() {
    delete metasMensais[mesPainelAtual()];
    if (!salvarMetas()) return;
    $('dialogPlanningGoal')?.close();
    renderPlanejamento();
    toast('Meta mensal removida.');
  }

  function atualizarStatusEscala(id, status) {
    if (!STATUS_ESCALA.includes(status)) return;
    const escala = escalas.find((e) => String(e.id) === String(id));
    if (!escala || statusEscala(escala) === status) return;
    const anterior = statusEscala(escala);
    escala.status = status;
    if (!salvar()) { escala.status = anterior; render(); return; }
    render();
    toast(`Escala marcada como ${STATUS_INFO[status].label.toLocaleLowerCase('pt-BR')}.`);
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

    on('formEscala', 'submit', (ev) => { ev.preventDefault(); submeterFormulario(); });
    on('btnCancelEdit', 'click', () => {
      cancelarEdicao();
      if (isMobileViewport()) fecharPainelLancamentoMobile();
    });
    on('toggleAdvanced', 'click', () => setDetalhesAvancados($('toggleAdvanced')?.getAttribute('aria-expanded') !== 'true'));
    on('btnRepeatLast', 'click', () => {
      repetirUltimaEscala();
      if (isMobileViewport()) abrirPainelLancamentoMobile();
    });
    on('btnSaveTemplate', 'click', abrirSalvarModelo);
    on('templateCancel', 'click', () => $('dialogTemplate')?.close());
    on('templateForm', 'submit', (ev) => { ev.preventDefault(); salvarModeloAtual(); });
    on('templateSelect', 'change', () => {
      const id = $('templateSelect')?.value || '';
      const modelo = modelos.find((m) => m.id === id);
      $('btnDeleteTemplate')?.classList.toggle('hidden', !modelo);
      if (!modelo) return;
      preencherConfiguracaoRapida(modelo);
      toast(`Modelo “${modelo.nome}” aplicado.`);
    });
    on('btnDeleteTemplate', 'click', excluirModeloSelecionado);
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
      filtroStatus = btn.dataset.statusFilter || '';
      if ($('filtroStatus')) $('filtroStatus').value = filtroStatus;
      render();
      document.querySelector('.feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    on('planningAlert', 'click', () => {
      filtroMes = mesPainelAtual();
      filtroStatus = 'planejada';
      if ($('filtroMes')) $('filtroMes').value = filtroMes;
      if ($('filtroStatus')) $('filtroStatus').value = filtroStatus;
      render();
      document.querySelector('.feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    on('btnTheme', 'click', () =>
      aplicarTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    on('btnPrint',     'click', imprimirRelatorio);
    on('btnExportCsv', 'click', exportarCSV);
    on('btnShare',     'click', abrirShareSheet);

    on('mobileAdd', 'click', () => {
      if (isMobileViewport()) {
        /* Abre primeiro para que o toque seja apresentado imediatamente; o
           preenchimento e o cálculo seguem depois do primeiro paint. */
        abrirPainelLancamentoMobile();
        aposProximoPaint(() => {
          if (!sheetAberto) return;
          if (editandoId === null) {
            setTituloSheet('Nova escala AC4');
            setDetalhesAvancados(false);
            $('escalaInicio').value = toInputLocal(new Date());
            aplicarDuracao();
            sincronizarTodosControlesDataHora();
          }
          atualizarResumoLancamento();
        });
        return;
      }
      document.querySelector('.launch-panel')?.scrollIntoView({ behavior: 'smooth' });
      $('escalaInicio').focus();
    });
    on('mobileLaunchClose', 'click', () => fecharPainelLancamentoMobile());
    on('mobileLaunchBackdrop', 'click', () => fecharPainelLancamentoMobile());
    /* Sair da faixa mobile com o sheet aberto: destrava a rolagem do fundo */
    window.matchMedia('(max-width: 760px)').addEventListener('change', (e) => {
      if (!e.matches && sheetAberto) setMobileSheetOpen(false);
    });
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

    on('btnClearAll', 'click', limparTudo);
    on('filtroMes', 'change', () => { filtroMes = $('filtroMes')?.value || ''; render(); });
    on('filtroOrigem', 'change', () => { filtroOrigem = $('filtroOrigem')?.value || ''; render(); });
    on('filtroStatus', 'change', () => { filtroStatus = $('filtroStatus')?.value || ''; render(); });
    on('filtroBusca', 'input', () => { filtroBusca = ($('filtroBusca')?.value || '').trim(); render(); });

    const aplicarDuracao = () => {
      const horas = Number($('escalaDuracao')?.value || 0);
      if (!horas) return false;
      const fim = calcularTerminoPorDuracao($('escalaInicio')?.value || '', horas);
      if (!fim) return false;
      $('escalaFim').value = fim;
      sincronizarControlesDataHora('escalaFim');
      $('fieldFim').classList.remove('invalid');
      $('fieldFim').querySelector('.control')?.removeAttribute('aria-invalid');
      atualizarResumoFim();
      atualizarChipsDuracao();
      atualizarResumoLancamento();
      return true;
    };
    on('escalaDuracao', 'input', aplicarDuracao);
    on('escalaDuracao', 'change', aplicarDuracao);
    on('escalaInicio',  'input', aplicarDuracao);
    on('escalaInicio',  'change', aplicarDuracao);
    on('escalaInicio',  'input', () => sincronizarControlesDataHora('escalaInicio'));
    on('escalaInicio',  'change', () => sincronizarControlesDataHora('escalaInicio'));
    const marcarDuracaoPersonalizada = () => {
      if ($('escalaDuracao')) $('escalaDuracao').value = '';
      setDetalhesAvancados(true);
      sincronizarControlesDataHora('escalaFim');
      atualizarResumoFim();
      atualizarChipsDuracao();
      atualizarResumoLancamento();
    };
    on('escalaFim', 'input', marcarDuracaoPersonalizada);
    on('escalaFim', 'change', marcarDuracaoPersonalizada);
    ['escalaInicio', 'escalaFim'].forEach((id) => {
      ['Data', 'Hora'].forEach((sufixo) => {
        on(`${id}${sufixo}`, 'input', () => aplicarPartesDataHora(id, 'input'));
        on(`${id}${sufixo}`, 'change', () => aplicarPartesDataHora(id, 'change'));
      });
    });
    /* Resumo do lançamento também depende de Qtd. PM e Origem */
    on('escalaQtdPm', 'input', atualizarResumoLancamento);
    on('escalaQtdPm', 'change', atualizarResumoLancamento);
    on('escalaOrigem', 'input', atualizarResumoLancamento);
    on('escalaOrigem', 'change', atualizarResumoLancamento);

    /* Chips de duração rápida (mobile) — escrevem no mesmo #escalaDuracao. */
    document.querySelectorAll('#durChips .dur-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if ($('escalaDuracao')) $('escalaDuracao').value = chip.dataset.horas;
        atualizarChipsDuracao();
        aposProximoPaint(() => {
          if ($('escalaDuracao')?.value === chip.dataset.horas) aplicarDuracao();
        });
      });
    });

    /* Stepper de Qtd. PM (mobile) — ajusta o mesmo #escalaQtdPm, faixa 1–999. */
    const atualizarEstadoStepper = () => {
      const qtd = lerQtdPm();
      $('qtdMinus')?.toggleAttribute('disabled', qtd <= 1);
      $('qtdPlus')?.toggleAttribute('disabled', qtd >= 999);
    };
    const ajustarQtd = (delta) => {
      const inp = $('escalaQtdPm');
      if (!inp) return;
      const atual = parseInt(inp.value || '1', 10);
      inp.value = Math.min(999, Math.max(1, (Number.isFinite(atual) ? atual : 1) + delta));
      atualizarResumoLancamento();
      atualizarEstadoStepper();
    };
    on('qtdMinus', 'click', () => ajustarQtd(-1));
    on('qtdPlus', 'click', () => ajustarQtd(1));
    on('escalaQtdPm', 'change', () => {
      const inp = $('escalaQtdPm');
      if (inp) inp.value = String(lerQtdPm());
      atualizarResumoLancamento();
      atualizarEstadoStepper();
    });
    atualizarEstadoStepper();

    on('listaEscalas', 'click', (ev) => {
      const btn = ev.target.closest('[data-acao]');
      if (!btn) return;
      if (btn.dataset.acao === 'anteriores') { limiteLista += PASSO_LISTA; render(); return; }
      const id = btn.dataset.id;
      if (btn.dataset.acao === 'remover')        removerEscala(id);
      else if (btn.dataset.acao === 'editar')    editarEscala(id);
      else if (btn.dataset.acao === 'duplicar')  duplicarEscala(id);
      else if (btn.dataset.acao === 'agenda')    agendarEscalaItem(id);
      btn.closest('details')?.removeAttribute('open');
    });
    on('listaEscalas', 'change', (ev) => {
      const select = ev.target.closest('[data-status-id]');
      if (select) atualizarStatusEscala(select.dataset.statusId, select.value);
    });

    document.addEventListener('keydown', (e) => {
      if (sheetAberto && e.key === 'Tab') {
        const painel = $('launchPanel');
        const focaveis = [...painel.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
        )].filter((el) => el.offsetParent !== null);
        if (focaveis.length) {
          const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
          else if (!painel.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submeterFormulario(); }
      if (e.key === 'Escape') {
        if (editandoId !== null) cancelarEdicao();
        if (sheetAberto) fecharPainelLancamentoMobile();
      }
    });

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
