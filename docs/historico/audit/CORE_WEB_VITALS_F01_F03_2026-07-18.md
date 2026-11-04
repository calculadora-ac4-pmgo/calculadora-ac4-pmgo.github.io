# Auditoria Core Web Vitals — F-01, F-02 e F-03

**Data:** 18/07/2026 · **Branch:** `fix/core-web-vitals-f01-f03` · **Versão:** v56

## Contexto

O relatório de Web Analytics do Cloudflare (27/06 → 18/07/2026, bots excluídos)
mostrou o CLS como pior indicador do site: **74% bom / 20% precisa melhorar /
6% pobre**. A visão de depuração apontou `#conteudo > div.feed` com **CLS 0,651
(40 ocorrências)** — a área `#listaEscalas` "pulando" quando o JavaScript hidrata
as escalas do `localStorage`. LCP estava saudável (95% bom, P75 = 1.388 ms) e o
INP em 86% bom (tratado em follow-up, fora deste PR).

## Causa raiz

- **F-01 — renderização dupla no init.** `init()` → `carregar()` →
  `salvarConfig()` → `render()` (com o estado ainda vazio), e depois um segundo
  `render()` ao final do `init()`. O usuário via o empty-state por um instante
  antes de a lista persistida substituí-lo — a origem do shift de 0,651 no feed.
- **F-02 — primeiro paint instável.** `#listaEscalas` nascia com um comentário
  HTML; todo o conteúdo aparecia de uma vez após o JS rodar, deslocando footer
  e alerta legal (mitigado apenas parcialmente pelo `min-height: 220px`).
- **F-03 — sem gate no CI.** Nenhum teste media CLS ou interações; regressões
  de layout só apareceriam no campo, semanas depois.

## Mudanças realizadas

| Arquivo | Mudança |
|---|---|
| `js/app.js` | `salvarConfig()` não chama mais `render()` (persistência intacta); nova `revelarAplicacao()` idempotente; `init()` executa em `try/finally` no `DOMContentLoaded` — a revelação acontece mesmo com exceção. |
| `index.html` | `<html lang="pt-BR" class="app-pending">`; estado vazio estático dentro de `#listaEscalas`, idêntico ao produzido pelo `render()` (sem dados falsos). |
| `css/styles.css` | Barreira de primeiro paint: `.app-pending .layout/.site-footer/.mobile-bar { visibility: hidden }` (nunca `display:none` — o espaço do layout é preservado). Failsafe só-CSS: animação de 0s com delay de 5s revela o conteúdo se o JS jamais executar. `#listaEscalas { min-height: 220px }` preservado. |
| `tests/web-vitals-check.mjs` | Novo gate (detalhes abaixo). |
| `.github/workflows/deploy.yml` | Passo "Core Web Vitals — CLS e interações críticas" após os testes mobile; deploy segue dependendo do job `test`. |
| `index.html`, `sw.js`, `js/app.js`, `css/styles.css` | Bump v55 → v56 via `tools/bump-version.mjs` (rodapé, `?v=`, `APP_VERSION`, cache do service worker — garante que os clientes recebam a correção). |

## Arquitetura do teste (F-03)

Mesma base zero-dependências do `smoke.mjs`/`mobile-check.mjs`: servidor
`node:http`, Chrome headless, CDP puro. `PerformanceObserver` (layout-shift,
longtask, com `buffered: true`) instalado **antes** de qualquer script da página
via `Page.addScriptToEvaluateOnNewDocument`; tipos de entrada indisponíveis são
sinalizados explicitamente — a ausência de `layout-shift` reprova o CLS, nunca o
aprova por omissão. Um `MutationObserver` em `#listaEscalas` (armado no
`DOMContentLoaded`, antes do listener da aplicação) conta as reposições de
conteúdo — o gate do F-01 exige exatamente 1.

## Cenários testados e resultados (local, 18/07/2026)

| Cenário | Verificações | Resultado |
|---|---|---|
| 1 — mobile 390×844, storage vazio | app-pending removida; CLS; render único; empty-state presente; sem overflow | **CLS 0,0000** ✅ |
| 2 — mobile, 5 escalas semeadas (formato persistido real) | 5 cards + 5 linhas; total `R$ 3.452,00` idêntico ao calculado por `calcularEscala()` importado no Node; sem empty-state intermediário; render único | **CLS 0,0000** ✅ |
| 3 — interação `#mobileShare` | diálogo aberto + 2 frames em **28,9 ms** (orçamento 200 ms); maior long task **0 ms** | ✅ |
| 4 — desktop 1280×900, storage preenchido | tabela visível; `launch-panel` não-fixed; sem overflow; render único | **CLS 0,0000** ✅ |
| 5 — resiliência | sabotagem via CDP remove `#escalaInicio` antes do init → init lança TypeError → `try/finally` revela a aplicação (app-ready, sem app-pending residual) | ✅ |

Bateria completa também verde: ESLint, `run-tests.mjs` (cálculo AC4 + ICS),
`smoke.mjs` (18 passos, inclui PDF/CSV/ICS/persistência), `mobile-check.mjs`,
`mobile-v55-check.mjs` (24 verificações), `git diff --check`.

## Garantias de não regressão

- `git diff --exit-code -- js/modules/calculo.mjs js/modules/agenda.mjs` limpo —
  nenhuma regra financeira, valor da Portaria SSP nº 621/2026 ou lógica de
  agenda tocada.
- Formato do `localStorage` inalterado (mesmas chaves, mesmo shape).
- Zero dependências npm adicionadas; zero coleta de dados.
- PDF, CSV e ICS cobertos pelo smoke test, verde.

## Limitações do ambiente CI

- Chrome headless em runner é mais rápido e estável que celulares reais: o CLS
  0,0000 e os 28,9 ms de interação são medidas de laboratório, não de campo.
- `longtask` em headless raramente reproduz os 304–600 ms vistos no INP de
  campo; o orçamento de 200 ms do gate protege contra regressões grosseiras,
  não substitui RUM.
- O failsafe de 5s (JS ausente) não é exercitado pelo gate (exigiria esperar 5s
  reais); foi validado manualmente.

## Riscos residuais

- Clientes com service worker antigo podem servir o HTML velho até o SW v56
  assumir (`updateViaCache: 'none'` minimiza a janela).
- Shifts menores seguem sem tratamento neste PR: `header.topbar::after`
  (CLS 0,126 · 40x) e `section.launch-panel` (0,13 · 10x) — candidatos ao
  follow-up F-04, junto com o INP de `#btnSubmit` (304 ms), `#btnShare` (600 ms)
  e `#mobileAdd` (240 ms).

## Recomendação

Após o merge e deploy, **aguardar nova janela de 1–2 semanas do Cloudflare Web
Analytics** antes de declarar melhora nas métricas de campo. Este documento não
afirma melhora real de RUM — apenas as medidas de laboratório acima.

## Comandos executados

```
npx --yes eslint@9 .
node tests/run-tests.mjs
node tests/smoke.mjs
node tests/mobile-check.mjs
node tests/mobile-v55-check.mjs
node tests/web-vitals-check.mjs
git diff --check
git diff --exit-code -- js/modules/calculo.mjs
git diff --exit-code -- js/modules/agenda.mjs
node tools/bump-version.mjs 56
```
