/* Verificador do piso de fonte (v77, R6).
   Lê css/src/*.css, ignora comentários e @media print e confere, para cada
   regra com font-size (ou a abreviação font:):
     - rótulo  ≥ 0,75 rem (12 px)  — padrão;
     - leitura ≥ 0,875 rem (14 px) — seletores listados em
       tests/fixtures/fontes-leitura.json ("leitura").
   Tamanho que não dá para avaliar (em, %, calc, palavra-chave…) é acusado,
   salvo seletor listado em "naoAvaliaveisAceitos" (justificado no inventário
   docs/inventario-fontes-v77.md).
   Uso:
     node tools/piso-fonte.mjs [arquivo.css …]   sai com 1 se houver falha */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, resolve } from 'node:path';

const PX_ROTULO = 12;
const PX_LEITURA = 14;

/** Troca comentários por espaços/quebras de linha, preservando as posições. */
function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Percorre o CSS e devolve as regras de estilo que valem para a tela.
 * Cada regra: { seletor, corpo, linha, ctx }. `ctx` é a pilha de at-rules.
 * Blocos `@media print`, `@keyframes` e `@font-face` não entram.
 */
export function regrasDeTela(css) {
  const txt = semComentarios(css);
  const regras = [];
  const pilha = []; // { tipo: 'at'|'regra', cabecalho, ignorar }
  let inicio = 0; // início do cabeçalho corrente
  let linha = 1;
  let linhaInicio = 1;
  let corpoInicio = 0;
  const ignorando = () => pilha.some((p) => p.ignorar);
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '\n') linha++;
    if (c === '{') {
      const cab = txt.slice(inicio, i).trim();
      const linhaCab = linhaInicio + (txt.slice(inicio, i).match(/^\s*/)[0].match(/\n/g) || []).length;
      if (cab.startsWith('@')) {
        const at = cab.toLowerCase();
        const ignorar = /^@media[^{]*\bprint\b/.test(at) || at.startsWith('@keyframes') || at.startsWith('@font-face');
        pilha.push({ tipo: 'at', cabecalho: cab, ignorar });
      } else {
        pilha.push({ tipo: 'regra', cabecalho: cab, linha: linhaCab });
        corpoInicio = i + 1;
      }
      inicio = i + 1;
      linhaInicio = linha;
    } else if (c === '}') {
      const topo = pilha.pop();
      if (topo && topo.tipo === 'regra' && !ignorando() && !topo.ignorar) {
        regras.push({
          seletor: topo.cabecalho.replace(/\s+/g, ' '),
          corpo: txt.slice(corpoInicio, i),
          linha: topo.linha,
          ctx: pilha.map((p) => p.cabecalho),
        });
      }
      inicio = i + 1;
      linhaInicio = linha;
    } else if (c === ';' && pilha.length === 0) {
      inicio = i + 1; // @import / @charset
      linhaInicio = linha;
    }
  }
  return regras;
}

