/* Smoke test de interface — abre a aplicação real em Chrome headless via
   DevTools Protocol (CDP) e valida o fluxo principal do usuário:
   lançar escala com duração automática → tabela → totais → persistência → .ics.

   Zero dependências npm: servidor HTTP e WebSocket nativos do Node (≥ 22).
   Uso: node tests/smoke.mjs   (CHROME_PATH sobrepõe a detecção do binário) */
import { createServer } from 'node:http';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------ servidor estático */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

function iniciarServidor() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        let caminho = new URL(req.url, 'http://localhost').pathname;
        if (caminho === '/') caminho = '/index.html';
        const arquivo = join(raiz, caminho.replace(/^\/+/, ''));
        const corpo = await readFile(arquivo);
        res.writeHead(200, { 'Content-Type': MIME[extname(arquivo)] || 'application/octet-stream' });
        res.end(corpo);
      } catch {
        res.writeHead(404).end('não encontrado');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ------------------------------------------------ chrome headless */
function acharChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidatos = process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  return achado;
}

function lancarChrome(chrome, perfil) {
  return new Promise((resolve, reject) => {
    const proc = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', `--user-data-dir=${perfil}`,
      '--remote-debugging-port=0', 'about:blank',
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
}

/* ------------------------------------------------ cliente CDP mínimo */
function conectarCDP(wsUrl) {
  return new Promise((resolve, reject) => {
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
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
        return;
      }
      if (msg.method) {
        for (let i = esperasEvento.length - 1; i >= 0; i--) {
          if (esperasEvento[i].method === msg.method) {
            esperasEvento.splice(i, 1)[0].res(msg.params);
          }
        }
      }
    });
    ws.addEventListener('error', (e) => reject(new Error(`WebSocket: ${e.message || 'falha'}`)));
  });
}

/* ------------------------------------------------ roteiro do smoke test
   Executado dentro da página; retorna JSON com os passos e resultados. */
