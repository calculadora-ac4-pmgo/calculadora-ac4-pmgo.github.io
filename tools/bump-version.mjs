/* Atualiza o número de versão em todos os pontos do projeto de uma vez.
   Uso: node tools/bump-version.mjs 28 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { montarCSS } from './montar-css.mjs';

const nova = process.argv[2];
if (!/^\d+$/.test(nova || '')) {
  console.error('Uso: node tools/bump-version.mjs <número>   (ex.: 28)');
  process.exit(1);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const alvos = [
  { arquivo: 'index.html',     regras: [[/\?v=\d+/g, `?v=${nova}`], [/v\d+ &middot;/g, `v${nova} &middot;`], [/Nova versão <strong>v\d+<\/strong>/g, `Nova versão <strong>v${nova}</strong>`]] },
  { arquivo: 'sw.js',          regras: [[/ac4-v\d+/g, `ac4-v${nova}`], [/const SW_VERSION = '\d+'/g, `const SW_VERSION = '${nova}'`], [/\?v=\d+/g, `?v=${nova}`]] },
  { arquivo: 'js/app.js',      regras: [[/Calculadora AC4 — v\d+/g, `Calculadora AC4 — v${nova}`], [/const APP_VERSION = '\d+'/g, `const APP_VERSION = '${nova}'`]] },
  /* CSS: a versão vai no fonte; css/styles.css é montado no fim (v76). */
  { arquivo: 'css/src/00-base.css', regras: [[/Calculadora AC4 — v\d+/g, `Calculadora AC4 — v${nova}`]] },
  { arquivo: 'package.json',   regras: [[/"version": "\d+\.0\.0"/g, `"version": "${nova}.0.0"`]] },
];

alvos.forEach(({ arquivo, regras }) => {
  const caminho = join(raiz, arquivo);
  let conteudo = readFileSync(caminho, 'utf8');
  let mudou = false;
  regras.forEach(([re, sub]) => {
    const novo = conteudo.replace(re, sub);
    if (novo !== conteudo) { conteudo = novo; mudou = true; }
  });
  writeFileSync(caminho, conteudo);
  console.log(`${mudou ? 'atualizado' : 'sem mudança'}: ${arquivo}`);
});

writeFileSync(join(raiz, 'css', 'styles.css'), montarCSS(raiz));
console.log('montado: css/styles.css');

console.log(`\nVersão v${nova} aplicada. Confira com: git diff`);
