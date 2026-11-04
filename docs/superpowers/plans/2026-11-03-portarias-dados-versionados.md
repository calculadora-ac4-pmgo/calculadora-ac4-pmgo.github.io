# Tabela da Portaria como dado versionado (v73) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** os valores da hora AC4 e a identificação da norma passam a vir de um único arquivo de dados (`js/modules/portarias.mjs`), e as escalas a partir de 01/07/2026 sempre usam a tabela oficial.

**Architecture:** um módulo só de dados (`portarias.mjs`) alimenta `calculo.mjs`, que deriva `TABELA_OFICIAL` e expõe `tabelaParaData()`. A `persistencia.mjs` aplica a norma às escalas ao abrir o app e ao restaurar backup. O `app.js` deixa de ler campos ocultos. O `relatorio.mjs` cita a norma no PDF e no texto compartilhado. A regra de cálculo minuto a minuto não muda.

**Tech Stack:** HTML/CSS/JS sem build, módulos ES (`.mjs`), testes em Node (`tests/run-tests.mjs`) e Chrome headless (smoke/mobile/vitals).

**Spec:** `docs/superpowers/specs/2026-11-03-portarias-dados-versionados-design.md`

## Global Constraints

- Zero dependências em produção; nenhum `fetch` novo; CSP do `index.html` inalterada.
- Comentários, mensagens e commits em português, no estilo do histórico (`feat(v73): …`, `test: …`, `docs: …`).
- Norma vigente: `id: 'ssp-621-2026-07-01'`, `norma: 'Portaria SSP nº 621/2026'`, DOE `numero: '24.801'`, `data: '2026-06-17'`, `paginas: '58-59'`, `protocolo: '630514'`, `vigenciaInicio: '2026-07-01'`, valores em centavos `{ AD: 3000, AN: 3300, VD: 4000, VN: 4500 }`.
- Citação padrão: `Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)`.
- Escalas anteriores a 01/07/2026: sem recálculo e sem norma histórica (fora de escopo).
- O id `ssp-621-2026-07-01` não muda (tabelas já gravadas nos aparelhos o usam).
- Os 52 casos de "Conformidade com a Portaria 621/2026 (Anexo I)" e as 10 escalas reais **não podem ser editados**.
- Rodar `npm run verify` antes de cada commit que toque `js/`, `index.html` ou `sw.js`; antes do `git add`, `git checkout -- artifacts/`.
- Sem item novo no `#dialogNovidades`; manter o `data-conteudo` atual.

## Review Focus

1. **Editar uma escala mudando a data** → a tabela deve ser a da norma da **nova** data (hoje o código mantém a tabela antiga com `escalas[idx].tabela || …`). Teste na Task 4.
2. **O aviso de recálculo não pode reaparecer a cada abertura**: depois de regravadas, uma segunda leitura deve contar `recalculadas: 0`. Teste na Task 3.
3. **Backup cancelado na confirmação não altera nada nem mostra toast**: o toast só aparece depois do `salvar()` bem-sucedido. Coberto pela posição do toast na Task 4.
4. **Escala anterior a julho sem tabela gravada** (backup antigo) → continua sendo exibida, calculada com `TABELA_OFICIAL` como fallback e não contada como recalculada. Teste na Task 3.
5. **Relatório só com escalas cujas tabelas gravadas não têm norma conhecida** → o cabeçalho do PDF ainda cita uma norma (`normaAtual()`), e não fica vazio. Teste na Task 5.

---

### Task 1: Módulo de dados `portarias.mjs`

**Files:**
- Create: `js/modules/portarias.mjs`
- Modify: `sw.js` (lista `SHELL`, após `./js/modules/calculo.mjs`)
- Test: `tests/run-tests.mjs` (nova suíte antes do `process.exit`)

