/* Validação mobile — abre a aplicação em Chrome headless com viewport de
   celular (393×852 e 320×568) e mede na prática: touch targets ≥ 44px,
   barra fixa, topbar compacta, footer sem sobreposição e ausência de
   overflow horizontal. Zero dependências npm (mesma base do smoke.mjs). */
import { createServer } from 'node:http';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

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

/* Medições feitas dentro da página em viewport mobile (393×852). */
const ROTEIRO_MOBILE = `(async () => {
  const passos = [];
  const ok = (nome, cond, detalhe = '') => passos.push({ nome, ok: !!cond, detalhe: String(detalhe) });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect();
  const visivel = (sel) => { const r = rect(sel); return !!r && r.width > 0 && r.height > 0; };

  for (let i = 0; i < 50 && !document.getElementById('formEscala'); i++) await espera(100);
  localStorage.removeItem('pmgoEscalas');

  // lança uma escala para materializar a tabela/ações
  const ini = document.getElementById('escalaInicio');
  ini.value = '2026-07-06T07:00';
  ini.dispatchEvent(new Event('change', { bubbles: true }));
  const dur = document.getElementById('escalaDuracao');
  dur.value = '14';
  dur.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('btnSubmit').click();
  await espera(400);

  // 1. barra fixa mobile visível e com ações ≥ 44px
  ok('Barra fixa mobile visível', visivel('.mobile-bar'));
  const share = rect('#mobileShare');
  ok('Botão compartilhar da barra ≥ 44px', share && share.width >= 44 && share.height >= 44, share && Math.round(share.width) + '×' + Math.round(share.height));
  const add = rect('#mobileAdd');
  ok('Botão "Nova escala" ≥ 44px de altura', add && add.height >= 44, add && Math.round(add.height) + 'px');

  // 2. botão de agenda removido da topbar (agendamento vive nos lançamentos e no compartilhar)
  ok('Topbar sem botão "Adicionar à agenda"', !document.querySelector('.agenda-action') && !document.getElementById('btnExportIcs'));
  ok('Dialog de escolha de agenda presente no DOM', !!document.getElementById('dialogAgenda'));

  // 3. touch targets da topbar ≥ 44px
  const csv = rect('#btnExportCsv');
  ok('Botões da topbar ≥ 44px', csv && csv.height >= 44, csv && Math.round(csv.width) + '×' + Math.round(csv.height));
  const tema = rect('#btnTheme');
  ok('Botão de tema ≥ 44px', tema && tema.width >= 44 && tema.height >= 44, tema && Math.round(tema.width) + '×' + Math.round(tema.height));

  // 3b. novidades em bottom sheet, sem prejudicar a navegação mobile
  document.getElementById('footerNovidades').click();
  await espera(350);
  const novidades = rect('#dialogNovidades');
  const acaoNovidades = rect('#novidadesContinuar');
  ok('Novidades usa bottom sheet ajustado ao celular',
     novidades && Math.abs(novidades.width - window.innerWidth) <= 1 && Math.abs(novidades.bottom - window.innerHeight) <= 1,
     novidades && Math.round(novidades.width) + '×' + Math.round(novidades.height) + ' · base ' + Math.round(novidades.bottom) + '/' + window.innerHeight);
  ok('Ação principal das novidades possui alvo ≥ 44px', acaoNovidades && acaoNovidades.height >= 44);
  document.getElementById('novidadesContinuar').click();

  // 3c. atualização PWA pronta para telas pequenas
  window.__ac4SimularAtualizacao();
  const updateBanner = rect('#updateBanner');
  const updateNow = rect('#updateNow');
  const updateLater = rect('#updateLater');
  ok('Aviso de atualização cabe no celular sem overflow',
     updateBanner && updateBanner.width <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1,
     updateBanner && Math.round(updateBanner.width) + 'px');
  ok('Ações da atualização possuem alvos ≥ 44px',
     updateNow && updateLater && updateNow.height >= 44 && updateLater.width >= 44 && updateLater.height >= 44);
  document.getElementById('updateLater').click();

  // 4. card da escala: leitura confortável e ações tocáveis
  const cardEscala = rect('#listaEscalas .escala-card');
  ok('Card da escala visível e confortável', cardEscala && cardEscala.height >= 124, cardEscala && Math.round(cardEscala.height) + 'px');

  // 5. filtros responsivos disponíveis
  ok('Filtros de busca, mês, origem e situação disponíveis',
     !!document.getElementById('filtroBusca') && !!document.getElementById('filtroMes') &&
     !!document.getElementById('filtroOrigem') && !!document.getElementById('filtroStatus'));

  // 5b. planejamento mensal e ciclo de situação (v62)
  const filtroMes = document.getElementById('filtroMes');
  filtroMes.value = '2026-07';
  filtroMes.dispatchEvent(new Event('change', { bubbles: true }));
  ok('Painel mensal resume valor, horas e quantidade',
     document.getElementById('planningValue').textContent.includes('420,00') &&
     document.getElementById('planningHours').textContent.includes('14h') &&
     document.getElementById('planningHours').textContent.includes('1 escala'));
  ok('Detalhes do planejamento começam recolhidos no celular',
     !document.querySelector('.planning-panel').classList.contains('is-expanded') &&
     document.getElementById('planningToggle').getBoundingClientRect().height >= 44);
  document.getElementById('planningToggle').click();
  const statusCards = [...document.querySelectorAll('.planning-status')];
  ok('Resumo de situações usa quatro alvos de toque grandes',
     statusCards.length === 4 && statusCards.every((b) => b.getBoundingClientRect().height >= 44));
  const statusSelect = document.querySelector('.escala-card .status-select');
  statusSelect.value = 'realizada';
  statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await espera(50);
  ok('Alterar situação persiste no aparelho',
     JSON.parse(localStorage.getItem('pmgoEscalas') || '[]')[0].status === 'realizada');
  ok('Painel atualiza contagem por situação',
     document.querySelector('[data-status-filter="realizada"] strong')?.textContent === '1');

  document.getElementById('btnPlanningGoal').click();
  document.getElementById('planningGoalValue').value = '1000';
  document.getElementById('planningGoalHours').value = '40';
  document.getElementById('planningGoalForm').requestSubmit();
  await espera(50);
  const metas = JSON.parse(localStorage.getItem('pmgoMetasMensais') || '{}');
  ok('Meta mensal fica somente no aparelho', metas['2026-07']?.valorCentavos === 100000 && metas['2026-07']?.horas === 40);
  ok('Progresso da meta fica visível', !document.getElementById('planningProgress').classList.contains('hidden'));

  // 6. tabela em modo cartão (thead oculto)
  const thead = document.querySelector('.escala-table thead');
  ok('Tabela em modo cartão no mobile', thead && getComputedStyle(thead).display === 'none');

  // 7. sem overflow horizontal
  ok('Sem rolagem horizontal', document.documentElement.scrollWidth <= window.innerWidth + 1,
     document.documentElement.scrollWidth + ' vs ' + window.innerWidth);

  // 8. footer com folga para a barra fixa
  const footPad = parseFloat(getComputedStyle(document.querySelector('.site-footer')).paddingBottom);
  const barra = rect('.mobile-bar');
  ok('Footer com folga para a barra fixa', barra && footPad >= barra.height, Math.round(footPad) + 'px de padding vs barra ' + (barra && Math.round(barra.height)) + 'px');

  // 8b. métricas premium: só o card de Valor + resumo em texto
  const cardsVis = [...document.querySelectorAll('.metric-card')].filter((c) => getComputedStyle(c).display !== 'none').length;
  ok('Só o card de Valor visível no mobile', cardsVis === 1, cardsVis + ' card(s)');
  const mResumo = document.getElementById('metricResumoMobile');
  ok('Resumo das métricas visível (Xh · N escalas)', !!mResumo && getComputedStyle(mResumo).display !== 'none' && /escala/.test(mResumo.textContent), mResumo && mResumo.textContent);

  // 8c. lista premium: card legível no lugar da tabela
  ok('Tabela oculta no mobile', getComputedStyle(document.querySelector('.table-wrap')).display === 'none');
  ok('Cards de escala visíveis no mobile', getComputedStyle(document.querySelector('.escala-cards')).display !== 'none');
  const weekday = document.querySelector('.escala-card .ec-time');
  const money = document.querySelector('.escala-card .ec-money');
  ok('Card mostra dia, horário, duração e valor em texto grande',
     !!weekday && /07:00/.test(weekday.textContent) &&
     !!money && money.textContent.includes('R$ 420,00') &&
     parseFloat(getComputedStyle(weekday).fontSize) >= 14,
     (weekday && weekday.textContent) + ' / ' + (money && money.textContent));
  const acoesCard = [...document.querySelectorAll('.escala-card .ec-action-btn')];
  ok('Card mantém Editar visível e agrupa ações secundárias',
     acoesCard.map((b) => b.textContent.trim()).join(' | ') === 'Editar | Mais',
     acoesCard.map((b) => b.textContent.trim()).join(' | '));
  const acoesGrandes = acoesCard.every((b) => {
    const r = b.getBoundingClientRect();
    return r.height >= 44 && r.width >= 80;
  });
  ok('Ações do card têm alvo de toque grande', acoesGrandes,
     acoesCard.map((b) => {
       const r = b.getBoundingClientRect();
       return Math.round(r.width) + '×' + Math.round(r.height);
     }).join(' | '));
  document.querySelector('.escala-card .ec-more > summary').click();
  const menuAcoes = [...document.querySelectorAll('.escala-card .ec-more-menu button')];
  ok('Menu contém agenda, duplicação e exclusão',
     menuAcoes.length === 3 && menuAcoes.every((b) => b.getBoundingClientRect().height >= 44),
     menuAcoes.map((b) => b.textContent.trim()).join(' | '));
  document.querySelector('.escala-card .ec-more').removeAttribute('open');

  // 8d. busca, repetição e modelos locais da v61
  const busca = document.getElementById('filtroBusca');
  busca.value = 'unidade inexistente';
  busca.dispatchEvent(new Event('input', { bubbles: true }));
  ok('Busca filtra a lista em tempo real', document.querySelectorAll('.escala-card').length === 0);
  busca.value = '';
  busca.dispatchEvent(new Event('input', { bubbles: true }));
  ok('Limpar busca restaura a lista', document.querySelectorAll('.escala-card').length === 1);

  document.getElementById('btnSaveTemplate').click();
  document.getElementById('templateName').value = 'Plantão 14h';
  document.getElementById('templateForm').requestSubmit();
  await espera(40);
  const modelos = JSON.parse(localStorage.getItem('pmgoModelos') || '[]');
  ok('Modelo favorito é salvo somente no aparelho', modelos.length === 1 && modelos[0].nome === 'Plantão 14h');
  ok('Modelo salvo aparece no seletor', document.getElementById('templateSelect').options.length === 2);

  document.getElementById('btnRepeatLast').click();
  await espera(350);
  ok('Repetir última preenche o dia seguinte sem salvar automaticamente',
     document.getElementById('escalaInicio').value === '2026-07-07T07:00' &&
     JSON.parse(localStorage.getItem('pmgoEscalas') || '[]').length === 1,
     document.getElementById('escalaInicio').value);
  document.getElementById('mobileLaunchClose').click();
  await espera(300);

  // 9. bottom sheet de lançamento: abre por "Nova escala", fecha pelo X
  const painel = document.querySelector('.launch-panel');
  const btnAdd = document.getElementById('mobileAdd');
  ok('Sheet fechado por padrão', !!painel && !painel.classList.contains('is-open') && getComputedStyle(painel).visibility === 'hidden');
  btnAdd.click();
  await espera(350);
  ok('Nova escala abre o bottom sheet', painel.classList.contains('is-open') && getComputedStyle(painel).visibility === 'visible');
  ok('Backdrop visível ao abrir', document.getElementById('mobileLaunchBackdrop').classList.contains('is-open'));
  ok('Fundo travado (body lock)', document.body.classList.contains('mobile-sheet-open'));
  ok('aria-expanded=true ao abrir', btnAdd.getAttribute('aria-expanded') === 'true');
  ok('Sheet expõe semântica modal', painel.getAttribute('role') === 'dialog' && painel.getAttribute('aria-modal') === 'true');
  ok('Foco entra no sheet', painel.contains(document.activeElement) || document.activeElement === painel, document.activeElement?.id || document.activeElement?.tagName);
  ok('Conteúdo de fundo fica inerte', document.querySelector('.metrics')?.inert === true);
  const painelRect = painel.getBoundingClientRect();
  ok('Painel ancorado ao rodapé da tela', Math.abs(painelRect.bottom - window.innerHeight) <= 12, Math.round(painelRect.bottom) + ' vs ' + window.innerHeight);

  // 9b. data e hora mobile: controles separados, grandes e contidos no viewport
  const dtInicio = document.getElementById('escalaInicioData');
  const hrInicio = document.getElementById('escalaInicioHora');
  const dtFim = document.getElementById('escalaFimData');
  const hrFim = document.getElementById('escalaFimHora');
  const inputNativoInicio = document.getElementById('escalaInicio');
  ok('Mobile usa data/hora separadas para início',
     !!dtInicio && !!hrInicio && getComputedStyle(dtInicio).display !== 'none' && getComputedStyle(hrInicio).display !== 'none');
  ok('Datetime-local nativo fica oculto no sheet mobile',
     inputNativoInicio && inputNativoInicio.getBoundingClientRect().width <= 1,
     inputNativoInicio && Math.round(inputNativoInicio.getBoundingClientRect().width) + 'px');
  const inicioContido = [dtInicio, hrInicio].every((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 1 && r.height >= 54;
  });
  ok('Fluxo básico começa com término personalizado recolhido',
     inicioContido && document.getElementById('fieldFim').classList.contains('hidden'));
  document.getElementById('toggleAdvanced').click();
  await espera(30);
  const contidos = [dtInicio, hrInicio, dtFim, hrFim].every((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 1 && r.height >= 54;
  });
  ok('Mais detalhes revela campos sem ultrapassar a tela', contidos,
     [dtInicio, hrInicio, dtFim, hrFim].map((el) => {
       const r = el.getBoundingClientRect();
       return Math.round(r.left) + '-' + Math.round(r.right) + ' / ' + Math.round(r.height);
     }).join(' | '));

  // 10. duração 14h calcula término e o espelho legível aparece (não depende do repaint do datetime-local)
  const iniS = document.getElementById('escalaInicio');
  iniS.value = '2026-07-10T18:00';
  iniS.dispatchEvent(new Event('change', { bubbles: true }));
  const durS = document.getElementById('escalaDuracao');
  durS.value = '14';
  durS.dispatchEvent(new Event('change', { bubbles: true }));
  await espera(30);
  ok('Duração 14h preenche o término (valor)', document.getElementById('escalaFim').value === '2026-07-11T08:00', document.getElementById('escalaFim').value);
  const resumo = document.getElementById('fimResumo');
  ok('Espelho legível do término visível', !!resumo && resumo.textContent.includes('11/07') && getComputedStyle(resumo).display !== 'none', resumo && resumo.textContent);
  const lResumo = document.getElementById('launchResumo');
  ok('Resultado premium do lançamento mostra valor, duração e horas',
     !!lResumo && !lResumo.classList.contains('is-empty') &&
     document.getElementById('launchResultValue').textContent.includes('595,00') &&
     document.getElementById('launchResultDuration').textContent === '14 horas' &&
     document.getElementById('launchResultHours').textContent === '7h diurnas · 7h noturnas',
     lResumo && lResumo.textContent);
  ok('Campos separados refletem início e término calculado',
     dtInicio.value === '2026-07-10' && hrInicio.value === '18:00' && dtFim.value === '2026-07-11' && hrFim.value === '08:00',
     [dtInicio.value, hrInicio.value, dtFim.value, hrFim.value].join(' / '));

  hrInicio.value = '19:30';
  hrInicio.dispatchEvent(new Event('change', { bubbles: true }));
  await espera(30);
  ok('Alterar horário inicial no campo grande recalcula término',
     document.getElementById('escalaInicio').value === '2026-07-10T19:30' &&
     document.getElementById('escalaFim').value === '2026-07-11T09:30',
     document.getElementById('escalaInicio').value + ' → ' + document.getElementById('escalaFim').value);
  hrInicio.value = '18:00';
  hrInicio.dispatchEvent(new Event('change', { bubbles: true }));
  await espera(30);

  // 11. chips de duração rápida (mobile): clicar 24h ativa o chip e recalcula término
  const chip24 = [...document.querySelectorAll('#durChips .dur-chip')].find((c) => c.dataset.horas === '24');
  ok('Chips de duração visíveis no mobile', getComputedStyle(document.getElementById('durChips')).display !== 'none');
  ok('Select de duração oculto no mobile', getComputedStyle(document.querySelector('#fieldDuracao > .control')).display === 'none');
  chip24.click();
  await espera(80);
  ok('Chip 24h fica ativo ao tocar', chip24.classList.contains('is-active') && document.getElementById('escalaDuracao').value === '24');
  ok('Chip 24h recalcula término', document.getElementById('escalaFim').value === '2026-07-11T18:00', document.getElementById('escalaFim').value);
  const submitResult = document.getElementById('btnSubmitResult');
  ok('CTA mantém área estável para o resultado',
     !!submitResult && !submitResult.classList.contains('hidden') && submitResult.getAttribute('aria-hidden') === 'false');
  const toastRegion = document.getElementById('toastRegion');
  const toastStyle = getComputedStyle(toastRegion);
  ok('Região de avisos isolada contra CLS',
     toastRegion.getBoundingClientRect().height > 0 && toastStyle.contain.includes('layout'));

  // 12. stepper de Qtd. PM
  const qtd = document.getElementById('escalaQtdPm');
  qtd.value = '1';
  document.getElementById('qtdPlus').click();
  document.getElementById('qtdPlus').click();
  ok('Stepper + aumenta Qtd. PM', qtd.value === '3', qtd.value);
  document.getElementById('qtdMinus').click();
  ok('Stepper - diminui Qtd. PM', qtd.value === '2', qtd.value);
  qtd.value = '1'; document.getElementById('qtdMinus').click();
  ok('Stepper não passa de 1 (mínimo)', qtd.value === '1', qtd.value);

  // 13. título do sheet e ícones dos campos
  ok('Título do sheet "Nova escala AC4"', document.getElementById('mobileLaunchTitle').textContent.trim() === 'Nova escala AC4');
  ok('Ícones dos campos visíveis no mobile', getComputedStyle(document.querySelector('#fieldInicio .field-ico')).display !== 'none');

  document.getElementById('mobileLaunchClose').click();
  await espera(350);
  ok('Botão fechar recolhe o sheet', !painel.classList.contains('is-open'));
  ok('Fundo destravado ao fechar', !document.body.classList.contains('mobile-sheet-open'));
  ok('aria-expanded=false ao fechar', btnAdd.getAttribute('aria-expanded') === 'false');
  ok('Semântica modal removida ao fechar', !painel.hasAttribute('role') && !painel.hasAttribute('aria-modal'));
  ok('Conteúdo de fundo volta a ficar ativo', document.querySelector('.metrics')?.inert === false);

  // 14. instalar app sempre disponível via Compartilhar → Instalar
  ok('Compartilhar tem uma única opção de agenda', !document.getElementById('shareGoogleOpt') && !!document.getElementById('shareIcsOpt') && document.getElementById('shareIcsOpt').textContent.includes('Agenda'));
  const inst = document.getElementById('shareInstallOpt');
  ok('Opção "Instalar" disponível no Compartilhar', !!inst && !inst.classList.contains('hidden'));

  localStorage.removeItem('pmgoEscalas');
  return JSON.stringify(passos);
})()`;

