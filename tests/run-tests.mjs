/* Runner de testes para CI — executa os testes de regressão de cálculo
   (window.__ac4Testes e __ac4TestesAgendamento) em Node, sem navegador.
   O app.js só toca o DOM dentro de funções; no carregamento bastam stubs. */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { regraNormativaParaData, TABELA_OFICIAL } from '../js/modules/calculo.mjs';
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
globalThis.location = { protocol: 'https:', origin: 'https://calculadora-ac4-pmgo.github.io' };

/* ---- carrega o app (módulo ES — os imports de js/modules/ resolvem sozinhos) ---- */
await import(pathToFileURL(join(raiz, 'js', 'app.js')).href);

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
  const versaoApp = readFileSync(join(raiz, 'js/app.js'), 'utf8').match(/const APP_VERSION = '(\d+)'/)?.[1];
  const blocoInstall = sw.slice(sw.indexOf("self.addEventListener('install'"), sw.indexOf("self.addEventListener('message'"));
  const checks = [
    [sw.includes("event.data?.type === 'SKIP_WAITING'"), 'worker aceita atualização solicitada pela interface'],
    [versaoApp && sw.includes(`const SW_VERSION = '${versaoApp}'`) && sw.includes("event.data?.type === 'GET_VERSION'"), 'worker informa sua versão antes do aviso'],
    [sw.includes('self.addEventListener(\'message\''), 'canal de mensagem registrado'],
    [!blocoInstall.includes('skipWaiting'), 'instalação não força recarga durante preenchimento'],
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

process.exit(falhou ? 1 : 0);
