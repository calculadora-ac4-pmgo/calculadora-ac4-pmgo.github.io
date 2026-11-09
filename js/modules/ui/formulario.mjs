/* ==========================================================================
   Calculadora AC4 — formulário de lançamento e ações da lista (v75)
   Formulário (validar, salvar, editar, cancelar), data e hora, chips de
   duração, stepper de Qtd. PM, resumo do lançamento, sheet do celular
   (abrir/fechar, foco preso, fundo inerte) e ações da lista (duplicar,
   remover com desfazer, limpar tudo, mudar situação). Estado só via `estado`.
   ========================================================================== */
import {
  fmtMoeda, fmtHoras, fmtDataHora, fmtDiaSemana,
  combinarDataHoraLocal, parseDateTimeLocal, formatarDataHoraInput, toInputLocal,
  calcularTerminoPorDuracao, validarIntervaloEscala,
} from '../formato.mjs';
import { TABELA_OFICIAL, regraNormativaParaData, tabelaParaData } from '../calculo.mjs';
import { STATUS_ESCALA, gerarIdEscala, detectarConflitos, aplicarNorma } from '../persistencia.mjs';
import { STATUS_INFO, statusEscala, rotuloQuantidadePm } from '../templates.mjs';
import { primeiraDoMes } from '../lote.mjs';

/**
 * Cria o formulário de lançamento e as ações da lista.
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, dialogConfirmar, haptic,
 *   salvar, render, calcularEscala, clonarEscalas, aposProximoPaint, esperarProximoPaint,
 *   pedirArmazenamentoPersistente, mostrarInstalacaoAposConversao, agendarEscalaItem, abrirLote, explicarValor, PASSO_LISTA.
 * @returns {Object} Funções públicas da área, incluindo ligarEventos().
 */
/**
 * Hora de início da última escala lançada (a última da lista salva), ou 07:00.
 * @param {Array<Object>} escalas
 * @returns {string} "HH:MM"
 */
export function horaUltimaEscala(escalas) {
  const ultima = escalas[escalas.length - 1];
  const hora = ultima && String(ultima.inicio || '').slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hora || '') ? hora : '07:00';
}

/**
 * Início sugerido para uma escala nova: data de hoje e hora da última escala.
 * @param {Array<Object>} escalas
 * @param {Date} [agora]
 * @returns {string} "AAAA-MM-DDTHH:MM"
 */
export function inicioPadrao(escalas, agora = new Date()) {
  return `${toInputLocal(agora).slice(0, 10)}T${horaUltimaEscala(escalas)}`;
}

