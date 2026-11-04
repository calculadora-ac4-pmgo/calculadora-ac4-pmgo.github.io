# Calculadora AC4 — contexto para agentes de IA

Aplicação web estática/PWA que estima horas diurnas/noturnas e o valor do Serviço
Extraordinário AC4 (Portaria SSP nº 621/2026, Goiás). Público: policiais militares, uso
majoritário em **celular**. Produção: <https://calculadora-ac4-pmgo.github.io/> (GitHub Pages).

## Comece por aqui

1. **Backlog e estratégia:** [`docs/ESTUDO_ESTRATEGICO_v67.md`](docs/ESTUDO_ESTRATEGICO_v67.md). A seção
   *Backlog executável* lista as próximas tarefas em ordem; marque `[x]` com versão e PR ao concluir.
2. **Regras invioláveis e onboarding:** fim de [`docs/DIARIO_DE_BORDO.md`](docs/DIARIO_DE_BORDO.md).
3. **Base normativa (antes de mexer em cálculo):** [`docs/portaria-ssp-621-2026.md`](docs/portaria-ssp-621-2026.md).
4. **Design system:** [`docs/DESIGN.md`](docs/DESIGN.md). **Histórico por versão:** [`CHANGELOG.md`](CHANGELOG.md).
5. **Arquitetura e índice dos documentos:** [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) (diagrama, "onde mexer para…") e [`docs/README.md`](docs/README.md). Documentos superados ficam em `docs/historico/`; o teste "Links dos documentos" bloqueia link relativo quebrado nos `.md`.

## Arquitetura em uma tela

- Sem build, sem framework, **sem dependências em produção**. `index.html` + `css/styles.css` (**gerado**, ver abaixo) + `js/app.js` (IIFE: estado, eventos e orquestração da UI) + `js/modules/*.mjs`:
  - dados: `portarias` (fonte única das normas: valores, DOE, vigência);
  - funções puras: `calculo` (regra da Portaria), `formato`, `agenda` (.ics/links), `persistencia`, `templates` (HTML da lista), `relatorio` (PDF/CSV/texto compartilhado), `lote` (lançar em outros dias, v79);
  - `pwa` (fábrica `criarPWA(ctx)`: atualização e instalação);
  - `ui/` (v74–v75): um módulo por área da interface (`avisos`, `observabilidade`, `aparencia`, `dados`, `exportacoes`, `compartilhar`, `planejamento`, `formulario`, `modelos`, `agenda-dias`), cada um com uma fábrica `criarX(ctx)` que não toca o DOM ao ser criada. Módulos com eventos próprios expõem `ligarEventos()`, chamado pelo `init()`; ligações **entre** áreas (ex.: opções do Compartilhar que exportam ou fazem backup) ficam no `init()`. O `app.js` (~400 linhas) só tem estado, ligação, `render()` e `init()`. Estado só via o objeto `estado` do `app.js` (getters/setters). **Módulo de UI não importa outro módulo de UI**; o `app.js` cria todos no topo e repassa as dependências. Consts do `app.js` declaradas mais abaixo vão como função de chamada tardia (`calcularEscala: (e) => calcularEscala(e)`), para evitar zona morta (TDZ);
  - `testes` (suítes de regressão, **import dinâmico só em localhost**; testes aguardam `window.__ac4TestesProntos`).
  - Módulo novo? Coloque no `SHELL` do `sw.js` (o teste "Módulos no cache offline" confere).
- **CSS (desde a v76):** edite `css/src/NN-area.css` e rode `node tools/montar-css.mjs`, que junta os fontes em ordem alfabética no único `css/styles.css` publicado. Os fontes são fatias contínuas: a cascata depende da ordem, então regra nova vai no arquivo da área, e regra de celular vai em `90-responsivo.css`. O teste "CSS montado a partir de css/src" bloqueia `styles.css` editado direto ou desatualizado. `css/src/` não vai para o site (deploy.yml).
- Dados **só no aparelho** (`localStorage`, chaves `pmgo*`). Nunca coletar dados pessoais (LGPD).
- `sw.js`: network-first, atualização só com confirmação do usuário (`SKIP_WAITING` via banner).
- Não há mais limpeza forçada: o `js/force-update.js` (v65–v68) recarregava a página a cada versão sem perguntar e foi removido na v69. Caches antigos são apagados no `activate` do `sw.js`. **Não reintroduzir** (o teste "Atualização PWA" bloqueia).
- **CSP** em `index.html`: `style-src 'self'` bloqueia atributos `style="…"` em HTML injetado. Para estilo dinâmico use CSSOM (`el.style.x = …`) ou classes.

## Fluxo de trabalho obrigatório

