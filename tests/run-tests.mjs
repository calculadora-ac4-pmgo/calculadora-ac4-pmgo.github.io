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
  planejamento: ['atualizarSelectMes', 'renderPlanejamento', 'renderHistorico', 'mesPainelAtual', 'abrirMetaMensal', 'salvarMetaMensal', 'removerMetaMensal', 'ligarEventos'],
};
const resultadoModulosUI = await (async () => {
  const app = readFileSync(join(raiz, 'js', 'app.js'), 'utf8');
  const falhas = [];
  const ctxVazio = new Proxy({}, { get: () => () => {} });
  for (const [nome, chaves] of Object.entries(MODULOS_UI)) {
    let mod;
    try { mod = await import(pathToFileURL(join(raiz, 'js', 'modules', 'ui', `${nome}.mjs`)).href); } catch { falhas.push(`${nome}: módulo ausente`); continue; }
    const fabrica = mod[`criar${nome[0].toUpperCase()}${nome.slice(1)}`];
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

process.exit(falhou ? 1 : 0);