**Interfaces:**
- Produces:
  - `NORMAS: ReadonlyArray<Norma>`, onde `Norma = { id, norma, doe: { numero, data, paginas, protocolo }, vigenciaInicio, vigenciaFim?, valores: { AD, AN, VD, VN } }` (tudo congelado, inclusive os objetos aninhados).
  - `normaParaData(valor: string): Norma | null`: usa os 10 primeiros caracteres; `null` para formato inválido ou data fora de toda vigência.
  - `normaAtual(): Norma`: a última da lista.
  - `citacaoNorma(n: Norma): string` → `'Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)'`.

- [ ] **Step 1: Escrever a suíte que falha** em `tests/run-tests.mjs`, importando de `../js/modules/portarias.mjs`:

```js
const validarNormas = () => {
  const ids = new Set(NORMAS.map((n) => n.id));
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const checks = [
    [NORMAS.length >= 1 && ids.size === NORMAS.length, 'ids únicos'],
    [NORMAS.every((n) => n.norma && n.doe?.numero && iso.test(n.doe?.data) && iso.test(n.vigenciaInicio)), 'campos obrigatórios'],
    [NORMAS.every((n) => ['AD', 'AN', 'VD', 'VN'].every((k) => Number.isInteger(n.valores[k]) && n.valores[k] > 0)), 'valores inteiros positivos'],
    [NORMAS.every((n, i) => i === 0 || (NORMAS[i - 1].vigenciaFim && NORMAS[i - 1].vigenciaFim < n.vigenciaInicio)), 'vigências em ordem e sem sobreposição'],
    [NORMAS.slice(0, -1).every((n) => n.vigenciaFim), 'só a última sem vigenciaFim'],
    [Object.isFrozen(NORMAS) && NORMAS.every((n) => Object.isFrozen(n) && Object.isFrozen(n.valores) && Object.isFrozen(n.doe)), 'congeladas'],
    [normaParaData('2026-06-30') === null, '30/06/2026 sem norma'],
    [normaParaData('2026-07-01T00:00')?.id === 'ssp-621-2026-07-01', '01/07/2026 → 621'],
    [normaParaData('lixo') === null, 'data inválida → null'],
    [citacaoNorma(normaAtual()) === 'Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)', 'citação padrão'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'NORMAS OK';
};
rodar('Normas da Portaria (dados versionados)', validarNormas);
```

- [ ] **Step 2: Rodar e confirmar a falha.** Run: `node tests/run-tests.mjs`. Expected: erro de import (`portarias.mjs` não existe).
- [ ] **Step 3: Criar `js/modules/portarias.mjs`** com os valores das Global Constraints. No topo, um comentário com a regra de manutenção: *nunca editar uma entrada publicada; norma nova vai no fim e a anterior recebe `vigenciaFim`*. Inclua também a fonte (DOE nº 24.801, p. 58-59, protocolo 630514) e o link para `docs/portaria-ssp-621-2026.md`. `normaParaData` segue a mesma busca do atual `regraNormativaParaData` (de trás para frente na lista).
- [ ] **Step 4: Acrescentar `'./js/modules/portarias.mjs'` ao `SHELL` do `sw.js`.**
- [ ] **Step 5: Rodar.** Run: `node tests/run-tests.mjs`. Expected: `OK: Normas da Portaria (dados versionados) — NORMAS OK` e `OK: Módulos no cache offline do Service Worker`.
- [ ] **Step 6: Commit** — `feat(v73): módulo de dados das normas da Portaria`.

### Task 2: `calculo.mjs` deriva a tabela das normas

**Files:**
- Modify: `js/modules/calculo.mjs:1-35` (cabeçalho e constantes)
- Test: `tests/run-tests.mjs` (acrescentar à suíte da Task 1)

