# Lançar em outros dias (agenda de lote) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A partir de uma escala lançada, marcar dias num calendário e lançar todas as escalas de uma vez, com o mesmo horário (ou um horário trocado por dia), sem duplicar nem sobrepor.

**Architecture:** Regra pura em `js/modules/lote.mjs` (sem DOM, testada no `run-tests`). Interface em `js/modules/ui/agenda-dias.mjs` (fábrica `criarAgendaDias(ctx)`, um `<dialog id="dialogLote">` no `index.html`). Entradas: item `data-acao="lote"` no menu da escala e ação no toast "Escala adicionada.".

**Tech Stack:** HTML/CSS/JS ES modules sem build e sem dependências; testes Node + Chrome headless do próprio repo.

**Spec:** `docs/superpowers/specs/2026-11-04-agenda-lote-design.md`

## Global Constraints

- Sem dependências em produção; sem framework; ES modules.
- CSP `style-src 'self'`: nada de `style="…"` em HTML injetado; dados do usuário só via `textContent`.
- Módulo de UI não importa outro módulo de UI; dependências chegam por `ctx`, criado no `app.js`; funções definidas mais abaixo vão como chamada tardia (`abrirLote: (id) => agendaDias.abrir(id)`).
- Módulo novo entra no `SHELL` do `sw.js` (teste "Módulos no cache offline").
- CSS só em `css/src/` (janela em `40-dialogos.css`, celular em `90-responsivo.css`) + `node tools/montar-css.mjs`. Letra: dias e lista `var(--fs-leitura)`, rótulos `var(--fs-rotulo)`; textos de leitura novos em `tests/fixtures/fontes-leitura.json`. Alvos de toque ≥ 44 px.
- `LIMITE_LOTE = 31`. Navegação: até 3 meses antes e depois do mês da base. Grade seg–dom.
- Novas escalas: `status: 'planejada'`, `tabela: tabelaParaData(inicio)`, id de `gerarIdEscala()`; copiam `descricao`, `origem`, `qtdPm` da base.
- Datas de teste ≥ 01/07/2026 (vigência). Versão: v79, próxima v80.
- Textos exatos: item de menu e ação do toast **"Lançar em outros dias"**; contador **"N dias marcados"** (1 → "1 dia marcado"); botões **"Revisar"**, **"Lançar N escalas"** (1 → "Lançar 1 escala"); toast final **"N escalas lançadas."** (1 → "1 escala lançada.") com ação **"Desfazer"**.
- Commits em português (`feat(v79): …`), terminando com:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01WWKg8Ctf5wyYRu8oa8fnbt`.
- `git checkout -- artifacts/` antes de cada `git add`. Antes de rodar testes de navegador: `pkill -f "[c]hrome.*user-data-dir=/tmp/ac4"` (Chromes antigos causam falhas falsas).

## Review Focus

1. **Toque duplo em "Lançar"** — deve lançar uma vez só (botão desativado durante o lançamento). Teste no Task 3.
2. **Base com duração não inteira** (ex.: 18:30 → 08:00, 13h30) — as escalas geradas mantêm exatamente 810 min. Teste no Task 1.
3. **Mês que começa no domingo** (nov/2026 começa num domingo) — o dia 1 cai na 7ª coluna, sem dia deslocado. Teste no Task 2.
4. **Desfazer depois de editar uma das escalas lançadas** — remove só os ids do lote que ainda existem, sem mexer nas outras. Teste no Task 3.
5. **Abrir a agenda com o formulário em modo edição** — não altera a edição em curso nem a escala base. Teste no Task 2.

---

### Task 1: Regra do lote (`js/modules/lote.mjs`)

**Files:**
- Create: `js/modules/lote.mjs`
- Modify: `sw.js` (SHELL: `'./js/modules/lote.mjs'`)
- Test: `tests/run-tests.mjs` (nova suíte, depois de "Piso de fonte: casos de borda do verificador")

**Interfaces:**
- Consumes: `detectarConflitos(lista, candidata, ignorarId)`, `gerarIdEscala()` (persistencia); `tabelaParaData(valor)` (calculo); `parseDateTimeLocal`, `toInputLocal` (formato).
- Produces:
  - `export const LIMITE_LOTE = 31`
  - `export function duracaoMinutos(base): number`
  - `export function escalaDoDia(base, data, horario?): {inicio:string, fim:string}` — `data` `'YYYY-MM-DD'`; `horario` `{hora:'HH:mm', duracaoMin:number}`.
  - `export function situacaoDoDia(escalas, base, data, horario?): {estado:'livre'|'ocupado'|'fora-vigencia'|'base', motivo:string, conflitos:Object[]}` — `motivo` vazio quando livre; ocupado: `"Já existe escala neste horário."`; fora: `"Data fora da vigência da Portaria."`; base: `"Escala de origem."`.
  - `export function validarLote(escalas, base, dias): {ok:boolean, problemas:{data:string, motivo:string}[]}` — `dias` `[{data, horario?}]`. Motivos extras: `"Nenhum dia marcado."` (data `''`), `"Limite de 31 dias por lote."` (data `''`), `"Dia repetido."`, `"Sobrepõe outro dia deste lote."`.
  - `export function gerarEscalasLote(base, dias): Object[]` — lança `Error('fora-vigencia')` se algum dia não tiver norma.

- [ ] **Step 1: Escrever a suíte (falhando)**

`rodar('Lançamento em lote', () => …)` importando `lote.mjs` com `await import(pathToFileURL(join(raiz,'js','modules','lote.mjs')).href)` antes, no estilo das suítes v77. Devolve `'LOTE OK'` ou o array de falhas. Base: `{id:'b1', inicio:'2026-07-10T18:00', fim:'2026-07-11T08:00', descricao:'Unidade X', origem:'AC4', qtdPm:2, status:'realizada', tabela:{…}}`. Asserções:
- `escalaDoDia(base,'2026-07-15')` → `{inicio:'2026-07-15T18:00', fim:'2026-07-16T08:00'}`.
- `escalaDoDia(base,'2026-07-15',{hora:'07:00',duracaoMin:720})` → `{inicio:'2026-07-15T07:00', fim:'2026-07-15T19:00'}`.
- Base 18:30 → 08:00: `duracaoMinutos` = 810 e `escalaDoDia(...,'2026-07-20').fim === '2026-07-21T08:00'` (Review Focus 2).
- `situacaoDoDia([base], base, '2026-07-10').estado === 'base'`.
- Existente `{inicio:'2026-07-16T06:00', fim:'2026-07-16T12:00'}` → `situacaoDoDia([base, existente], base, '2026-07-15').estado === 'ocupado'` (vira a noite) e `conflitos.length === 1`.
- Existente com o mesmo intervalo de 15/07 → `'ocupado'` (duplicada).
- `situacaoDoDia([base], base, '2026-06-20').estado === 'fora-vigencia'`.
- `situacaoDoDia([base], base, '2026-07-20')` → `{estado:'livre', motivo:'', conflitos:[]}`.
- `validarLote([base], base, [])` → `ok:false`, motivo `"Nenhum dia marcado."`.
- 32 dias livres → motivo `"Limite de 31 dias por lote."`.
- `[{data:'2026-07-20'},{data:'2026-07-20'}]` → `"Dia repetido."`.
- `[{data:'2026-07-20', horario:{hora:'18:00',duracaoMin:1440}}, {data:'2026-07-21'}]` → `"Sobrepõe outro dia deste lote."` com `data:'2026-07-21'` ou `'2026-07-20'` (ao menos um).
- `gerarEscalasLote(base, [{data:'2026-07-20'},{data:'2026-07-22'}])`: 2 escalas; ids distintos e ≠ `'b1'`; `status 'planejada'`; `descricao/origem/qtdPm` copiados; `tabela.id === tabelaParaData('2026-07-20T18:00').id`.
- `gerarEscalasLote(base, [{data:'2026-06-20'}])` lança.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tests/run-tests.mjs 2>&1 | grep -A3 "Lançamento em lote"`
Expected: FALHA (módulo inexistente).

