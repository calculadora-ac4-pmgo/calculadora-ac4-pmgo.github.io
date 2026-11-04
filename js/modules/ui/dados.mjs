/* ==========================================================================
   Calculadora AC4 — dados no aparelho (v74)
   Salvar/carregar escalas, modelos e metas no localStorage; backup em JSON
   (exportar/restaurar), lembrete de backup e pedido de armazenamento
   persistente. Escalas, modelos e metas são lidos e gravados só via `estado`.
   ========================================================================== */
import { STORAGE_SCHEMA_VERSION, desserializarEscalas } from '../persistencia.mjs';
import { baixarArquivo } from '../relatorio.mjs';
import { fmtData } from '../formato.mjs';
import { normaAtual } from '../portarias.mjs';

/**
 * Cria a camada de dados da interface.
 * @param {Object} ctx Dependências de app.js: estado (escalas, modelos, metasMensais,
 *   sheetAberto), STORAGE, APP_VERSION, lerLocal, toast, dialogConfirmar, registrarErro,
 *   render, renderModelos, cancelarEdicao e clonarEscalas.
 * @returns {Object} salvar, carregar, salvarModelos, salvarMetas, normalizarModelos,
 *   normalizarMetas, exportarBackup, restaurarBackup, pedirArmazenamentoPersistente,
 *   textoStatusBackup, lembrarBackup, ehIOS e rodandoInstalado.
 */
