/* Monta css/styles.css a partir de css/src/*.css (ordem alfabética, sem
   separador). Os fontes são fatias contínuas do CSS: a cascata depende da
   ordem, por isso os nomes começam com número (00-base, 05-pwa, …).
   Uso:
     node tools/montar-css.mjs              grava css/styles.css
     node tools/montar-css.mjs --verificar  sai com 1 se estiver desatualizado
   Nunca edite css/styles.css direto: o teste "CSS montado a partir de
   css/src" bloqueia a diferença. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Junta os fontes de css/src/ na ordem dos nomes.
 * @param {string} raiz Raiz do repositório.
 * @returns {string} Conteúdo de css/styles.css.
 */
export function montarCSS(raiz) {
  const dir = join(raiz, 'css', 'src');
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.css')).sort();
  if (!arquivos.length) throw new Error('css/src/ sem arquivos .css');
  return arquivos.map((f) => readFileSync(join(dir, f), 'utf8')).join('');
}

const executadoDireto = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (executadoDireto) {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const destino = join(raiz, 'css', 'styles.css');
  const montado = montarCSS(raiz);
  if (process.argv.includes('--verificar')) {
    const igual = readFileSync(destino, 'utf8') === montado;
    console.log(igual ? 'CSS montado em dia' : 'css/styles.css diferente de css/src/ — rode node tools/montar-css.mjs');
    process.exit(igual ? 0 : 1);
  }
  writeFileSync(destino, montado);
  console.log('montado: css/styles.css');
}
