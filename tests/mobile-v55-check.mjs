/* Fase 55 — regressão do resultado premium mobile-first.
   Exercita a aplicação real em Chrome headless, sem dependências npm. */
import { createServer } from 'node:http';
import { readFile, writeFile, rm, mkdtemp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };

const servidor = await new Promise((resolve) => {
  const srv = createServer(async (req, res) => {
    try {
      let caminho = new URL(req.url, 'http://localhost').pathname;
      if (caminho === '/') caminho = '/index.html';
      const corpo = await readFile(join(raiz, caminho.replace(/^\/+/, '')));
      res.writeHead(200, { 'Content-Type': MIME[extname(caminho)] || 'application/octet-stream' }).end(corpo);
    } catch { res.writeHead(404).end(); }
  });
  srv.listen(0, '127.0.0.1', () => resolve(srv));
});

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidatos = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  const caminho = candidatos.find(existsSync);
  if (!caminho) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  return caminho;
}

const perfil = await mkdtemp(join(tmpdir(), 'ac4-v55-'));
const chrome = await new Promise((resolve, reject) => {
  const proc = spawn(chromePath(), ['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--disable-extensions',`--user-data-dir=${perfil}`,'--remote-debugging-port=0','about:blank']);
  let stderr = '';
  const timer = setTimeout(() => reject(new Error(`Chrome não iniciou em 60s.\n${stderr}`)), 60000);
  proc.stderr.on('data', (d) => {
    stderr += d;
    const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); resolve({ proc, url: m[1] }); }
  });
  proc.on('error', reject);
});

function conectar(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let id = 0; const pendentes = new Map(); const eventos = [];
    ws.addEventListener('open', () => resolve({
      enviar(method, params = {}, sessionId) {
        const atual = ++id;
        return new Promise((res, rej) => { pendentes.set(atual, { res, rej }); ws.send(JSON.stringify({ id: atual, method, params, ...(sessionId ? { sessionId } : {}) })); });
      },
      evento(method, timeout = 15000) {
        return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`Timeout: ${method}`)), timeout); eventos.push({ method, res: (v) => { clearTimeout(t); res(v); } }); });
      },
      fechar() { ws.close(); },
    }));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) { const p = pendentes.get(msg.id); pendentes.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
      if (msg.method) for (let i = eventos.length - 1; i >= 0; i--) if (eventos[i].method === msg.method) eventos.splice(i, 1)[0].res(msg.params);
    });
    ws.addEventListener('error', reject);
  });
}

