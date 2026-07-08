/* ESLint (flat config) — Calculadora AC4.
   Foco em BUGS, não em estilo: pega variável/identificador não definido
   (a classe do bug do import faltante de csvTextoSeguro), no-undef,
   no-unused-vars e afins. Sem dependências no repo — o CI roda via
   `npx --yes eslint@9`. Rodar local: `npx --yes eslint@9 .`

   Globais declarados por contexto (não instalamos o pacote `globals`):
   browser para a app, service worker para sw.js, node para tests/tools. */

const BROWSER = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  location: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
  Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  console: 'readonly', matchMedia: 'readonly', Image: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', btoa: 'readonly', atob: 'readonly',
  Event: 'readonly', ErrorEvent: 'readonly', CustomEvent: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  getComputedStyle: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
};

const SERVICE_WORKER = {
  self: 'readonly', caches: 'readonly', Request: 'readonly', Response: 'readonly',
  fetch: 'readonly', URL: 'readonly', location: 'readonly', console: 'readonly',
  Promise: 'readonly', clients: 'readonly',
};

const NODE = {
  process: 'readonly', console: 'readonly', globalThis: 'writable',
  Buffer: 'readonly', __dirname: 'readonly', URL: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', WebSocket: 'readonly',
  fetch: 'readonly', btoa: 'readonly', atob: 'readonly', Event: 'readonly', ErrorEvent: 'readonly',
};

const REGRAS = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-unreachable': 'error',
  'no-cond-assign': 'error',
  'no-self-assign': 'error',
  'no-fallthrough': 'error',
  'valid-typeof': 'error',
  'use-isnan': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { ignores: ['assets/**', '_site/**', 'node_modules/**'] },
  {
    files: ['js/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: BROWSER },
    rules: REGRAS,
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: SERVICE_WORKER },
    rules: REGRAS,
  },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...NODE, ...BROWSER } },
    rules: REGRAS,
  },
];
