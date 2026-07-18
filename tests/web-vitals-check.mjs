/* Core Web Vitals — gate automatizado (auditoria F-01/F-02/F-03).
   Abre a aplicação em Chrome headless e mede na prática, via PerformanceObserver:
   CLS de inicialização (armazenamento vazio e preenchido, mobile e desktop),
   renderização única do init() e a latência da interação de compartilhamento,
   incluindo long tasks. Zero dependências npm (mesma base do mobile-check.mjs). */
import { createServer } from 'node:http';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
/* Coerência financeira do cenário 2: o total renderizado na página deve bater
   com o que a própria lógica de cálculo produz para as escalas semeadas. */
import { calcularEscala, TABELA_OFICIAL } from '../js/modules/calculo.mjs';
import { fmtMoeda } from '../js/modules/formato.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const LIMITE_CLS = 0.10;          // orçamento de CLS por cenário
const LIMITE_INTERACAO_MS = 200;  // até o diálogo aberto + dois frames (CI)
const LIMITE_LONGTASK_MS = 200;   // nenhuma long task acima disso na interação

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

const iniciarServidor = () => new Promise((resolve) => {
  const srv = createServer(async (req, res) => {
    try {
      let caminho = new URL(req.url, 'http://localhost').pathname;
      if (caminho === '/') caminho = '/index.html';
      const corpo = await readFile(join(raiz, caminho.replace(/^\/+/, '')));
      res.writeHead(200, { 'Content-Type': MIME[extname(caminho)] || 'application/octet-stream' });
      res.end(corpo);
    } catch { res.writeHead(404).end(); }
  });
  srv.listen(0, '127.0.0.1', () => resolve(srv));
});

function acharChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidatos = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  return achado;
}

const lancarChrome = (chrome, perfil) => new Promise((resolve, reject) => {
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', `--user-data-dir=${perfil}`, '--remote-debugging-port=0', 'about:blank',
  ]);
  let stderr = '';
  const timer = setTimeout(() => reject(new Error(`Chrome não expôs o DevTools em 20s.\n${stderr}`)), 20000);
  proc.stderr.on('data', (d) => {
    stderr += d;
    const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); resolve({ proc, wsUrl: m[1] }); }
  });
  proc.on('error', (e) => { clearTimeout(timer); reject(e); });
});

const conectarCDP = (wsUrl) => new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl);
  let proximoId = 1;
  const pendentes = new Map();
  const esperasEvento = [];
  ws.addEventListener('open', () => resolve({
    enviar(method, params = {}, sessionId) {
      const id = proximoId++;
      return new Promise((res, rej) => {
        pendentes.set(id, { res, rej });
        ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      });
    },
    aguardarEvento(method, timeoutMs = 15000) {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`Timeout aguardando ${method}`)), timeoutMs);
        esperasEvento.push({ method, res: (p) => { clearTimeout(timer); res(p); } });
      });
    },
    fechar: () => ws.close(),
  }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendentes.has(msg.id)) {
      const { res, rej } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      return;
    }
    if (msg.method) {
      for (let i = esperasEvento.length - 1; i >= 0; i--) {
        if (esperasEvento[i].method === msg.method) esperasEvento.splice(i, 1)[0].res(msg.params);
      }
    }
  });
  ws.addEventListener('error', () => reject(new Error('Falha no WebSocket do DevTools.')));
});

/* Instalado ANTES de qualquer script da página (addScriptToEvaluateOnNewDocument):
   acumula layout shifts sem input recente (CLS), long tasks e quantas vezes o
   init() repopulou #listaEscalas (gate do F-01 — deve ser exatamente 1).
   Tipos de entrada ausentes são sinalizados, nunca mascarados: a ausência de
   'layout-shift' reprova o CLS; a de 'longtask' é reportada na tabela. */