/* iPhone: após uma visita engajada, o banner inteligente deve aparecer e a
   opção Instalar continua acessível a qualquer momento no compartilhamento. */
const ROTEIRO_IOS = `(async () => {
  const passos = [];
  const ok = (nome, cond, detalhe = '') => passos.push({ nome, ok: !!cond, detalhe: String(detalhe) });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !document.getElementById('formEscala'); i++) await espera(100);
  ok('iOS detectado como iPhone', /iphone/i.test(navigator.userAgent));
  const banner = document.getElementById('pwaBanner');
  ok('iOS: banner aparece em visita engajada', !!banner && !banner.classList.contains('hidden'));
  const inst = document.getElementById('shareInstallOpt');
  ok('iOS: opção Instalar disponível', !!inst && !inst.classList.contains('hidden'));
  return JSON.stringify(passos);
})()`;

/* Em 320px o interesse é só overflow e a barra não estourar. */
const ROTEIRO_320 = `(async () => {
  const passos = [];
  const ok = (nome, cond, detalhe = '') => passos.push({ nome, ok: !!cond, detalhe: String(detalhe) });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !document.getElementById('formEscala'); i++) await espera(100);
  localStorage.removeItem('pmgoEscalas');
  const ini = document.getElementById('escalaInicio');
  ini.value = '2026-07-06T07:00';
  ini.dispatchEvent(new Event('change', { bubbles: true }));
  const dur = document.getElementById('escalaDuracao');
  dur.value = '14';
  dur.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('btnSubmit').click();
  await espera(400);
  ok('320px: sem rolagem horizontal', document.documentElement.scrollWidth <= window.innerWidth + 1,
     document.documentElement.scrollWidth + ' vs ' + window.innerWidth);
  const barra = document.querySelector('.mobile-bar')?.getBoundingClientRect();
  ok('320px: barra fixa cabe na tela', barra && barra.width <= window.innerWidth + 1,
     barra && Math.round(barra.width) + 'px');
  const acoes = [...document.querySelectorAll('.escala-card .ec-action-btn')];
  ok('320px: ações continuam tocáveis',
     acoes.length === 2 && acoes.every((b) => b.getBoundingClientRect().height >= 44),
     acoes.map((b) => Math.round(b.getBoundingClientRect().width) + '×' + Math.round(b.getBoundingClientRect().height)).join(' | '));
  localStorage.removeItem('pmgoEscalas');
  return JSON.stringify(passos);
})()`;

