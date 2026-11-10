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
    const timer = setTimeout(() => reject(new Error(`Chrome não expôs o DevTools em 60s.\n${stderr}`)), 60000);
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
  await window.__ac4TestesProntos; // suítes carregadas sob demanda (js/modules/testes.mjs)
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
  /* v81: 1ª escala do mês abre a agenda de lote; o usuário fecha e segue. */
  for (let i = 0; i < 60 && !document.getElementById('dialogLote')?.open; i++) await espera(50);
  ok('1ª escala do mês abre a agenda de lote', document.getElementById('dialogLote')?.open);
  document.getElementById('loteFechar')?.click();
  await espera(50);
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
    for (let i = 0; i < 60 && !document.getElementById('dialogLote')?.open; i++) await espera(50);
    document.getElementById('loteFechar')?.click(); // v81: agenda abre sozinha na 1ª do mês
    await espera(50);
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
  // 4g. situação do backup no Compartilhar (v70)
  ok('Backup: status informa quando nunca houve backup',
     window.__ac4StatusBackup().startsWith('Você ainda não fez backup'), window.__ac4StatusBackup());
  localStorage.setItem('pmgoUltimoBackup', String(Date.now() - 3 * 24 * 60 * 60 * 1000));
  ok('Backup: status mostra data e há quantos dias',
     window.__ac4StatusBackup().startsWith('Último backup: ') && window.__ac4StatusBackup().includes('(há 3 dias).'),
     window.__ac4StatusBackup());
  document.getElementById('btnShare')?.click();
  await espera(150);
  ok('Backup: status aparece no Compartilhar',
     document.getElementById('shareBackupStatus')?.textContent.startsWith('Último backup:'),
     document.getElementById('shareBackupStatus')?.textContent);
  document.getElementById('dialogShare')?.close();
  localStorage.removeItem('pmgoUltimoBackup');
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

  // Versão sem novidade nova: quem já viu o conteúdo atual (data-conteudo) não recebe o aviso de novo.
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoVersion','1'); localStorage.setItem('pmgoNovidadesVistas', document.getElementById('dialogNovidades').dataset.conteudo);`,
  }, sessionId);
  const semNovidade = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await semNovidade;
  const avisoRepetido = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{await new Promise(r=>setTimeout(r,400));return !!document.getElementById('dialogNovidades')?.open})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  passos.push({ nome: 'Novidades já vistas não reaparecem em versão sem conteúdo novo',
    ok: avisoRepetido.result.value === false, detalhe: String(avisoRepetido.result.value) });

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

  // 7. PDF do relatório com muitas escalas, no papel A4 de verdade. Regressão da v62 à v83: a tabela ganhou a
  //    coluna Situação, o CSS de impressão continuou com larguras de 11 colunas, "Valor Estimado" ficou com
  //    largura zero e cada escala virou uma "torre" de meia página (30 escalas = 9 páginas).
  const p2 = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const muitasEscalas = Array.from({ length: 30 }, (_, k) => {
    const ini = new Date(2026, 6 + Math.floor(k / 6), 1 + (k % 6) * 4, 6 + (k % 4) * 4, 0);
    const fim = new Date(ini.getTime() + (8 + (k % 3) * 4) * 3600000);
    return {
      id: `pdf${k}`, inicio: local(ini), fim: local(fim),
      descricao: k % 5 === 0 ? 'Policiamento ostensivo — Companhia Independente de Pontalina' : 'Escala AC4',
      origem: 'AC4', qtdPm: k % 7 === 0 ? 4 : 1, status: ['planejada', 'realizada', 'conferida', 'recebida'][k % 4],
    };
  });
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoEscalas', ${JSON.stringify(JSON.stringify(muitasEscalas))}); localStorage.removeItem('pmgoUltimoBackup'); localStorage.setItem('pmgoLembreteBackup', String(Date.now()));`,
  }, sessionId);
  const abriuPdf = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await abriuPdf;
  const gerouPdf = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<50&&!document.getElementById('formEscala');i++)await sl(100);
      window.print=()=>{window.__imprimiu=true;};document.getElementById('btnPrint').click();
      for(let i=0;i<60&&!window.__imprimiu;i++)await sl(50);
      return document.querySelectorAll('#printReport .pr-table tbody tr').length;})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  passos.push({ nome: 'PDF: relatório com 30 escalas populado', ok: gerouPdf.result.value === 30, detalhe: String(gerouPdf.result.value) });

  // Versões misturadas logo após um deploy (JS novo + index.html antigo, sem #prFiltros): o PDF tem que sair igual.
  const semLinhaFiltros = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('prFiltros').remove();
      window.__imprimiu=false;document.getElementById('btnPrint').click();
      for(let i=0;i<60&&!window.__imprimiu;i++)await sl(50);
      return window.__imprimiu===true&&document.querySelectorAll('#printReport .pr-table tbody tr').length===30;})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  passos.push({ nome: 'PDF: sem #prFiltros (index.html antigo com JS novo) a impressão ainda abre',
    ok: semLinhaFiltros.result.value === true, detalhe: String(semLinhaFiltros.result.value) });

  // Largura útil do A4 com margem de 10 mm (190 mm ≈ 718 px) e mídia de impressão: mede colunas e linhas.
  await cdp.enviar('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 718, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const layoutPdf = await cdp.enviar('Runtime.evaluate', {
    expression: `(()=>{const ths=[...document.querySelectorAll('#printReport .pr-table thead th')];
      const larg=ths.map((t)=>Math.round(t.getBoundingClientRect().width));
      const alt=[...document.querySelectorAll('#printReport .pr-table tbody tr')].map((t)=>Math.round(t.getBoundingClientRect().height));
      const estouros=[...document.querySelectorAll('#printReport .pr-table th, #printReport .pr-table td')].filter((c)=>c.scrollWidth>c.clientWidth+1).length;
      const tabela=document.querySelector('#printReport .pr-table').getBoundingClientRect().width;
      const pai=document.getElementById('printReport').getBoundingClientRect().width;
      return JSON.stringify({colunas:ths.length,menorColuna:Math.min(...larg),valor:larg[larg.length-1],maiorLinha:Math.max(...alt),estouros,tabela:Math.round(tabela),pai:Math.round(pai)});})()`,
    returnByValue: true,
  }, sessionId);
  const lay = JSON.parse(layoutPdf.result.value);
  passos.push({ nome: 'PDF: nenhuma coluna colapsa e "Valor Estimado" tem largura útil (≥ 60 px)',
    ok: lay.menorColuna >= 18 && lay.valor >= 60, detalhe: JSON.stringify(lay) });
  passos.push({ nome: 'PDF: cada escala ocupa poucas linhas (nada de "torre" de meia página)',
    ok: lay.maiorLinha <= 90, detalhe: `maior linha ${lay.maiorLinha}px` });
  passos.push({ nome: 'PDF: nenhum texto estoura a própria coluna (sem palavra cortada no meio)',
    ok: lay.estouros === 0, detalhe: `${lay.estouros} célula(s) estourando` });
  passos.push({ nome: 'PDF: a tabela cabe na largura do papel',
    ok: lay.tabela <= lay.pai + 1, detalhe: `${lay.tabela}px em ${lay.pai}px` });
  const pdfLongo = await cdp.enviar('Page.printToPDF', { preferCSSPageSize: true, printBackground: false }, sessionId);
  const paginasPdf = (Buffer.from(pdfLongo.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  passos.push({ nome: 'PDF: 30 escalas cabem em até 3 páginas A4 (antes: 9)', ok: paginasPdf >= 1 && paginasPdf <= 3, detalhe: `${paginasPdf} página(s)` });
  await cdp.enviar('Emulation.setEmulatedMedia', { media: '' }, sessionId);
  await cdp.enviar('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  // iPhone/iPad (v86): no app instalado, window.print() não abre nada. O toque em PDF gera o arquivo
  // no aparelho e entrega à tela de compartilhar; sem compartilhamento de arquivo, baixa como o CSV.
  const pdfIphone = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));
      Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
      let enviado=null;let imprimiu=false;window.print=()=>{imprimiu=true;};
      navigator.canShare=(d)=>!!(d&&d.files&&d.files.length);navigator.share=async(d)=>{enviado=d;};
      document.getElementById('btnPrint').click();
      for(let i=0;i<40&&!enviado;i++)await sl(50);await sl(150);
      const f=enviado&&enviado.files&&enviado.files[0];
      const ini=f?new TextDecoder().decode((await f.arrayBuffer()).slice(0,8)):'';
      const compartilhar={nome:f?f.name:'',tipo:f?f.type:'',tamanho:f?f.size:0,ini,imprimiu};
      let baixado='';const clickOriginal=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){baixado=this.download||'';};
      navigator.canShare=undefined;imprimiu=false;
      document.getElementById('btnPrint').click();await sl(200);
      HTMLAnchorElement.prototype.click=clickOriginal;delete navigator.userAgent;
      return JSON.stringify({compartilhar,baixar:{nome:baixado,imprimiu}});})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  const pi = JSON.parse(pdfIphone.result.value);
  passos.push({ nome: 'PDF no iPhone: toque gera arquivo PDF e abre a tela de compartilhar (sem window.print)',
    ok: /^Relatorio-AC4-\d{4}-\d{2}-\d{2}\.pdf$/.test(pi.compartilhar.nome) && pi.compartilhar.tipo === 'application/pdf'
      && pi.compartilhar.ini === '%PDF-1.4' && pi.compartilhar.tamanho > 20000 && pi.compartilhar.imprimiu === false,
    detalhe: JSON.stringify(pi.compartilhar) });
  passos.push({ nome: 'PDF no iPhone: sem compartilhamento de arquivo, baixa o PDF como o CSV',
    ok: /^Relatorio-AC4-.*\.pdf$/.test(pi.baixar.nome) && pi.baixar.imprimiu === false, detalhe: JSON.stringify(pi.baixar) });

  // Falha ao montar o relatório: nunca em silêncio. Mostra aviso e não abre a impressão.
  const falhaPdf = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));document.getElementById('prSummary').remove();
      window.__imprimiu=false;document.getElementById('btnPrint').click();
      let msg='';for(let i=0;i<60&&!msg;i++){await sl(100);msg=[...document.querySelectorAll('#toastRegion .toast')].map((x)=>x.textContent).find((x)=>x.includes('Não foi possível gerar o PDF'))||'';}
      await sl(300);return JSON.stringify({msg,imprimiu:window.__imprimiu===true});})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  const fp = JSON.parse(falhaPdf.result.value);
  passos.push({ nome: 'PDF: falha ao montar o relatório mostra aviso e não abre a impressão',
    ok: fp.msg.includes('Atualize o aplicativo') && fp.imprimiu === false, detalhe: JSON.stringify(fp) });
  await cdp.enviar('Runtime.evaluate', { expression: `localStorage.removeItem('pmgoEscalas');` }, sessionId);

  // 8. Aviso de carregamento (v87): um arquivo do app falha ao baixar (atualização interrompida pela
  //    rede). Em vez de tela parada, aparece o aviso; "Recarregar" traz o app de volta sem perder dados.
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoEscalas', ${JSON.stringify(JSON.stringify(muitasEscalas.slice(0, 2)))});`,
  }, sessionId);
  await cdp.enviar('Fetch.enable', { patterns: [{ urlPattern: '*relatorio.mjs*' }] }, sessionId);
  const pausado = cdp.aguardarEvento('Fetch.requestPaused', 20000);
  const abriuQuebrado = cdp.aguardarEvento('Page.loadEventFired', 20000);
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  const reqPausada = await pausado;
  await cdp.enviar('Fetch.failRequest', { requestId: reqPausada.requestId, errorReason: 'Failed' }, sessionId);
  await abriuQuebrado.catch(() => {});
  await cdp.enviar('Fetch.disable', {}, sessionId);
  const quebrado = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));const a=document.getElementById('avisoCarregamento');
      for(let i=0;i<140&&a.classList.contains('hidden');i++)await sl(100);
      return JSON.stringify({visivel:!a.classList.contains('hidden'),pendente:document.documentElement.classList.contains('app-pending'),texto:a.textContent.replace(/\\s+/g,' ').trim()});})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  const qb = JSON.parse(quebrado.result.value);
  passos.push({ nome: 'Carregamento interrompido: aparece o aviso com "Recarregar" (sem tela parada)',
    ok: qb.visivel && qb.pendente && qb.texto.includes('Seus dados continuam salvos'), detalhe: JSON.stringify(qb) });
  const recarregouAviso = cdp.aguardarEvento('Page.loadEventFired', 20000);
  await cdp.enviar('Runtime.evaluate', { expression: `document.getElementById('avisoCarregamentoRecarregar').click();` }, sessionId);
  await recarregouAviso;
  const voltou = await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));
      for(let i=0;i<80&&document.documentElement.classList.contains('app-pending');i++)await sl(100);
      await sl(300);
      const r={abriu:!document.documentElement.classList.contains('app-pending'),
        avisoOculto:document.getElementById('avisoCarregamento').classList.contains('hidden'),
        escalas:JSON.parse(localStorage.getItem('pmgoEscalas')||'[]').length};
      localStorage.removeItem('pmgoEscalas');return JSON.stringify(r);})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  const vt = JSON.parse(voltou.result.value);
  passos.push({ nome: 'Recarregar: o app abre, o aviso some e as escalas continuam salvas',
    ok: vt.abriu && vt.avisoOculto && vt.escalas === 2, detalhe: JSON.stringify(vt) });
  const avisoNormal = await cdp.enviar('Runtime.evaluate', {
    expression: `new Promise((r)=>setTimeout(()=>r(document.getElementById('avisoCarregamento').classList.contains('hidden')),10500))`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  passos.push({ nome: 'Carregamento normal: o aviso nunca aparece (nem depois do limite de 10 s)',
    ok: avisoNormal.result.value === true, detalhe: String(avisoNormal.result.value) });

  // 9. Meu dinheiro e Já passou? (v89): o painel divide o total em Recebido · A receber · Previsto
  //    e o cartão marca de uma vez as escalas encerradas que ficaram como planejadas (com Desfazer).
  const dinEscalas = [
    { id: 'd1', inicio: '2026-08-03T07:00', fim: '2026-08-03T19:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada' },
    { id: 'd2', inicio: '2026-08-05T07:00', fim: '2026-08-05T19:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada' },
    { id: 'd3', inicio: '2026-08-07T07:00', fim: '2026-08-07T19:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'recebida' },
    { id: 'd4', inicio: '2099-08-07T07:00', fim: '2099-08-07T19:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada' },
  ];
  await cdp.enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('pmgoEscalas', ${JSON.stringify(JSON.stringify(dinEscalas))}); localStorage.removeItem('pmgoJaPassouDispensadas');`,
  }, sessionId);
  const abrirDin = async () => {
    const carregou = cdp.aguardarEvento('Page.loadEventFired', 20000);
    await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
    await carregou;
  };
  const avaliarDin = async (expr) => JSON.parse((await cdp.enviar('Runtime.evaluate', {
    expression: `(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));
      for(let i=0;i<80&&document.documentElement.classList.contains('app-pending');i++)await sl(100);
      await sl(250); ${expr}})()`, awaitPromise: true, returnByValue: true,
  }, sessionId)).result.value);
  await abrirDin();
  const din = await avaliarDin(`const n=(id)=>Number(document.getElementById(id).textContent.replace(/\\D/g,''));
    return JSON.stringify({painel:!document.getElementById('dinheiro').classList.contains('hidden'),
      soma:n('dinValor-recebida')+n('dinValor-a-receber')+n('dinValor-planejada'), total:n('totValor'),
      qtdPrev:document.getElementById('dinQtd-planejada').textContent,
      cartao:!document.getElementById('jaPassou').classList.contains('hidden'),
      texto:document.getElementById('jaPassouTexto').textContent});`);
  passos.push({ nome: 'Meu dinheiro: Recebido + A receber + Previsto = valor total', ok: din.painel && din.soma === din.total && din.total > 0 && din.qtdPrev === '3 escalas', detalhe: JSON.stringify(din) });
  passos.push({ nome: 'Já passou: cartão mostra as 2 escalas encerradas ainda planejadas', ok: din.cartao && din.texto.startsWith('2 escalas'), detalhe: din.texto });
  const filtro = await avaliarDin(`document.querySelector('[data-dinheiro-filtro="planejada"]').click(); await sl(150);
    const r={itens:document.querySelectorAll('#listaEscalas .escala-card').length, pressionado:document.querySelector('[data-dinheiro-filtro="planejada"]').getAttribute('aria-pressed'), select:document.getElementById('filtroStatus').value};
    document.querySelector('[data-dinheiro-filtro="planejada"]').click(); await sl(150);
    r.depois=document.querySelectorAll('#listaEscalas .escala-card').length; return JSON.stringify(r);`);
  passos.push({ nome: 'Meu dinheiro: tocar em Previsto filtra a lista; tocar de novo limpa', ok: filtro.itens === 3 && filtro.pressionado === 'true' && filtro.select === 'planejada' && filtro.depois === 4, detalhe: JSON.stringify(filtro) });
  const marcou = await avaliarDin(`document.getElementById('jaPassouMarcar').click(); await sl(200);
    const st=()=>JSON.parse(localStorage.getItem('pmgoEscalas')).map(e=>e.status).join(',');
    const r={depois:st(), cartao:document.getElementById('jaPassou').classList.contains('hidden')};
    let b=null; for(let i=0;i<60&&!(b=[...document.querySelectorAll('.toast-action')].find(x=>x.textContent==='Desfazer'));i++)await sl(100);
    r.temDesfazer=!!b; b&&b.click(); await sl(200); r.desfeito=st();
    r.cartaoVoltou=!document.getElementById('jaPassou').classList.contains('hidden'); return JSON.stringify(r);`);
  passos.push({ nome: 'Já passou: "Marcar como realizadas" muda só as passadas e "Desfazer" volta', ok: marcou.depois === 'realizada,realizada,recebida,planejada' && marcou.cartao && marcou.temDesfazer && marcou.desfeito === 'planejada,planejada,recebida,planejada' && marcou.cartaoVoltou, detalhe: JSON.stringify(marcou) });
  await avaliarDin(`document.getElementById('jaPassouAgoraNao').click(); return '1';`);
  await abrirDin();
  const dispensou = await avaliarDin(`return JSON.stringify(document.getElementById('jaPassou').classList.contains('hidden'));`);
  await cdp.enviar('Runtime.evaluate', {
    expression: `const l=JSON.parse(localStorage.getItem('pmgoEscalas'));l.push({id:'d5',inicio:'2026-08-09T07:00',fim:'2026-08-09T19:00',descricao:'Escala AC4',origem:'AC4',qtdPm:1,status:'planejada'});localStorage.setItem('pmgoEscalas',JSON.stringify(l));`,
  }, sessionId);
  await abrirDin();
  const voltouNova = await avaliarDin(`const r={visivel:!document.getElementById('jaPassou').classList.contains('hidden'),texto:document.getElementById('jaPassouTexto').textContent};
    localStorage.removeItem('pmgoEscalas'); localStorage.removeItem('pmgoJaPassouDispensadas'); return JSON.stringify(r);`);
  passos.push({ nome: 'Já passou: "Agora não" some após recarregar e só volta com escala passada nova', ok: dispensou === true && voltouNova.visivel && voltouNova.texto.startsWith('1 escala'), detalhe: JSON.stringify({ dispensou, voltouNova }) });

  // 10. Ajustes rápidos (v90) no celular: lista vazia com botão, hora vinda da última escala,
  //     botões de hora e faixa da Portaria recolhida. No computador, a faixa continua aberta.
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await cdp.enviar('Runtime.evaluate', { expression: `localStorage.removeItem('pmgoEscalas');` }, sessionId);
  await abrirDin();
  const v90 = await avaliarDin(`const r={};
    const vazio=document.querySelector('#listaEscalas .empty-state');
    r.texto=vazio?.querySelector('p')?.textContent; r.botao=!!vazio?.querySelector('[data-acao-vazia="nova-escala"]');
    const faixa=document.getElementById('tariffStrip');
    r.itensOcultos=getComputedStyle(document.getElementById('tariffItems')).display==='none';
    document.getElementById('tariffToggle').click(); await sl(50);
    r.itensAbertos=getComputedStyle(document.getElementById('tariffItems')).display!=='none' && document.getElementById('tariffToggle').getAttribute('aria-expanded')==='true';
    localStorage.setItem('pmgoEscalas', JSON.stringify([{id:'h1',inicio:'2026-08-03T22:30',fim:'2026-08-04T06:30',descricao:'Escala AC4',origem:'AC4',qtdPm:1,status:'recebida'}]));
    return JSON.stringify(r);`);
  passos.push({ nome: 'Lista vazia no celular: "Toque em Nova escala…" com o botão', ok: v90.texto === 'Toque em Nova escala para lançar a primeira.' && v90.botao, detalhe: JSON.stringify(v90) });
  passos.push({ nome: 'Faixa da Portaria: recolhida no celular e abre com um toque', ok: v90.itensOcultos && v90.itensAbertos, detalhe: JSON.stringify(v90) });
  await abrirDin();
  const hora = await avaliarDin(`document.getElementById('mobileAdd').click();
    for(let i=0;i<30&&!document.getElementById('escalaInicioHora').value;i++)await sl(100); await sl(200);
    const r={padrao:document.getElementById('escalaInicioHora').value, data:document.getElementById('escalaInicioData').value,
      semChipsHora:!document.getElementById('horaChips'),
      fimVisivel:document.getElementById('escalaFimData').offsetHeight>0 && document.getElementById('escalaFimHora').offsetHeight>0,
      fimLogoAbaixo:document.getElementById('escalaFimData').getBoundingClientRect().top>document.getElementById('escalaInicioData').getBoundingClientRect().top && document.getElementById('escalaFimData').getBoundingClientRect().top<document.querySelector('#durChips').getBoundingClientRect().top};
    document.querySelector('#durChips .dur-chip[data-horas="12"]').click(); await sl(150);
    r.fimData=document.getElementById('escalaFimData').value; r.fimHora=document.getElementById('escalaFimHora').value;
    document.getElementById('escalaFimHora').value='08:00'; document.getElementById('escalaFimHora').dispatchEvent(new Event('change',{bubbles:true})); await sl(150);
    r.fimManual=document.getElementById('escalaFim').value.slice(11,16); r.duracaoDepois=document.getElementById('escalaDuracao').value;
    localStorage.removeItem('pmgoEscalas'); return JSON.stringify(r);`);
  const hoje = await avaliarDin(`const d=new Date();return JSON.stringify(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));`);
  passos.push({ nome: 'Nova escala: hora vem da última escala (22:30), data de hoje; Término visível (v92)', ok: hora.padrao === '22:30' && hora.data === hoje && hora.semChipsHora && hora.fimVisivel && hora.fimLogoAbaixo, detalhe: JSON.stringify(hora) });
  passos.push({ nome: 'Atalho 12h preenche o Término; término digitado vale (v92)', ok: hora.fimHora === '10:30' && hora.fimManual === '08:00', detalhe: JSON.stringify(hora) });
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await abrirDin();
  const desk = await avaliarDin(`return JSON.stringify({itens:getComputedStyle(document.getElementById('tariffItems')).display!=='none', botao:getComputedStyle(document.getElementById('tariffToggle')).display==='none', texto:document.querySelector('#listaEscalas .empty-state p')?.textContent, botaoVazio:!!document.querySelector('[data-acao-vazia]')});`);
  passos.push({ nome: 'Computador: faixa da Portaria aberta e lista vazia sem o botão do celular', ok: desk.itens && desk.botao && desk.texto === 'Use o formulário Lançar escala para começar.' && !desk.botaoVazio, detalhe: JSON.stringify(desk) });

  // 11. Próxima escala e Planejamento (v91), no celular: o cartão mostra a próxima escala e o toque
  //     leva até ela na lista, mesmo filtrada; o Planejamento não repete o número grande do topo.
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await cdp.enviar('Runtime.evaluate', { expression: `(()=>{const p=(n)=>String(n).padStart(2,'0');const f=(d)=>d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
    const am=new Date();am.setDate(am.getDate()+1);am.setHours(7,0,0,0);const fa=new Date(am);fa.setHours(19);
    const lg=new Date();lg.setDate(lg.getDate()+40);lg.setHours(7,0,0,0);const fl=new Date(lg);fl.setHours(19);
    localStorage.setItem('pmgoEscalas',JSON.stringify([{id:'px2',inicio:f(lg),fim:f(fl),descricao:'Escala AC4',origem:'AC4',qtdPm:1,status:'planejada'},{id:'px1',inicio:f(am),fim:f(fa),descricao:'19º CRPM — Sede',origem:'AC4',qtdPm:1,status:'planejada'}]));
    localStorage.setItem('pmgoMetasMensais',JSON.stringify({[f(am).slice(0,7)]:{valorCentavos:100000}}));})()` }, sessionId);
  await abrirDin();
  const px = await avaliarDin(`const c=document.getElementById('proximaEscala');
    const r={visivel:!c.classList.contains('hidden'),rotulo:document.getElementById('proximaRotulo').textContent,
      quando:document.getElementById('proximaQuando').textContent,detalhe:document.getElementById('proximaDetalhe').textContent,
      fonteValorPlan:parseFloat(getComputedStyle(document.getElementById('planningValue')).fontSize),
      metaSemAbrir:getComputedStyle(document.getElementById('planningProgress')).display!=='none' && document.getElementById('planningProgress').offsetHeight>0,
      diaNoiteSemAbrir:document.getElementById('planningHoursBar').offsetHeight>0};
    const fm=document.getElementById('filtroStatus'); fm.value='recebida'; fm.dispatchEvent(new Event('change',{bubbles:true})); await sl(150);
    r.cardsFiltrados=document.querySelectorAll('#listaEscalas .escala-card').length;
    c.click(); await sl(300);
    const alvo=[...document.querySelectorAll('#listaEscalas .escala-card')].find(x=>x.querySelector('[data-id="px1"]'));
    r.achou=!!alvo; r.destaque=!!alvo&&alvo.classList.contains('is-destaque'); r.filtroLimpo=fm.value==='';
    localStorage.removeItem('pmgoEscalas'); localStorage.removeItem('pmgoMetasMensais'); return JSON.stringify(r);`);
  passos.push({ nome: 'Próxima escala: "Amanhã · 07:00 às 19:00" com unidade e valor', ok: px.visivel && px.rotulo === 'Próxima escala' && px.quando === 'Amanhã · 07:00 às 19:00' && px.detalhe.startsWith('19º CRPM — Sede · R$'), detalhe: JSON.stringify(px) });
  passos.push({ nome: 'Próxima escala: o toque limpa o filtro e destaca a escala na lista', ok: px.cardsFiltrados === 0 && px.achou && px.destaque && px.filtroLimpo, detalhe: JSON.stringify(px) });
  passos.push({ nome: 'Planejamento: valor do mês discreto; meta e dia/noite visíveis sem abrir detalhes', ok: px.fonteValorPlan <= 16 && px.metaSemAbrir && px.diaNoiteSemAbrir, detalhe: JSON.stringify(px) });
  await abrirDin();
  const semPx = await avaliarDin(`return JSON.stringify(document.getElementById('proximaEscala').classList.contains('hidden'));`);
  passos.push({ nome: 'Próxima escala: sem escala futura, o cartão não aparece', ok: semPx === true, detalhe: String(semPx) });

  // 12. Explicar o valor (v94): tocar no valor abre a conta por faixa, com o arredondamento à vista.
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await cdp.enviar('Runtime.evaluate', { expression: `localStorage.setItem('pmgoEscalas', JSON.stringify([
    {id:'ev1',inicio:'2026-11-08T08:01',fim:'2026-11-08T23:01',descricao:'Escala AC4',origem:'AC4',qtdPm:1,status:'recebida'},
    {id:'ev2',inicio:'2026-11-05T18:00',fim:'2026-11-06T08:00',descricao:'Escala AC4',origem:'AC4',qtdPm:2,status:'recebida'}]));` }, sessionId);
  await abrirDin();
  const ev = await avaliarDin(`const dlg=document.getElementById('dialogValor'); const txt=()=>document.getElementById('valorLinhas').textContent.replace(/\\s+/g,' ').trim();
    const r={};
    document.querySelector('.ec-valor-btn[data-id="ev1"]').click(); await sl(150);
    r.aberto=dlg.open; r.linhas1=txt(); r.total1=document.getElementById('valorTotal').textContent.replace(/\\s/g,' ');
    r.nota=document.getElementById('valorNota').textContent;
    document.getElementById('valorFechar').click(); await sl(100); r.fechou=!dlg.open;
    document.querySelector('.ec-valor-btn[data-id="ev2"]').click(); await sl(150);
    r.linhas2=txt(); r.total2=document.getElementById('valorTotal').textContent.replace(/\\s/g,' ');
    r.cabe=dlg.getBoundingClientRect().width<=390 && dlg.scrollWidth<=dlg.clientWidth+1;
    document.getElementById('valorFechar').click(); return JSON.stringify(r);`);
  passos.push({ nome: 'Explicar o valor: domingo 08:01→23:01 mostra "13h59 conta como 14h" e R$ 605,00', ok: ev.aberto && ev.linhas1.includes('Diurna · escala vermelha') && ev.linhas1.includes('13h59 conta como 14h') && ev.linhas1.includes('1h01 conta como 1h') && ev.total1 === 'R$ 605,00' && ev.fechou, detalhe: JSON.stringify(ev) });
  passos.push({ nome: 'Explicar o valor: 2 PMs mostra "Por PM × 2 PMs" e o total; cabe em 390 px', ok: ev.linhas2.includes('Por PM') && ev.linhas2.includes('× 2 PMs') && !ev.linhas2.includes('conta como') && ev.total2 === 'R$ 942,00' && ev.cabe && ev.nota.includes('Portaria'), detalhe: JSON.stringify(ev) });
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await abrirDin();
  const evDesk = await avaliarDin(`document.querySelector('.valor-btn[data-id="ev1"]').click(); await sl(150);
    const r={aberto:document.getElementById('dialogValor').open,total:document.getElementById('valorTotal').textContent.replace(/\\s/g,' ')};
    document.getElementById('valorFechar').click(); localStorage.removeItem('pmgoEscalas'); return JSON.stringify(r);`);
  passos.push({ nome: 'Explicar o valor: no computador, clicar no valor da tabela abre a conta', ok: evDesk.aberto && evDesk.total === 'R$ 605,00', detalhe: JSON.stringify(evDesk) });

  // 13. Repetir a semana (v95): semana atual vazia + passada com escalas → cartão, conferência,
  //     lançar com Desfazer e "Agora não" valendo para a semana de destino.
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  const semearSemanaPassada = `(()=>{const p=(n)=>String(n).padStart(2,'0');const f=(d)=>d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
    const hoje=new Date(); const seg=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()-((hoje.getDay()+6)%7));
    const em=(dias,h)=>{const d=new Date(seg);d.setDate(d.getDate()+dias);d.setHours(h,0,0,0);return d;};
    /* semana passada: domingo 08h→18h e domingo 20h→22h (destino: domingo desta semana, ainda por vir ou hoje) */
    const lista=[{id:'rs1',inicio:f(em(-1,8)),fim:f(em(-1,18)),descricao:'Sede',origem:'AC4',qtdPm:1,status:'recebida'},
                 {id:'rs2',inicio:f(em(-1,20)),fim:f(em(-1,22)),descricao:'Escala AC4',origem:'AC4',qtdPm:2,status:'recebida'}];
    localStorage.setItem('pmgoEscalas',JSON.stringify(lista)); localStorage.removeItem('pmgoRepetirSemanaDispensada'); localStorage.setItem('pmgoJaPassouDispensadas','[]');})()`;
  await cdp.enviar('Runtime.evaluate', { expression: semearSemanaPassada }, sessionId);
  await abrirDin();
  const rs = await avaliarDin(`const r={}; const cartao=document.getElementById('repetirSemana');
    r.visivel=!cartao.classList.contains('hidden'); r.texto=document.getElementById('repetirSemanaTexto').textContent;
    document.getElementById('repetirSemanaAbrir').click(); await sl(200);
    const dlg=document.getElementById('dialogRepetir'); r.aberto=dlg.open;
    const caixas=[...document.querySelectorAll('.repetir-check')]; r.itens=caixas.length;
    r.total0=document.getElementById('repetirTotal').textContent.replace(/\\s/g,' ');
    caixas.forEach(c=>{ if(!c.checked&&!c.disabled){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));} }); await sl(100);
    r.botao=document.getElementById('repetirConfirmar').textContent; r.cabe=dlg.scrollWidth<=dlg.clientWidth+1;
    const c2=document.querySelectorAll('.repetir-check')[1]; c2.checked=false; c2.dispatchEvent(new Event('change',{bubbles:true})); await sl(100);
    r.botao1=document.getElementById('repetirConfirmar').textContent;
    document.getElementById('repetirConfirmar').click(); await sl(300);
    const lista=()=>JSON.parse(localStorage.getItem('pmgoEscalas'));
    r.depois=lista().length; r.nova=lista()[2]; r.fechou=!dlg.open; r.textoDepois=document.getElementById('repetirSemanaTexto').textContent;
    let b=null; for(let i=0;i<60&&!(b=[...document.querySelectorAll('.toast-action')].find(x=>x.textContent==='Desfazer'));i++)await sl(100);
    r.temDesfazer=!!b; b&&b.click(); await sl(250); r.desfeito=lista().length; r.cartaoVolta=!cartao.classList.contains('hidden') && document.getElementById('repetirSemanaTexto').textContent===r.texto;
    document.getElementById('repetirSemanaAgoraNao').click(); await sl(100); r.dispensou=cartao.classList.contains('hidden');
    return JSON.stringify(r);`);
  passos.push({ nome: 'Repetir a semana: cartão oferece as 2 escalas da semana passada', ok: rs.visivel && rs.texto === 'Repetir nesta semana as 2 escalas da semana passada?' && rs.aberto && rs.itens === 2 && rs.cabe, detalhe: JSON.stringify(rs) });
  passos.push({ nome: 'Repetir a semana: desmarcar muda o botão; lançar cria a escala 7 dias depois; o cartão passa a oferecer a próxima semana', ok: rs.botao === 'Lançar 2 escalas' && rs.botao1 === 'Lançar 1 escala' && rs.depois === 3 && rs.nova.status === 'planejada' && rs.nova.descricao === 'Sede' && rs.nova.id !== 'rs1' && rs.fechou && rs.textoDepois === 'Repetir na próxima semana a escala desta semana?', detalhe: JSON.stringify(rs) });
  passos.push({ nome: 'Repetir a semana: Desfazer remove as lançadas; "Agora não" esconde o cartão', ok: rs.temDesfazer && rs.desfeito === 2 && rs.cartaoVolta && rs.dispensou, detalhe: JSON.stringify(rs) });
  await abrirDin();
  const rsDepois = await avaliarDin(`const r=document.getElementById('repetirSemana').classList.contains('hidden'); localStorage.removeItem('pmgoEscalas'); localStorage.removeItem('pmgoRepetirSemanaDispensada'); return JSON.stringify(r);`);
  passos.push({ nome: 'Repetir a semana: "Agora não" continua valendo depois de recarregar', ok: rsDepois === true, detalhe: String(rsDepois) });
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await abrirDin();
  const ordem = await avaliarDin(`const t=(s)=>document.querySelector(s).getBoundingClientRect().top+scrollY;
    return JSON.stringify({metricas:t('.metrics'),form:t('#launchPanel'),plan:t('.planning-panel'),lista:t('.feed'),aviso:t('.legal-alert')});`);
  passos.push({ nome: 'Computador, sem cartões: formulário e planejamento acima da lista (ordem fixa)', ok: ordem.metricas < ordem.form && Math.abs(ordem.form - ordem.plan) < 2 && ordem.form < ordem.lista && ordem.lista < ordem.aviso, detalhe: JSON.stringify(ordem) });

  // 14. Lançar por texto ou voz (v96): a frase preenche Início e Término para conferir; frase que o
  //     app não entende avisa e não mexe nos campos; Enter não adiciona a escala sozinho.
  const tx = await avaliarDin(`const r={}; const $=(id)=>document.getElementById(id);
    const lista=()=>JSON.parse(localStorage.getItem('pmgoEscalas')||'[]');
    const p=(n)=>String(n).padStart(2,'0'); const hoje=new Date();
    const sex=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()+((5-hoje.getDay()+7)%7));
    const sab=new Date(sex.getFullYear(),sex.getMonth(),sex.getDate()+1);
    const dia=(d)=>d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
    r.esperadoIni=dia(sex)+'T18:01'; r.esperadoFim=dia(sab)+'T08:00';
    $('escalaTexto').value='sexta 18:01 às 8'; $('btnTextoEscala').click(); await sl(150);
    r.ini=$('escalaInicio').value; r.fim=$('escalaFim').value; r.msg=$('escalaTextoMsg').textContent;
    r.erroOk=!$('escalaTextoMsg').classList.contains('is-erro'); r.semAdicionar=lista().length;
    r.valor=!$('launchResumo').classList.contains('is-empty');
    $('escalaTexto').value='sexta 18'; 
    $('escalaTexto').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); await sl(150);
    r.msgErro=$('escalaTextoMsg').textContent; r.ehErro=$('escalaTextoMsg').classList.contains('is-erro');
    r.iniMantido=$('escalaInicio').value; r.fimMantido=$('escalaFim').value; r.semAdicionar2=lista().length;
    $('escalaTexto').value='sexta 18:01 às 8'; $('btnTextoEscala').click(); await sl(100);
    $('formEscala').requestSubmit(); await sl(500);
    r.adicionou=lista().length; r.nova=lista()[0]; r.textoLimpo=$('escalaTexto').value===''&&$('escalaTextoMsg').textContent==='';
    if($('dialogLote').open) $('loteFechar').click();
    localStorage.removeItem('pmgoEscalas');
    return JSON.stringify(r);`);
  passos.push({ nome: 'Lançar por texto: "sexta 18:01 às 8" preenche Início e Término (dia seguinte) e não adiciona sozinho', ok: tx.ini === tx.esperadoIni && tx.fim === tx.esperadoFim && tx.msg.startsWith('Preenchi: ') && tx.erroOk && tx.semAdicionar === 0 && tx.valor, detalhe: JSON.stringify(tx) });
  passos.push({ nome: 'Lançar por texto: frase incompleta avisa e mantém os campos; Enter não envia o formulário', ok: tx.ehErro && tx.msgErro.startsWith('Não entendi as horas') && tx.iniMantido === tx.esperadoIni && tx.fimMantido === tx.esperadoFim && tx.semAdicionar2 === 0, detalhe: JSON.stringify(tx) });
  passos.push({ nome: 'Lançar por texto: depois de conferir, Adicionar grava a escala e limpa o campo', ok: tx.adicionou === 1 && tx.nova.inicio === tx.esperadoIni && tx.nova.fim === tx.esperadoFim && tx.textoLimpo, detalhe: JSON.stringify(tx) });

  // 15. Limite de horas no mês (v97): o Planejamento mostra "180h de 192h"; chegar a 192 h não
  //     avisa; passar de 192 h pergunta antes de gravar e, confirmado, destaca a linha.
  await cdp.enviar('Runtime.evaluate', { expression: `(()=>{const p=(n)=>String(n).padStart(2,'0');
    const l=Array.from({length:15},(_,i)=>({id:'lh'+i,inicio:'2026-12-'+p(i+1)+'T07:00',fim:'2026-12-'+p(i+1)+'T19:00',descricao:'Sede',origem:'AC4',qtdPm:1,status:'planejada'}));
    localStorage.setItem('pmgoEscalas',JSON.stringify(l)); localStorage.setItem('pmgoJaPassouDispensadas',JSON.stringify(l.map(e=>e.id))); localStorage.setItem('pmgoRepetirSemanaDispensada','9999-12-31');})()` }, sessionId);
  await abrirDin();
  const lh = await avaliarDin(`const r={}; const $=(id)=>document.getElementById(id);
    const lista=()=>JSON.parse(localStorage.getItem('pmgoEscalas')||'[]');
    const filtro=$('filtroMes'); filtro.value='2026-12'; filtro.dispatchEvent(new Event('change',{bubbles:true})); await sl(200);
    const linha=()=>({valor:$('planningLimiteValor').textContent,nota:$('planningLimiteNota').textContent,acima:$('planningLimite').classList.contains('is-acima')});
    r.inicio=linha();
    const lancar=async(ini,fim)=>{ $('escalaInicio').value=ini; $('escalaFim').value=fim; $('formEscala').requestSubmit(); await sl(450); };
    await lancar('2026-12-20T07:00','2026-12-20T19:00');
    r.semAviso=!$('dialogConfirm').open; r.apos192=lista().length; r.linha192=linha();
    await lancar('2026-12-21T07:00','2026-12-21T08:00');
    r.avisou=$('dialogConfirm').open; r.msg=$('dialogMsg').textContent;
    $('dialogCancel').click(); await sl(300); r.cancelado=lista().length;
    await lancar('2026-12-21T07:00','2026-12-21T08:00');
    r.avisou2=$('dialogConfirm').open; $('dialogOk').click(); await sl(450);
    r.confirmado=lista().length; r.linha193=linha();
    localStorage.removeItem('pmgoEscalas'); localStorage.removeItem('pmgoJaPassouDispensadas'); localStorage.removeItem('pmgoRepetirSemanaDispensada');
    return JSON.stringify(r);`);
  passos.push({ nome: 'Limite de horas: Planejamento mostra "180h de 192h" e chegar a 192 h não avisa', ok: lh.inicio.valor === '180h de 192h' && lh.inicio.nota === 'Restam 12h' && !lh.inicio.acima && lh.semAviso && lh.apos192 === 16 && lh.linha192.valor === '192h de 192h' && lh.linha192.nota === 'No limite' && !lh.linha192.acima, detalhe: JSON.stringify(lh) });
  passos.push({ nome: 'Limite de horas: passar de 192 h pergunta antes; Cancelar não grava', ok: lh.avisou && lh.msg === 'Com esta escala, Dezembro de 2026 fica com 193h. O limite é de 192h por mês. Deseja continuar?' && lh.cancelado === 16, detalhe: JSON.stringify(lh) });
  passos.push({ nome: 'Limite de horas: Continuar grava e a linha fica em destaque ("1h acima do limite")', ok: lh.avisou2 && lh.confirmado === 17 && lh.linha193.valor === '193h de 192h' && lh.linha193.nota === '1h acima do limite' && lh.linha193.acima, detalhe: JSON.stringify(lh) });

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