**Interfaces:**
- Consumes: `NORMAS`, `normaParaData`, `normaAtual` (Task 1).
- Produces:
  - `TABELA_OFICIAL`, `PORTARIA_ATUAL`, `REGRA_NORMATIVA_ATUAL_ID` e `REGRAS_NORMATIVAS` com os mesmos nomes e formatos, agora derivados.
  - `tabelaDaNorma(n: Norma): Tabela` → `{ id, portaria: n.norma, vigenciaInicio, valores: { ...n.valores } }`, congelada.
  - `tabelaParaData(valor: string): Tabela | null` (via `normaParaData`).
  - `regraNormativaParaData(valor)` continua com a mesma assinatura.
  - `VALORES_OFICIAIS` **permanece até a Task 4**, derivado (`String(valores.AD / 100)` etc.), para o app não quebrar entre os commits.

- [ ] **Step 1: Acrescentar os checks que falham** à `validarNormas`:

```js
[tabelaParaData('2026-08-10')?.valores.VN === 4500 && tabelaParaData('2026-08-10')?.portaria === 'Portaria SSP nº 621/2026', 'tabelaParaData → tabela oficial'],
[tabelaParaData('2026-06-01') === null, 'tabelaParaData antes da vigência → null'],
[TABELA_OFICIAL.id === normaAtual().id && TABELA_OFICIAL.valores.AD === normaAtual().valores.AD, 'TABELA_OFICIAL derivada'],
```

- [ ] **Step 2: Rodar e confirmar a falha.** Expected: `tabelaParaData` não exportada.
- [ ] **Step 3: Implementar** em `calculo.mjs`. Os comentários do cabeçalho e da `calcularEscala` que dizem "Portaria SSP nº 621/2026" passam a "Portaria vigente (ver portarias.mjs)". `calcularEscala`, `tabelaEscalaValida` e `labelOrigem` não mudam.
- [ ] **Step 4: Rodar a suíte inteira.** Run: `node tests/run-tests.mjs`. Expected: todas as suítes OK, inclusive "Conformidade com a Portaria 621/2026 (Anexo I)" sem nenhuma alteração.
- [ ] **Step 5: Commit** — `refactor(v73): calculo deriva a tabela oficial de portarias.mjs`.

### Task 3: `aplicarNorma` na persistência

**Files:**
- Modify: `js/modules/persistencia.mjs` (nova função; `desserializarEscalas`)
- Test: `tests/run-tests.mjs` (nova suíte)

**Interfaces:**
- Consumes: `tabelaParaData` (Task 2).
- Produces:
  - `aplicarNorma(escala): { escala, alterada: boolean, valorMudou: boolean }`. Escala sem norma para `inicio`: devolve a mesma referência, com `alterada: false` e `valorMudou: false`. Com norma: `escala` é uma cópia com `tabela: tabelaParaData(inicio)`; `alterada` vale quando o id ou algum valor difere, ou quando não havia tabela; `valorMudou` vale só quando havia tabela válida com algum valor diferente.
  - `desserializarEscalas(raw)` → `{ escalas, rejeitadas, recalculadas }`, em que `recalculadas` conta as escalas com `valorMudou`.

- [ ] **Step 1: Escrever a suíte que falha:**

```js
const validarAplicarNorma = () => {
  const base = { id: 'x', inicio: '2026-08-07T08:00', fim: '2026-08-07T18:00', descricao: 'Escala AC4', origem: 'AC4', qtdPm: 1, status: 'planejada' };
  const antiga = { ...base, tabela: { id: 'ssp-550-2024', portaria: 'Portaria nº 550/2024', valores: { AD: 2647, AN: 2980, VD: 3641, VN: 4138 } } };
  const oficial = { ...base, tabela: TABELA_OFICIAL };
  const junho = { ...base, inicio: '2026-06-05T08:00', fim: '2026-06-05T18:00' };
  const r1 = aplicarNorma(antiga), r2 = aplicarNorma(oficial), r3 = aplicarNorma(base), r4 = aplicarNorma(junho);
  const lote = desserializarEscalas(JSON.stringify([antiga, oficial, base, junho]));
  const releitura = desserializarEscalas(JSON.stringify(lote.escalas));
  const checks = [
    [r1.valorMudou && r1.escala.tabela.valores.VD === 4000, 'tabela antiga → oficial'],
    [!r2.alterada && !r2.valorMudou, 'escala já oficial não muda'],
    [r3.alterada && !r3.valorMudou && r3.escala.tabela.id === 'ssp-621-2026-07-01', 'sem tabela recebe a oficial sem contar como recálculo'],
    [r4.escala === junho && !r4.alterada, 'antes de 01/07/2026: devolvida sem alteração'],
    [calcularEscala(r4.escala, TABELA_OFICIAL).valorCentavos > 0, 'junho sem tabela ainda calcula pelo fallback'],
    [lote.recalculadas === 1 && lote.escalas.length === 4, 'desserializar conta só valores alterados'],
    [releitura.recalculadas === 0, 'releitura não recalcula de novo (aviso não se repete)'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'APLICAR NORMA OK';
};
rodar('Escalas salvas seguem a Portaria vigente', validarAplicarNorma);
```