const ROTEIRO = `(async () => {
  const passos = [];
  const ok = (nome, cond, detalhe = '') => passos.push({ nome, ok: !!cond, detalhe: String(detalhe) });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  // aguarda a inicialização do app (formulário renderizado e listeners ativos)
  for (let i = 0; i < 50 && !document.getElementById('formEscala'); i++) await espera(100);
  localStorage.removeItem('pmgoEscalas');

  ok('Formulário de lançamento presente', !!document.getElementById('formEscala'));
  ok('Métricas presentes', !!document.getElementById('totValor'));

  // 1. duração automática: seg 06/07 07:00 + 14h => 21:00 do mesmo dia
  const ini = document.getElementById('escalaInicio');
  ini.value = '2026-07-06T07:00';
  ini.dispatchEvent(new Event('change', { bubbles: true }));
  const dur = document.getElementById('escalaDuracao');
  dur.value = '14';
  dur.dispatchEvent(new Event('change', { bubbles: true }));
  ok('Duração 14h preenche término automaticamente',
     document.getElementById('escalaFim').value === '2026-07-06T21:00',
     document.getElementById('escalaFim').value);

  // 2. submeter e conferir tabela + totais (14h azul diurna = R$ 420,00)
  document.getElementById('btnSubmit').click();
  await espera(400);
  ok('Escala aparece na tabela', document.querySelectorAll('#listaEscalas tbody tr').length === 1);
  ok('Total de horas = 14h', document.getElementById('totHoras').textContent === '14h',
     document.getElementById('totHoras').textContent);
  ok('Valor estimado = R$ 420,00',
     document.getElementById('totValor').textContent.replace(/\\u00a0/g, ' ').includes('420,00'),
     document.getElementById('totValor').textContent);

  // 3. persistência em localStorage
  const salvas = JSON.parse(localStorage.getItem('pmgoEscalas') || '[]');
  ok('Escala persistida em localStorage', salvas.length === 1);

  // 4. exportação .ics válida (RFC 5545)
  const ics = window.__ac4ValidarICS();
  ok('Arquivo .ics gerado é válido', ics.ok && ics.eventos === 1, JSON.stringify(ics.falhas || []));

  // 4b. suíte de lançamento no navegador (validações + teto de duração de 192h)
  const lanc = window.__ac4TestesLancamento();
  ok('Suíte de lançamento (inclui teto de duração)', lanc === 'TODOS OS TESTES DE LANCAMENTO OK',
     typeof lanc === 'string' ? lanc : JSON.stringify(lanc).slice(0, 200));

  // 4c. relatório de impressão: popula o #printReport sem abrir o diálogo de print
  let chamadasPrint = 0;
  window.print = () => { chamadasPrint += 1; };
  document.getElementById('btnPrint').click();
  const printSincrono = chamadasPrint;
  await espera(200);
  ok('PDF: diálogo abre só após o próximo paint (INP)', printSincrono === 0 && chamadasPrint === 1,
     printSincrono + ' → ' + chamadasPrint);
  ok('Relatório de impressão populado com a escala e o total',
     document.querySelectorAll('#printReport .pr-table tbody tr').length === 1
       && document.getElementById('prTableWrap').innerHTML.includes('420,00'));

  // 4d. agenda: a ação da linha abre o dialog de provedores (mesmo fluxo em celular e desktop)
  document.querySelector('#listaEscalas [data-acao="agenda"]').click();
  await espera(250);
  const dlgAgenda = document.getElementById('dialogAgenda');
  const provs = dlgAgenda.querySelectorAll('.agenda-prov');
  ok('Agenda: dialog abre com provedores', dlgAgenda.open && provs.length === 4, provs.length + ' opções');
  ok('Agenda: opção Google Agenda presente', !!dlgAgenda.querySelector('.agenda-prov[data-prov="google"]'));
  ok('Agenda: alternativa .ics presente', !!dlgAgenda.querySelector('.agenda-prov--ics[data-prov="ics"]'));
  dlgAgenda.close();
  await espera(100);

  // 4d2. exportar CSV não pode lançar (guarda a regressão do import de csvTextoSeguro)
  localStorage.removeItem('pmgoErros');
  let erroCsv = '';
  try { document.getElementById('btnExportCsv').click(); } catch (e) { erroCsv = String(e); }
  await espera(150);
  const errosCsv = window.__ac4Erros();
  ok('Exportar CSV não lança erro', erroCsv === '' && errosCsv.length === 0,
     erroCsv || (errosCsv[0] && errosCsv[0].msg) || '');
  window.__ac4LimparErros();

  // 4e. observabilidade: handler global captura erro anônimo no log local
  localStorage.removeItem('pmgoErros');
  window.dispatchEvent(new ErrorEvent('error', { message: 'erro-teste-smoke', filename: location.origin + '/x.js', lineno: 1, colno: 1 }));
  await espera(50);
  const erros = window.__ac4Erros();
  ok('Observabilidade: erro anônimo registrado no log local',
     Array.isArray(erros) && erros.length === 1 && erros[0].msg === 'erro-teste-smoke' && !JSON.stringify(erros[0]).includes(location.origin),
     JSON.stringify(erros[0] || {}));
  window.__ac4LimparErros();

  // 4f. hardening v58 + analytics agregado v59
  document.getElementById('btnShare').click();
  await espera(100);
  const dlgShare = document.getElementById('dialogShare');
  ok('Backup e restauração disponíveis', dlgShare.open && !!document.getElementById('shareBackupOpt') && !!document.getElementById('shareRestoreOpt'));
  const analytics = [...document.scripts].find((s) => s.src === 'https://static.cloudflareinsights.com/beacon.min.js');
  ok('Cloudflare Web Analytics configurado',
     !!analytics && analytics.type === 'module' && analytics.dataset.cfBeacon?.includes('3b1137c9d2024604bff681a3d09a202e'));
  dlgShare.close();

  // 4g. aviso de atualização: anúncio acessível e opção de adiar sem recarregar
  window.__ac4SimularAtualizacao();
  const updateBanner = document.getElementById('updateBanner');
  ok('Atualização PWA: aviso acessível fica visível',
     !updateBanner.classList.contains('hidden') && updateBanner.getAttribute('role') === 'status' &&
     updateBanner.getAttribute('aria-live') === 'polite');
  ok('Atualização PWA: oferece ação principal explícita',
     document.getElementById('updateNow').textContent.trim() === 'Atualizar agora');
  document.getElementById('updateNow').click();
  await espera(20);
  ok('Atualização PWA: botão solicita ativação ao Service Worker',
     window.__ac4UltimaMensagemSW?.type === 'SKIP_WAITING' &&
     document.getElementById('updateNow').textContent.includes('Atualizando'));
  document.getElementById('updateLater').click();
  ok('Atualização PWA: usuário pode adiar sem perder o fluxo', updateBanner.classList.contains('hidden'));

  // 4e. histórico mensal (datas na vigência da portaria, ≥ 07/2026): com 2+ meses lançados, mostra 6 colunas e destaca o mês do painel
  const lancar = async (inicio) => {
    ini.value = inicio;
    ini.dispatchEvent(new Event('change', { bubbles: true }));
    dur.value = '12';
    dur.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('btnSubmit').click();
    await espera(400);
  };
  const historico = document.getElementById('planningHistory');
  ok('Histórico: oculto com um único mês', historico.classList.contains('hidden'));
  await lancar('2026-08-10T08:00');
  const colunas = historico.querySelectorAll('.planning-history-col');
  const barraAtual = historico.querySelector('.planning-history-col.is-current .planning-history-bar');
  ok('Histórico: 6 meses com o mês do painel em destaque',
     !historico.classList.contains('hidden') && colunas.length === 6 && colunas[5].classList.contains('is-current')
       && barraAtual.getBoundingClientRect().height > 0,
     colunas.length + ' colunas, ' + JSON.parse(localStorage.getItem('pmgoEscalas') || '[]').length + ' escalas');
  ok('Histórico: leitor de tela recebe mês e valor',
     colunas[4]?.querySelector('.sr-only')?.textContent.toLowerCase().includes('julho'),
     colunas[4]?.querySelector('.sr-only')?.textContent);

  // 4f. lembrete de backup: 3+ escalas sem backup → um aviso com ação, no máximo 1x por semana
  await lancar('2026-09-10T08:00');
  localStorage.removeItem('pmgoUltimoBackup');
  localStorage.removeItem('pmgoLembreteBackup');
  ok('Backup: lembrete dispara com 3+ escalas e nenhum backup', window.__ac4LembrarBackup() === true);
  ok('Backup: lembrete não se repete na mesma semana', window.__ac4LembrarBackup() === false);
  localStorage.setItem('pmgoUltimoBackup', String(Date.now()));
  localStorage.removeItem('pmgoLembreteBackup');
  ok('Backup: backup recente dispensa o lembrete', window.__ac4LembrarBackup() === false);
  localStorage.removeItem('pmgoUltimoBackup');
  localStorage.removeItem('pmgoLembreteBackup');
  // guarda as 3 escalas para a fase com recarga (disparo automático real)
  localStorage.setItem('__smokeTresEscalas', localStorage.getItem('pmgoEscalas'));

  // 5. remoção limpa o estado
  for (let i = 0; i < 5 && document.querySelector('#listaEscalas [data-acao="remover"]'); i++) {
    document.querySelector('#listaEscalas [data-acao="remover"]').click();
    await espera(300);
  }
  ok('Remoção limpa a lista', JSON.parse(localStorage.getItem('pmgoEscalas') || '[]').length === 0);

  // 6. canal de feedback: dialog abre pelo rodapé, tipos alternam e o mailto
  //    aponta para o mantenedor (validado sem navegar para fora da página)
  document.getElementById('footerFeedback').click();
  await espera(100);
  const dlgFb = document.getElementById('dialogFeedback');
  ok('Feedback: dialog abre pelo link do rodapé', !!dlgFb && dlgFb.open);
  const tipoSugestao = document.querySelector('#fbTipos .fb-tipo[data-tipo="Sugestão"]');
  tipoSugestao.click();
  ok('Feedback: seleção de tipo alterna o ativo',
     tipoSugestao.classList.contains('is-active') && tipoSugestao.getAttribute('aria-pressed') === 'true' &&
     document.querySelectorAll('#fbTipos .fb-tipo.is-active').length === 1);
  const urlFb = window.__ac4MailtoFeedback('Sugestão', 'Mensagem de teste');
  ok('Feedback: mailto endereça o mantenedor com assunto e corpo',
     urlFb.startsWith('mailto:welitonsp@gmail.com?subject=') &&
     urlFb.includes(encodeURIComponent('[Calculadora AC4] Sugestão')) &&
     urlFb.includes(encodeURIComponent('Mensagem de teste')),
     urlFb.slice(0, 60));
  document.getElementById('fbFechar').click();
  ok('Feedback: dialog fecha sem enviar', !dlgFb.open);

  // 6b. central de novidades: pode ser reaberta e registra a versão vista
  document.getElementById('footerNovidades').click();
  await espera(100);
  const dlgNovidades = document.getElementById('dialogNovidades');
  ok('Novidades: dialog abre pelo rodapé', !!dlgNovidades && dlgNovidades.open);
  ok('Novidades: apresenta versão e funcionalidades',
     dlgNovidades.querySelector('.whats-new-badge')?.textContent.includes('v' + window.__ac4Version) &&
     dlgNovidades.querySelectorAll('.whats-new-list li').length === 3);
  document.getElementById('novidadesContinuar').click();
  ok('Novidades: fecha e registra somente a versão vista',
     !dlgNovidades.open && localStorage.getItem('pmgoNovidadesVistas') === window.__ac4Version);

  localStorage.removeItem('pmgoEscalas');
  return JSON.stringify(passos);
})()`;