/** Valores simples (`--x: 0.75rem`) declarados em :root, para resolver var(). */
function variaveisRaiz(regras) {
  const vars = {};
  for (const r of regras) {
    if (!/(^|,)\s*:root\s*(,|$)/.test(r.seletor)) continue;
    for (const m of r.corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

/**
 * Converte um valor de tamanho em px. Devolve `null` quando não dá para avaliar.
 * Aceita rem/px/pt, var(--x) simples e clamp()/max() pelo menor argumento
 * (o piso do clamp é o primeiro argumento).
 */
export function paraPx(valor, vars = {}, profundidade = 0) {
  const v = String(valor).trim().replace(/\s*!important$/i, '');
  if (profundidade > 5) return null;
  let m = /^(-?\d*\.?\d+)(rem|px|pt)$/.exec(v);
  if (m) {
    const n = parseFloat(m[1]);
    return m[2] === 'rem' ? n * 16 : m[2] === 'pt' ? (n * 4) / 3 : n;
  }
  if (/^0+(\.0+)?$/.test(v)) return 0;
  m = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(v);
  if (m) return vars[m[1]] !== undefined ? paraPx(vars[m[1]], vars, profundidade + 1) : null;
  m = /^clamp\(\s*([^,]+),/.exec(v);
  if (m && /\)$/.test(v)) return paraPx(m[1], vars, profundidade + 1);
  return null;
}

/** Extrai o tamanho da abreviação `font:` (primeiro token com unidade, antes de `/`). */
function tamanhoDaAbreviacao(valor) {
  if (/^(inherit|initial|unset|revert)$/i.test(valor.trim())) return { semTamanho: true };
  const m = /(?:^|\s)(-?\d*\.?\d+(?:rem|px|pt|em|%))(?:\s*\/[^\s]+)?(?=\s)/.exec(valor);
  return m ? { valor: m[1] } : { naoAvaliavel: true };
}

/** Declarações de tamanho de uma regra: [{ propriedade, valor }]. */
function tamanhosDaRegra(corpo) {
  const saida = [];
  for (const m of corpo.matchAll(/(?:^|[;{\s])(font-size|font)\s*:\s*([^;}]+)/g)) {
    saida.push({ propriedade: m[1], valor: m[2].trim() });
  }
  return saida;
}

const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Um seletor de regra é de leitura quando QUALQUER parte dele (grupo separado por vírgula,
 * composto, com pseudo-classe/elemento) usa um seletor da lista de leitura como unidade
 * inteira. Assim `.launch-panel .field-hint`, `.field-hint, .x` e `.field-hint:hover` não
 * escapam do mínimo de 14 px. `.field-hint-x` não conta (outro nome).
 */
export function ehSeletorLeitura(seletor, leitura) {
  const partes = seletor.split(',').map((p) => p.trim().replace(/\s+/g, ' '));
  for (const entrada of leitura) {
    const re = new RegExp(`(^|[\\s>+~])${escaparRegex(entrada)}(?![\\w-])`);
    /* Pseudo-elemento (::before/::after) é outro texto (ex.: o rótulo da célula no
       celular): só conta se o seletor for exatamente o da lista. */
    if (partes.some((p) => (p.includes('::') ? p === entrada : re.test(p)))) return true;
  }
  return false;
}

function carregarFixture(raiz) {
  const f = join(raiz, 'tests', 'fixtures', 'fontes-leitura.json');
  const dados = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  return {
    leitura: new Set(dados.leitura || []),
    aceitos: new Set(dados.naoAvaliaveisAceitos || []),
  };
}

/** Lista de todas as regras abaixo de 14 px (para o inventário). */
export function avaliarRegras(raiz, { arquivos } = {}) {
  const dir = join(raiz, 'css', 'src');
  const nomes = (arquivos && arquivos.length
    ? arquivos.map((a) => basename(a))
    : readdirSync(dir).filter((f) => f.endsWith('.css')).sort());
  const todas = nomes.map((n) => ({ arquivo: n, regras: regrasDeTela(readFileSync(join(dir, n), 'utf8')) }));
  // As variáveis valem para o projeto inteiro: sempre lidas de todos os fontes.
  const vars = variaveisRaiz(readdirSync(dir).filter((f) => f.endsWith('.css')).sort()
    .flatMap((n) => regrasDeTela(readFileSync(join(dir, n), 'utf8'))));
  const { leitura, aceitos } = carregarFixture(raiz);
  const itens = [];
  for (const { arquivo, regras } of todas) {
    for (const r of regras) {
      for (const t of tamanhosDaRegra(r.corpo)) {
        let valor = t.valor;
        if (t.propriedade === 'font') {
          const a = tamanhoDaAbreviacao(t.valor);
          if (a.semTamanho) continue;
          if (a.naoAvaliavel) { itens.push({ arquivo, linha: r.linha, seletor: r.seletor, valor: t.valor, px: null, ehLeitura: ehSeletorLeitura(r.seletor, leitura), aceito: aceitos.has(r.seletor) }); continue; }
          valor = a.valor;
        }
        if (/^(inherit|initial|unset|revert)$/i.test(valor)) continue; // não define tamanho novo
        itens.push({ arquivo, linha: r.linha, seletor: r.seletor, valor, px: paraPx(valor, vars), ehLeitura: ehSeletorLeitura(r.seletor, leitura), aceito: aceitos.has(r.seletor) });
      }
    }
  }
  return itens;
}

/**
 * @param {string} raiz Raiz do repositório.
 * @param {{arquivos?: string[]}} [opcoes] Restringe aos arquivos de css/src (nomes ou caminhos).
 * @returns {{falhas: string[], avaliadas: number}}
 */
export function verificarPiso(raiz, { arquivos } = {}) {
  const itens = avaliarRegras(raiz, { arquivos });
  const falhas = [];
  /* Lista obsoleta: seletor que não existe mais no CSS deixaria o texto sem proteção.
     Só confere com todos os fontes (com `arquivos` a lista não é a visão completa). */
  if (!arquivos || !arquivos.length) {
    const { leitura, aceitos } = carregarFixture(raiz);
    for (const entrada of leitura) {
      if (!itens.some((it) => ehSeletorLeitura(it.seletor, [entrada]))) {
        falhas.push(`fontes-leitura.json: "${entrada}" obsoleto — nenhuma regra de tela com font-size usa esse seletor`);
      }
    }
    for (const entrada of aceitos) {
      if (!itens.some((it) => it.seletor === entrada)) {
        falhas.push(`fontes-leitura.json: naoAvaliaveisAceitos "${entrada}" obsoleto — nenhuma regra com esse seletor`);
      }
    }
  }
  for (const it of itens) {
    const onde = `${it.arquivo}:${it.linha} ${it.seletor}`;
    if (it.px === null) {
      if (!it.aceito) falhas.push(`${onde} — valor não avaliável: ${it.valor}`);
      continue;
    }
    if (it.px === 0) continue; // font-size: 0 (texto escondido de propósito)
    const min = it.ehLeitura ? PX_LEITURA : PX_ROTULO;
    if (it.px < min) {
      falhas.push(`${onde} — ${it.valor} = ${+it.px.toFixed(2)}px (mínimo ${min}px por ser ${it.ehLeitura ? 'leitura' : 'rótulo'})`);
    }
  }
  return { falhas, avaliadas: itens.length };
}

/* CLI */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const arquivos = process.argv.slice(2);
  const { falhas, avaliadas } = verificarPiso(raiz, { arquivos });
  if (falhas.length) {
    console.error(`FALHA: ${falhas.length} regra(s) abaixo do piso (de ${avaliadas} avaliadas)`);
    for (const f of falhas) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`OK: ${avaliadas} regras avaliadas, nenhuma abaixo do piso`);
}