export function criarDados(ctx) {
  const { estado, STORAGE, APP_VERSION, lerLocal, toast, dialogConfirmar, registrarErro,
    render, renderModelos, cancelarEdicao, clonarEscalas } = ctx;

  /* Valores somente leitura, vindos de portarias.mjs (fonte única, v73).
     Escalas gravam a tabela da norma vigente na data de início. */
  const avisarRecalculadas = (k) => {
    if (k > 0) toast(`${k} escala${k === 1 ? '' : 's'} recalculada${k === 1 ? '' : 's'} pela ${normaAtual().norma}.`);
  };

  /* --------------------------------------------- persistência */
  function salvar() {
    try {
      localStorage.setItem(STORAGE.escalas, JSON.stringify(estado.escalas));
      localStorage.setItem(STORAGE.schema, STORAGE_SCHEMA_VERSION);
      sessionStorage.removeItem(STORAGE.escalas);
      return true;
    } catch {
      toast('Não foi possível salvar neste navegador. Exporte os dados e confira o espaço disponível.', { erro: true });
      return false;
    }
  }

  const normalizarModelos = (fonte) => Array.isArray(fonte)
    ? fonte.filter((m) => m && typeof m.id === 'string' && typeof m.nome === 'string'
      && Number.isFinite(Number(m.duracao)) && Number(m.duracao) > 0 && Number(m.duracao) <= 24)
      .slice(0, 20)
    : [];

  const normalizarMetas = (fonte) => {
    if (!fonte || typeof fonte !== 'object' || Array.isArray(fonte)) return {};
    return Object.fromEntries(Object.entries(fonte).filter(([mes, meta]) => /^\d{4}-\d{2}$/.test(mes)
      && meta && typeof meta === 'object').map(([mes, meta]) => {
      const valorCentavos = Math.max(0, Math.min(9_999_999_900, Math.round(Number(meta.valorCentavos) || 0)));
      const horas = Math.max(0, Math.min(744, Number(meta.horas) || 0));
      return [mes, { valorCentavos, horas }];
    }).filter(([, meta]) => meta.valorCentavos > 0 || meta.horas > 0));
  };

  function carregar() {
    /* pmgoConfig guardava os valores dos antigos campos ocultos (até a v72). */
    try { localStorage.removeItem('pmgoConfig'); } catch { /* sem acesso ao storage */ }
    try {
      const legado = sessionStorage.getItem(STORAGE.escalas);
      if (legado) { const p = JSON.parse(legado); if (Array.isArray(p) && p.length) localStorage.setItem(STORAGE.escalas, legado); sessionStorage.removeItem(STORAGE.escalas); }
      const carregadas = desserializarEscalas(localStorage.getItem(STORAGE.escalas));
      estado.escalas = carregadas.escalas;
      /* Regrava o formato normalizado e registra a versão do schema. Registros
         inválidos são descartados antes de alcançar cálculo/renderização. */
      if (salvar()) avisarRecalculadas(carregadas.recalculadas);
      if (carregadas.rejeitadas) {
        registrarErro({ msg: `${carregadas.rejeitadas} registro(s) local(is) inválido(s) ignorado(s)`, src: 'storage', ln: 0, col: 0 });
      }
    } catch { estado.escalas = []; }
    try {
      const salvos = JSON.parse(lerLocal(STORAGE.modelos) || '[]');
      estado.modelos = normalizarModelos(salvos);
    } catch { estado.modelos = []; }
    try { estado.metasMensais = normalizarMetas(JSON.parse(lerLocal(STORAGE.metas) || '{}')); }
    catch { estado.metasMensais = {}; }
  }

  function salvarModelos() {
    try {
      localStorage.setItem(STORAGE.modelos, JSON.stringify(estado.modelos));
      return true;
    } catch {
      toast('Não foi possível salvar o modelo neste navegador.', { erro: true });
      return false;
    }
  }

  function salvarMetas() {
    try {
      localStorage.setItem(STORAGE.metas, JSON.stringify(estado.metasMensais));
      return true;
    } catch {
      toast('Não foi possível salvar a meta neste navegador.', { erro: true });
      return false;
    }
  }

  function exportarBackup() {
    const backup = {
      produto: 'Calculadora AC4',
      appVersion: APP_VERSION,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      exportadoEm: new Date().toISOString(),
      escalas: estado.escalas,
      modelos: estado.modelos,
      metasMensais: estado.metasMensais,
    };
    baixarArquivo(`${JSON.stringify(backup, null, 2)}\n`, `backup-calculadora-ac4-v${APP_VERSION}.json`, 'application/json;charset=utf-8');
    try { localStorage.setItem(STORAGE.ultimoBackup, String(Date.now())); } catch { /* lembrete pode reaparecer */ }
    toast(`Backup gerado com ${estado.escalas.length} escala${estado.escalas.length === 1 ? '' : 's'}.`);
  }

  /* Pede ao navegador que não apague os dados por falta de espaço ou de uso
     (Safari/iOS apaga após 7 dias sem visita). Chamado só após um lançamento,
     uma vez por sessão — o Firefox pode perguntar ao usuário. Recusa é tolerada. */
  let persistenciaSolicitada = false;
  async function pedirArmazenamentoPersistente() {
    if (persistenciaSolicitada || !navigator.storage?.persist) return;
    persistenciaSolicitada = true;
    try {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch { /* sem suporte: o lembrete de backup continua sendo a proteção */ }
  }

  const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const rodandoInstalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  /* Situação do backup exibida no Compartilhar, perto dos botões Backup/Restaurar. */
  function textoStatusBackup(agora = Date.now()) {
    const ultimo = Number(lerLocal(STORAGE.ultimoBackup)) || 0;
    let texto;
    if (!ultimo) texto = 'Você ainda não fez backup. As escalas ficam só neste aparelho.';
    else {
      const dias = Math.max(0, Math.floor((agora - ultimo) / DIA_MS));
      const quando = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
      texto = `Último backup: ${fmtData(new Date(ultimo))} (${quando}).`;
    }
    if (ehIOS() && !rodandoInstalado()) {
      texto += ' No iPhone, instale o app na Tela de Início: o Safari pode apagar dados de sites sem uso por 7 dias.';
    }
    return texto;
  }

  /* Lembrete de backup: os dados vivem só neste aparelho. Avisa quem tem
     estado.escalas e nunca salvou cópia (ou salvou há mais de 30 dias), no máximo
     uma vez por semana e nunca por cima de um dialog ou do sheet aberto. */
  const DIA_MS = 24 * 60 * 60 * 1000;
  function lembrarBackup(agora = Date.now()) {
    if (estado.escalas.length < 3 || estado.sheetAberto || document.querySelector('dialog[open]')) return false;
    const ultimo = Number(lerLocal(STORAGE.ultimoBackup)) || 0;
    const lembrado = Number(lerLocal(STORAGE.lembreteBackup)) || 0;
    if (agora - lembrado < 7 * DIA_MS) return false;
    if (ultimo && agora - ultimo <= 30 * DIA_MS) return false;
    try { localStorage.setItem(STORAGE.lembreteBackup, String(agora)); } catch { return false; }
    const dias = Math.floor((agora - ultimo) / DIA_MS);
    toast(ultimo
      ? `Último backup há ${dias} dias. Salve uma cópia das suas escalas.`
      : 'Suas escalas ficam só neste aparelho. Salve uma cópia de segurança.',
    { acao: { rotulo: 'Fazer backup', fn: exportarBackup } });
    return true;
  }

  async function restaurarBackup(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast('O backup excede o limite de 1 MB.', { erro: true });
      return;
    }
    try {
      const documento = JSON.parse(await file.text());
      const fonte = Array.isArray(documento) ? documento : documento?.escalas;
      if (!Array.isArray(fonte)) throw new Error('formato');
      const resultado = desserializarEscalas(JSON.stringify(fonte));
      const modelosBackup = !Array.isArray(documento) && Array.isArray(documento?.modelos)
        ? normalizarModelos(documento.modelos)
        : null;
      const metasBackup = !Array.isArray(documento) && documento?.metasMensais
        ? normalizarMetas(documento.metasMensais)
        : null;
      if (!resultado.escalas.length && fonte.length) throw new Error('sem-registros-validos');
      const detalhe = resultado.rejeitadas ? ` ${resultado.rejeitadas} registro(s) inválido(s) serão ignorados.` : '';
      const detalheModelos = modelosBackup ? ` O backup contém ${modelosBackup.length} modelo(s).` : '';
      const ok = await dialogConfirmar(
        `Restaurar ${resultado.escalas.length} escala${resultado.escalas.length === 1 ? '' : 's'} e substituir os dados atuais?${detalhe}${detalheModelos}`,
        { textoOk: 'Restaurar', perigoso: false }
      );
      if (!ok) return;
      const anteriores = clonarEscalas();
      estado.escalas = resultado.escalas;
      cancelarEdicao();
      if (!salvar()) { estado.escalas = anteriores; render(); return; }
      if (modelosBackup) {
        const modelosAnteriores = estado.modelos;
        estado.modelos = modelosBackup;
        if (!salvarModelos()) estado.modelos = modelosAnteriores;
        renderModelos();
      }
      if (metasBackup) {
        const metasAnteriores = estado.metasMensais;
        estado.metasMensais = metasBackup;
        if (!salvarMetas()) estado.metasMensais = metasAnteriores;
      }
      render();
      toast('Backup restaurado com sucesso.');
      avisarRecalculadas(resultado.recalculadas);
    } catch {
      toast('Arquivo de backup inválido ou incompatível.', { erro: true });
    }
  }

  return {
    salvar, carregar, salvarModelos, salvarMetas, normalizarModelos, normalizarMetas,
    exportarBackup, restaurarBackup, pedirArmazenamentoPersistente, textoStatusBackup,
    lembrarBackup, ehIOS, rodandoInstalado,
  };
}
