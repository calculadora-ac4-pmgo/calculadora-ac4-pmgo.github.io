/* Capturas para a revisão visual do piso de fonte (v77, R6).
   Script de apoio — NÃO faz parte do npm test. Tira PNGs do app em 320, 390 e
   1280 px, nos temas claro e escuro, de quatro telas:
     inicio        página inteira com escalas lançadas
     painel-mes    painel do planejamento do mês expandido
     sheet         lançamento (sheet no celular; painel de lançamento no desktop)
     compartilhar  diálogo Compartilhar
   Uso:
     node tests/capturas-fontes.mjs <pasta-de-saida> [--raiz <repositorio>]
   Com --raiz, serve outro checkout (ex.: um worktree da v76) para comparar
   "antes" e "depois" com as mesmas escalas e a mesma data. */
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { raiz as raizPadrao, iniciarServidor, acharChrome, lancarChrome, conectarCDP } from './lib/navegador.mjs';

const args = process.argv.slice(2);
const iRaiz = args.indexOf('--raiz');
const raizAlvo = iRaiz >= 0 ? resolve(args[iRaiz + 1]) : raizPadrao;
const pasta = args.find((a, i) => !a.startsWith('--') && (iRaiz < 0 || i !== iRaiz + 1));
const saida = pasta ? resolve(pasta) : '';
if (!saida) {
  console.error('uso: node tests/capturas-fontes.mjs <pasta-de-saida> [--raiz <repositorio>]');
  process.exit(2);
}

const { TABELA_OFICIAL } = await import(pathToFileURL(join(raizAlvo, 'js', 'modules', 'calculo.mjs')).href);
const BASE = [
  ['2026-07-06T07:00', '2026-07-06T19:00', 'Batalhão Centro', 'AC4', 1, 'recebida'],
  ['2026-07-07T19:00', '2026-07-08T07:00', 'Operação Noturna', 'AC4', 1, 'conferida'],
  ['2026-07-09T18:00', '2026-07-10T05:00', 'Virada quinta→sexta', 'PREFEITURAS', 3, 'realizada'],
  ['2026-07-15T13:00', '2026-07-16T13:00', 'Plantão 24h', 'AC4', 1, 'planejada'],
  ['2026-08-03T07:00', '2026-08-03T19:00', 'Batalhão Centro', 'AC4', 1, 'planejada'],
  ['2026-08-04T19:00', '2026-08-05T07:00', 'Operação Noturna', 'DETRAN', 1, 'realizada'],
  ['2026-08-14T14:00', '2026-08-15T14:00', 'Plantão 24h sexta', 'DETRAN', 3, 'recebida'],
  ['2026-09-02T08:00', '2026-09-02T20:00', 'Evento Águas Quentes', 'CONVENIO_TRE', 1, 'planejada'],
];
const ESCALAS = BASE.map(([inicio, fim, descricao, origem, qtdPm, status], i) => ({
  id: `cap-${i + 1}`, inicio, fim, descricao, origem, qtdPm, status, tabela: TABELA_OFICIAL,
}));
const METAS = { '2026-08': { valorCentavos: 500000, horas: 120 } };

const LARGURAS = [
  { w: 320, h: 640, mobile: true, dpr: 2 },
  { w: 390, h: 844, mobile: true, dpr: 2 },
  { w: 1280, h: 900, mobile: false, dpr: 1 },
];
const TEMAS = ['light', 'dark'];

const servidor = await iniciarServidor(raizAlvo);
const porta = servidor.address().port;
const perfil = await mkdtemp(join(tmpdir(), 'ac4-cap-'));
let chrome;
try {
  await mkdir(saida, { recursive: true });
  chrome = await lancarChrome(acharChrome(), perfil);
  const cdp = await conectarCDP(chrome.wsUrl);
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  await cdp.enviar('Page.enable', {}, sessionId);
  await cdp.enviar('Runtime.enable', {}, sessionId);
  await cdp.enviar('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' }, sessionId);

  const navegar = async () => {
    const carregou = cdp.aguardarEvento('Page.loadEventFired');
    await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
    await carregou;
  };
  const avaliar = async (expression) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`Erro na página: ${JSON.stringify(r.exceptionDetails)}`);
    return r.result.value;
  };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const salvar = async (nome, params = {}) => {
    const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'png', ...params }, sessionId);
    await writeFile(join(saida, `${nome}.png`), Buffer.from(data, 'base64'));
  };
  const recorte = async (seletor) => avaliar(`(() => {
    const e = document.querySelector(${JSON.stringify(seletor)});
    if (!e) return null;
    e.scrollIntoView({ block: 'start' });
    const r = e.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  })()`);

  for (const vp of LARGURAS) {
    for (const tema of TEMAS) {
      const base = `${vp.w}-${tema}`;
      await cdp.enviar('Emulation.setDeviceMetricsOverride',
        { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile }, sessionId);
      await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile }, sessionId);
      const semear = async () => {
        await navegar();
        await avaliar(`(() => {
          localStorage.clear();
          localStorage.setItem('pmgoEscalas', ${JSON.stringify(JSON.stringify(ESCALAS))});
          localStorage.setItem('pmgoMetasMensais', ${JSON.stringify(JSON.stringify(METAS))});
          localStorage.setItem('pmgoTheme', ${JSON.stringify(tema)});
          localStorage.setItem('pmgoVersion', String(window.__ac4Version));
          localStorage.setItem('pmgoNovidadesVistas', document.getElementById('dialogNovidades').dataset.conteudo);
          localStorage.setItem('pmgoUltimoBackup', String(Date.now()));
          localStorage.setItem('pmgoPwaBanner', 'dispensado');
        })()`);
        await navegar();
        await avaliar(`(async () => { for (let i = 0; i < 80 && !(document.documentElement.classList.contains('app-ready') && document.getElementById('listaEscalas')); i++) await new Promise((r) => setTimeout(r, 100)); })()`);
        await espera(500);
      };

      // 1. início, página inteira
      await semear();
      const altura = await avaliar('Math.ceil(document.documentElement.scrollHeight)');
      await salvar(`${base}-inicio`, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: vp.w, height: altura, scale: 1 } });

      // 2. painel do mês expandido
      await avaliar(`document.getElementById('planningToggle')?.offsetParent && document.getElementById('planningToggle').click()`);
      await espera(350);
      const painel = await recorte('.planning-panel');
      if (painel) await salvar(`${base}-painel-mes`, { captureBeyondViewport: true, clip: { ...painel, scale: 1 } });

      // 3. sheet de lançamento (celular) ou painel de lançamento (desktop)
      await semear();
      if (vp.mobile) {
        await avaliar(`document.getElementById('mobileAdd').click()`);
        await espera(500);
        await salvar(`${base}-sheet`);
      } else {
        const lancamento = await recorte('#launchPanel');
        if (lancamento) await salvar(`${base}-sheet`, { captureBeyondViewport: true, clip: { ...lancamento, scale: 1 } });
      }

      // 4. diálogo Compartilhar
      await semear();
      await avaliar(`document.getElementById(${JSON.stringify(vp.mobile ? 'mobileShare' : 'btnShare')}).click()`);
      await espera(500);
      await salvar(`${base}-compartilhar`);
    }
  }
  cdp.fechar();
  console.log(`Capturas salvas em ${saida}`);
} finally {
  chrome?.proc.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
