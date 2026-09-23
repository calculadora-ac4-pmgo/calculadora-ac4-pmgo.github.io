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
  const expostos = app.split('\n')
    .filter((l) => /window\.__ac4(Testes\w*|ValidarICS|MailtoFeedback|SimularAtualizacao|LembrarBackup)\s*=/.test(l))
    .filter((l) => !l.includes('if (ambienteDeTeste)') && !/^\s{6,}/.test(l));
  return expostos.length ? expostos.map((l) => `gancho fora de ambienteDeTeste: ${l.trim()}`) : 'GANCHOS SÓ EM LOCALHOST OK';
};
rodar('Ganchos de teste restritos a localhost', validarGanchosLocais);

process.exit(falhou ? 1 : 0);