- [ ] **Step 2: Rodar e confirmar a falha.** Expected: `aplicarNorma` não exportada.
- [ ] **Step 3: Implementar `aplicarNorma`** e aplicá-la em `desserializarEscalas` depois do `normalizarEscala`. A comparação de valores é chave a chave em `AD/AN/VD/VN`.
- [ ] **Step 4: Rodar.** Run: `node tests/run-tests.mjs`. Expected: todas OK, inclusive "Hardening v58".
- [ ] **Step 5: Commit** — `feat(v73): escalas salvas seguem a tabela da Portaria vigente`.

### Task 4: `app.js` e `index.html` sem campos ocultos

**Files:**
- Modify: `js/app.js` (imports linhas 11-14; `STORAGE` linha 43; bloco de tabela 281-342; `salvarConfig` 357-364; `carregar` 382-394; `restaurarBackup` 234-262; salvar escala 699-712; `instalarTestes` 1849-1851)
- Modify: `index.html:361-364` (os 4 `<input type="hidden" id="val…">`)
- Modify: `js/modules/testes.mjs:18-23, 147, 180` (troca `lerTabelaAtual()`/`tabelaParaCalculo()` por `TABELA_OFICIAL`, importado de `./calculo.mjs`)
- Test: `tests/run-tests.mjs` (nova suíte "Fonte única da Portaria")

**Interfaces:**
- Consumes: `TABELA_OFICIAL`, `tabelaParaData` (Task 2); `aplicarNorma`, `desserializarEscalas().recalculadas` (Task 3); `normaAtual` (Task 1).
- Produces: `instalarTestes(ctx)` sem `lerTabelaAtual` e `tabelaParaCalculo` no `ctx`.

- [ ] **Step 1: Escrever a suíte que falha:**

```js
const validarFonteUnica = () => {
  const dir = join(raiz, 'js'), arquivos = [];
  const varrer = (d) => readdirSync(d, { withFileTypes: true }).forEach((f) =>
    f.isDirectory() ? varrer(join(d, f.name)) : /\.m?js$/.test(f.name) && arquivos.push(join(d, f.name)));
  varrer(dir);
  const fora = arquivos.filter((a) => !/portarias\.mjs$|testes\.mjs$/.test(a));
  const html = readFileSync(join(raiz, 'index.html'), 'utf8');
  const faixa = html.match(/<div class="tariff-strip"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  const n = normaAtual();
  const reais = (c) => `R$&nbsp;${c / 100}/h`;
  const checks = [
    [!fora.some((a) => /621\/2026/.test(readFileSync(a, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))), '621/2026 só em portarias.mjs'],
    [!fora.some((a) => /AD:\s*3000/.test(readFileSync(a, 'utf8'))), 'valores só em portarias.mjs'],
    [!/id="val(AD|AN|VD|VN)"/.test(html), 'campos ocultos removidos'],
    [faixa.includes(n.norma) && ['AD', 'AN', 'VD', 'VN'].every((k) => faixa.includes(reais(n.valores[k]))), 'faixa fixa confere com normaAtual()'],
    [!/valAD|pmgoConfig.*setItem|salvarConfig/.test(readFileSync(join(dir, 'app.js'), 'utf8')), 'app.js sem campos ocultos'],
  ];
  const falhas = checks.filter(([ok]) => !ok).map(([, nome]) => nome);
  return falhas.length ? falhas : 'FONTE ÚNICA OK';
};
rodar('Fonte única da Portaria', validarFonteUnica);
```

