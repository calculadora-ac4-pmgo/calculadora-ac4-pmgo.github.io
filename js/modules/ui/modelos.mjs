/* ==========================================================================
   Calculadora AC4 — modelos favoritos (v75)
   Modelos salvos no aparelho (duração, Qtd. PM, unidade, origem), seletor
   "Meus modelos" e "Repetir última" (preenche o dia seguinte sem salvar).
   ========================================================================== */
import { calcularTerminoPorDuracao, parseDateTimeLocal, toInputLocal } from '../formato.mjs';
import { gerarIdEscala } from '../persistencia.mjs';

/**
 * Cria os modelos favoritos.
 * @param {Object} ctx Dependências de app.js: $, on, estado, toast, dialogConfirmar, salvarModelos,
 *   aposProximoPaint e, do formulário, isMobileViewport, abrirPainelLancamentoMobile,
 *   setDetalhesAvancados, sincronizarTodosControlesDataHora, atualizarResumoFim,
 *   atualizarChipsDuracao, atualizarResumoLancamento e lerQtdPm.
 * @returns {{renderModelos:Function, preencherConfiguracaoRapida:Function, repetirUltimaEscala:Function,
 *   abrirSalvarModelo:Function, salvarModeloAtual:Function, excluirModeloSelecionado:Function, ligarEventos:Function}}
 */
export function criarModelos(ctx) {
  const { $, on, estado, toast, dialogConfirmar, salvarModelos, aposProximoPaint, isMobileViewport,
    abrirPainelLancamentoMobile, setDetalhesAvancados, sincronizarTodosControlesDataHora, atualizarResumoFim,
    atualizarChipsDuracao, atualizarResumoLancamento, lerQtdPm } = ctx;

  function renderModelos() {
    const select = $('templateSelect');
    const wrap = $('templateSelectWrap');
    if (!select || !wrap) return;
    const selecionado = select.value;
    select.innerHTML = '<option value="">Meus modelos</option>';
    estado.modelos.forEach((modelo) => {
      const opt = document.createElement('option');
      opt.value = modelo.id;
      opt.textContent = modelo.nome;
      select.appendChild(opt);
    });
    wrap.classList.toggle('hidden', estado.modelos.length === 0);
    if (estado.modelos.some((m) => m.id === selecionado)) select.value = selecionado;
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
    const ultima = [...estado.escalas].sort((a, b) => (parseDateTimeLocal(b.inicio) || new Date(b.inicio)) - (parseDateTimeLocal(a.inicio) || new Date(a.inicio)))[0];
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
    const existente = estado.modelos.find((m) => m.nome.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'));
    const modelo = {
      id: existente?.id || gerarIdEscala(),
      nome: nome.slice(0, 40),
      duracao,
      qtdPm: lerQtdPm(),
      descricao: ($('escalaDescricao')?.value || '').trim(),
      origem: $('escalaOrigem')?.value || 'AC4',
    };
    estado.modelos = existente ? estado.modelos.map((m) => m.id === existente.id ? modelo : m) : [...estado.modelos, modelo].slice(-20);
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
    const modelo = estado.modelos.find((m) => m.id === id);
    if (!modelo) return;
    const ok = await dialogConfirmar(`Excluir o modelo “${modelo.nome}”?`);
    if (!ok) return;
    estado.modelos = estado.modelos.filter((m) => m.id !== id);
    if (salvarModelos()) {
      renderModelos();
      toast('Modelo excluído.');
    }
  }

  function ligarEventos() {
    on('btnRepeatLast', 'click', () => {
      repetirUltimaEscala();
      if (isMobileViewport()) abrirPainelLancamentoMobile();
    });
    on('btnSaveTemplate', 'click', abrirSalvarModelo);
    on('templateCancel', 'click', () => $('dialogTemplate')?.close());
    on('templateForm', 'submit', (ev) => { ev.preventDefault(); salvarModeloAtual(); });
    on('templateSelect', 'change', () => {
      const id = $('templateSelect')?.value || '';
      const modelo = estado.modelos.find((m) => m.id === id);
      $('btnDeleteTemplate')?.classList.toggle('hidden', !modelo);
      if (!modelo) return;
      preencherConfiguracaoRapida(modelo);
      toast(`Modelo “${modelo.nome}” aplicado.`);
    });
    on('btnDeleteTemplate', 'click', excluirModeloSelecionado);
  }

  return {
    renderModelos, preencherConfiguracaoRapida, repetirUltimaEscala, abrirSalvarModelo,
    salvarModeloAtual, excluirModeloSelecionado, ligarEventos,
  };
}
