/* Runner de testes para CI — executa os testes de regressão de cálculo
   (window.__ac4Testes e __ac4TestesAgendamento) em Node, sem navegador.
   O app.js só toca o DOM dentro de funções; no carregamento bastam stubs. */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { calcularEscala, regraNormativaParaData, TABELA_OFICIAL, tabelaParaData } from '../js/modules/calculo.mjs';
import { NORMAS, normaParaData, normaAtual, citacaoNorma } from '../js/modules/portarias.mjs';
import { aplicarNorma, desserializarEscalas, detectarConflitos, normalizarEscala, STORAGE_SCHEMA_VERSION } from '../js/modules/persistencia.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Módulos de produção em js/modules/, incluindo subpastas (ui/ desde a v74),
   como caminhos relativos ("calculo.mjs", "ui/avisos.mjs"). */
const listarModulos = (dir = join(raiz, 'js', 'modules'), prefixo = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((f) => (f.isDirectory()
    ? listarModulos(join(dir, f.name), `${prefixo}${f.name}/`)
    : f.name.endsWith('.mjs') ? [`${prefixo}${f.name}`] : []));

/* ---- stubs mínimos de navegador ---- */
const storageStub = () => {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
};

globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => null,
  addEventListener: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {} }),
  documentElement: { dataset: {} },
};
globalThis.localStorage = storageStub();
globalThis.sessionStorage = storageStub();
// Node ≥ 21 já expõe navigator (somente leitura); só criamos se faltar.
if (!('navigator' in globalThis)) {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-ci' } });
}
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });
// hostname local: os ganchos window.__ac4Testes* só são expostos fora da produção.
globalThis.location = { protocol: 'https:', hostname: 'localhost', origin: 'https://calculadora-ac4-pmgo.github.io' };

/* ---- carrega o app (módulo ES — os imports de js/modules/ resolvem sozinhos) ---- */
await import(pathToFileURL(join(raiz, 'js', 'app.js')).href);
/* As suítes vivem em js/modules/testes.mjs, carregado sob demanda em localhost. */
await globalThis.__ac4TestesProntos;

/* ---- executa as suítes ---- */
let falhou = false;

const rodar = (nome, fn) => {
  if (typeof fn !== 'function') {
    console.error(`FALHA: suíte ${nome} não encontrada.`);
    falhou = true;
    return;
  }
  const resultado = fn();
  if (typeof resultado === 'string') {
    console.log(`OK: ${nome} — ${resultado}`);
  } else {
    console.error(`FALHA: ${nome}`);
    console.error(JSON.stringify(resultado, null, 2));
    falhou = true;
  }
};

rodar('__ac4Testes (regras de cálculo AC4)', globalThis.__ac4Testes);
rodar('__ac4TestesExtras (CSV injection + invariantes)', globalThis.__ac4TestesExtras);
rodar('__ac4TestesAgendamento (geração de .ics)', globalThis.__ac4TestesAgendamento);