const servidor = await iniciarServidor();
const porta = servidor.address().port;
const perfil = await mkdtemp(join(tmpdir(), 'ac4-mob-'));
let chrome;
let falhou = false;

async function rodarViewport(cdp, sessionId, porta, largura, altura, roteiro, titulo) {
  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: largura, height: altura, deviceScaleFactor: 2, mobile: true,
  }, sessionId);
  await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
  const carregou = cdp.aguardarEvento('Page.loadEventFired');
  await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
  await carregou;
  const avaliacao = await cdp.enviar('Runtime.evaluate', {
    expression: roteiro, awaitPromise: true, returnByValue: true,
  }, sessionId);
  if (avaliacao.exceptionDetails) throw new Error(JSON.stringify(avaliacao.exceptionDetails));
  const passos = JSON.parse(avaliacao.result.value);
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

  await rodarViewport(cdp, sessionId, porta, 393, 852, ROTEIRO_MOBILE, 'Celular 393×852 (padrão Android)');
  await rodarViewport(cdp, sessionId, porta, 320, 568, ROTEIRO_320, 'Celular 320×568 (mínimo)');

  /* iPhone: força o User-Agent de iOS para validar o fluxo de instalação do Safari. */
  await cdp.enviar('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  }, sessionId);
  await rodarViewport(cdp, sessionId, porta, 390, 844, ROTEIRO_IOS, 'iPhone (instalação PWA)');

  console.log(falhou ? '\nVALIDAÇÃO MOBILE FALHOU.' : '\nVALIDAÇÃO MOBILE OK — todos os critérios atendidos.');
  process.exitCode = falhou ? 1 : 0;
  cdp.fechar();
} finally {
  chrome?.proc.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