- [ ] **Step 3: Implementar `lote.mjs`**

Datas sempre em hora local (`new Date(ano, mes-1, dia, h, m)`), nunca `Date.parse` de `YYYY-MM-DD` (seria UTC). Duração = `(fim − início)/60000` da base. Conflitos do lote entre si: comparar intervalos dois a dois (`a.inicio < b.fim && a.fim > b.inicio`). `situacaoDoDia` checa nesta ordem: vigência (`tabelaParaData(inicio)` nulo) → base (mesmo `inicio` e `fim` da base) → `detectarConflitos(escalas, cand, base.id)` (ignora a base, já tratada) → livre.

- [ ] **Step 4: Rodar e ver passar** — `node tests/run-tests.mjs` → `OK: Lançamento em lote — LOTE OK` e teste "Módulos no cache offline" OK.

- [ ] **Step 5: Commit** — `feat(v79): regra do lançamento em lote (lote.mjs)`.

---

### Task 2: Calendário (abrir, grade, marcar, bloqueio)

**Files:**
- Create: `js/modules/ui/agenda-dias.mjs`
- Modify: `index.html` (`<dialog id="dialogLote">` junto aos outros dialogs), `js/modules/templates.mjs` (item no `ec-more-menu` e botão desktop), `js/modules/ui/formulario.mjs` (handler `listaEscalas`: `else if (acao === 'lote') abrirLote(id)`; `abrirLote` entra no `ctx`), `js/app.js` (import, `criarAgendaDias`, `ligarEventos()` no `init()`, `abrirLote` tardio no ctx do formulário), `sw.js` (SHELL), `css/src/40-dialogos.css`, `css/src/90-responsivo.css`, `tests/fixtures/fontes-leitura.json`
- Test: `tests/mobile-check.mjs`

