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

## Arquitetura em uma tela

- Sem build, sem framework, **sem dependências em produção**. `index.html` + `css/styles.css` + `js/app.js` (IIFE, UI e estado) + `js/modules/*.mjs` (funções puras: `calculo`, `formato`, `agenda`, `persistencia`).
- Dados **só no aparelho** (`localStorage`, chaves `pmgo*`). Nunca coletar dados pessoais (LGPD).
- `sw.js`: network-first, atualização só com confirmação do usuário (`SKIP_WAITING` via banner).
- Não há mais limpeza forçada: o `js/force-update.js` (v65–v68) recarregava a página a cada versão sem perguntar e foi removido na v69. Caches antigos são apagados no `activate` do `sw.js`. **Não reintroduzir** (o teste "Atualização PWA" bloqueia).
- **CSP** em `index.html`: `style-src 'self'` bloqueia atributos `style="…"` em HTML injetado. Para estilo dinâmico use CSSOM (`el.style.x = …`) ou classes.

## Fluxo de trabalho obrigatório

1. Branch → commits → `npm run verify` (lint + unit + smoke + mobile + mobile-v55 + vitals) → PR → CI verde → `gh pr merge --merge --delete-branch` → acompanhar o deploy da `main` → **conferir o site publicado** (ex.: `curl -s https://calculadora-ac4-pmgo.github.io/sw.js | sed -n 4,5p`). Não declarar concluído só com o workflow verde.
2. Mudou `index.html`, `css/` ou `js/`? **Bump de versão:** `node tools/bump-version.mjs <n>` (atualiza index, sw, app.js, styles.css e package.json). Versão atual: **v71** → próxima **v72**.
3. Todo bump exige **entrada nova no topo do `CHANGELOG.md`** com a mesma versão (o teste "Release" falha se não houver) e, se houver novidade para o usuário, o conteúdo do `#dialogNovidades` em `index.html` (**exatamente 3 itens** na lista; o smoke confere) **e o atributo `data-conteudo` com a versão atual** — é ele que decide se o aviso reabre sozinho (sem novidade, mantenha o valor antigo para não repetir o aviso).
4. Os testes regeneram PNGs em `artifacts/v55/`. Não commitar isso por acidente: `git checkout -- artifacts/` antes do `git add`.
5. Mensagens de commit e PR em português, no estilo do histórico (`feat(v66): …`, `fix: …`, `ci: …`).

## Armadilhas conhecidas (aprendidas na prática)

- **Incidente v65:** o PR #58 colocou o redesign numa pasta `ac4-v65-files/` e o commit seguinte a apagou em vez de mover. O CI passou porque testava o código antigo. Hoje o teste "Release" bloqueia pastas `ac4-vNN-files/` na raiz. Arquivos novos vão **direto no lugar final**.
- **Testes com número de versão fixo quebram o deploy** a cada bump. Leia a versão de `APP_VERSION` (`js/app.js`) ou de `window.__ac4Version` no navegador.
- **Valor = só horas inteiras por faixa** (AD/AN/VD/VN), decisão do gestor na v71: fração de hora não é paga. Não voltar ao pagamento proporcional por minuto.
- **Datas de teste** precisam estar na vigência da Portaria (≥ 01/07/2026); antes disso `validarTabelaAtual` recusa a escala.
- **Toasts são enfileirados** (um por vez, ~3,8 s cada). Em testes, não espere um toast específico logo após outras ações; teste a regra pela função e o fluxo real com recarga da página.
- **Ganchos de teste** só em localhost: `window.__ac4SimularAtualizacao`, `window.__ac4LembrarBackup`, `window.__ac4Testes*`.
- **Smoke no runner:** se falhar com "Chrome não expôs o DevTools", é infraestrutura: `gh run rerun <id> --failed`. Se o job de *deploy* do Pages falhar, usar `gh workflow run deploy.yml`.
- **`window.print()`** bloqueia a thread até o diálogo fechar: chame via `aposProximoPaint` (senão o tempo no diálogo entra no INP).
- **Documentos podem estar desatualizados.** Confirme no código antes de afirmar que um recurso existe (ex.: a importação `.ics` foi removida na v48, mas `ESCOPO_MVP.md` ainda a cita, item R7 do backlog).
- **Revisão visual é obrigatória** em mudanças de UI: capturas em 390 px e 1280 px, temas claro e escuro (o harness de `tests/mobile-v55-check.mjs` serve de base).