const passos = [];
const registrar = (nome, ok, detalhe = '') => passos.push({ nome, ok: Boolean(ok), detalhe: String(detalhe) });
const pastaEvidencias = join(raiz, 'artifacts', 'v55');
await mkdir(pastaEvidencias, { recursive: true });
let cdp;
try {
  cdp = await conectar(chrome.url);
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  await cdp.enviar('Page.enable', {}, sessionId); await cdp.enviar('Runtime.enable', {}, sessionId);

  const navegar = async (largura, altura) => {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 2, mobile: largura <= 760 }, sessionId);
    const pronto = cdp.evento('Page.loadEventFired');
    await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${servidor.address().port}/` }, sessionId); await pronto;
  };
  const avaliar = async (expression) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const capturar = async (nome) => {
    const imagem = await cdp.enviar('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, sessionId);
    await writeFile(join(pastaEvidencias, nome), Buffer.from(imagem.data, 'base64'));
  };

  await navegar(390, 844);
  await avaliar(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<50&&!document.getElementById('formEscala');i++)await w(50);localStorage.removeItem('pmgoEscalas');document.getElementById('mobileAdd').click();await w(300);document.getElementById('escalaDuracao').value='';document.getElementById('launchResumo').scrollIntoView({block:'center'});await w(100)})()`);
  await capturar('01-formulario-antes-calculo-390.png');
  await avaliar(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const i=document.getElementById('escalaInicio'),d=document.getElementById('escalaDuracao');i.value='2026-07-10T18:00';i.dispatchEvent(new Event('change',{bubbles:true}));d.value='14';d.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('launchResumo').scrollIntoView({block:'center'});await w(100)})()`);
  await capturar('02-resultado-1-pm-390.png');
  await avaliar(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const q=document.getElementById('escalaQtdPm');q.value='20';q.dispatchEvent(new Event('input',{bubbles:true}));await w(100)})()`);
  await capturar('03-resultado-20-pms-390.png');
  await avaliar(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('btnSubmit').click();await w(350)})()`);
  await capturar('04-cards-escalas-390.png');
  await avaliar(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('footerNovidades').click();await w(350)})()`);
  await capturar('08-novidades-v64-390.png');
  await avaliar(`document.getElementById('novidadesContinuar').click()`);
  await avaliar(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));window.__ac4SimularAtualizacao();await w(350)})()`);
  await capturar('09-atualizacao-v64-390.png');
  await avaliar(`document.getElementById('updateLater').click()`);
  await avaliar(`document.getElementById('btnTheme').click()`);
  await capturar('05-modo-escuro-390.png');

  await avaliar(`localStorage.removeItem('pmgoEscalas');localStorage.removeItem('pmgoTheme')`);
  await navegar(390, 844);
  const resultado = JSON.parse(await avaliar(`(async()=>{
    const out=[]; const ok=(n,c,d='')=>out.push({n,ok:!!c,d:String(d)}); const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<50&&!document.getElementById('formEscala');i++)await wait(50);
    localStorage.removeItem('pmgoEscalas');
    document.getElementById('mobileAdd').click(); await wait(300);
    const inicio=document.getElementById('escalaInicio'), dur=document.getElementById('escalaDuracao'), qtd=document.getElementById('escalaQtdPm');
    const setDur=(h)=>{dur.value=String(h);dur.dispatchEvent(new Event('change',{bubbles:true}));};
    inicio.value='2026-07-10T18:00'; inicio.dispatchEvent(new Event('change',{bubbles:true})); setDur(14); await wait(30);
    ok('Caso 1: término 11/07 08:00',document.getElementById('escalaFim').value==='2026-07-11T08:00',document.getElementById('escalaFim').value);
    ok('Caso 1: 7h diurnas e 7h noturnas',document.getElementById('launchResultHours').textContent==='7h diurnas · 7h noturnas',document.getElementById('launchResultHours').textContent);
    ok('Caso 1: individual e total R$ 595,00',document.getElementById('launchResultValue').textContent.includes('595,00')&&document.getElementById('launchResultHelper').textContent==='Valor individual');
    ok('Caso 1: CTA contextual',document.getElementById('btnSubmitResult').textContent.includes('595,00'),document.getElementById('btnSubmit').textContent.trim());
    qtd.value='20';qtd.dispatchEvent(new Event('input',{bubbles:true}));await wait(20);
    ok('Caso 2: título e total para 20 PMs',document.getElementById('launchResultTitle').textContent==='CUSTO TOTAL ESTIMADO'&&document.getElementById('launchResultValue').textContent.includes('11.900,00'),document.getElementById('launchResultValue').textContent);
    ok('Caso 2: valor por PM preservado',document.getElementById('launchResultHelper').textContent.includes('R$ 595,00 por PM'),document.getElementById('launchResultHelper').textContent);
    setDur(12);await wait(20);ok('Caso 3: 12h atualiza tudo',document.getElementById('escalaFim').value==='2026-07-11T06:00'&&document.getElementById('launchResultValue').textContent.includes('10.300,00')&&document.getElementById('btnSubmitResult').textContent.includes('10.300,00'));
    setDur(14);await wait(20);ok('Caso 3: 14h restaura tudo',document.getElementById('escalaFim').value==='2026-07-11T08:00'&&document.getElementById('launchResultValue').textContent.includes('11.900,00'));
    setDur(24);await wait(20);ok('Caso 4: 24h atualiza tudo',document.getElementById('escalaFim').value==='2026-07-11T18:00'&&document.getElementById('launchResultValue').textContent.includes('19.900,00')&&document.getElementById('launchResultHours').textContent==='17h diurnas · 7h noturnas');
    qtd.value='1';qtd.dispatchEvent(new Event('input',{bubbles:true}));setDur(14);await wait(20);
    ok('Caso 5: 1 → 20 → 1 restaura título e individual',document.getElementById('launchResultTitle').textContent==='VALOR ESTIMADO'&&document.getElementById('launchResultValue').textContent.includes('595,00'));
    document.getElementById('btnSubmit').click();await wait(350);
    ok('Caso 6: persistência gravada',JSON.parse(localStorage.getItem('pmgoEscalas')||'[]').length===1);
    document.querySelector('[data-acao="editar"]').click();await wait(250);
    ok('Caso 7: edição restaura campos e resultado',inicio.value==='2026-07-10T18:00'&&document.getElementById('launchResultValue').textContent.includes('595,00'));
    document.getElementById('btnCancelEdit').click();await wait(250);
    document.querySelector('[data-acao="duplicar"]').click();await wait(200);
    ok('Caso 8: duplicação preserva cálculos',JSON.parse(localStorage.getItem('pmgoEscalas')||'[]').length===2&&document.querySelectorAll('.escala-card').length===2);
    document.querySelector('[data-acao="remover"]').click();await wait(150);
    ok('Caso 9: exclusão preservada',JSON.parse(localStorage.getItem('pmgoEscalas')||'[]').length===1);
    document.getElementById('btnTheme').click();
    ok('Caso 10: modo escuro aplicado',document.documentElement.dataset.theme==='dark'&&getComputedStyle(document.getElementById('totValor')).color!=='rgba(0, 0, 0, 0)');
    ok('Stepper participa do teclado',!document.getElementById('qtdMinus').hasAttribute('tabindex')&&!document.getElementById('qtdPlus').hasAttribute('tabindex'));
    return JSON.stringify(out);
  })()`));
  resultado.forEach((p) => registrar(p.n, p.ok, p.d));

  await navegar(390, 844);
  const persistiu = JSON.parse(await avaliar(`JSON.stringify({n:JSON.parse(localStorage.getItem('pmgoEscalas')||'[]').length,card:document.querySelectorAll('.escala-card').length})`));
  registrar('Caso 6: recarga mantém escala e card', persistiu.n === 1 && persistiu.card === 1, JSON.stringify(persistiu));

  for (const largura of [320, 360, 375, 390, 412, 430]) {
    await navegar(largura, 844);
    const medida = JSON.parse(await avaliar(`JSON.stringify({scroll:document.documentElement.scrollWidth,inner:window.innerWidth})`));
    registrar(`Caso 11: ${largura}px sem overflow horizontal`, medida.scroll <= medida.inner + 1, `${medida.scroll}/${medida.inner}`);
    if (largura === 320 || largura === 430) await capturar(`06-layout-${largura}px.png`);
  }
  await navegar(1280, 900);
  const desktop = JSON.parse(await avaliar(`JSON.stringify({overflow:document.documentElement.scrollWidth<=window.innerWidth+1,panel:getComputedStyle(document.getElementById('launchPanel')).position,table:getComputedStyle(document.querySelector('.table-wrap')).display})`));
  registrar('Caso 12: desktop sem regressão estrutural', desktop.overflow && desktop.panel !== 'fixed' && desktop.table !== 'none', JSON.stringify(desktop));

  console.table(passos);
  const falhas = passos.filter((p) => !p.ok);
  console.log(falhas.length ? `MOBILE V55 FALHOU — ${falhas.length} caso(s).` : `MOBILE V55 OK — ${passos.length} verificações.`);
  process.exitCode = falhas.length ? 1 : 0;
  cdp.fechar();
} finally {
  chrome.proc.kill(); servidor.close(); await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