export function criarFormulario(ctx) {
  const { $, on, estado, toast, dialogConfirmar, haptic, salvar, render, calcularEscala, clonarEscalas,
    aposProximoPaint, esperarProximoPaint, pedirArmazenamentoPersistente, mostrarInstalacaoAposConversao,
    agendarEscalaItem, abrirLote, explicarValor, PASSO_LISTA } = ctx;

  let fundoInerte = [];

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
    estado.sheetAberto = aberto;
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
    if (!estado.sheetAberto) return;
    setMobileSheetOpen(false);
    if (devolverFoco) $('mobileAdd')?.focus();
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
    if (estado.submetendo) return;
    estado.submetendo = true;
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

      const conflitos = detectarConflitos(estado.escalas, dados, estado.editandoId);
      if (conflitos.duplicadas.length || conflitos.sobrepostas.length) {
        const mensagem = conflitos.duplicadas.length
          ? 'Já existe uma escala com o mesmo início e término. Deseja adicionar mesmo assim?'
          : `Esta escala se sobrepõe a ${conflitos.sobrepostas.length} lançamento${conflitos.sobrepostas.length === 1 ? '' : 's'}. Deseja continuar?`;
        const ok = await dialogConfirmar(mensagem, { textoOk: 'Continuar', perigoso: false });
        if (!ok) return;
      }

      haptic(10);
      const escalasAntes = clonarEscalas();

      const novoRegistro = estado.editandoId === null;
      let aviso;
      if (!novoRegistro) {
        const idx = estado.escalas.findIndex((e) => e.id === estado.editandoId);
        /* Data editada pode mudar de norma: reaplica a tabela da nova data. */
        if (idx >= 0) estado.escalas[idx] = aplicarNorma({ ...estado.escalas[idx], ...dados }).escala;
        /* v83: sai da edição só depois de gravar (falha de gravação não perde o que foi digitado). */
        aviso = () => { cancelarEdicao(); toast('Escala atualizada.'); };
      } else {
        const idNovo = gerarIdEscala();
        estado.escalas.push({ id: idNovo, ...dados, status: 'planejada', tabela: tabelaParaData(dados.inicio) || TABELA_OFICIAL });
        /* v83: limpa os campos só depois de gravar. v79: atalho para lançar em outros dias. */
        aviso = () => {
          if ($('escalaDescricao')) $('escalaDescricao').value = '';
          if ($('escalaQtdPm'))    $('escalaQtdPm').value = '1';
          if ($('escalaOrigem'))   $('escalaOrigem').value = 'AC4';
          toast('Escala adicionada.', { acao: { rotulo: 'Lançar em outros dias', fn: () => abrirLote(idNovo) } });
        };
      }
      if (!salvar()) { estado.escalas = escalasAntes; render(); return; }
      /* O aviso só sai depois de gravar de verdade (v80). */
      aviso();
      render();
      /* v81: a 1ª escala do mês abre a agenda para marcar os outros dias. */
      if (novoRegistro && primeiraDoMes(estado.escalas, estado.escalas[estado.escalas.length - 1])) {
        const idLote = estado.escalas[estado.escalas.length - 1].id;
        aposProximoPaint(() => abrirLote(idLote));
      }
      if (novoRegistro) { mostrarInstalacaoAposConversao(); pedirArmazenamentoPersistente(); }
      /* No mobile, salvar com sucesso fecha o bottom sheet. */
      if (isMobileViewport()) fecharPainelLancamentoMobile();
    } finally {
      estado.submetendo = false;
      if (btn) btn.disabled = false;
    }
  }

  function editarEscala(id) {
    const e = estado.escalas.find((x) => x.id === id);
    if (!e) return;
    estado.editandoId = id;
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

  function atualizarBotaoSubmitMobile(resultado = null, qtd = 1) {
    const label = $('btnSubmitLabel');
    const valor = $('btnSubmitResult');
    if (!label || !valor) return;
    label.textContent = estado.editandoId === null ? 'Adicionar' : 'Salvar';
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
    estado.editandoId = null;
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

  function duplicarEscala(id) {
    const e = estado.escalas.find((x) => x.id === id);
    if (!e) return;
    const umDia = 24 * 3600000;
    const escalasAntes = clonarEscalas();
    estado.escalas.push({
      ...e,
      id: gerarIdEscala(),
      inicio: toInputLocal(new Date((parseDateTimeLocal(e.inicio) || new Date(e.inicio)).getTime() + umDia)),
      fim:    toInputLocal(new Date((parseDateTimeLocal(e.fim) || new Date(e.fim)).getTime() + umDia)),
    });
    if (!salvar()) { estado.escalas = escalasAntes; render(); return; }
    haptic([10, 30, 10]);
    render();
    toast('Escala duplicada para o dia seguinte.');
  }

  function removerEscala(id) {
    const e = estado.escalas.find((x) => x.id === id);
    if (!e) return;
    const escalasAntes = clonarEscalas();
    estado.ultimaExcluida = e;
    estado.escalas = estado.escalas.filter((x) => x.id !== id);
    if (estado.editandoId === id) cancelarEdicao();
    if (!salvar()) { estado.escalas = escalasAntes; estado.ultimaExcluida = null; render(); return; }
    haptic([10, 20]);
    render();
    toast('Escala removida.', {
      acao: { rotulo: 'Desfazer', fn: () => {
        if (!estado.ultimaExcluida) return;
        const antes = clonarEscalas(), restaurada = estado.ultimaExcluida;
        estado.escalas.push(restaurada);
        if (!salvar()) { estado.escalas = antes; render(); return; }
        estado.ultimaExcluida = null;
        render();
      } },
    });
  }

  async function limparTudo() {
    if (!estado.escalas.length) return;
    const ok = await dialogConfirmar(`Remover todas as ${estado.escalas.length} escala${estado.escalas.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    const escalasAntes = clonarEscalas();
    estado.escalas = []; cancelarEdicao();
    if (!salvar()) { estado.escalas = escalasAntes; render(); return; }
    render();
    toast('Todas as escalas foram removidas.');
  }

  function atualizarStatusEscala(id, status) {
    if (!STATUS_ESCALA.includes(status)) return;
    const escala = estado.escalas.find((e) => String(e.id) === String(id));
    if (!escala || statusEscala(escala) === status) return;
    const anterior = statusEscala(escala);
    escala.status = status;
    if (!salvar()) { escala.status = anterior; render(); return; }
    render();
    toast(`Escala marcada como ${STATUS_INFO[status].label.toLocaleLowerCase('pt-BR')}.`);
  }

  function ligarEventos() {
    on('formEscala', 'submit', (ev) => { ev.preventDefault(); submeterFormulario(); });
    on('btnCancelEdit', 'click', () => {
      cancelarEdicao();
      if (isMobileViewport()) fecharPainelLancamentoMobile();
    });
    on('toggleAdvanced', 'click', () => setDetalhesAvancados($('toggleAdvanced')?.getAttribute('aria-expanded') !== 'true'));
    on('mobileAdd', 'click', () => {
      if (isMobileViewport()) {
        /* Abre primeiro para que o toque seja apresentado imediatamente; o
           preenchimento e o cálculo seguem depois do primeiro paint. */
        abrirPainelLancamentoMobile();
        aposProximoPaint(() => {
          if (!estado.sheetAberto) return;
          if (estado.editandoId === null) {
            setTituloSheet('Nova escala AC4');
            setDetalhesAvancados(false);
            $('escalaInicio').value = inicioPadrao(estado.escalas);
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
      if (!e.matches && estado.sheetAberto) setMobileSheetOpen(false);
    });

    on('btnClearAll', 'click', limparTudo);

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

    /* Chips de duração rápida (mobile) — escrevem no mesmo #escalaDuracao.
       Tocar de novo no chip ativo desmarca: volta a "Personalizada", mantém o
       término já calculado e abre o campo Término para o ajuste manual (v78). */
    document.querySelectorAll('#durChips .dur-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if ($('escalaDuracao')?.value === chip.dataset.horas) {
          marcarDuracaoPersonalizada();
          return;
        }
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
      if (ev.target.closest('[data-acao-vazia="nova-escala"]')) { $('mobileAdd')?.click(); return; }
      const btn = ev.target.closest('[data-acao]');
      if (!btn) return;
      if (btn.dataset.acao === 'anteriores') { estado.limiteLista += PASSO_LISTA; render(); return; }
      const id = btn.dataset.id;
      if (btn.dataset.acao === 'remover')        removerEscala(id);
      else if (btn.dataset.acao === 'editar')    editarEscala(id);
      else if (btn.dataset.acao === 'duplicar')  duplicarEscala(id);
      else if (btn.dataset.acao === 'agenda')    agendarEscalaItem(id);
      else if (btn.dataset.acao === 'lote')      abrirLote(id);
      else if (btn.dataset.acao === 'explicar')  explicarValor(id);
      btn.closest('details')?.removeAttribute('open');
    });
    on('listaEscalas', 'change', (ev) => {
      const select = ev.target.closest('[data-status-id]');
      if (select) atualizarStatusEscala(select.dataset.statusId, select.value);
    });

    document.addEventListener('keydown', (e) => {
      if (estado.sheetAberto && e.key === 'Tab') {
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
        if (estado.editandoId !== null) cancelarEdicao();
        if (estado.sheetAberto) fecharPainelLancamentoMobile();
      }
    });
  }

  return {
    isMobileViewport, setDetalhesAvancados, abrirPainelLancamentoMobile, fecharPainelLancamentoMobile,
    validarFormulario, submeterFormulario, editarEscala, cancelarEdicao, atualizarResumoLancamento,
    sincronizarTodosControlesDataHora, aplicarPartesDataHora, atualizarChipsDuracao, duplicarEscala,
    removerEscala, limparTudo, atualizarStatusEscala, atualizarResumoFim, lerQtdPm, ligarEventos,
  };
}