1. Branch → commits → `npm run verify` (lint + unit + smoke + equivalência + mobile + mobile-v55 + vitals) → PR → CI verde → `gh pr merge --merge --delete-branch` → acompanhar o deploy da `main` → **conferir o site publicado** (ex.: `curl -s https://calculadora-ac4-pmgo.github.io/sw.js | sed -n 4,5p`). Não declarar concluído só com o workflow verde.
2. Mudou `index.html`, `css/` ou `js/`? **Bump de versão:** `node tools/bump-version.mjs <n>` (atualiza index, sw, app.js, `css/src/00-base.css` e package.json, e monta o `styles.css`). Versão atual: **v82** → próxima **v83**.
3. Todo bump exige **entrada nova no topo do `CHANGELOG.md`** com a mesma versão (o teste "Release" falha se não houver) e, se houver novidade para o usuário, o conteúdo do `#dialogNovidades` em `index.html` (**exatamente 3 itens** na lista; o smoke confere) **e o atributo `data-conteudo` com a versão atual** — é ele que decide se o aviso reabre sozinho (sem novidade, mantenha o valor antigo para não repetir o aviso).
4. **Equivalência da interface** (`tests/equivalencia.mjs`): compara lista, totais, planejamento, CSV, PDF, texto compartilhado e agenda com `tests/fixtures/equivalencia.json`. Mudança visual ou de texto **intencional**: `node tests/equivalencia.mjs --atualizar` e explicar a diferença no PR. Refatoração: a fotografia **não** pode mudar. Ela não cobre os textos de toast; para isso existe o teste **"Textos preservados em refatoração"** (unit), que compara todos os literais de `js/app.js` + `js/modules/ui/*.mjs` com `tests/fixtures/literais.json`. Texto alterado de propósito: `LITERAIS_ATUALIZAR=1 node tests/run-tests.mjs` e explicar no PR.
5. Os testes regeneram PNGs em `artifacts/v55/`. Não commitar isso por acidente: `git checkout -- artifacts/` antes do `git add`.
6. Mensagens de commit e PR em português, no estilo do histórico (`feat(v66): …`, `fix: …`, `ci: …`).

## Armadilhas conhecidas (aprendidas na prática)

- **Incidente v65:** o PR #58 colocou o redesign numa pasta `ac4-v65-files/` e o commit seguinte a apagou em vez de mover. O CI passou porque testava o código antigo. Hoje o teste "Release" bloqueia pastas `ac4-vNN-files/` na raiz. Arquivos novos vão **direto no lugar final**.
- **Testes com número de versão fixo quebram o deploy** a cada bump. Leia a versão de `APP_VERSION` (`js/app.js`) ou de `window.__ac4Version` no navegador.
- **Valor = só horas inteiras por faixa** (AD/AN/VD/VN), decisão do gestor na v71: fração de hora não é paga. Não voltar ao pagamento proporcional por minuto.
- **Portaria nova:** acrescentar entrada no fim de `js/modules/portarias.mjs` (nunca editar uma publicada), pôr `vigenciaFim` na anterior e atualizar a faixa `.tariff-strip` do `index.html` e a transcrição em `docs/`. O teste "Fonte única da Portaria" confere.
- **Datas de teste** precisam estar na vigência da Portaria (≥ 01/07/2026); antes disso o formulário (`validarFormulario`, via `regraNormativaParaData`) recusa a escala.
- **Toasts são enfileirados** (um por vez, ~3,8 s cada). Em testes, não espere um toast específico logo após outras ações; teste a regra pela função e o fluxo real com recarga da página.
- **Ganchos de teste** só em localhost: `window.__ac4SimularAtualizacao`, `window.__ac4LembrarBackup`, `window.__ac4Testes*`.
- **Proteção da `main` vale para admin** (desde 23/09/2026): PR obrigatório, check `test` obrigatório, branch atualizada com a `main` (`strict`), conversas resolvidas, merge commit permitido (sem exigência de histórico linear). Não há bypass: CI vermelho se resolve com correção ou `gh run rerun <id> --failed`. Para uma emergência real, o gestor desliga temporariamente em *Settings → Branches* e religa em seguida.
- **Testes de desempenho oscilam em máquina carregada.** Antes de concluir que houve regressão, compare com a `main` nas mesmas condições (ex.: `git worktree add` da `main` e rodar os dois alternadamente). O CI em runner limpo é o juiz.
- **Smoke no runner:** se falhar com "Chrome não expôs o DevTools", é infraestrutura: `gh run rerun <id> --failed`. Se o job de *deploy* do Pages falhar, usar `gh workflow run deploy.yml`.
- **`window.print()`** bloqueia a thread até o diálogo fechar: chame via `aposProximoPaint` (senão o tempo no diálogo entra no INP).
- **Mover código com troca automática de nomes corrompe textos.** Na v74, trocar `escalas` por `estado.escalas` com regex também alterou mensagens ("As estado.escalas ficam…"). Troque só referências de código e compare os literais com a versão anterior.
- **Letra nova abaixo de 12/14 px é bloqueada** pelo teste "Piso de fonte (R6)" (`tools/piso-fonte.mjs`): rótulo ≥ 12 px (`var(--fs-rotulo)`), leitura ≥ 14 px (`var(--fs-leitura)`). Texto de leitura novo entra em `tests/fixtures/fontes-leitura.json`. `@media print` fica fora. Tamanho em `em`/`%`/`calc` o verificador não avalia e acusa. Inventário em `docs/inventario-fontes-v77.md`.
- **Nunca edite `css/styles.css` direto**: ele é sobrescrito pelo `tools/montar-css.mjs`. Edite `css/src/` (v76).
- **Documentos podem estar desatualizados.** Confirme no código antes de afirmar que um recurso existe (ex.: a importação `.ics` foi removida na v48, mas `docs/historico/ESCOPO_MVP.md` ainda a cita, item R7 do backlog).
- **A 1ª escala do mês abre a agenda de lote sozinha (v81).** Teste de navegador que salva escala num mês vazio precisa fechar `#dialogLote` (`#loteFechar`) antes de seguir; com a janela aberta o resto da página fica inerte e o lembrete de backup não aparece.
- **Revisão visual é obrigatória** em mudanças de UI: capturas em 390 px e 1280 px, temas claro e escuro (o harness de `tests/mobile-v55-check.mjs` serve de base).