- [ ] **Step 2: Rodar e confirmar a falha.** Expected: falhas em "campos ocultos removidos", "app.js sem campos ocultos" e "621/2026 só em portarias.mjs" (o `relatorio.mjs` ainda tem; esse item fica verde só na Task 5).
- [ ] **Step 3: Implementar em `app.js`:**
  - Remover `parseMoedaCampo`, `tabelaVazia`, `lerTabelaAtual`, `validarTabelaAtual`, `tabelaParaCalculo`, `salvarConfig`, o import de `VALORES_OFICIAIS` e a chave `config` de `STORAGE`.
  - Nas pontes (cálculo e agenda), a tabela de fallback passa a ser `TABELA_OFICIAL`.
  - Ao salvar uma escala nova: `tabela: tabelaParaData(dados.inicio)`.
  - Ao editar uma escala: `escalas[idx] = aplicarNorma({ ...escalas[idx], ...dados }).escala` (Review Focus 1).
  - Em `carregar()`: `try { localStorage.removeItem('pmgoConfig'); } catch {}`. Se `carregadas.recalculadas > 0`, mostrar o toast `` `${k} escala${k === 1 ? '' : 's'} recalculada${k === 1 ? '' : 's'} pela ${normaAtual().norma}.` ``.
  - Em `restaurarBackup()`: o mesmo toast, só depois de `salvar()` retornar `true` (Review Focus 3).
- [ ] **Step 4: Ajustar `testes.mjs` e remover os inputs ocultos do `index.html`.**
- [ ] **Step 5: Teste da edição (Review Focus 1).** Acrescentar à suíte `__ac4Testes` em `testes.mjs` um caso que grava uma escala de 07/08/2026 com a tabela antiga do teste da Task 3 e reaplica `aplicarNorma` com `inicio` alterado para 08/08/2026. Esperado: tabela oficial e `valores.VD === 4000`.
- [ ] **Step 6: Rodar.** Run: `node tests/run-tests.mjs`. Expected: todas OK, exceto o item `621/2026` da "Fonte única", que só fica verde na Task 5. Depois rodar `npm run test:smoke` (ou o script equivalente em `package.json`). Expected: OK, com o app carregando sem erros no console.
- [ ] **Step 7: Commit** — `refactor(v73): app usa a tabela da Portaria sem campos ocultos`.

### Task 5: Relatório e texto compartilhado citam a norma dos dados

**Files:**
- Modify: `js/modules/relatorio.mjs` (`montarRelatorioImpressao` devolve também `normaHTML`; linha 194)
- Modify: `index.html:776` (`<p>Base normativa: Portaria SSP n.º 621/2026</p>` → `<p>Base normativa: <span id="prNorma"></span></p>`)
- Modify: `js/app.js` (`imprimirRelatorio`: `$('prNorma').textContent = normaTexto`)
- Test: `tests/run-tests.mjs` (acrescentar à suíte "Templates e exportações")

*Ajuste em relação à spec:* o PDF já tinha "Base normativa" fixa no cabeçalho. Em vez de criar uma linha nova após o resumo, o cabeçalho passa a ser preenchido com a citação. Atualizar a spec com uma linha registrando isso.

**Interfaces:**
- Consumes: `NORMAS`, `normaAtual`, `citacaoNorma` (Task 1).
- Produces: `montarRelatorioImpressao(resultados) → { resumoHTML, tabelaHTML, normaTexto: string }`. `normaTexto` reúne as citações das normas cujos ids aparecem em `r.tabela.id`, na ordem de `NORMAS`, separadas por `'; '`. Sem nenhuma conhecida, usa `citacaoNorma(normaAtual())`. É texto puro, atribuído com `textContent` (sem risco de HTML).

