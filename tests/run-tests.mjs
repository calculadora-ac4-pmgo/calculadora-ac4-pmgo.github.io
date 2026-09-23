/* Runner de testes para CI — executa os testes de regressão de cálculo
   (window.__ac4Testes e __ac4TestesAgendamento) em Node, sem navegador.
   O app.js só toca o DOM dentro de funções; no carregamento bastam stubs. */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { calcularEscala, regraNormativaParaData, TABELA_OFICIAL } from '../js/modules/calculo.mjs';
import { desserializarEscalas, detectarConflitos, normalizarEscala, STORAGE_SCHEMA_VERSION } from '../js/modules/persistencia.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

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
   - só horas inteiras por faixa (decisão do gestor, v71). */
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
      [`${NOMES[d]} 08h→20h40 (fração não paga)`, dia(d, 8), dia(d, 20, 40), 12 * ANEXO.diurno[d]],
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
  const modulos = readdirSync(join(raiz, 'js', 'modules'))
    .filter((f) => f.endsWith('.mjs') && f !== 'testes.mjs')
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
  const faltando = readdirSync(join(raiz, 'js', 'modules'))
    .filter((f) => f.endsWith('.mjs') && !soTeste.has(f))
    .filter((f) => !sw.includes(`'./js/modules/${f}'`));
  return faltando.length ? faltando.map((f) => `fora do SHELL do sw.js: js/modules/${f}`) : 'MÓDULOS NO SHELL OK';
};
rodar('Módulos no cache offline do Service Worker', validarShellModulos);

/* Módulos puros extraídos do app.js (P3-2): templates e exportações. */
const { botoesAcaoHTML, cardEscalaHTML } = await import('../js/modules/templates.mjs');
const { montarCSV, montarRelatorioImpressao, montarTextoResumo } = await import('../js/modules/relatorio.mjs');
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
    [resumoHTML.includes('R$') && resumoHTML.includes('960,00'), 'PDF: resumo com o valor total'],
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

process.exit(falhou ? 1 : 0);