**Interfaces:**
- Consumes: Task 1 (`situacaoDoDia`, `LIMITE_LOTE`).
- Produces: `criarAgendaDias(ctx) → {abrir(idBase:string):void, ligarEventos():void}`; ctx `{$, on, estado, toast, salvar, render, haptic, aposProximoPaint}`. DOM: `#dialogLote`, `#loteMes` (título "novembro de 2026"), `#lotePrev`/`#loteNext`, `#loteGrade` (botões `.lote-dia[data-data="YYYY-MM-DD"]` com `aria-pressed` e, se bloqueado, `aria-disabled="true"` + `title` = motivo), `#loteContador`, `#loteRevisar`, `#loteFechar`. Células vazias antes do dia 1 são `<span class="lote-vazio">`.

- [ ] **Step 1: Teste de navegador (falhando)** em `mobile-check.mjs`, num roteiro novo de página limpa (padrão `roteiroHistorico`) a 390 px: cria via formulário a base 10/11/2026 18:00 + 14h e outra escala 15/11/2026 07:00–12:00; abre o menu da base e toca `[data-acao="lote"]`. Asserções:
- `#dialogLote` aberto; `#loteMes` = "novembro de 2026".
- Primeira célula `.lote-dia` (dia 01) é o 7º filho da grade, com 6 `.lote-vazio` antes (Review Focus 3).
- Dia 10 com `aria-disabled="true"` (base); dia 14 bloqueado (18:00–08:00 sobrepõe 15/11 07:00); dia 15 livre.
- Toque no dia 15, 17 e 19 → `aria-pressed="true"` e `#loteContador` = "3 dias marcados"; toque de novo no 19 → "2 dias marcados".
- Toque no dia 14 não marca e enfileira toast com o motivo.
- `#loteNext` três vezes chega a fevereiro de 2027 e fica `disabled`.
- Alvos `.lote-dia` ≥ 44×44 px; sem rolagem horizontal; `menoresQue12()` vazio com a janela aberta.
- Com o formulário em edição de outra escala, abrir a agenda não muda `estado.editandoId` nem os campos do formulário (Review Focus 5).

- [ ] **Step 2: Rodar e ver falhar** — `node tests/mobile-check.mjs` → as verificações novas `false`.

- [ ] **Step 3: Implementar** — markup, módulo, CSS, entradas e ligação conforme Interfaces. Grade: `(getDay()+6)%7` vazios antes do dia 1. Mês em `pt-BR` via `toLocaleDateString('pt-BR',{month:'long',year:'numeric'})`. Marcar acima de 31 → toast `"Limite de 31 dias por lote."` e não marca.

- [ ] **Step 4: Rodar e ver passar** — `node tests/mobile-check.mjs` exit 0; `node tests/run-tests.mjs` (piso de fonte e literais: atualizar `LITERAIS_ATUALIZAR=1` só pelos textos novos desta task).

- [ ] **Step 5: Commit** — `feat(v79): calendário para lançar em outros dias`.

---

### Task 3: Revisar, trocar horário, lançar e desfazer

**Files:**
- Modify: `js/modules/ui/agenda-dias.mjs`, `index.html` (área `#loteRevisao` dentro do dialog: lista `#loteLista`, painel de troca `#loteEditar` com campo hora `#loteHora`, chips 12/14/24 h e término personalizado `#loteFim`, botões `#loteVoltar`, `#loteLancar`), `css/src/40-dialogos.css`, `css/src/90-responsivo.css`, `tests/fixtures/fontes-leitura.json`
- Test: `tests/mobile-check.mjs` (continua o roteiro do Task 2)

