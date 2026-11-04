/* Equivalência da interface ("fotografia") — abre o app real em Chrome headless
   com 20 escalas fixas e compara tudo o que o policial vê ou recebe (lista,
   totais, planejamento, CSV, PDF, texto compartilhado, agenda .ics e links)
   com a referência em tests/fixtures/equivalencia.json.

   Uso:
     node tests/equivalencia.mjs              compara com a referência
     node tests/equivalencia.mjs --atualizar  regrava a referência (mudança intencional;
                                              a diferença aparece no PR)
   Criado na v74 para provar que refatorações não mudam a interface. */
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { raiz, iniciarServidor, acharChrome, lancarChrome, conectarCDP } from './lib/navegador.mjs';

const ARQ_REFERENCIA = join(raiz, 'tests', 'fixtures', 'equivalencia.json');
const atualizar = process.argv.includes('--atualizar');
const { TABELA_OFICIAL } = await import(pathToFileURL(join(raiz, 'js', 'modules', 'calculo.mjs')).href);

/* ------------------------------------------------ 20 escalas fixas
   jul–ago/2026; azul e vermelha; diurno, noturno, madrugada e virada de dia;
   1 e 3 PMs; várias origens; as 4 situações; textos com acento e com HTML. */
const BASE = [
  ['2026-07-06T07:00', '2026-07-06T19:00', 'Batalhão Centro', 'AC4', 1, 'recebida'],
  ['2026-07-07T19:00', '2026-07-08T07:00', 'Operação Noturna', 'AC4', 1, 'conferida'],
  ['2026-07-09T18:00', '2026-07-10T05:00', 'Virada quinta→sexta', 'PREFEITURAS', 3, 'realizada'],
  ['2026-07-10T08:00', '2026-07-10T18:20', 'Fração não paga', 'AC4', 1, 'planejada'],
  ['2026-07-11T22:00', '2026-07-12T06:00', 'Madrugada sábado', 'CONVENIO_TRE', 1, 'recebida'],
  ['2026-07-12T06:00', '2026-07-12T18:00', 'Domingo diurno', 'DETRAN', 3, 'conferida'],
  ['2026-07-13T04:00', '2026-07-13T06:00', 'Madrugada segunda', 'AC4', 1, 'realizada'],
  ['2026-07-15T13:00', '2026-07-16T13:00', 'Plantão 24h', 'AC4', 1, 'planejada'],
  ['2026-07-17T20:00', '2026-07-18T08:00', 'Unidade <b>Especial</b>', 'PREFEITURAS', 1, 'recebida'],
  ['2026-07-24T07:00', '2026-07-24T21:00', 'Evento Águas Quentes', 'CONVENIO_TRE', 3, 'conferida'],
  ['2026-08-03T07:00', '2026-08-03T19:00', 'Batalhão Centro', 'AC4', 1, 'planejada'],
  ['2026-08-04T19:00', '2026-08-05T07:00', 'Operação Noturna', 'DETRAN', 1, 'realizada'],
  ['2026-08-06T18:00', '2026-08-07T08:00', 'Quinta 18h → sexta 8h', 'AC4', 1, 'conferida'],
  ['2026-08-07T08:00', '2026-08-07T20:00', 'Sexta diurno', 'PREFEITURAS', 3, 'recebida'],
  ['2026-08-08T22:00', '2026-08-09T05:00', 'Sábado noturno', 'AC4', 1, 'planejada'],
  ['2026-08-09T05:00', '2026-08-09T17:00', 'Domingo cedo', 'CONVENIO_TRE', 1, 'realizada'],
  ['2026-08-12T10:00', '2026-08-12T14:30', 'Meio período', 'AC4', 1, 'conferida'],
  ['2026-08-14T14:00', '2026-08-15T14:00', 'Plantão 24h sexta', 'DETRAN', 3, 'recebida'],
  ['2026-08-20T21:00', '2026-08-21T03:00', 'Ronda escolar', 'AC4', 1, 'planejada'],
  ['2026-08-28T06:00', '2026-08-28T22:00', 'Escala Açaí & Café', 'PREFEITURAS', 1, 'realizada'],
];
const ESCALAS = BASE.map(([inicio, fim, descricao, origem, qtdPm, status], i) => ({
  id: `eq-${String(i + 1).padStart(2, '0')}`, inicio, fim, descricao, origem, qtdPm, status, tabela: TABELA_OFICIAL,
}));
const METAS = { '2026-08': { valorCentavos: 500000, horas: 120 } };
const VIEWPORTS = [
  { nome: '390', width: 390, height: 844, mobile: true, deviceScaleFactor: 2 },
  { nome: '1280', width: 1280, height: 900, mobile: false, deviceScaleFactor: 1 },
];

