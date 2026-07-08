/* Atualiza o número de versão em todos os pontos do projeto de uma vez.
   Uso: node tools/bump-version.mjs 28 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const nova = process.argv[2];
if (!/^\d+$/.test(nova || '')) {
  console.error('Uso: node tools/bump-version.mjs <número>   (ex.: 28)');
  process.exit(1);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const alvos = [
  { arquivo: 'index.html',     regras: [[/\?v=\d+/g, `?v=${nova}`], [/v\d+ &middot;/g, `v${nova} &middot;`]] },
  { arquivo: 'sw.js',          regras: [[/ac4-v\d+/g, `ac4-v${nova}`], [/\?v=\d+/g, `?v=${nova}`]] },
  { arquivo: 'js/app.js',      regras: [[/Calculadora AC4 — v\d+/g, `Calculadora AC4 — v${nova}`], [/const APP_VERSION = '\d+'/g, `const APP_VERSION = '${nova}'`]] },
  { arquivo: 'css/styles.css', regras: [[/Calculadora AC4 — v\d+/g, `Calculadora AC4 — v${nova}`]] },
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

console.log(`\nVersão v${nova} aplicada. Confira com: git diff`);