const OBSERVADOR_VITALS = `(() => {
  window.__ac4Vitals = { cls: 0, longTasks: [], renderMutacoes: 0, semLayoutShift: false, semLongTask: false };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__ac4Vitals.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { window.__ac4Vitals.semLayoutShift = true; }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__ac4Vitals.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch { window.__ac4Vitals.semLongTask = true; }
  /* Conta reposições de conteúdo em #listaEscalas a partir do DOMContentLoaded
     (o parser também insere o empty-state estático — esse não conta). Este
     listener registra antes do módulo da aplicação, logo observa o 1º render. */
  document.addEventListener('DOMContentLoaded', () => {
    const alvo = document.getElementById('listaEscalas');
    if (!alvo) return;
    new MutationObserver((records) => {
      window.__ac4Vitals.renderMutacoes += records.length;
    }).observe(alvo, { childList: true });
  }, { once: true });
})();`;

/* Coleta pós-carregamento: espera fontes + frames + janela de assentamento e
   devolve o estado consolidado da página para as asserções do Node. */
const MEDICAO_CARGA = `(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const doisFrames = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r('frames')))),
    espera(1500).then(() => 'timeout'),
  ]);
  await document.fonts.ready;
  await doisFrames();
  await espera(300); /* janela para layout shifts tardios entrarem no observer */
  const v = window.__ac4Vitals;
  return JSON.stringify({
    cls: v.cls,
    semLayoutShift: v.semLayoutShift,
    semLongTask: v.semLongTask,
    renderMutacoes: v.renderMutacoes,
    appPending: document.documentElement.classList.contains('app-pending'),
    appReady: document.documentElement.classList.contains('app-ready'),
    cards: document.querySelectorAll('#listaEscalas .escala-card').length,
    linhas: document.querySelectorAll('#listaEscalas tbody tr').length,
    emptyState: !!document.querySelector('#listaEscalas .empty-state'),
    totValor: (document.getElementById('totValor')?.textContent || '').replace(/\\u00a0/g, ' '),
    tabelaVisivel: (() => { const t = document.querySelector('.table-wrap'); return !!t && getComputedStyle(t).display !== 'none'; })(),
    launchPanelFixed: (() => { const p = document.querySelector('.launch-panel'); return !!p && getComputedStyle(p).position === 'fixed'; })(),
    semOverflowX: document.documentElement.scrollWidth <= window.innerWidth + 1,
  });
})()`;

/* Escalas de teste no formato exato persistido pela aplicação. Definidas no
   Node para servirem tanto à semeadura quanto ao total esperado (coerência). */