**Interfaces:**
- Consumes: Task 1 (`escalaDoDia`, `validarLote`, `gerarEscalasLote`, `situacaoDoDia`), Task 2 (estado interno de dias marcados).
- Produces: itens `#loteLista li[data-data]` com texto "Dom 15/11 · 18:00 → 08:00" e, se houver problema, `.lote-problema` com o motivo de `validarLote`.

- [ ] **Step 1: Teste (falhando)**, continuando com 15, 17 e 19 marcados:
- "Revisar" mostra 3 itens em ordem de data; texto do 1º = "Dom 15/11 · 18:00 → 08:00".
- Trocar o 17 para 24 h → item do 17 mostra "18:00 → 18:00", sem problema; trocar o 17 para hora 06:00 com término personalizado 19/11 20:00 (alcança o 19 às 18:00) → `.lote-problema` "Sobrepõe outro dia deste lote." e `#loteLancar` `disabled`; voltar o 17 para 14 h → liberado.
- `#loteLancar` = "Lançar 3 escalas"; dois cliques seguidos (sem espera) → lista principal tem exatamente +3 escalas (Review Focus 1); dialog fechado; toast "3 escalas lançadas." com ação "Desfazer".
- Editar uma das 3 (mudar descrição) e acionar Desfazer → as 3 saem e as 2 escalas originais ficam (Review Focus 4).
- Revalidação: com o dialog na revisão, inserir por `estado` (gancho de teste em localhost) uma escala que ocupa o dia 19; "Lançar" remove o 19 da lista com aviso e só lança após novo toque.
- Falha de gravação simulada (`localStorage.setItem` lançando) → nenhuma escala nova, toast de erro.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.** "Lançar": desativar o botão primeiro → `validarLote(estado.escalas, base, dias)`; se surgir `'ocupado'`, retirar esses dias, mostrar aviso e reativar o botão (exige novo toque) → `gerarEscalasLote` → `clonarEscalas` para backup → `push` → um `salvar()`; se `false`, restaurar e `toast(…, {erro:true})` → `render()` → toast com `acao:{rotulo:'Desfazer', fn}` que filtra pelos ids gerados ainda presentes, salva e renderiza.

- [ ] **Step 4: Rodar e ver passar** — `node tests/mobile-check.mjs` e `node tests/run-tests.mjs`.

- [ ] **Step 5: Commit** — `feat(v79): revisar, trocar horário e lançar o lote`.

---

### Task 4: Ação no toast após salvar

**Files:**
- Modify: `js/modules/ui/formulario.mjs` (no ramo `novoRegistro`, `toast('Escala adicionada.', {acao:{rotulo:'Lançar em outros dias', fn:() => abrirLote(idNovo)}})`, com `idNovo` guardado antes do `push`)
- Test: `tests/mobile-check.mjs`

- [ ] **Step 1: Teste (falhando)**: após salvar uma escala nova numa página limpa, o botão de ação do toast tem texto "Lançar em outros dias" e, ao tocar, abre `#dialogLote` com a escala recém-salva como base (dia bloqueado = dia dela). Editar uma escala → toast "Escala atualizada." sem ação.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `feat(v79): atalho no aviso de escala adicionada`.

---

### Task 5: Release v79, revisão visual e verificação

**Files:**
- Modify: versão (`node tools/bump-version.mjs 79`), `CHANGELOG.md` (entrada v79 no topo), `index.html` (`#dialogNovidades`: 3 itens, o primeiro sobre "Lançar em outros dias"; `data-conteudo="79"`), `docs/DESIGN.md` (componente calendário de lote), `CLAUDE.md` (`lote` em funções puras, `agenda-dias` na lista de `ui/`, "Versão atual: **v79** → próxima **v80**"), `docs/ESTUDO_ESTRATEGICO_v67.md` (registrar a entrega no backlog com "v79, PR #N"), `tests/fixtures/equivalencia.json` (`node tests/equivalencia.mjs --atualizar`: item novo no menu)

- [ ] **Step 1:** Bump, CHANGELOG, novidades, docs.
- [ ] **Step 2:** Capturas em 390 px e 1280 px, claro e escuro (calendário, dias bloqueados, revisão, troca de horário) com `tests/capturas-fontes.mjs` adaptado ou script de apoio em `/tmp`; conferir: sem texto cortado, sem rolagem horizontal, contraste de dia bloqueado legível.
- [ ] **Step 3:** `node tests/equivalencia.mjs --atualizar`; conferir que a diferença é só o item de menu e as novidades.
- [ ] **Step 4:** `npm run verify` → exit 0.
- [ ] **Step 5:** Commit `feat(v79): release — lançar em outros dias`.