/* ------------------------------------------------ roteiro executado na página */
async function roteiro() {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  for (let i = 0; i < 80 && !(document.documentElement.classList.contains('app-ready') && $('listaEscalas')); i++) await espera(100);
  await espera(300);

  const blobs = [];
  const criarURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { blobs.push(b); return criarURL(b); };
  const copiados = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copiados.push(t); } } });
  window.print = () => {};
  window.open = () => null;

  const out = {};
  const secao = (id) => $(id)?.closest('section')?.innerHTML ?? '';
  const coletarTela = (prefixo) => {
    out[`${prefixo}/lista`] = $('listaEscalas')?.innerHTML ?? '';
    out[`${prefixo}/totais`] = secao('totValor');
    out[`${prefixo}/planejamento`] = secao('planningTitle');
  };

  coletarTela('A');

  $('btnExportCsv').click();
  await espera(150);
  out.csv = blobs.length ? await blobs.at(-1).text() : '';

  $('sharePdfOpt').click();
  await espera(300);
  out.pdf = $('printReport')?.innerHTML ?? '';

  $('shareCopy').click();
  await espera(300);
  out.textoCompartilhado = copiados.at(-1) ?? '';

  for (const prov of ['google', 'outlook']) {
    $('shareIcsOpt').click();
    await espera(150);
    document.querySelector(`#agendaBody [data-prov="${prov}"]`)?.click();
    await espera(150);
    out[`agenda/${prov}`] = $('agendaBody')?.innerHTML ?? '';
    $('dialogAgenda')?.close();
  }
  $('shareIcsOpt').click();
  await espera(150);
  out['agenda/opcoes'] = $('agendaBody')?.innerHTML ?? '';
  const antes = blobs.length;
  document.querySelector('#agendaBody [data-prov="ics"]')?.click();
  await espera(300);
  out.ics = blobs.length > antes ? await blobs.at(-1).text() : '';

  const filtro = $('filtroMes');
  filtro.value = '2026-08';
  filtro.dispatchEvent(new Event('change', { bubbles: true }));
  await espera(300);
  coletarTela('B');

  return JSON.stringify(out);
}

/* ------------------------------------------------ normalização */
const normalizar = (chave, valor) => {
  let v = String(valor);
  if (chave.endsWith('pdf')) v = v.replace(/(<strong id="prDate">)[^<]*(<\/strong>)/, '$1«emissão»$2');
  if (chave.endsWith('ics')) v = v.replace(/^DTSTAMP:.*$/gm, 'DTSTAMP:«agora»');
  v = v.replace(/((?:class="footer-year"|id="printYear")[^>]*>)\d{4}/g, '$1«ano»');
  return v;
};

/* ------------------------------------------------ execução */
const servidor = await iniciarServidor();
const porta = servidor.address().port;
const perfil = await mkdtemp(join(tmpdir(), 'ac4-equiv-'));
let chrome;
let falhou = false;

try {
  chrome = await lancarChrome(acharChrome(), perfil);
  const cdp = await conectarCDP(chrome.wsUrl);
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  await cdp.enviar('Page.enable', {}, sessionId);
  await cdp.enviar('Runtime.enable', {}, sessionId);
  const navegar = async () => {
    const carregou = cdp.aguardarEvento('Page.loadEventFired');
    await cdp.enviar('Page.navigate', { url: `http://127.0.0.1:${porta}/` }, sessionId);
    await carregou;
  };
  const avaliar = async (expression) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`Erro na página: ${JSON.stringify(r.exceptionDetails, null, 2)}`);
    return r.result.value;
  };

  const capturas = {};
  for (const vp of VIEWPORTS) {
    await cdp.enviar('Emulation.setDeviceMetricsOverride',
      { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile }, sessionId);
    await navegar();
    await avaliar(`(() => {
      localStorage.clear();
      localStorage.setItem('pmgoEscalas', ${JSON.stringify(JSON.stringify(ESCALAS))});
      localStorage.setItem('pmgoMetasMensais', ${JSON.stringify(JSON.stringify(METAS))});
      localStorage.setItem('pmgoVersion', String(window.__ac4Version));
      localStorage.setItem('pmgoNovidadesVistas', document.getElementById('dialogNovidades').dataset.conteudo);
      localStorage.setItem('pmgoUltimoBackup', String(Date.now()));
      localStorage.setItem('pmgoPwaBanner', 'dispensado');
    })()`);
    await navegar();
    const dados = JSON.parse(await avaliar(`(${roteiro.toString()})()`));
    Object.entries(dados).forEach(([k, v]) => { capturas[`${vp.nome}/${k}`] = normalizar(k, v); });
  }

  const vazias = Object.entries(capturas).filter(([, v]) => !v.trim()).map(([k]) => k);
  if (vazias.length) {
    console.error(`FALHA: capturas vazias — ${vazias.join(', ')}`);
    falhou = true;
  } else if (atualizar) {
    await writeFile(ARQ_REFERENCIA, `${JSON.stringify(capturas, null, 1)}\n`);
    console.log(`Referência regravada: ${Object.keys(capturas).length} capturas em tests/fixtures/equivalencia.json`);
  } else {
    const ref = JSON.parse(await readFile(ARQ_REFERENCIA, 'utf8'));
    const chaves = [...new Set([...Object.keys(ref), ...Object.keys(capturas)])].sort();
    const diferentes = chaves.filter((k) => ref[k] !== capturas[k]);
    diferentes.forEach((k) => {
      const a = ref[k] ?? '«ausente»', b = capturas[k] ?? '«ausente»';
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      console.error(`DIFERENÇA: ${k}\n  referência: …${a.slice(Math.max(0, i - 40), i + 160)}\n  atual:      …${b.slice(Math.max(0, i - 40), i + 160)}`);
    });
    if (diferentes.length) {
      console.error(`\nEQUIVALÊNCIA FALHOU — ${diferentes.length} de ${chaves.length} capturas diferentes.`);
      falhou = true;
    } else {
      console.log(`EQUIVALÊNCIA OK — ${chaves.length} capturas idênticas.`);
    }
  }
  cdp.fechar();
} catch (erro) {
  console.error(erro);
  falhou = true;
} finally {
  chrome?.proc.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
process.exit(falhou ? 1 : 0);