/* ------------------------------------------------ execução */
const servidor = await iniciarServidor();
const porta = servidor.address().port;
const perfil = await mkdtemp(join(tmpdir(), 'ac4-smoke-'));
let chrome;

try {
  chrome = await lancarChrome(acharChrome(), perfil);
  const cdp = await conectarCDP(chrome.wsUrl);

  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  await cdp.enviar('Page.enable', {}, sessionId);
  await cdp.enviar('Runtime.enable', {}, sessionId);
  const carregou = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await carregou;

  const avaliacao = await cdp.enviar('Runtime.evaluate', {
    expression: ROTEIRO,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);

  if (avaliacao.exceptionDetails) {
    throw new Error(`Erro na página: ${JSON.stringify(avaliacao.exceptionDetails, null, 2)}`);
  }

  const passos = JSON.parse(avaliacao.result.value);

  // PDF real via CSS de impressão (@media print) — o #printReport foi populado no passo 4c.
  const pdf = await cdp.enviar('Page.printToPDF', { printBackground: false }, sessionId);
  const kb = Math.round(((pdf.data || '').length * 3 / 4) / 1024);
  passos.push({ nome: 'PDF gerado pelo CSS de impressão (≥10KB)', ok: kb >= 10, detalhe: `${kb}KB` });

  // Atualização real: uma versão anterior deve receber as novidades automaticamente uma única vez.
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoVersion','63'); localStorage.removeItem('pmgoNovidadesVistas');`,
  }, sessionId);
  const atualizou = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await atualizou;
  const avisoAtualizacao = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));await sl(400);const d=document.getElementById('dialogNovidades');const aberto=!!d?.open;document.getElementById('novidadesContinuar')?.click();return aberto})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  passos.push({ nome: 'Atualização exibe novidades automaticamente uma única vez',
    ok: avisoAtualizacao.result.value === true, detalhe: String(avisoAtualizacao.result.value) });

  // Lembrete de backup real: com 3 escalas e sem backup, o aviso aparece sozinho após a abertura.
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoEscalas', localStorage.getItem('__smokeTresEscalas')); localStorage.removeItem('__smokeTresEscalas');
      localStorage.removeItem('pmgoUltimoBackup'); localStorage.removeItem('pmgoLembreteBackup');`,
  }, sessionId);
  const abriuBackup = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await abriuBackup;
  const lembrete = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));let t=null;
      for(let i=0;i<80&&!t;i++){t=[...document.querySelectorAll('#toastRegion .toast')].find((x)=>x.querySelector('.toast-action')?.textContent==='Fazer backup');if(!t)await sl(100);}
      localStorage.removeItem('pmgoEscalas');localStorage.removeItem('pmgoLembreteBackup');
      return t?t.textContent:'';})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  passos.push({ nome: 'Backup: lembrete aparece sozinho com ação "Fazer backup"',
    ok: lembrete.result.value.includes('Salve uma cópia'), detalhe: lembrete.result.value });

  // 6. localStorage corrompido: grava lixo, recarrega e confirma que o app sobe vazio sem quebrar.
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoEscalas','{lixo-nao-json['); localStorage.removeItem('pmgoErros');`,
  }, sessionId);
  const recarregou = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await recarregou;
  const resiliencia = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<50&&!document.getElementById('formEscala');i++)await sl(100);
      const formOk=!!document.getElementById('formEscala');
      const listaVazia=document.querySelectorAll('#listaEscalas tbody tr').length===0;
      const semErro=(window.__ac4Erros?window.__ac4Erros():[]).length===0;
      localStorage.removeItem('pmgoEscalas');
      return JSON.stringify({formOk,listaVazia,semErro});})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  const rr = JSON.parse(resiliencia.result.value);
  passos.push({ nome: 'localStorage corrompido: app carrega vazio sem quebrar',
    ok: rr.formOk && rr.listaVazia && rr.semErro, detalhe: JSON.stringify(rr) });

  console.table(passos.map(({ nome, ok, detalhe }) => ({ passo: nome, ok, detalhe })));

  const falhas = passos.filter((p) => !p.ok);
  if (falhas.length) {
    console.error(`SMOKE TEST FALHOU: ${falhas.length} passo(s) com erro.`);
    process.exitCode = 1;
  } else {
    console.log(`SMOKE TEST OK — ${passos.length} passos aprovados.`);
  }
  cdp.fechar();
} finally {
  chrome?.proc.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