- [ ] **Step 1: Acrescentar os checks que falham:**

```js
[montarRelatorioImpressao([{ e, r }]).normaTexto === 'Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)', 'PDF cita norma e DOE'],
[montarRelatorioImpressao([{ e, r: { ...r, tabela: { id: 'desconhecida', portaria: 'X', valores: r.tabela.valores } } }]).normaTexto.startsWith('Portaria SSP nº 621/2026'), 'PDF sem norma conhecida cai na atual'],
[montarTextoResumo([{ e, r }]).includes(`_${normaAtual().norma} · Valor simulado_`), 'texto compartilhado usa a norma dos dados'],
```

- [ ] **Step 2: Rodar e confirmar a falha.**
- [ ] **Step 3: Implementar.** No texto compartilhado, a linha vira `` `\n⚠️ _${normaAtual().norma} · Valor simulado_\n` `` (o "n.º" passa a "nº", igual ao resto do app).
- [ ] **Step 4: Rodar.** Run: `node tests/run-tests.mjs`. Expected: todas OK, inclusive "Fonte única da Portaria" completa.
- [ ] **Step 5: Commit** — `feat(v73): relatório cita a norma e o DOE a partir dos dados`.

### Task 6: Release v73

**Files:**
- Modify (via script): `index.html`, `sw.js`, `js/app.js`, `css/styles.css`, `package.json`
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `docs/ESTUDO_ESTRATEGICO_v67.md`, `docs/portaria-ssp-621-2026.md`, `docs/superpowers/specs/2026-11-03-portarias-dados-versionados-design.md`

- [ ] **Step 1:** `node tools/bump-version.mjs 73`.
- [ ] **Step 2: Entrada `## v73 — Tabela da Portaria como dado versionado (R5)` no topo do `CHANGELOG.md`.** Conteúdo: fonte única em `portarias.mjs`; escalas a partir de 01/07/2026 recalculadas pela norma; campos ocultos e chave `pmgoConfig` removidos; PDF e texto compartilhado com a norma dos dados; **equivalência**, com os 52 casos do Anexo I e as 10 escalas reais inalterados.
- [ ] **Step 3: Documentação.**
  - `CLAUDE.md`: versão atual v73 → próxima v74; `portarias` na lista de módulos; nova armadilha: *"Portaria nova = nova entrada no fim de `portarias.mjs` + `vigenciaFim` na anterior + faixa `.tariff-strip` do `index.html`; o teste 'Fonte única' confere"*.
  - Backlog: marcar R5 `[x]` com v73 e o número do PR.
  - `docs/portaria-ssp-621-2026.md`: apontar `js/modules/portarias.mjs` como fonte dos dados.
- [ ] **Step 4: Verificação completa.** Run: `npm run verify`. Expected: lint, unit, smoke, mobile, mobile-v55 e vitals sem falhas. Revisão visual das capturas em `artifacts/v55/` (390 px e 1280 px, claro e escuro): nada deve mudar na tela. Depois, `git checkout -- artifacts/`.
- [ ] **Step 5: Commit** — `docs(v73): release, CHANGELOG e backlog (R5)`.
- [ ] **Step 6: PR.** `git fetch origin main && git rebase origin/main`; `git push -u origin feat/v73-portarias-dados`; `gh pr create` com o título `feat(v73): tabela da Portaria como dado versionado (R5)` e o corpo com resumo, testes e o rodapé de atribuição.
- [ ] **Step 7: CI verde → merge.** `gh pr merge --merge --delete-branch`. Acompanhar o deploy da `main`.
- [ ] **Step 8: Conferir produção.** Run: `curl -s https://calculadora-ac4-pmgo.github.io/sw.js | sed -n 4,5p`. Expected: `v73`. Confirmar também que `https://calculadora-ac4-pmgo.github.io/js/modules/portarias.mjs` responde 200.