const validarHardeningV58 = () => {
  const valida = desserializarEscalas(JSON.stringify([
    { id: 10, inicio: '2026-07-10T18:00', fim: '2026-07-11T08:00', descricao: '<b>Unidade</b>', qtdPm: 2000 },
    { inicio: 'inválido', fim: '2026-07-11T08:00' },
  ]));
  const conflitos = detectarConflitos(valida.escalas, { inicio: '2026-07-10T20:00', fim: '2026-07-11T06:00' });
  const comStatus = normalizarEscala({ inicio: '2026-08-10T08:00', fim: '2026-08-10T20:00', status: 'recebida' });
  const checks = [
    [STORAGE_SCHEMA_VERSION === '2', 'schema versionado'],
    [valida.escalas.length === 1 && valida.rejeitadas === 1, 'registro inválido rejeitado'],
    [valida.escalas[0].id === '10' && valida.escalas[0].qtdPm === 999, 'registro normalizado'],
    [valida.escalas[0].status === 'planejada' && comStatus.status === 'recebida', 'situação normalizada e legado migrado'],
    [conflitos.sobrepostas.length === 1, 'sobreposição detectada'],
    [regraNormativaParaData('2026-07-01')?.id === TABELA_OFICIAL.id, 'regra selecionada pela vigência'],
    [regraNormativaParaData('2026-06-30') === null, 'data sem norma conhecida não recebe regra'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'TODOS OS TESTES V58 OK';
};
rodar('Hardening v58 (schema, conflitos e vigência)', validarHardeningV58);

const validarAtualizacaoPWA = () => {
  const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
  const index = readFileSync(join(raiz, 'index.html'), 'utf8');
  const versaoApp = readFileSync(join(raiz, 'js/app.js'), 'utf8').match(/const APP_VERSION = '(\d+)'/)?.[1];
  const blocoInstall = sw.slice(sw.indexOf("self.addEventListener('install'"), sw.indexOf("self.addEventListener('message'"));
  const checks = [
    [sw.includes("event.data?.type === 'SKIP_WAITING'"), 'worker aceita atualização solicitada pela interface'],
    [versaoApp && sw.includes(`const SW_VERSION = '${versaoApp}'`) && sw.includes("event.data?.type === 'GET_VERSION'"), 'worker informa sua versão antes do aviso'],
    [sw.includes('self.addEventListener(\'message\''), 'canal de mensagem registrado'],
    [!blocoInstall.includes('skipWaiting'), 'instalação não força recarga durante preenchimento'],
    // Auditoria v67 (P2-2): a limpeza forçada recarregava a página a cada versão sem perguntar.
    [!existsSync(join(raiz, 'js/force-update.js')) && !index.includes('force-update') && !sw.includes('force-update'),
      'sem limpeza forçada (force-update.js) — atualização só pelo banner'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'ATUALIZAÇÃO PWA SEGURA OK';
};
rodar('Atualização PWA (espera + ativação explícita)', validarAtualizacaoPWA);

/* v87: o app instalado nunca mistura arquivos de versões diferentes. Executa o sw.js de
   verdade com cache, rede e eventos simulados: versão A instalada, versão B publicada. */
const testarSwSemMistura = async () => {
  const Resposta = globalThis.Response;
  const fonte = readFileSync(join(raiz, 'sw.js'), 'utf8');
  const nomeCache = fonte.match(/const CACHE = '([^']+)'/)[1];
  const base = 'https://ac4.test/';
  const abs = (r) => new URL(typeof r === 'string' ? r : r.url, base).href;
  const guardados = new Map();
  let versaoRede = 'A';
  let offline = false;
  const falhar = new Set();
  const rede = async (r) => {
    const u = abs(r);
    if (offline || falhar.has(new URL(u).pathname)) throw new TypeError('sem rede');
    return new Resposta(`${versaoRede}:${new URL(u).pathname}`);
  };
  const abrir = (nome) => {
    if (!guardados.has(nome)) guardados.set(nome, new Map());
    const m = guardados.get(nome);
    return {
      match: async (r) => (m.has(abs(r)) ? new Resposta(m.get(abs(r))) : undefined),
      put: async (r, resp) => { m.set(abs(r), await resp.text()); },
      addAll: async (lista) => {
        const lidos = [];
        for (const r of lista) {
          const resp = await rede(r);
          lidos.push([abs(r), await resp.text()]);
        }
        lidos.forEach(([u, txt]) => m.set(u, txt)); /* tudo ou nada */
      },
    };
  };
  const cachesFalso = {
    open: async (nome) => abrir(nome),
    keys: async () => [...guardados.keys()],
    delete: async (nome) => guardados.delete(nome),
    match: async (r) => {
      for (const m of guardados.values()) if (m.has(abs(r))) return new Resposta(m.get(abs(r)));
      return undefined;
    },
  };
  const ouvintes = {};
  const selfFalso = { addEventListener: (tipo, fn) => { ouvintes[tipo] = fn; }, clients: { claim: async () => {} }, skipWaiting: () => {} };
  class RequisicaoRelativa { constructor(u) { this.url = new URL(u, base).href; } }
  new Function('self', 'caches', 'fetch', 'location', 'Request', 'Response', fonte)(
    selfFalso, cachesFalso, rede, new URL(`${base}sw.js`), RequisicaoRelativa, Resposta);
  const esperar = async (tipo) => { let p = null; ouvintes[tipo]({ waitUntil: (x) => { p = x; } }); return p; };
  const buscar = async (url, mode = 'cors') => {
    let resp = null;
    ouvintes.fetch({ request: { method: 'GET', url: abs(url), mode }, respondWith: (x) => { resp = x; } });
    const r = await resp;
    return r.type === 'error' ? 'ERRO' : r.text();
  };

  guardados.set('ac4-v1', new Map([['x', 'velho']]));
  await esperar('install');
  await esperar('activate');
  const aposAtivar = { antiga: guardados.has('ac4-v1'), atual: guardados.get(nomeCache)?.size || 0 };
  versaoRede = 'B'; /* nova versão publicada no servidor */
  const r1 = await buscar('js/modules/relatorio.mjs');
  const r2 = await buscar('js/modules/ui/exportacoes.mjs');
  const r3 = await buscar('?nocache=1', 'navigate');
  falhar.add('/js/modules/pdf.mjs');
  const r4 = await buscar('js/modules/pdf.mjs');
  offline = true;
  const r5 = await buscar('js/modules/calculo.mjs');
  const r6 = await buscar('docs/nao-guardado.md');
  offline = false;
  const r7 = await buscar('docs/nao-guardado.md');
  const r8 = await buscar('docs/nao-guardado.md');
  versaoRede = 'C';
  falhar.clear();
  falhar.add('/js/modules/lote.mjs');
  let instalacaoParcialRecusada = false;
  guardados.delete(nomeCache);
  try { await esperar('install'); } catch { instalacaoParcialRecusada = true; }
  const checks = [
    [r1 === 'A:/js/modules/relatorio.mjs' && r2 === 'A:/js/modules/ui/exportacoes.mjs', 'com versão B no servidor, os módulos continuam da versão A instalada'],
    [r3 === 'A:/index.html', 'abrir o app (navegação, mesmo com ?query) recebe o index.html da versão instalada'],
    [r4 === 'A:/js/modules/pdf.mjs' && r5 === 'A:/js/modules/calculo.mjs', 'rede falhando ou offline: ainda só arquivos da versão A'],
    [r6 === 'ERRO', 'arquivo fora da cópia, offline: erro (nunca outro arquivo no lugar)'],
    [r7 === 'B:/docs/nao-guardado.md' && r8 === 'B:/docs/nao-guardado.md', 'arquivo fora da cópia, online: busca na rede e guarda'],
    [!aposAtivar.antiga && aposAtivar.atual > 20, 'instalação guarda a cópia completa e a ativação apaga as de versões antigas'],
    [instalacaoParcialRecusada && !guardados.get(nomeCache)?.size, 'instalação com arquivo faltando é recusada inteira (sem versão pela metade)'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'SEM MISTURA DE VERSÕES OK';
};
const resultadoSwSemMistura = await testarSwSemMistura().catch((erro) => [`erro: ${erro.message}`]);
rodar('Atualização sem mistura de versões (sw.js simulado)', () => resultadoSwSemMistura);

/* Guarda de release: o PR #58 passou no CI com o redesign da v65 numa pasta
   descartada (ac4-v65-files/), fora do app servido. Toda versão precisa estar
   registrada no CHANGELOG da raiz, e nenhuma pasta de rascunho pode ficar lá. */
const validarRelease = () => {
  const versaoApp = readFileSync(join(raiz, 'js/app.js'), 'utf8').match(/const APP_VERSION = '(\d+)'/)?.[1];
  const topoChangelog = readFileSync(join(raiz, 'CHANGELOG.md'), 'utf8').match(/^## v(\d+)/m)?.[1];
  const rascunhos = readdirSync(raiz).filter((nome) => /^ac4-v\d+-files$/.test(nome));
  const checks = [
    [versaoApp && topoChangelog === versaoApp, `CHANGELOG começa na versão do app (v${topoChangelog} ≠ v${versaoApp})`],
    [!rascunhos.length, `pasta de rascunho na raiz: ${rascunhos.join(', ')}`],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'RELEASE CONSISTENTE OK';
};
rodar('Release (CHANGELOG × versão, sem rascunhos na raiz)', validarRelease);

/* Conformidade com a Portaria SSP 621/2026 — casos derivados direto do Anexo I
   (docs/portaria-ssp-621-2026.md), um por dia da semana e faixa:
   - diurno (5h01–21h59) e noturno (22h) do próprio dia, pela coluna do dia;
   - madrugada (00h–5h) paga pelo noturno do DIA ANTERIOR (Art. 1º, par. único:
     "22h de um dia e 5h do dia seguinte");
   - virada às 5h: 04h→06h = 1h noturno do dia anterior + 1h diurno do dia;
   - virada às 22h: 21h→23h = 1h diurno + 1h noturno do mesmo dia;
   - cada faixa arredondada para a hora mais próxima, 30 min sobe (decisão do gestor, v93; antes, v71, só horas inteiras). */
const validarAnexoI = () => {
  const ANEXO = { // centavos/hora por dia (0 = domingo … 6 = sábado)
    diurno:  [4000, 3000, 3000, 3000, 3000, 4000, 4000],
    noturno: [4500, 3300, 3300, 3300, 3300, 4500, 4500],
  };
  const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const pad = (n) => String(n).padStart(2, '0');
  // semana de 05/07/2026 (domingo) a 11/07/2026 (sábado)
  const dia = (d, h, m = 0) => `2026-07-${pad(5 + d)}T${pad(h)}:${pad(m)}`;
  const casos = [];
  for (let d = 0; d < 7; d++) {
    const ant = (d + 6) % 7;
    casos.push(
      [`${NOMES[d]} 10h→11h (diurno do dia)`, dia(d, 10), dia(d, 11), ANEXO.diurno[d]],
      [`${NOMES[d]} 22h→23h (noturno do dia)`, dia(d, 22), dia(d, 23), ANEXO.noturno[d]],
      [`${NOMES[d]} 02h→03h (madrugada = noturno de ${NOMES[ant]})`, dia(d + 1, 2), dia(d + 1, 3), ANEXO.noturno[d]],
      [`${NOMES[d]} 04h→06h (virada das 5h)`, dia(d, 4), dia(d, 6), ANEXO.noturno[ant] + ANEXO.diurno[d]],
      [`${NOMES[d]} 21h→23h (virada das 22h)`, dia(d, 21), dia(d, 23), ANEXO.diurno[d] + ANEXO.noturno[d]],
      [`${NOMES[d]} 08h→20h40 (12h40 arredonda para 13h)`, dia(d, 8), dia(d, 20, 40), 13 * ANEXO.diurno[d]],
      [`${NOMES[d]} 08h→20h20 (12h20 arredonda para 12h)`, dia(d, 8), dia(d, 20, 20), 12 * ANEXO.diurno[d]],
    );
  }
  // exemplo conferido pelo gestor em 23/09/2026: qui 24/09 18h → sex 05h = R$ 351,00
  casos.push(['qui 24/09/2026 18h→sex 05h (exemplo do gestor)', '2026-09-24T18:00', '2026-09-25T05:00', 35100]);
  // planilha do gestor (23/09/2026) — conferida coluna a coluna (AD/VD/AN/VN)
  [
    ['sex 07/08 18h→sáb 08h', '2026-08-07T18:00', '2026-08-08T08:00', 59500],   // VD 280 + VN 315
    ['sáb 08/08 08h→dom 08h', '2026-08-08T08:00', '2026-08-09T08:00', 99500],   // VD 680 + VN 315
    ['qui 13/08 18h→sex 08h', '2026-08-13T18:00', '2026-08-14T08:00', 47100],   // AD 120 + VD 120 + AN 231
    ['sex 14/08 18h→sáb 08h', '2026-08-14T18:00', '2026-08-15T08:00', 59500],
    ['sáb 15/08 08h→dom 08h', '2026-08-15T08:00', '2026-08-16T08:00', 99500],
    ['qui 27/08 18h→sex 02h', '2026-08-27T18:00', '2026-08-28T02:00', 25200],   // AD 120 + AN 132
    ['sex 28/08 18h→sáb 08h', '2026-08-28T18:00', '2026-08-29T08:00', 59500],
    ['sáb 29/08 08h→dom 08h', '2026-08-29T08:00', '2026-08-30T08:00', 99500],
    ['seg 21/09 04h→06h', '2026-09-21T04:00', '2026-09-21T06:00', 7500],       // VN 45 (domingo) + AD 30
    /* Planilha do gestor de novembro/2026 (08/11/2026): o sistema oficial exige início com ":01"
       depois de escala ordinária; a planilha arredonda (ROUND) cada faixa — v93. */
    ['dom 08/11 08h→23h', '2026-11-08T08:00', '2026-11-08T23:00', 60500],       // VD 14h 560 + VN 1h 45
    ['dom 08/11 08:01→23:01', '2026-11-08T08:01', '2026-11-08T23:01', 60500],   // VD 13h59 → 14h
    ['sáb 07/11 08:01→dom 07:01', '2026-11-07T08:01', '2026-11-08T07:01', 95500], // VD 16h + VN 7h
    ['qui 26/11 18:01→sex 03:01', '2026-11-26T18:01', '2026-11-27T03:01', 28500], // AD 3h59→4h + AN 5h01→5h
    ['sex 27/11 18:01→sáb 08h', '2026-11-27T18:01', '2026-11-28T08:00', 59500],   // VD 6h59→7h + VN 7h
    ['qui 05/11 18h→sex 08h', '2026-11-05T18:00', '2026-11-06T08:00', 47100],     // AD 120 + VD 120 + AN 231
  ].forEach(([nome, inicio, fim, cent]) => casos.push([`${nome} (planilha do gestor)`, inicio, fim, cent]));
  const falhas = casos
    .map(([nome, inicio, fim, esperado]) => [nome, esperado, calcularEscala({ inicio, fim }, TABELA_OFICIAL).valorCentavos])
    .filter(([, esperado, obtido]) => esperado !== obtido)
    .map(([nome, esperado, obtido]) => `${nome}: esperado ${esperado / 100}, obtido ${obtido / 100}`);
  return falhas.length ? falhas : `ANEXO I CONFORME (${casos.length} casos)`;
};
rodar('Conformidade com a Portaria 621/2026 (Anexo I)', validarAnexoI);

/* Auditoria v67 (P3-1): ganchos de teste não podem ser expostos em produção.
   __ac4TestesLancamento zera e regrava as escalas reais do aparelho. */
const validarGanchosLocais = () => {
  const app = readFileSync(join(raiz, 'js/app.js'), 'utf8');
  /* app.js + módulos de produção (testes.mjs só carrega em localhost). */
  const modulos = listarModulos()
    .filter((f) => f !== 'testes.mjs')
    .map((f) => readFileSync(join(raiz, 'js', 'modules', f), 'utf8'));
  const linhas = [app, ...modulos].join('\n').split('\n');
  /* Um gancho é aceito na mesma linha do if (ambienteDeTeste) ou na linha
     logo após a abertura do bloco if (ambienteDeTeste) {. */
  const expostos = linhas
    .map((l, i) => [l, linhas[i - 1] || ''])
    .filter(([l]) => /window\.__ac4(Testes\w*|ValidarICS|MailtoFeedback|SimularAtualizacao|LembrarBackup)\s*=/.test(l))
    .filter(([l, anterior]) => !l.includes('if (ambienteDeTeste)') && !anterior.includes('if (ambienteDeTeste) {'))
    .map(([l]) => `gancho fora de ambienteDeTeste: ${l.trim()}`);
  /* P3-2: as suítes ficam em js/modules/testes.mjs — nunca importado de forma
     estática; o import dinâmico precisa estar dentro do bloco if (ambienteDeTeste). */
  if (/^import[^;]*modules\/testes\.mjs/m.test(app)) expostos.push('testes.mjs importado estaticamente em app.js');
  const iImport = linhas.findIndex((l) => l.includes("import('./modules/testes.mjs')"));
  if (iImport < 1 || !linhas[iImport - 1].includes('if (ambienteDeTeste) {')) expostos.push('import de testes.mjs fora de if (ambienteDeTeste)');
  return expostos.length ? expostos : 'GANCHOS SÓ EM LOCALHOST OK';
};
rodar('Ganchos de teste restritos a localhost', validarGanchosLocais);

/* Modularização (auditoria v67, P3-2): todo módulo em js/modules/ carregado
   pelo app precisa estar no SHELL do Service Worker, senão o app quebra offline.
   Exceção: módulos só de teste, carregados sob demanda em localhost. */
const validarShellModulos = () => {
  const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
  const soTeste = new Set(['testes.mjs']);
  const faltando = listarModulos()
    .filter((f) => !soTeste.has(f))
    .filter((f) => !sw.includes(`'./js/modules/${f}'`));
  const falhas = faltando.map((f) => `fora do SHELL do sw.js: js/modules/${f}`);
  /* Módulos só de teste também ficam fora do site publicado (deploy.yml). */
  const deploy = readFileSync(join(raiz, '.github', 'workflows', 'deploy.yml'), 'utf8');
  soTeste.forEach((f) => { if (!deploy.includes(`--exclude '/js/modules/${f}'`)) falhas.push(`deploy publica js/modules/${f}`); });
  return falhas.length ? falhas : 'MÓDULOS NO SHELL OK';
};
rodar('Módulos no cache offline do Service Worker', validarShellModulos);

/* Módulos puros extraídos do app.js (P3-2): templates e exportações. */
const { botoesAcaoHTML, cardEscalaHTML } = await import('../js/modules/templates.mjs');
const { montarCSV, montarRelatorioImpressao, montarTextoResumo, descreverFiltros } = await import('../js/modules/relatorio.mjs');
const validarModulosExtraidos = () => {
  const hostil = '"><img src=x onerror=alert(1)>';
  const e = { id: hostil, inicio: '2026-07-10T08:00', fim: '2026-07-10T20:00', descricao: '=1+1 <b>x</b>', origem: 'AC4', qtdPm: 2, status: 'realizada' };
  const r = calcularEscala(e, TABELA_OFICIAL);
  const csv = montarCSV([{ e, r }, { e: { ...e, qtdPm: 1 }, r }]);
  const linhasCsv = csv.slice(1).split('\r\n');
  const { resumoHTML, tabelaHTML } = montarRelatorioImpressao([{ e, r }]);
  const checks = [
    [!botoesAcaoHTML(hostil).includes('<img'), 'id hostil escapado nos botões de ação'],
    [!cardEscalaHTML(e, r).includes('<img') && !cardEscalaHTML(e, r).includes('<b>'), 'id e unidade escapados no card'],
    [csv.startsWith('﻿'), 'CSV começa com BOM UTF-8'],
    [linhasCsv.length === 4, 'CSV: cabeçalho + 2 escalas + total'],
    [linhasCsv[1].startsWith('"\'=1+1'), 'CSV neutraliza fórmula na unidade'],
    [linhasCsv[1].includes('"Realizada"'), 'CSV traz a situação'],
    [linhasCsv[3].endsWith(';1440,00'), 'CSV: total = 2 PMs × R$ 480 + R$ 480'],
    [!tabelaHTML.includes('<b>') && tabelaHTML.includes('&lt;b&gt;'), 'PDF escapa a unidade'],
    [(tabelaHTML.match(/<th>/g) || []).length === 13 && (tabelaHTML.split('<tr>')[2].match(/<td/g) || []).length === 13,
      'PDF: 13 colunas no cabeçalho e na linha (o CSS de impressão tem 13 larguras)'],
    [tabelaHTML.includes('<td class="pr-center">2</td>'), 'PDF: coluna PMs mostra a quantidade'],
    [descreverFiltros() === '' && descreverFiltros({ mes: '', origem: '', status: '', busca: '  ' }) === '', 'PDF: sem filtro não há aviso'],
    (() => {
      const f = descreverFiltros({ mes: '2026-11', origem: 'PREFEITURAS', status: 'realizada', busca: ' natal ' });
      return [f.startsWith('Filtros aplicados: mês Novembro de 2026; origem Prefeituras; situação Realizada; busca “natal”.')
        && f.includes('totais consideram só as escalas filtradas'), 'PDF: aviso lista cada filtro ativo'];
    })(),
    [descreverFiltros({ status: 'inexistente' }) === '', 'PDF: situação desconhecida não gera aviso'],
    [resumoHTML.includes('R$') && resumoHTML.includes('960,00'), 'PDF: resumo com o valor total'],
    [montarRelatorioImpressao([{ e, r }]).normaTexto === 'Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)', 'PDF cita norma e DOE'],
    [montarRelatorioImpressao([{ e, r: { ...r, tabela: { id: 'desconhecida', portaria: 'X', valores: r.tabela.valores } } }]).normaTexto.startsWith('Portaria SSP nº 621/2026'), 'PDF sem norma conhecida cai na atual'],
    [montarTextoResumo([{ e, r }]).includes(`_${normaAtual().norma} · Valor simulado_`), 'texto compartilhado usa a norma dos dados'],
    (() => {
      const pref = { ...e, origem: 'PREFEITURAS' };
      const txt = montarTextoResumo([{ e: pref, r }, { e: { ...pref, qtdPm: 1 }, r }]);
      return [txt.includes('Origem: Prefeituras') && txt.includes('TOTAL — 2 escalas') && txt.includes('1.440,00') && txt.includes('Vermelha'),
        'Resumo compartilhado: origem pelo labelOrigem, total e tipo da escala'];
    })(),
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'TEMPLATES E EXPORTAÇÕES OK';
};
rodar('Templates e exportações (módulos extraídos)', validarModulosExtraidos);

/* PDF gerado no próprio aparelho (v86): no app instalado do iPhone, window.print() não abre nada. */
const { gerarPdfRelatorio, codigosWinAnsi, quebrarLinhas } = await import('../js/modules/pdf.mjs');
const relatorioMod = await import('../js/modules/relatorio.mjs');
const { dadosRelatorio, COLUNAS_RELATORIO } = relatorioMod;
const { readFileSync: lerArquivoPdf } = await import('node:fs');
const validarPdfIphone = () => {
  const p2 = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const escalas = Array.from({ length: 30 }, (_, k) => {
    const ini = new Date(2026, 6 + Math.floor(k / 6), 1 + (k % 6) * 4, 6 + (k % 4) * 4);
    return {
      id: `p${k}`, inicio: local(ini), fim: local(new Date(ini.getTime() + (8 + (k % 3) * 4) * 3600000)),
      descricao: k === 0 ? 'Sede (Caldas) \\ teste' : (k % 5 === 0 ? 'Policiamento ostensivo — Companhia Independente de Pontalina' : 'Escala AC4'),
      origem: 'AC4', qtdPm: k % 7 === 0 ? 4 : 1, status: ['planejada', 'realizada', 'conferida', 'recebida'][k % 4],
    };
  });
  const resultados = escalas.map((e) => ({ e, r: calcularEscala(e, TABELA_OFICIAL) }));
  const dados = dadosRelatorio(resultados);
  const bytes = gerarPdfRelatorio({ dados, emitidoEm: '05/11/2026, 16:30', filtrosTexto: 'Filtros aplicados: mês Novembro de 2026.', titulo: 'Relatorio-AC4-2026-11-05' });
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const paginas = (s.match(/\/Type \/Page[^s]/g) || []).length;
  const xref = s.slice(s.indexOf('\nxref\n') + 1);
  const posicoes = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  const xrefOk = posicoes.length > 4 && posicoes.every((pos, i) => s.startsWith(`${i + 1} 0 obj`, pos));
  const startxref = Number(s.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  const comprimentosOk = [...s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)]
    .every((m) => s.startsWith('\nendstream', m.index + m[0].length + Number(m[1])));
  const css = lerArquivoPdf(new URL('../css/src/95-rodape-impressao.css', import.meta.url), 'utf8');
  const larguraCss = [...css.matchAll(/\.pr-table th:nth-child\((\d+)\)\s*\{\s*width:\s*([\d.]+)%/g)].map((m) => Number(m[2]));
  const util = 595.28 - 2 * 28.35;
  const cortes = [];
  dados.linhas.forEach(({ celulas }) => celulas.forEach((c, i) => {
    if (i === 6) return; /* Unidade: texto livre, pode quebrar palavra enorme */
    const ls = quebrarLinhas(c, (COLUNAS_RELATORIO[i].largura * util) / 100 - 4.5, 8, i === 12);
    if (ls.join(' ') !== c.split(/\s+/).join(' ')) cortes.push(`${COLUNAS_RELATORIO[i].titulo}: ${c}`);
  }));
  const checks = [
    [s.startsWith('%PDF-1.4\n') && s.endsWith('%%EOF\n'), 'cabeçalho %PDF-1.4 e fim %%EOF'],
    [xrefOk && s.startsWith('xref', startxref), 'tabela xref aponta para cada objeto e startxref para a xref'],
    [comprimentosOk, '/Length de cada conteúdo bate com o tamanho do stream'],
    [paginas === 2 && s.includes('/Count 2'), `30 escalas em 2 páginas A4 (obtido: ${paginas})`],
    [s.includes('P\\341gina 1 de 2') && s.includes('P\\341gina 2 de 2'), 'numeração "Página X de Y" com acento em WinAnsi'],
    [s.includes('(Relat\\363rio de Escalas AC4)'), 'título com acento'],
    [s.includes('(Sede \\(Caldas\\))') && s.includes('(\\\\ teste)'), 'parênteses e barra da unidade escapados'],
    [s.includes('(TOTAL GERAL)') && s.includes('Filtros aplicados'), 'total geral e aviso de filtro no PDF'],
    [/^[\x09\x0A\x0D\x20-\x7E]*$/.test(s.slice(s.indexOf('1 0 obj'))), 'corpo do arquivo só em ASCII (acentos em octal)'],
    [JSON.stringify(codigosWinAnsi('—“€ç😀')) === JSON.stringify([0x97, 0x93, 0x80, 0xE7, 63]), 'codificação WinAnsi (travessão, aspas, euro, ç; emoji vira ?)'],
    [quebrarLinhas('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 30, 8).length > 1, 'palavra maior que a coluna é cortada'],
    [larguraCss.length === COLUNAS_RELATORIO.length && larguraCss.every((w, i) => w === COLUNAS_RELATORIO[i].largura),
      'larguras do PDF iguais às do CSS de impressão'],
    [Math.abs(COLUNAS_RELATORIO.reduce((soma, c) => soma + c.largura, 0) - 100) < 1e-9, 'larguras somam 100%'],
    [cortes.length === 0, `nenhuma palavra cortada fora da Unidade${cortes.length ? `: ${cortes.slice(0, 3).join(' | ')}` : ''}`],
    [gerarPdfRelatorio({ dados: dadosRelatorio(resultados.slice(0, 1)), emitidoEm: 'x' }).length > 3000, 'uma escala: PDF de 1 página sem total'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'PDF DO IPHONE OK';
};
rodar('PDF do iPhone (arquivo gerado no aparelho)', validarPdfIphone);

const validarTotalPorMes = () => {
  const { COLUNAS_MESES } = relatorioMod;
  const mk = (id, ini, fim) => ({ id, inicio: ini, fim, descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada' });
  const calc = (es) => es.map((e) => ({ e, r: calcularEscala(e, TABELA_OFICIAL) }));
  const umMes = dadosRelatorio(calc([mk('a', '2026-07-06T08:00', '2026-07-06T18:00'), mk('b', '2026-07-07T08:00', '2026-07-07T18:00')]));
  const virada = calc([
    mk('c', '2026-07-31T20:00', '2026-08-01T06:00'), /* começa em julho, termina em agosto: conta em julho */
    mk('d', '2026-08-03T08:00', '2026-08-03T18:00'),
    mk('e', '2026-07-10T08:00', '2026-07-10T18:00'),
  ]);
  const dois = dadosRelatorio(virada);
  const soma = (i) => dois.meses.reduce((a, m) => a + Number(m[i].replace(/\D/g, '')), 0);
  const geral = dois.resumo.find(([r]) => r === 'Valor estimado:')[1];
  const valores = dois.meses.map((m) => Number(m[5].replace(/[^\d,]/g, '').replace(',', '.')));
  const somaValores = valores.reduce((a, v) => a + v, 0).toFixed(2).replace('.', ',');
  const pdfDois = Array.from(gerarPdfRelatorio({ dados: dois, emitidoEm: 'x' }), (b) => String.fromCharCode(b)).join('');
  const pdfUm = Array.from(gerarPdfRelatorio({ dados: umMes, emitidoEm: 'x' }), (b) => String.fromCharCode(b)).join('');
  const css = lerArquivoPdf(new URL('../css/src/95-rodape-impressao.css', import.meta.url), 'utf8');
  const larguraCss = [...css.matchAll(/\.pr-meses th:nth-child\((\d+)\)\s*\{\s*width:\s*([\d.]+)%/g)].map((m) => Number(m[2]));
  const html = relatorioMod.montarRelatorioImpressao(virada);
  const htmlUm = relatorioMod.montarRelatorioImpressao(calc([mk('a', '2026-07-06T08:00', '2026-07-06T18:00')]));
  const checks = [
    [umMes.meses.length === 0, 'um mês só: sem quadro'],
    [dois.meses.length === 2, `dois meses: duas linhas (obtido: ${dois.meses.length})`],
    [dois.meses[0][0].startsWith('Julho') && dois.meses[1][0].startsWith('Agosto'), 'ordem cronológica'],
    [dois.meses[0][1] === '2' && dois.meses[1][1] === '1', 'escala que vira o mês conta no mês em que começa'],
    [somaValores === geral.replace(/[^\d,]/g, '').replace(/^0+/, '').replace(/^(\d+),/, (_, n) => `${Number(n)},`) || somaValores.replace('.', '') === geral.replace(/\D/g, ''),
      `soma dos meses (${somaValores}) = valor total (${geral})`],
    [pdfDois.includes('(Julho de 2026)') && pdfDois.includes('(Agosto de 2026)'), 'PDF do iPhone traz as linhas dos meses'],
    [!pdfUm.includes('(Julho de 2026)'), 'PDF do iPhone com um mês não traz o quadro'],
    [html.mesesHTML.includes('Julho de 2026') && html.mesesHTML.includes('Agosto de 2026'), 'relatório do computador traz o quadro'],
    [htmlUm.mesesHTML === '', 'relatório do computador com um mês: sem quadro'],
    [larguraCss.length === COLUNAS_MESES.length && larguraCss.every((w, i) => w === COLUNAS_MESES[i].largura), 'larguras do quadro iguais no PDF e no CSS'],
    [Math.abs(COLUNAS_MESES.reduce((a, c) => a + c.largura, 0) - 100) < 1e-9, 'larguras do quadro somam 100%'],
    [soma(1) === 3, 'escalas por mês somam 3'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'TOTAL POR MÊS OK';
};
rodar('Total por mês no relatório', validarTotalPorMes);

const dinheiroMod = await import('../js/modules/ui/dinheiro.mjs');
const validarMeuDinheiro = () => {
  const { resumirDinheiro, escalasPassadasPlanejadas, PARTES_DINHEIRO } = dinheiroMod;
  const mk = (id, ini, fim, status, qtdPm = 1) => ({ id, inicio: ini, fim, descricao: 'Escala AC4', origem: 'AC4', qtdPm, status });
  const escalas = [
    mk('a', '2026-07-06T08:00', '2026-07-06T18:00', 'recebida'),
    mk('b', '2026-07-07T08:00', '2026-07-07T18:00', 'realizada', 2),
    mk('c', '2026-07-08T08:00', '2026-07-08T18:00', 'conferida'),
    mk('d', '2026-07-09T08:00', '2026-07-09T18:00', 'planejada'),
    mk('e', '2026-07-10T08:00', '2026-07-10T18:00'), /* sem situação = planejada */
  ];
  const resultados = escalas.map((e) => ({ e, r: calcularEscala(e, TABELA_OFICIAL) }));
  const { total, partes } = resumirDinheiro(resultados);
  const totalGeral = resultados.reduce((t, x) => t + x.r.valorCentavos * (x.e.qtdPm || 1), 0);
  const p = Object.fromEntries(partes.map((x) => [x.chave, x]));
  const passadas = escalasPassadasPlanejadas(escalas, new Date(2026, 6, 9, 20));
  const situacoes = PARTES_DINHEIRO.flatMap((x) => x.situacoes).sort().join(',');
  const checks = [
    [total === totalGeral && partes.reduce((t, x) => t + x.valor, 0) === totalGeral, 'partes somam o total geral'],
    [p.recebida.qtd === 1 && p['a-receber'].qtd === 2 && p.planejada.qtd === 2, 'quantidades por parte (1 · 2 · 2)'],
    [p['a-receber'].valor === resultados[1].r.valorCentavos * 2 + resultados[2].r.valorCentavos, 'A receber = realizadas (× PMs) + conferidas'],
    [situacoes === 'conferida,planejada,realizada,recebida', 'cada situação cai em exatamente uma parte'],
    [resumirDinheiro([]).total === 0, 'lista vazia: total zero'],
    [passadas.length === 1 && passadas[0].id === 'd', 'já passou: só planejada com término antes de agora'],
    [descreverFiltros({ status: 'a-receber' }).includes('A receber'), 'aviso de filtro do PDF entende "A receber"'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'MEU DINHEIRO OK';
};
rodar('Meu dinheiro e Já passou', validarMeuDinheiro);

const formularioMod = await import('../js/modules/ui/formulario.mjs');
const validarHoraRapida = () => {
  const { horaUltimaEscala, inicioPadrao } = formularioMod;
  const agora = new Date(2026, 10, 7, 16, 41);
  const checks = [
    [horaUltimaEscala([]) === '07:00', 'sem escala: 07:00'],
    [horaUltimaEscala([{ inicio: '2026-11-01T19:00' }, { inicio: '2026-11-03T22:30' }]) === '22:30', 'usa a última da lista'],
    [horaUltimaEscala([{ inicio: 'lixo' }]) === '07:00', 'início inválido: 07:00'],
    [inicioPadrao([], agora) === '2026-11-07T07:00', 'data de hoje + 07:00 (nunca a hora do relógio)'],
    [inicioPadrao([{ inicio: '2026-10-01T19:00' }], agora) === '2026-11-07T19:00', 'data de hoje + hora da última escala'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'HORA RÁPIDA OK';
};
rodar('Hora sugerida para escala nova', validarHoraRapida);

const proximaMod = await import('../js/modules/ui/proxima-escala.mjs');
const { fmtMoeda } = await import('../js/modules/formato.mjs');
const validarProximaEscala = () => {
  const { proximaEscala, rotuloDia, textosProximaEscala } = proximaMod;
  const agora = new Date(2026, 10, 7, 20, 0); /* sáb 07/11/2026 20:00 */
  const mk = (id, ini, fim, extra = {}) => ({ id, inicio: ini, fim, descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada', ...extra });
  const passada = mk('p', '2026-11-05T07:00', '2026-11-05T19:00');
  const amanha = mk('a', '2026-11-08T07:00', '2026-11-08T19:00', { descricao: '19º CRPM — Sede' });
  const depois = mk('d', '2026-11-14T07:00', '2026-11-14T19:00');
  const andando = mk('n', '2026-11-07T19:00', '2026-11-08T07:00');
  const r = calcularEscala(amanha, TABELA_OFICIAL);
  const tAmanha = textosProximaEscala({ escala: amanha, emAndamento: false }, r, agora);
  const tAndando = textosProximaEscala({ escala: andando, emAndamento: true }, calcularEscala(andando, TABELA_OFICIAL), agora);
  const checks = [
    [proximaEscala([passada, depois, amanha], agora)?.escala.id === 'a', 'escolhe a próxima a começar (não a passada nem a mais distante)'],
    [proximaEscala([amanha, andando], agora)?.emAndamento === true && proximaEscala([amanha, andando], agora).escala.id === 'n', 'escala em andamento tem prioridade'],
    [proximaEscala([passada], agora) === null && proximaEscala([], agora) === null, 'sem escala futura: nada'],
    [rotuloDia(new Date(2026, 10, 7, 23), agora) === 'Hoje' && rotuloDia(new Date(2026, 10, 8, 7), agora) === 'Amanhã', 'Hoje e Amanhã'],
    [/^sáb\.?, 14\/11$/.test(rotuloDia(new Date(2026, 10, 14, 7), agora)), `data abreviada (obtido: ${rotuloDia(new Date(2026, 10, 14, 7), agora)})`],
    [rotuloDia(new Date(2026, 11, 1, 7), new Date(2026, 10, 30, 20)) === 'Amanhã', 'Amanhã na virada do mês'],
    [tAmanha.rotulo === 'Próxima escala' && tAmanha.quando === 'Amanhã · 07:00 às 19:00' && tAmanha.detalhe === `19º CRPM — Sede · ${fmtMoeda(r.valorCentavos)}`, `textos da próxima (${JSON.stringify(tAmanha)})`],
    [tAndando.rotulo === 'Em andamento' && tAndando.quando === 'Termina amanhã às 07:00', `textos em andamento (${JSON.stringify(tAndando)})`],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'PRÓXIMA ESCALA OK';
};
rodar('Próxima escala', validarProximaEscala);

const { detalharValor } = await import('../js/modules/calculo.mjs');
const validarExplicarValor = () => {
  if (typeof detalharValor !== 'function') return ['detalharValor não existe em calculo.mjs'];
  const det = (inicio, fim, qtd = 1) => detalharValor(calcularEscala({ inicio, fim }, TABELA_OFICIAL), qtd);
  const dom = det('2026-11-08T08:01', '2026-11-08T23:01');        // VD 13h59 → 14h, VN 1h01 → 1h
  const qui = det('2026-11-05T18:00', '2026-11-06T08:00', 2);     // AD 4h, AN 7h, VD 3h; 2 PMs
  const curto = det('2026-07-06T10:00', '2026-07-06T10:20');      // AD 20 min → 0h
  const l = (d, k) => d.linhas.find((x) => x.chave === k);
  const checks = [
    [dom.linhas.map((x) => x.chave).join(',') === 'VD,VN', `só as faixas com tempo (obtido: ${dom.linhas.map((x) => x.chave)})`],
    [l(dom, 'VD').minutos === 839 && l(dom, 'VD').horasPagas === 14 && l(dom, 'VD').arredondado === true && l(dom, 'VD').subtotalCentavos === 56000, '13h59 VD conta como 14h = R$ 560'],
    [l(dom, 'VN').horasPagas === 1 && l(dom, 'VN').tarifaCentavos === 4500 && l(dom, 'VN').subtotalCentavos === 4500, '1h01 VN conta como 1h = R$ 45'],
    [dom.porPmCentavos === 60500 && dom.totalCentavos === 60500 && dom.qtdPm === 1, 'total do domingo R$ 605'],
    [qui.linhas.map((x) => x.chave).join(',') === 'AD,AN,VD' && qui.linhas.every((x) => !x.arredondado), 'hora cheia: sem arredondamento, ordem AD, AN, VD, VN'],
    [qui.porPmCentavos === 47100 && qui.totalCentavos === 94200 && qui.qtdPm === 2, '2 PMs: R$ 471 por PM, R$ 942 no total'],
    [qui.linhas.reduce((t, x) => t + x.subtotalCentavos, 0) === qui.porPmCentavos, 'subtotais somam o valor por PM'],
    [curto.linhas.length === 1 && l(curto, 'AD').horasPagas === 0 && l(curto, 'AD').subtotalCentavos === 0 && curto.totalCentavos === 0, '20 min conta como 0h'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'EXPLICAR O VALOR OK';
};
rodar('Explicar o valor (conta por faixa)', validarExplicarValor);

const limiteMod = await import('../js/modules/limite-horas.mjs').catch(() => ({}));
const validarLimiteHoras = () => {
  const { LIMITE_HORAS_MES, horasDoMes, situacaoLimite, efeitoNoLimite } = limiteMod;
  if (typeof horasDoMes !== 'function') return ['js/modules/limite-horas.mjs não existe'];
  const p = (n) => String(n).padStart(2, '0');
  /* 15 escalas de 12 h em novembro (01 a 15, 07→19) = 180 h. */
  const base = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, inicio: `2026-11-${p(i + 1)}T07:00`, fim: `2026-11-${p(i + 1)}T19:00`, qtdPm: 1 }));
  const extra = [
    { id: 'out', inicio: '2026-10-31T19:00', fim: '2026-11-01T07:00', qtdPm: 1 },   /* começa em outubro */
    { id: 'vira', inicio: '2026-11-30T19:00', fim: '2026-12-01T07:00', qtdPm: 3 },  /* começa em novembro, 3 PMs */
  ];
  const nov = horasDoMes([...base, ...extra], '2026-11', calcularEscala);
  const s180 = situacaoLimite(180);
  const s192 = situacaoLimite(192);
  const s198 = situacaoLimite(198);
  const cabe = efeitoNoLimite(base, { inicio: '2026-11-20T07:00', fim: '2026-11-20T19:00' }, calcularEscala);
  const passa = efeitoNoLimite(base, { inicio: '2026-11-20T07:00', fim: '2026-11-20T20:00' }, calcularEscala);
  const outroMes = efeitoNoLimite(base, { inicio: '2026-12-01T07:00', fim: '2026-12-02T07:00' }, calcularEscala);
  const cheio = [...base, { id: 'x', inicio: '2026-11-20T07:00', fim: '2026-11-21T07:00', qtdPm: 1 }]; /* 204 h */
  const editaMenor = efeitoNoLimite(cheio, { inicio: '2026-11-20T07:00', fim: '2026-11-20T19:00' }, calcularEscala, 'x');
  const editaIgual = efeitoNoLimite(cheio, { inicio: '2026-11-21T07:00', fim: '2026-11-22T07:00' }, calcularEscala, 'x');
  const editaMaior = efeitoNoLimite(base, { inicio: '2026-11-15T07:00', fim: '2026-11-16T07:00' }, calcularEscala, 'e14');
  const um01 = horasDoMes([{ id: 'a', inicio: '2026-11-08T08:01', fim: '2026-11-08T23:01', qtdPm: 1 }], '2026-11', calcularEscala);
  const checks = [
    [LIMITE_HORAS_MES === 192, `limite deveria ser 192, é ${LIMITE_HORAS_MES}`],
    [nov === 192, `novembro deveria somar 192 h (180 + 12 da escala que vira o mês, 1 vez), somou ${nov}`],
    [um01 === 15, `08:01→23:01 deveria contar 15 h pagas, contou ${um01}`],
    [!s180.excedeu && s180.restante === 12, '180 h: não excede, restam 12'],
    [!s192.excedeu && s192.restante === 0, '192 h: no limite, não excede'],
    [s198.excedeu && s198.excesso === 6 && s198.restante === 0, '198 h: excede em 6'],
    [cabe.depois === 192 && !cabe.avisar, `180 + 12 = 192 não avisa (deu ${cabe.depois}, avisar ${cabe.avisar})`],
    [passa.depois === 193 && passa.avisar && passa.antes === 180 && passa.mes === '2026-11', `180 + 13 = 193 avisa (deu ${passa.depois})`],
    [outroMes.mes === '2026-12' && outroMes.depois === 24 && !outroMes.avisar, 'escala de dezembro não conta em novembro'],
    [editaMenor.depois === 192 && !editaMenor.avisar, `editar para menos (204 → 192) não avisa (deu ${editaMenor.depois})`],
    [editaIgual.depois === 204 && !editaIgual.avisar, 'editar sem aumentar as horas não avisa de novo'],
    [editaMaior.antes === 180 && editaMaior.depois === 192 && !editaMaior.avisar, `editar 12 h → 24 h: 180 → 192 (deu ${editaMaior.depois})`],
  ];
  /* v98: várias escalas de uma vez (lote, repetir a semana). */
  const { mesesAcimaDoLimite, perguntaLimite } = limiteMod;
  const dia = (mes, d, h1, h2) => ({ inicio: `2026-${mes}-${p(d)}T${h1}`, fim: `2026-${mes}-${p(d)}T${h2}`, qtdPm: 1 });
  const loteCabe = mesesAcimaDoLimite(base, [dia('11', 20, '07:00', '19:00')], calcularEscala);
  const lotePassa = mesesAcimaDoLimite(base, [dia('11', 20, '07:00', '19:00'), dia('11', 21, '07:00', '19:00'), dia('12', 1, '07:00', '19:00')], calcularEscala);
  const baseDez = base.map((e, i) => ({ ...e, id: `d${i}`, inicio: e.inicio.replace('-11-', '-12-'), fim: e.fim.replace('-11-', '-12-') }));
  const doisMeses = mesesAcimaDoLimite([...base, ...baseDez], [dia('11', 20, '07:00', '20:00'), dia('12', 20, '07:00', '21:00')], calcularEscala);
  checks.push(
    [typeof mesesAcimaDoLimite === 'function' && loteCabe.length === 0, 'lote que chega a 192 h não avisa'],
    [lotePassa.length === 1 && lotePassa[0].mes === '2026-11' && lotePassa[0].antes === 180 && lotePassa[0].depois === 204, `lote 180 + 24 em novembro avisa só novembro (deu ${JSON.stringify(lotePassa)})`],
    [perguntaLimite([{ mes: '2026-11', depois: 193, limite: 192 }]) === 'Com esta escala, Novembro de 2026 fica com 193h. O limite é de 192h por mês. Deseja continuar?', 'pergunta de 1 escala'],
    [perguntaLimite(lotePassa, 3) === 'Com estas escalas, Novembro de 2026 fica com 204h. O limite é de 192h por mês. Deseja continuar?', 'pergunta de várias escalas'],
    [doisMeses.length === 2 && perguntaLimite(doisMeses, 2) === 'Com estas escalas, Novembro de 2026 fica com 193h e Dezembro de 2026 com 194h. O limite é de 192h por mês. Deseja continuar?', `pergunta com dois meses (deu ${perguntaLimite(doisMeses, 2)})`],
  );
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'LIMITE DE HORAS OK';
};
rodar('Limite de horas no mês (192 h)', validarLimiteHoras);

const textoMod = await import('../js/modules/texto-escala.mjs').catch(() => ({}));
const validarTextoEscala = () => {
  const { interpretarTextoEscala: f } = textoMod;
  if (typeof f !== 'function') return ['js/modules/texto-escala.mjs não existe'];
  const agora = new Date(2026, 10, 9, 17, 0); /* segunda, 09/11/2026 */
  const certo = [
    ['sexta 18 às 8', '2026-11-13T18:00', '2026-11-14T08:00'],
    ['Sexta-feira das 18h às 8h', '2026-11-13T18:00', '2026-11-14T08:00'],
    ['hoje 7 às 19', '2026-11-09T07:00', '2026-11-09T19:00'],
    ['amanhã 18:01 às 8', '2026-11-10T18:01', '2026-11-11T08:00'],
    ['depois de amanhã 6 às 18', '2026-11-11T06:00', '2026-11-11T18:00'],
    ['13/11 8 às 23', '2026-11-13T08:00', '2026-11-13T23:00'],
    ['13/11/2026 08:01 as 22h', '2026-11-13T08:01', '2026-11-13T22:00'],
    ['dia 13 das 18 e 1 às 8', '2026-11-13T18:01', '2026-11-14T08:00'],
    ['sábado 7h30 até 19h30', '2026-11-14T07:30', '2026-11-14T19:30'],
    ['sab 7 e meia as 19', '2026-11-14T07:30', '2026-11-14T19:00'],
    ['domingo meio-dia à meia-noite', '2026-11-15T12:00', '2026-11-16T00:00'],
    ['segunda 7 às 7', '2026-11-09T07:00', '2026-11-10T07:00'],
    ['terça 18h01 - 08h', '2026-11-10T18:01', '2026-11-11T08:00'],
    ['quarta 18 horas e 30 minutos às 8 horas', '2026-11-11T18:30', '2026-11-12T08:00'],
    ['05/01 7 às 19', '2027-01-05T07:00', '2027-01-05T19:00'],
  ];
  const errado = [
    ['', 'vazio'], ['oi tudo bem', 'dia'], ['18 às 8', 'dia'], ['sexta 18', 'horas'],
    ['sexta 18 às 8 às 10', 'horas'], ['31/02 8 às 18', 'data'], ['sexta 25 às 8', 'hora'],
    ['sexta 18:75 às 8', 'hora'],
  ];
  const falhas = [];
  certo.forEach(([texto, inicio, fim]) => {
    const r = f(texto, agora);
    if (!r.ok || r.inicio !== inicio || r.fim !== fim) falhas.push(`"${texto}" deveria dar ${inicio} → ${fim}, deu ${r.ok ? `${r.inicio} → ${r.fim}` : r.motivo}`);
  });
  errado.forEach(([texto, motivo]) => {
    const r = f(texto, agora);
    if (r.ok || r.motivo !== motivo || !r.mensagem || 'inicio' in r) falhas.push(`"${texto}" deveria falhar por ${motivo}, deu ${r.ok ? 'ok' : r.motivo}`);
  });
  return falhas.length ? falhas : 'LANÇAR POR TEXTO OK';
};
rodar('Lançar por texto ou voz (interpretação)', validarTextoEscala);

const repetirMod = await import('../js/modules/repetir-semana.mjs').catch(() => ({}));
const validarRepetirSemana = () => {
  const { sugestaoRepetirSemana, gerarEscalasSemana, inicioDaSemana } = repetirMod;
  if (typeof sugestaoRepetirSemana !== 'function') return ['js/modules/repetir-semana.mjs não existe'];
  const mk = (id, ini, fim, extra = {}) => ({ id, inicio: ini, fim, descricao: 'Sede', origem: 'AC4', qtdPm: 1, status: 'recebida', ...extra });
  /* Semana passada (seg 02/11 a dom 08/11/2026): qui, sex, sáb e dom. */
  const passada = [
    mk('q', '2026-11-05T18:00', '2026-11-06T08:00'),
    mk('s', '2026-11-06T18:00', '2026-11-07T08:00'),
    mk('b', '2026-11-07T08:01', '2026-11-08T07:01', { qtdPm: 2 }),
    mk('d', '2026-11-08T08:01', '2026-11-08T23:01'),
  ];
  const seg = new Date(2026, 10, 9, 17, 0);   // segunda 09/11, semana atual vazia
  const sex = new Date(2026, 10, 13, 20, 0);  // sexta 13/11 20h: a de quinta já passou
  const s1 = sugestaoRepetirSemana(passada, seg);
  const s2 = sugestaoRepetirSemana(passada, sex);
  const comAtual = [...passada, mk('x', '2026-11-12T18:00', '2026-11-13T08:00')];
  const s3 = sugestaoRepetirSemana(comAtual, seg);
  /* Destino ocupado: escala da semana passada que entra na madrugada de segunda. */
  const s4 = sugestaoRepetirSemana([mk('m', '2026-11-02T02:00', '2026-11-02T05:00'), mk('v', '2026-11-08T22:00', '2026-11-09T06:00')], new Date(2026, 10, 9, 0, 30));
  const novas = s1 ? gerarEscalasSemana(s1.itens.filter((i) => i.marcado)) : [];
  const checks = [
    [inicioDaSemana(seg).getDate() === 9 && inicioDaSemana(new Date(2026, 10, 15, 23, 59)).getDate() === 9, 'semana começa na segunda e vai até domingo'],
    [s1 && s1.origem === 'passada' && s1.alvo === '2026-11-09' && s1.itens.length === 4, 'semana atual vazia: repete a passada nesta semana'],
    [s1 && s1.itens[0].inicio === '2026-11-12T18:00' && s1.itens[0].fim === '2026-11-13T08:00' && s1.itens[3].inicio === '2026-11-15T08:01', 'mesmo dia da semana e mesmo horário, 7 dias depois'],
    [s1 && s1.itens.every((i) => i.estado === 'livre' && i.marcado), 'tudo livre vem marcado'],
    [s2 && s2.itens[0].estado === 'passou' && s2.itens[0].marcado === false && s2.itens[1].marcado === true, 'dia que já passou vem desmarcado'],
    [s3 && s3.origem === 'atual' && s3.alvo === '2026-11-16' && s3.itens.length === 1 && s3.itens[0].inicio === '2026-11-19T18:00', 'semana atual com escala e próxima vazia: repete esta na próxima'],
    [s4 && s4.itens[0].inicio === '2026-11-09T02:00' && s4.itens[0].estado === 'ocupado' && s4.itens[0].marcado === false && s4.itens[1].estado === 'livre', 'destino que sobrepõe escala existente fica de fora'],
    [sugestaoRepetirSemana([], seg) === null, 'sem escalas: nada'],
    [novas.length === 4 && novas.every((e) => e.status === 'planejada' && e.tabela && e.descricao === 'Sede') && new Set(novas.map((e) => e.id)).size === 4 && novas[2].qtdPm === 2, 'escalas novas: planejadas, com norma, unidade e PMs da origem, ids novos'],
    [novas.every((e) => !passada.some((p) => p.id === e.id)), 'ids não repetem os da origem'],
  ];
  /* Conflito: já existe escala no horário de destino. */
  const comConflito = [...passada, mk('c', '2026-11-13T18:00', '2026-11-14T08:00')];
  const s5 = sugestaoRepetirSemana(comConflito, seg);
  checks.push([s5 && s5.origem === 'atual', 'com escala na semana atual, a origem passa a ser a atual']);
  const s6 = sugestaoRepetirSemana([...passada, mk('c2', '2026-11-20T18:00', '2026-11-21T08:00'), mk('x2', '2026-11-13T18:00', '2026-11-14T08:00')], seg);
  checks.push([s6 === null, 'próxima semana já tem escala: sem sugestão']);
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'REPETIR A SEMANA OK';
};
rodar('Repetir a semana', validarRepetirSemana);

const validarNormas = () => {
  const ids = new Set(NORMAS.map((n) => n.id));
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const checks = [
    [NORMAS.length >= 1 && ids.size === NORMAS.length, 'ids únicos'],
    [NORMAS.every((n) => n.norma && n.doe?.numero && iso.test(n.doe?.data) && iso.test(n.vigenciaInicio)), 'campos obrigatórios'],
    [NORMAS.every((n) => ['AD', 'AN', 'VD', 'VN'].every((k) => Number.isInteger(n.valores[k]) && n.valores[k] > 0)), 'valores inteiros positivos'],
    [NORMAS.every((n, i) => i === 0 || (NORMAS[i - 1].vigenciaFim && NORMAS[i - 1].vigenciaFim < n.vigenciaInicio)), 'vigências em ordem e sem sobreposição'],
    [NORMAS.slice(0, -1).every((n) => n.vigenciaFim), 'só a última sem vigenciaFim'],
    [Object.isFrozen(NORMAS) && NORMAS.every((n) => Object.isFrozen(n) && Object.isFrozen(n.valores) && Object.isFrozen(n.doe)), 'congeladas'],
    [normaParaData('2026-06-30') === null, '30/06/2026 sem norma'],
    [normaParaData('2026-07-01T00:00')?.id === 'ssp-621-2026-07-01', '01/07/2026 → 621'],
    [normaParaData('lixo') === null, 'data inválida → null'],
    [citacaoNorma(normaAtual()) === 'Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)', 'citação padrão'],
    [tabelaParaData('2026-08-10')?.valores.VN === 4500 && tabelaParaData('2026-08-10')?.portaria === 'Portaria SSP nº 621/2026', 'tabelaParaData → tabela oficial'],
    [tabelaParaData('2026-06-01') === null, 'tabelaParaData antes da vigência → null'],
    [TABELA_OFICIAL.id === normaAtual().id && TABELA_OFICIAL.valores.AD === normaAtual().valores.AD, 'TABELA_OFICIAL derivada'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'NORMAS OK';
};
rodar('Normas da Portaria (dados versionados)', validarNormas);

const validarAplicarNorma = () => {
  const base = { id: 'x', inicio: '2026-08-07T08:00', fim: '2026-08-07T18:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada' };
  const antiga = { ...base, tabela: { id: 'ssp-550-2024', portaria: 'Portaria nº 550/2024', valores: { AD: 2647, AN: 2980, VD: 3641, VN: 4138 } } };
  const oficial = { ...base, tabela: TABELA_OFICIAL };
  const junho = { ...base, inicio: '2026-06-05T08:00', fim: '2026-06-05T18:00' };
  const r1 = aplicarNorma(antiga), r2 = aplicarNorma(oficial), r3 = aplicarNorma(base), r4 = aplicarNorma(junho);
  const lote = desserializarEscalas(JSON.stringify([antiga, oficial, base, junho]));
  const releitura = desserializarEscalas(JSON.stringify(lote.escalas));
  const checks = [
    [r1.valorMudou && r1.escala.tabela.valores.VD === 4000, 'tabela antiga → oficial'],
    [!r2.alterada && !r2.valorMudou, 'escala já oficial não muda'],
    [r3.alterada && !r3.valorMudou && r3.escala.tabela.id === 'ssp-621-2026-07-01', 'sem tabela recebe a oficial sem contar como recálculo'],
    [r4.escala === junho && !r4.alterada, 'antes de 01/07/2026: devolvida sem alteração'],
    [calcularEscala(r4.escala, TABELA_OFICIAL).valorCentavos > 0, 'junho sem tabela ainda calcula pelo fallback'],
    [lote.recalculadas === 1 && lote.escalas.length === 4, 'desserializar conta só valores alterados'],
    [releitura.recalculadas === 0, 'releitura não recalcula de novo (aviso não se repete)'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'APLICAR NORMA OK';
};
rodar('Escalas salvas seguem a Portaria vigente', validarAplicarNorma);

const validarFonteUnica = () => {
  const dir = join(raiz, 'js'), arquivos = [];
  const varrer = (d) => readdirSync(d, { withFileTypes: true }).forEach((f) =>
    f.isDirectory() ? varrer(join(d, f.name)) : /\.m?js$/.test(f.name) && arquivos.push(join(d, f.name)));
  varrer(dir);
  const fora = arquivos.filter((a) => !/portarias\.mjs$|testes\.mjs$/.test(a));
  const html = readFileSync(join(raiz, 'index.html'), 'utf8');
  const faixa = html.match(/<div class="tariff-strip"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  const n = normaAtual();
  const reais = (c) => `R$&nbsp;${c / 100}/h`;
  const checks = [
    [!fora.some((a) => /621\/2026/.test(readFileSync(a, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))), '621/2026 só em portarias.mjs'],
    [!fora.some((a) => /AD:\s*3000/.test(readFileSync(a, 'utf8'))), 'valores só em portarias.mjs'],
    [!/id="val(AD|AN|VD|VN)"/.test(html), 'campos ocultos removidos'],
    [!/VALORES_OFICIAIS/.test(readFileSync(join(dir, 'modules', 'calculo.mjs'), 'utf8')), 'VALORES_OFICIAIS removido'],
    [faixa.includes(n.norma) && ['AD', 'AN', 'VD', 'VN'].every((k) => faixa.includes(reais(n.valores[k]))), 'faixa fixa confere com normaAtual()'],
    [!/valAD|pmgoConfig.*setItem|salvarConfig/.test(readFileSync(join(dir, 'app.js'), 'utf8')), 'app.js sem campos ocultos'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'FONTE ÚNICA OK';
};
rodar('Fonte única da Portaria', validarFonteUnica);

/* Módulos de interface (v74): cada js/modules/ui/<nome>.mjs exporta criar<Nome>(ctx);
   a fábrica não toca o DOM ao ser criada (chamada aqui com um ctx "vazio") e as
   funções públicas saíram do app.js. */
const MODULOS_UI = {
  avisos: ['toast', 'dialogConfirmar', 'haptic'],
  observabilidade: ['registrarErro', 'initObservabilidade'],
  aparencia: ['aplicarTema', 'initTema', 'initNovidades', 'abrirNovidades', 'marcarNovidadesVistas'],
  dados: ['salvar', 'carregar', 'salvarModelos', 'salvarMetas', 'normalizarModelos', 'normalizarMetas', 'exportarBackup',
    'restaurarBackup', 'pedirArmazenamentoPersistente', 'textoStatusBackup', 'lembrarBackup', 'ehIOS', 'rodandoInstalado'],
  exportacoes: ['exportarCSV', 'imprimirRelatorio', 'agendarEscalas', 'baixarArquivoAgenda', 'agendarEscalaItem'],
  compartilhar: ['abrirShareSheet', 'copiarResumo', 'compartilharWhatsApp', 'compartilharNativo', 'gerarTextoResumo', 'initFeedback'],
  formulario: ['isMobileViewport', 'setDetalhesAvancados', 'abrirPainelLancamentoMobile', 'fecharPainelLancamentoMobile',
    'validarFormulario', 'submeterFormulario', 'editarEscala', 'cancelarEdicao', 'atualizarResumoLancamento',
    'sincronizarTodosControlesDataHora', 'aplicarPartesDataHora', 'atualizarChipsDuracao', 'duplicarEscala',
    'removerEscala', 'limparTudo', 'atualizarStatusEscala', 'ligarEventos'],
  modelos: ['renderModelos', 'preencherConfiguracaoRapida', 'repetirUltimaEscala', 'abrirSalvarModelo', 'salvarModeloAtual', 'excluirModeloSelecionado', 'ligarEventos'],
  'agenda-dias': ['abrir', 'fechar', 'ligarEventos'],
  planejamento: ['atualizarSelectMes', 'renderPlanejamento', 'renderHistorico', 'mesPainelAtual', 'abrirMetaMensal', 'salvarMetaMensal', 'removerMetaMensal', 'ligarEventos'],
};
const resultadoModulosUI = await (async () => {
  const app = readFileSync(join(raiz, 'js', 'app.js'), 'utf8');
  const falhas = [];
  const ctxVazio = new Proxy({}, { get: () => () => {} });
  for (const [nome, chaves] of Object.entries(MODULOS_UI)) {
    let mod;
    try { mod = await import(pathToFileURL(join(raiz, 'js', 'modules', 'ui', `${nome}.mjs`)).href); } catch { falhas.push(`${nome}: módulo ausente`); continue; }
    const fabrica = mod[`criar${nome.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')}`];
    if (typeof fabrica !== 'function') { falhas.push(`${nome}: fábrica ausente`); continue; }
    let api;
    try { api = fabrica(ctxVazio); } catch (e) { falhas.push(`${nome}: fábrica falhou ao ser criada (${e.message})`); continue; }
    chaves.forEach((k) => { if (typeof api[k] !== 'function') falhas.push(`${nome}.${k} ausente`); });
    chaves.forEach((k) => { if (new RegExp(`function ${k}\\(|const ${k} = (async )?\\(`).test(app)) falhas.push(`${k} ainda definida no app.js`); });
  }
  try {
    const { criarObservabilidade } = await import(pathToFileURL(join(raiz, 'js', 'modules', 'ui', 'observabilidade.mjs')).href);
    /* Guarda e restaura os globais que o teste altera (não vazam para outras suítes). */
    const originais = { addEventListener: globalThis.addEventListener, erros: globalThis.__ac4Erros,
      limpar: globalThis.__ac4LimparErros, versao: globalThis.__ac4Version };
    delete globalThis.__ac4Erros;
    globalThis.addEventListener ??= () => {};
    try {
      criarObservabilidade({ STORAGE: { erros: 'eqErros', versao: 'eqVersao' }, APP_VERSION: '0', estado: {} }).initObservabilidade();
      if (typeof globalThis.__ac4Erros !== 'function') falhas.push('initObservabilidade não expõe __ac4Erros');
    } finally {
      globalThis.addEventListener = originais.addEventListener;
      globalThis.__ac4Erros = originais.erros;
      globalThis.__ac4LimparErros = originais.limpar;
      globalThis.__ac4Version = originais.versao;
    }
  } catch (e) { falhas.push(`observabilidade: ${e.message}`); }
  if (!/function init\(\) \{\s*initObservabilidade\(\);/.test(app)) falhas.push('initObservabilidade deixou de ser a primeira chamada do init()');
  /* v75: estado só via `estado.` — nenhuma atribuição nua nos módulos de UI. */
  readdirSync(join(raiz, 'js', 'modules', 'ui')).filter((f) => f.endsWith('.mjs')).forEach((f) => {
    /* Por linha: instrução que começa com `nome = …` (ou `nome += …`). O ESLint
       no-undef também acusa, mas esta mensagem diz o que fazer. */
    const m = readFileSync(join(raiz, 'js', 'modules', 'ui', f), 'utf8').split('\n')
      .map((l) => l.match(/^\s*(escalas|editandoId|ultimaExcluida|filtroMes|filtroOrigem|filtroBusca|filtroStatus|limiteLista|modelos|metasMensais|versaoAnterior|submetendo|sheetAberto)\s*[-+]?=(?!=)/))
      .find(Boolean);
    if (m) falhas.push(`${f}: atribuição nua a ${m[1]} (use estado.${m[1]})`);
  });
  const todosUI = readdirSync(join(raiz, 'js', 'modules', 'ui')).filter((f) => f.endsWith('.mjs'))
    .map((f) => readFileSync(join(raiz, 'js', 'modules', 'ui', f), 'utf8')).join('\n') + app;
  if ((todosUI.match(/document\.addEventListener\('keydown'/g) || []).length !== 1) falhas.push('listener keydown do documento deve existir exatamente uma vez');
  if ((app.match(/criarAvisos\(/g) || []).length !== 1) falhas.push('criarAvisos deve ser instanciado uma única vez (fila de toasts única)');
  return falhas.length ? falhas : 'MÓDULOS DE INTERFACE OK';
})();
rodar('Módulos de interface (js/modules/ui)', () => resultadoModulosUI);

/* Review Focus v74 (1): restaurar backup pela fábrica grava em estado.escalas
   (não numa variável local) e redesenha a tela. */
const resultadoRestaurar = await (async () => {
  try {
    const { criarDados } = await import(pathToFileURL(join(raiz, 'js', 'modules', 'ui', 'dados.mjs')).href);
    let escalas = [], modelos = [], metasMensais = {}, renderizou = 0;
    const estado = {
      get escalas() { return escalas; }, set escalas(v) { escalas = v; },
      get modelos() { return modelos; }, set modelos(v) { modelos = v; },
      get metasMensais() { return metasMensais; }, set metasMensais(v) { metasMensais = v; },
      sheetAberto: false,
    };
    const STORAGE = { escalas: 'eqEscalas', schema: 'eqSchema', modelos: 'eqModelos', metas: 'eqMetas', ultimoBackup: 'eqBackup', lembreteBackup: 'eqLembrete' };
    const dados = criarDados({ $: () => null, estado, STORAGE, APP_VERSION: '0', lerLocal: () => null,
      toast: () => {}, dialogConfirmar: async () => true, registrarErro: () => {}, render: () => { renderizou++; },
      renderModelos: () => {}, cancelarEdicao: () => {}, clonarEscalas: () => JSON.parse(JSON.stringify(escalas)) });
    const backup = JSON.stringify({ escalas: [{ id: 'b1', inicio: '2026-08-07T08:00', fim: '2026-08-07T18:00' }], metasMensais: { '2026-08': { valorCentavos: 100, horas: 1 } } });
    await dados.restaurarBackup({ size: backup.length, text: async () => backup });
    const falhas = [];
    if (!(escalas.length === 1 && escalas[0].id === 'b1')) falhas.push('estado.escalas não atualizado pelo restaurarBackup');
    if (!metasMensais['2026-08']) falhas.push('estado.metasMensais não atualizado');
    if (!renderizou) falhas.push('render não chamado após restaurar');
    /* Textos do backup (o código foi movido; as mensagens não podem mudar). */
    if (dados.textoStatusBackup() !== 'Você ainda não fez backup. As escalas ficam só neste aparelho.') falhas.push(`status do backup alterado: ${dados.textoStatusBackup()}`);
    const avisos = [];
    const dados2 = criarDados({ estado: { escalas: [1, 2, 3], sheetAberto: false }, STORAGE, APP_VERSION: '0', lerLocal: () => null,
      toast: (m) => avisos.push(m), dialogConfirmar: async () => true, registrarErro: () => {}, render: () => {},
      renderModelos: () => {}, cancelarEdicao: () => {}, clonarEscalas: () => [] });
    const querySelectorOriginal = globalThis.document.querySelector;
    globalThis.document.querySelector = () => null;
    dados2.lembrarBackup(Date.parse('2026-08-10T12:00:00Z'));
    if (avisos[0] !== 'Suas escalas ficam só neste aparelho. Salve uma cópia de segurança.') falhas.push(`lembrete sem backup alterado: ${avisos[0]}`);
    localStorage.removeItem('eqLembrete');
    const dados3 = criarDados({ estado: { escalas: [1, 2, 3], sheetAberto: false }, STORAGE, APP_VERSION: '0', lerLocal: (k) => (k === 'eqBackup' ? String(Date.parse('2026-06-01T12:00:00Z')) : null),
      toast: (m) => avisos.push(m), dialogConfirmar: async () => true, registrarErro: () => {}, render: () => {},
      renderModelos: () => {}, cancelarEdicao: () => {}, clonarEscalas: () => [] });
    dados3.lembrarBackup(Date.parse('2026-08-10T12:00:00Z'));
    if (avisos[1] !== 'Último backup há 70 dias. Salve uma cópia das suas escalas.') falhas.push(`lembrete com backup antigo alterado: ${avisos[1]}`);
    globalThis.document.querySelector = querySelectorOriginal;
    return falhas.length ? falhas : 'RESTAURAR GRAVA NO ESTADO OK';
  } catch (e) { return [`dados: ${e.message}`]; }
})();
rodar('Restaurar backup grava no estado (ui/dados)', () => resultadoRestaurar);

/* Textos preservados em refatoração (v75): o multiconjunto de literais de
   js/app.js + js/modules/ui/*.mjs precisa bater com tests/fixtures/literais.json.
   `estado.` é ignorado só dentro de ${…} (troca legítima de referência); fora
   disso, qualquer mudança de texto acusa — inclusive o incidente da v74
   ("As estado.escalas…"). Mudança intencional: LITERAIS_ATUALIZAR=1. */
const validarLiterais = () => {
  const arquivos = [join(raiz, 'js', 'app.js'),
    ...readdirSync(join(raiz, 'js', 'modules', 'ui')).filter((f) => f.endsWith('.mjs')).map((f) => join(raiz, 'js', 'modules', 'ui', f))];
  const contagem = {};
  arquivos.forEach((arq) => {
    /* APP_VERSION muda a cada bump (tools/bump-version.mjs): fora da comparação. */
    const fonte = readFileSync(arq, 'utf8').replace(/const APP_VERSION = '\d+';/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const literais = fonte.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
    literais
      .filter((l) => !/^['"]\.{1,2}\//.test(l))
      .map((l) => l.replace(/\$\{[^{}]*\}/g, (m) => m.replace(/\bestado\./g, '')))
      .forEach((l) => { contagem[l] = (contagem[l] || 0) + 1; });
  });
  const arqRef = join(raiz, 'tests', 'fixtures', 'literais.json');
  if (process.env.LITERAIS_ATUALIZAR === '1') {
    writeFileSync(arqRef, `${JSON.stringify(Object.fromEntries(Object.entries(contagem).sort()), null, 1)}\n`);
    return `REFERÊNCIA DE TEXTOS REGRAVADA (${Object.keys(contagem).length} literais)`;
  }
  const ref = JSON.parse(readFileSync(arqRef, 'utf8'));
  const entraram = Object.keys(contagem).filter((k) => (contagem[k] || 0) > (ref[k] || 0));
  const sairam = Object.keys(ref).filter((k) => (ref[k] || 0) > (contagem[k] || 0));
  if (!entraram.length && !sairam.length) return `TEXTOS PRESERVADOS (${Object.keys(ref).length} literais)`;
  return [...entraram.slice(0, 10).map((k) => `novo/alterado: ${k.slice(0, 160)}`), ...sairam.slice(0, 10).map((k) => `sumiu: ${k.slice(0, 160)}`)];
};
rodar('Textos preservados em refatoração', validarLiterais);

/* v76: css/styles.css é gerado a partir de css/src/ (tools/montar-css.mjs).
   Falha se alguém editar o gerado direto ou esquecer de montar. */
const resultadoCssMontado = await (async () => {
  try {
    const { montarCSS } = await import(pathToFileURL(join(raiz, 'tools', 'montar-css.mjs')).href);
    return montarCSS(raiz) === readFileSync(join(raiz, 'css', 'styles.css'), 'utf8')
      ? 'CSS MONTADO EM DIA' : ['css/styles.css diferente de css/src/ — rode node tools/montar-css.mjs'];
  } catch (e) { return [`montar-css: ${e.message}`]; }
})();
rodar('CSS montado a partir de css/src', () => resultadoCssMontado);

/* v76 (revisão): BOM num fonte do meio iria parar no meio do styles.css e o
   navegador descartaria a primeira regra daquele fonte — montarCSS recusa. */
const resultadoCssBom = await (async () => {
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { montarCSS } = await import(pathToFileURL(join(raiz, 'tools', 'montar-css.mjs')).href);
  const tmp = mkdtempSync(join(tmpdir(), 'ac4-css-'));
  try {
    mkdirSync(join(tmp, 'css', 'src'), { recursive: true });
    writeFileSync(join(tmp, 'css', 'src', '00-a.css'), 'a { color: red; }\n');
    writeFileSync(join(tmp, 'css', 'src', '05-b.css'), '﻿.b { position: fixed; }\n');
    try { montarCSS(tmp); return ['montarCSS aceitou um fonte com BOM']; }
    catch (e) { return /BOM/.test(e.message) ? 'CSS COM BOM RECUSADO' : [`erro inesperado: ${e.message}`]; }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
})();
rodar('CSS: fonte com BOM é recusado', () => resultadoCssBom);

/* v77 (R6): piso de fonte. Fora de @media print, rótulo ≥ 12 px e texto de
   leitura ≥ 14 px (lista em tests/fixtures/fontes-leitura.json). Tamanho que o
   verificador não consegue avaliar também falha. */
const resultadoPisoFonte = await (async () => {
  try {
    const { verificarPiso } = await import(pathToFileURL(join(raiz, 'tools', 'piso-fonte.mjs')).href);
    const { falhas, avaliadas } = verificarPiso(raiz);
    return falhas.length === 0 && avaliadas > 0 ? 'PISO DE FONTE OK' : (falhas.length ? falhas : ['verificador não avaliou nenhuma regra']);
  } catch (e) { return [`piso-fonte: ${e.message}`]; }
})();
rodar('Piso de fonte (R6)', () => resultadoPisoFonte);

/* v77 (revisão): o verificador precisa pegar regra de leitura escrita de outro jeito
   (seletor composto, em grupo, com pseudo-classe) e acusar item obsoleto da lista. */
const resultadoPisoBorda = await (async () => {
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { verificarPiso } = await import(pathToFileURL(join(raiz, 'tools', 'piso-fonte.mjs')).href);
  const rodarCom = (css, leitura = ['.field-hint']) => {
    const tmp = mkdtempSync(join(tmpdir(), 'ac4-piso-'));
    try {
      mkdirSync(join(tmp, 'css', 'src'), { recursive: true });
      mkdirSync(join(tmp, 'tests', 'fixtures'), { recursive: true });
      writeFileSync(join(tmp, 'css', 'src', '00-a.css'), css);
      writeFileSync(join(tmp, 'tests', 'fixtures', 'fontes-leitura.json'), JSON.stringify({ leitura }));
      return verificarPiso(tmp).falhas;
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  };
  const erros = [];
  const deve = (nome, css, leitura, trecho) => {
    const f = rodarCom(css, leitura);
    if (!f.length || (trecho && !f.some((x) => x.includes(trecho)))) erros.push(`não pegou: ${nome} (falhas: ${JSON.stringify(f)})`);
  };
  const naoDeve = (nome, css, leitura) => {
    const f = rodarCom(css, leitura);
    if (f.length) erros.push(`falso alarme: ${nome} (${JSON.stringify(f)})`);
  };
  deve('seletor composto', '.launch-panel .field-hint { font-size: 12px; }', ['.field-hint']);
  deve('seletor em grupo', '.field-hint, .outro { font-size: 12px; }', ['.field-hint']);
  deve('com pseudo-classe', '.field-hint:hover { font-size: 12px; }', ['.field-hint']);
  deve('item obsoleto na lista de leitura', '.outro { font-size: 12px; }', ['.sumiu'], 'obsoleto');
  naoDeve('leitura em 14 px', '.field-hint { font-size: 14px; }', ['.field-hint']);
  naoDeve('rótulo em 12 px', '.field-hint { font-size: 14px; }\n.rotulo { font-size: 12px; }', ['.field-hint']);
  naoDeve('seletor parecido não é o mesmo', '.field-hint-x { font-size: 12px; }\n.field-hint { font-size: 14px; }', ['.field-hint']);
  return erros.length ? erros : 'VERIFICADOR PEGA OS CASOS DE BORDA';
})();
rodar('Piso de fonte: casos de borda do verificador', () => resultadoPisoBorda);

/* v79: lançar em outros dias — regra pura do lote (js/modules/lote.mjs). */
const resultadoLote = await (async () => {
  let lote;
  try { lote = await import(pathToFileURL(join(raiz, 'js', 'modules', 'lote.mjs')).href); }
  catch (e) { return [`lote.mjs: ${e.message}`]; }
  const { LIMITE_LOTE, duracaoMinutos, escalaDoDia, situacaoDoDia, validarLote, gerarEscalasLote } = lote;
  const erros = [];
  const ok = (nome, cond, info = '') => { if (!cond) erros.push(`${nome}${info ? ` (${info})` : ''}`); };
  const base = {
    id: 'b1', inicio: '2026-07-10T18:00', fim: '2026-07-11T08:00', descricao: 'Unidade X',
    origem: 'AC4', qtdPm: 2, status: 'realizada', tabela: tabelaParaData('2026-07-10T18:00'),
  };
  ok('LIMITE_LOTE = 31', LIMITE_LOTE === 31);
  const d15 = escalaDoDia(base, '2026-07-15');
  ok('escalaDoDia usa hora e duração da base', d15.inicio === '2026-07-15T18:00' && d15.fim === '2026-07-16T08:00', JSON.stringify(d15));
  const d15b = escalaDoDia(base, '2026-07-15', { hora: '07:00', duracaoMin: 720 });
  ok('escalaDoDia com horário trocado', d15b.inicio === '2026-07-15T07:00' && d15b.fim === '2026-07-15T19:00', JSON.stringify(d15b));
  const baseMeia = { ...base, inicio: '2026-07-10T18:30' };
  ok('duração não inteira preservada (810 min)', duracaoMinutos(baseMeia) === 810 &&
     escalaDoDia(baseMeia, '2026-07-20').fim === '2026-07-21T08:00', String(duracaoMinutos(baseMeia)));
  ok('dia da base reconhecido', situacaoDoDia([base], base, '2026-07-10').estado === 'base');
  const madrugada = { id: 'x1', inicio: '2026-07-16T06:00', fim: '2026-07-16T12:00' };
  const sObre = situacaoDoDia([base, madrugada], base, '2026-07-15');
  ok('conflito com escala da manhã seguinte (vira a noite)', sObre.estado === 'ocupado' && sObre.conflitos.length === 1 &&
     sObre.motivo === 'Já existe escala neste horário.', JSON.stringify(sObre.estado));
  const igual = { id: 'x2', inicio: '2026-07-15T18:00', fim: '2026-07-16T08:00' };
  ok('duplicada conta como ocupado', situacaoDoDia([base, igual], base, '2026-07-15').estado === 'ocupado');
  const fora = situacaoDoDia([base], base, '2026-06-20');
  ok('fora da vigência', fora.estado === 'fora-vigencia' && fora.motivo === 'Data fora da vigência da Portaria.');
  const livre = situacaoDoDia([base], base, '2026-07-20');
  ok('dia livre', livre.estado === 'livre' && livre.motivo === '' && livre.conflitos.length === 0);
  const temMotivo = (r, m) => r.problemas.some((p) => p.motivo === m);
  const vazio = validarLote([base], base, []);
  ok('lote vazio recusado', !vazio.ok && temMotivo(vazio, 'Nenhum dia marcado.'));
  const muitos = Array.from({ length: 32 }, (_, i) => ({ data: `2026-08-${String((i % 31) + 1).padStart(2, '0')}` }));
  ok('limite de 31 dias', temMotivo(validarLote([base], base, muitos), 'Limite de 31 dias por lote.'));
  ok('dia repetido', temMotivo(validarLote([base], base, [{ data: '2026-07-20' }, { data: '2026-07-20' }]), 'Dia repetido.'));
  const sobreposto = validarLote([base], base, [
    { data: '2026-07-20', horario: { hora: '18:00', duracaoMin: 1500 } }, { data: '2026-07-21' }]);
  ok('dias do lote sobrepostos entre si', !sobreposto.ok && temMotivo(sobreposto, 'Sobrepõe outro dia deste lote.'));
  ok('lote válido passa', validarLote([base], base, [{ data: '2026-07-20' }, { data: '2026-07-22' }]).ok);
  ok('lote com dia ocupado falha', !validarLote([base, madrugada], base, [{ data: '2026-07-15' }]).ok);
  const geradas = gerarEscalasLote(base, [{ data: '2026-07-20' }, { data: '2026-07-22' }]);
  ok('gera 2 escalas', geradas.length === 2);
  ok('ids únicos e diferentes da base', geradas[0].id !== geradas[1].id && geradas.every((g) => g.id && g.id !== 'b1'));
  ok('copia descrição, origem e Qtd. PM; status planejada', geradas.every((g) =>
    g.descricao === 'Unidade X' && g.origem === 'AC4' && g.qtdPm === 2 && g.status === 'planejada'));
  ok('norma da data de cada escala', geradas[0].tabela && geradas[0].tabela.id === tabelaParaData('2026-07-20T18:00').id);
  ok('intervalo gerado', geradas[1].inicio === '2026-07-22T18:00' && geradas[1].fim === '2026-07-23T08:00');
  // revisão final (I1): dia com horário trocado que sobrepõe a própria escala base
  const baseNoite = { ...base, id: 'b2', inicio: '2026-07-20T19:00', fim: '2026-07-21T07:00' };
  ok('horário trocado que sobrepõe a base fica ocupado',
     situacaoDoDia([baseNoite], baseNoite, '2026-07-21', { hora: '06:00', duracaoMin: 720 }).estado === 'ocupado');
  ok('lote com dia que sobrepõe a base falha',
     !validarLote([baseNoite], baseNoite, [{ data: '2026-07-21', horario: { hora: '06:00', duracaoMin: 720 } }]).ok);
  const baseLonga = { ...base, id: 'b3', inicio: '2026-07-20T07:00', fim: '2026-07-21T08:00' };
  ok('base com mais de 24 h bloqueia o dia seguinte', situacaoDoDia([baseLonga], baseLonga, '2026-07-21').estado === 'ocupado');
  // v81: a agenda abre sozinha na 1ª escala do mês
  const { primeiraDoMes } = lote;
  const nov = { id: 'n1', inicio: '2026-11-10T18:00', fim: '2026-11-11T08:00' };
  ok('primeiraDoMes: sozinha no mês', primeiraDoMes([nov], nov) === true);
  ok('primeiraDoMes: outra no mesmo mês', primeiraDoMes([nov, { id: 'n2', inicio: '2026-11-25T07:00', fim: '2026-11-25T19:00' }], nov) === false);
  ok('primeiraDoMes: só de outro mês (término no mês não conta)', primeiraDoMes([nov, { id: 'o1', inicio: '2026-10-31T19:00', fim: '2026-11-01T07:00' }], nov) === true);
  let lancou = false;
  try { gerarEscalasLote(base, [{ data: '2026-06-20' }]); } catch { lancou = true; }
  ok('gerar fora da vigência lança erro', lancou);
  return erros.length ? erros : 'LOTE OK';
})();
rodar('Lançamento em lote', () => resultadoLote);

/* Subprojeto 4: nenhum link relativo dos documentos (.md) pode apontar para arquivo inexistente.
   Links externos (http, mailto), âncoras puras e blocos de código ficam de fora. */
const resultadoLinksDocs = (() => {
  const ignorar = new Set(['node_modules', '.git', 'artifacts', '.superpowers']);
  const listarMd = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((ent) => {
    if (ignorar.has(ent.name)) return [];
    const caminho = join(dir, ent.name);
    if (ent.isDirectory()) return listarMd(caminho);
    return ent.name.endsWith('.md') ? [caminho] : [];
  });
  const quebrados = [];
  for (const arquivo of listarMd(raiz)) {
    const texto = readFileSync(arquivo, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of texto.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const alvo = m[1].split('#')[0];
      if (!alvo || /^[a-z]+:/i.test(alvo)) continue;
      const resolvido = join(dirname(arquivo), decodeURIComponent(alvo));
      if (!existsSync(resolvido)) quebrados.push(`${arquivo.slice(raiz.length + 1)} → ${m[1]}`);
    }
  }
  return quebrados.length ? quebrados : 'LINKS DOS DOCUMENTOS OK';
})();
rodar('Links dos documentos', () => resultadoLinksDocs);

/* v82: cada evento do .ics leva um lembrete 2 h antes (VALARM), e o validador confere. */
const resultadoLembreteICS = await (async () => {
  const { montarICS, validarICS, desdobrarLinhasICS } = await import(pathToFileURL(join(raiz, 'js', 'modules', 'agenda.mjs')).href);
  const lista = [
    { id: 'a1', inicio: '2026-11-10T18:00', fim: '2026-11-11T08:00', descricao: 'Unidade X', origem: 'AC4', qtdPm: 1 },
    { id: 'a2', inicio: '2026-11-12T07:00', fim: '2026-11-12T19:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1 },
  ];
  const linhas = desdobrarLinhasICS(montarICS(lista).conteudo);
  const erros = [];
  const blocos = linhas.join('\n').split('BEGIN:VEVENT').slice(1);
  if (blocos.length !== 2) erros.push(`esperava 2 eventos, veio ${blocos.length}`);
  blocos.forEach((b, i) => {
    const alarme = /BEGIN:VALARM\n([\s\S]*?)\nEND:VALARM/.exec(b);
    if (!alarme) { erros.push(`evento ${i + 1} sem VALARM`); return; }
    ['ACTION:DISPLAY', 'TRIGGER:-PT2H'].forEach((l) => { if (!alarme[1].split('\n').includes(l)) erros.push(`evento ${i + 1}: falta ${l}`); });
    if (!/^DESCRIPTION:.+/m.test(alarme[1])) erros.push(`evento ${i + 1}: VALARM sem DESCRIPTION`);
    if (b.indexOf('BEGIN:VALARM') > b.indexOf('END:VEVENT')) erros.push(`evento ${i + 1}: VALARM fora do VEVENT`);
  });
  const v = validarICS(lista);
  if (!v.ok) erros.push(...v.falhas);
  return erros.length ? erros : 'LEMBRETE 2 H NO .ICS OK';
})();
rodar('Lembrete na agenda (.ics)', () => resultadoLembreteICS);

process.exit(falhou ? 1 : 0);