const ESCALAS_SEMENTE = [
  { id: 1, inicio: '2026-07-06T07:00', fim: '2026-07-06T19:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1 },
  { id: 2, inicio: '2026-07-07T18:00', fim: '2026-07-08T08:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 2 },
  { id: 3, inicio: '2026-07-10T08:00', fim: '2026-07-11T08:00', descricao: '1ª CIA',     origem: 'AC4', qtdPm: 1 },
  { id: 4, inicio: '2026-07-12T22:00', fim: '2026-07-13T05:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1 },
  { id: 5, inicio: '2026-07-15T08:00', fim: '2026-07-15T18:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 3 },
];

/* Total que a página DEVE exibir, calculado pela mesma lógica de produção. */
const TOTAL_ESPERADO = fmtMoeda(
  ESCALAS_SEMENTE.reduce((s, e) => s + calcularEscala(e, TABELA_OFICIAL).valorCentavos * (e.qtdPm || 1), 0)
).replace(new RegExp(String.fromCharCode(160), 'g'), ' ');

const SEMEAR_ESCALAS = `localStorage.setItem('pmgoEscalas', ${JSON.stringify(JSON.stringify(ESCALAS_SEMENTE))}); 'ok'`;

const LIMPAR_ESCALAS = `localStorage.removeItem('pmgoEscalas'); 'ok'`;

/* Interação de compartilhamento: clique → diálogo aberto + dois frames pintados.
   showModal é síncrono; o custo real (montar o sheet, estilo, paint) aparece nos
   frames e nas long tasks observadas logo após o clique. */
const INTERACAO_SHARE = `(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const doisFrames = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r('frames')))),
    espera(1500).then(() => 'timeout'),
  ]);
  const v = window.__ac4Vitals;
  const longTasksAntes = v.longTasks.length;
  const btn = document.getElementById('mobileShare') || document.getElementById('btnShare');
  const dlg = document.getElementById('dialogShare');
  if (!btn || !dlg) return JSON.stringify({ erro: 'botão ou diálogo de compartilhar ausente' });
  const t0 = performance.now();
  btn.click();
  const frames = await doisFrames();
  const duracaoMs = performance.now() - t0;
  await espera(150); /* deixa entradas de longtask pendentes serem entregues */
  const aberto = dlg.open === true;
  if (dlg.open) dlg.close();
  return JSON.stringify({
    duracaoMs, aberto, frames,
    longTasks: v.longTasks.slice(longTasksAntes),
    semLongTask: v.semLongTask,
  });
})()`;

const fmtMs = (n) => `${n.toFixed(1)} ms`;
const fmtCls = (n) => n.toFixed(4);

const servidor = await iniciarServidor();
const porta = servidor.address().port;
const url = `http://127.0.0.1:${porta}/`;
const perfil = await mkdtemp(join(tmpdir(), 'ac4-cwv-'));
let chrome;
let falhou = false;

function reportar(titulo, passos) {
  console.log(`\n=== ${titulo} ===`);
  console.table(passos.map(({ nome, ok, detalhe }) => ({ verificação: nome, ok, medida: detalhe })));
  if (passos.some((p) => !p.ok)) falhou = true;
}

try {
  chrome = await lancarChrome(acharChrome(), perfil);
  const cdp = await conectarCDP(chrome.wsUrl);
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  await cdp.enviar('Page.enable', {}, sessionId);
  await cdp.enviar('Runtime.enable', {}, sessionId);
  /* Observer instalado uma vez — vale para todas as navegações da sessão. */
  await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVADOR_VITALS }, sessionId);

  const avaliar = async (expression) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return typeof r.result.value === 'string' && r.result.value.startsWith('{') ? JSON.parse(r.result.value) : r.result.value;
  };

  const navegar = async () => {
    const carregou = cdp.aguardarEvento('Page.loadEventFired');
    await cdp.enviar('Page.navigate', { url }, sessionId);
    await carregou;
  };

  const viewportMobile = async () => {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
  };
  const viewportDesktop = async () => {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId);
  };

  const checksCarga = (m, extras = []) => [
    { nome: 'Barreira app-pending removida após init', ok: !m.appPending && m.appReady, detalhe: m.appPending ? 'app-pending presente' : 'app-ready' },
    { nome: 'PerformanceObserver de layout-shift disponível', ok: !m.semLayoutShift, detalhe: m.semLayoutShift ? 'tipo layout-shift indisponível' : 'ok' },
    { nome: `CLS de inicialização ≤ ${LIMITE_CLS}`, ok: !m.semLayoutShift && m.cls <= LIMITE_CLS, detalhe: fmtCls(m.cls) },
    { nome: 'init() renderiza #listaEscalas uma única vez (F-01)', ok: m.renderMutacoes === 1, detalhe: `${m.renderMutacoes} mutação(ões)` },
    ...extras,
  ];

  /* Cenário 1 — armazenamento vazio, mobile 390×844 */
  await viewportMobile();
  await navegar();                       /* estabelece a origem para o storage */
  await avaliar(LIMPAR_ESCALAS);
  await navegar();
  const m1 = await avaliar(MEDICAO_CARGA);
  reportar('Cenário 1 — armazenamento vazio (390×844)', checksCarga(m1, [
    { nome: 'Estado vazio presente em #listaEscalas', ok: m1.emptyState && m1.cards === 0, detalhe: '' },
    { nome: 'Sem overflow horizontal', ok: m1.semOverflowX, detalhe: '' },
  ]));

  /* Cenário 2 — armazenamento preenchido (5 escalas), mobile 390×844 */
  await avaliar(SEMEAR_ESCALAS);
  await navegar();
  const m2 = await avaliar(MEDICAO_CARGA);
  reportar('Cenário 2 — armazenamento preenchido (390×844)', checksCarga(m2, [
    { nome: '5 escalas semeadas e renderizadas', ok: m2.cards === 5 && m2.linhas === 5 && !m2.emptyState, detalhe: `${m2.cards} card(s) / ${m2.linhas} linha(s)` },
    { nome: 'Total exibido coerente com a lógica de cálculo', ok: m2.totValor === TOTAL_ESPERADO, detalhe: `${m2.totValor} (esperado ${TOTAL_ESPERADO})` },
  ]));

  /* Cenário 3 — interação de compartilhamento (mesma página carregada) */
  const i3 = await avaliar(INTERACAO_SHARE);
  const longAcima = (i3.longTasks || []).filter((d) => d > LIMITE_LONGTASK_MS);
  const maiorLongTask = (i3.longTasks || []).length ? Math.max(...i3.longTasks) : 0;
  reportar('Cenário 3 — compartilhamento (390×844)', i3.erro
    ? [{ nome: 'Interação de compartilhar', ok: false, detalhe: i3.erro }]
    : [
      { nome: 'Diálogo #dialogShare abre', ok: i3.aberto, detalhe: '' },
      { nome: 'Dois frames pintados após o clique', ok: i3.frames === 'frames', detalhe: i3.frames },
      { nome: `Interação ≤ ${LIMITE_INTERACAO_MS} ms`, ok: i3.aberto && i3.frames === 'frames' && i3.duracaoMs <= LIMITE_INTERACAO_MS, detalhe: fmtMs(i3.duracaoMs) },
      { nome: `Zero long task > ${LIMITE_LONGTASK_MS} ms na interação`, ok: longAcima.length === 0, detalhe: i3.semLongTask ? 'tipo longtask indisponível (não medido)' : `maior: ${fmtMs(maiorLongTask)}` },
    ]);

  /* Cenário 4 — desktop 1280×900 (armazenamento segue preenchido) */
  await viewportDesktop();
  await navegar();
  const m4 = await avaliar(MEDICAO_CARGA);
  reportar('Cenário 4 — desktop (1280×900)', checksCarga(m4, [
    { nome: 'Tabela de escalas visível no desktop', ok: m4.tabelaVisivel && m4.linhas === 5, detalhe: `${m4.linhas} linha(s)` },
    { nome: 'launch-panel não é fixed no desktop', ok: !m4.launchPanelFixed, detalhe: m4.launchPanelFixed ? 'position: fixed' : 'ok' },
    { nome: 'Sem overflow horizontal', ok: m4.semOverflowX, detalhe: '' },
  ]));

  /* Cenário 5 — resiliência: erro proposital no init() não pode deixar a tela
     presa em app-pending. A sabotagem remove #escalaInicio antes do init rodar
     (o listener injetado registra primeiro), forçando o TypeError; o try/finally
     do DOMContentLoaded deve revelar a aplicação mesmo assim. */
  await avaliar(LIMPAR_ESCALAS);
  const { identifier: idSabotagem } = await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', {
    source: `document.addEventListener('DOMContentLoaded', () => { document.getElementById('escalaInicio')?.remove(); }, { once: true });`,
  }, sessionId);
  await navegar();
  const m5 = await avaliar(`(async () => {
    await new Promise((r) => setTimeout(r, 200));
    return JSON.stringify({
      sabotado: !document.getElementById('escalaInicio'),
      appPending: document.documentElement.classList.contains('app-pending'),
      appReady: document.documentElement.classList.contains('app-ready'),
    });
  })()`);
  await cdp.enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: idSabotagem }, sessionId);
  reportar('Cenário 5 — resiliência (erro no init)', [
    { nome: 'Sabotagem aplicada (init falhou de propósito)', ok: m5.sabotado, detalhe: m5.sabotado ? '#escalaInicio removido' : 'sabotagem não surtiu efeito' },
    { nome: 'app-pending não permanece após erro no init', ok: !m5.appPending && m5.appReady, detalhe: m5.appPending ? 'tela presa em app-pending' : 'app-ready' },
  ]);

  await navegar(); /* recarrega sem sabotagem para deixar o storage limpo */
  await avaliar(LIMPAR_ESCALAS);
  console.log(falhou ? '\nCORE WEB VITALS: FALHOU.' : '\nCORE WEB VITALS OK — todos os orçamentos atendidos.');
  process.exitCode = falhou ? 1 : 0;
  cdp.fechar();
} finally {
  chrome?.proc.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
