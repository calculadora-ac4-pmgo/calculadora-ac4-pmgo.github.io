# Diário de Bordo — Calculadora AC4

> Documento de continuidade do projeto. Registra onde paramos, o que está pendente e como retomar o trabalho **em qualquer estação de trabalho**. Atualizar ao final de cada sessão relevante de desenvolvimento.

---

## 📍 Estado atual — 23/09/2026 (v72)

> **Fonte única do estado do projeto.** Ao encerrar uma sessão, atualize esta tabela e acrescente a
> sessão logo abaixo (mais recente primeiro). Os blocos mais antigos são histórico.

| Item | Estado |
| --- | --- |
| Versão em produção | **v72** — https://calculadora-ac4-pmgo.github.io/ · próxima **v73** |
| Projeto | **Em evolução ativa** (o "modo de manutenção" de 08/07 foi encerrado na v55) |
| Regra de cálculo | Portaria SSP 621/2026 + **só horas inteiras por faixa** (decisão do gestor, v71). Suíte "Conformidade com o Anexo I" com 52 casos, 10 deles da planilha do gestor |
| Última auditoria | [`relatorio_auditoria_producao_v67.md`](relatorio_auditoria_producao_v67.md) (BIH TECHS): 8,6/10. Itens P2-1…P2-4, P3-1…P3-4 e P3-6 resolvidos entre a v68 e a v72; aberto só o P3-5 (SRI/privacidade) |
| CI | Lint + 8 suítes unitárias + smoke (44 passos) + 2 mobile + Web Vitals (7 cenários) em todo PR; deploy só na `main` |
| Proteção da `main` | PR obrigatório, check `test` obrigatório **também para admin**, merge commit (`--merge`) — ver sessão de 23/09 |
| Monitor de uptime | UptimeRobot criado pelo gestor em 08/07/2026 (HTTP, 5 min). **Pendente do gestor:** confirmar que o alerta por e-mail está ativo |
| Backlog | [`ESTUDO_ESTRATEGICO_v67.md`](ESTUDO_ESTRATEGICO_v67.md), seção *Backlog executável* |
| Contexto para agentes | [`CLAUDE.md`](../CLAUDE.md) na raiz |

---

## Sessão de 23/09/2026 — auditoria BIH TECHS e v68–v71

- **Estação:** notebook sincronizado com o GitHub (o `.git` estava numa subpasta e foi devolvido à raiz).
- **Auditoria de produção v67** (BIH TECHS): nota 8,6/10, sem P0/P1. Relatório em [`relatorio_auditoria_producao_v67.md`](relatorio_auditoria_producao_v67.md).
- **v68 (PR #64):** ganchos de teste só em `localhost`, rótulo de origem único (`labelOrigem`), deploy sem `artifacts/`.
- **v69 (PR #65):** `force-update.js` removido: recarregava a página a cada versão sem perguntar. **Não reintroduzir.**
- **v70 (PR #66):** `navigator.storage.persist()` após lançamento, data do último backup no Compartilhar, novidades só reabrem quando `data-conteudo` muda.
- **v71 (PR #67):**
  - **Decisão do gestor:** valor só por **horas inteiras de cada faixa**; fração de hora não é paga.
  - Regras revistas contra a Portaria e contra a planilha do gestor: 10 escalas reais, iguais coluna a coluna.
  - Lista mostra as 30 escalas mais recentes com "Mostrar anteriores".
  - `Intl` cacheado; com 300 escalas, adicionar caiu de 2–4 s para 0,2–0,5 s.
- **v72 (P3-2):** `app.js` dividido em módulos (`templates`, `relatorio`, `pwa`, `testes` sob demanda), sem mudar comportamento. Saída de lista, CSV e PDF idêntica byte a byte à v71. Ids escapados nos templates.
- **Governança (P2-4/P3-3):** documentos reconciliados (este bloco, escopo, checklist, backlog). A proteção da `main` passou a valer também para admin, com merge commit.
- **Aprendizado:** nesta estação os testes de desempenho e animação oscilam quando a CPU está ocupada por outros programas. O CI (runner limpo) é o juiz. Compare sempre com a `main` nas mesmas condições antes de concluir que houve regressão.

---

## Marco histórico — encerramento do MVP em 08/07/2026 (v54)

> *Histórico: o texto abaixo descreve o estado de 08/07/2026. O projeto voltou a evoluir a partir da v55; o estado vigente está no topo.*

O escopo do MVP e todo o backlog de auditoria foram **concluídos**. O projeto entra em **modo de manutenção** (só correções sob demanda ou nova norma).

**Estado final entregue:**

| Item | Estado |
| --- | --- |
| Versão em produção | **v54** — no ar em https://calculadora-ac4-pmgo.github.io/ (HTTP 200) |
| Backlog da auditoria | **100% tratado** — nota **9,5/10**; sem P0/P1/P2 abertos |
| Regra de cálculo | Validada contra a Portaria SSP 621/2026 (transcrita no repo) |
| CI | Lint (ESLint 9) + 3 suítes de teste em PRs e na main; deploy só na main |
| Testes | run-tests (3 suítes) · smoke (18 passos, PDF real) · mobile-check — verdes |
| Segurança | Sem segredos; CSP; CSV neutralizado; XSS auditado; HSTS |
| LGPD | Minimização real — nenhum dado pessoal coletado |
| Acessibilidade | WCAG AA (0 falhas de contraste), h1 único |
| Observabilidade | Erros JS anônimos (local) + uptime externo (UptimeRobot) |
| Trabalho inacabado | **Nenhum** |

**Itens que dependem só do gestor (operacionais, não são código):**
- Confirmar no UptimeRobot que o **alerta por e-mail** está ativo e vinculado ao monitor.

**Melhorias futuras opcionais (sem urgência, "nice to have"):** modularizar `app.js` se ultrapassar ~1.700 linhas; otimizar demais assets se necessário. Não bloqueiam nada.

**Como reabrir:** este projeto está estável e documentado. Para retomar (nova norma, bug ou evolução), siga a seção *"Como retomar em outra estação de trabalho"* mais abaixo e as *"Regras invioláveis do projeto"*. Próximo bump de versão: **v55**.

---

## Sessão de 08/07/2026 — execução das melhorias residuais (v54): nota 9,5/10

Executados os itens P3/P4 do backlog residual da reauditoria. **Próxima versão: v55.**

### 🔴 Bug crítico encontrado e corrigido (estava vivo em produção)
- Ao escrever o teste de CSV, a exportação lançou **`ReferenceError: csvTextoSeguro is not defined` (`app.js:1067`)** — a função era chamada em `exportarCSV` mas **nunca foi importada** de `formato.mjs`. **O botão "CSV" estava quebrado desde a v48.** Não foi detectado antes porque não havia teste de CSV (a lacuna que a auditoria apontou).
- O novo handler de observabilidade (v52) **capturou o erro no log**, provando seu valor.
- Corrigido: import adicionado. Duas guardas contra reincidência: passo de smoke + lint `no-undef`.

### Melhorias aplicadas (v54)
- **ESLint 9 no CI** (`eslint.config.mjs`, flat config): regras focadas em bugs, globais por contexto (browser/SW/node), zero dependências (roda via `npx --yes eslint@9`). Corrigiu 1 achado real (`catch (e)` não usado em `theme.js`). Rodado como 1º passo do job `test`, também em PRs. Excluído do artefato Pages.
- **Suíte `__ac4TestesExtras`**: 8 casos de `csvTextoSeguro` + invariantes de cálculo sobre 50 escalas aleatórias (soma de categorias, diurno+noturno, vermelha≤mins, valor inteiro, total=Σ). No CI e no console.
- **Smoke 16 → 18 passos**: "Exportar CSV não lança erro" + "localStorage corrompido carrega vazio sem quebrar".
- **Métrica anônima de versão**: `APP_VERSION` carimba o log de erros (`v`), `window.__ac4Version` para suporte, `pmgoVersion` detecta cliente preso em cache. Local, sem dado pessoal. `bump-version.mjs` sincroniza `APP_VERSION`.
- Cobertura fecha as 3 lacunas da matriz v46. Relatório atualizado em [`relatorio_auditoria_producao_v53.md`](relatorio_auditoria_producao_v53.md) (adendo v54).

---

## Sessão de 08/07/2026 — reauditoria de produção (v53): nota 9,2/10

- Reauditoria completa executada sobre a v53, com evidência re-coletada (testes locais, inspeção dos 8 `innerHTML`, verificação HTTP da produção ao vivo, workflow, SW). Relatório: [`relatorio_auditoria_producao_v53.md`](relatorio_auditoria_producao_v53.md).
- **Resultado: 9,2/10 (era 8,0)** — sem P0/P1/P2 abertos; backlog da v46 concluído 10/10; produção confirmada com `docs/`/`tests/` em 404 e HSTS.
- Backlog residual (P3/P4): 3 testes da matriz v46 (`csvTextoSeguro` unitário, propriedade do total, smoke de storage corrompido, ~1h); ESLint no CI; modularização futura de `app.js`; métrica anônima de versão.
- Risco nº 1 registrado: **bus factor = 1** — compensado por diário, testes como portão de deploy e regras documentadas.

---

## Sessão de 08/07/2026 — P2 concluída: monitor de uptime criado

- O gestor **criou o monitor no UptimeRobot** (conta gratuita): monitor **HTTP** para `https://calculadora-ac4-pmgo.github.io/`, intervalo de **5 minutos**. Última pendência do backlog encerrada.
- **A confirmar pelo gestor:** que o **contato de alerta por e-mail** (welitonsp@gmail.com) esteja ativo e vinculado ao monitor — sem isso o UptimeRobot detecta a queda mas não notifica. As demais etapas do onboarding (SMS, push, selo público, MCP/API) são opcionais.
- **Não há mais pendências abertas no diário.** Backlog da auditoria de produção 100% tratado (P1–P4 resolvidos ou fora de escopo por decisão do gestor).

---

## Sessão de 08/07/2026 — residuais de a11y aprovados pelo gestor (v53)

Os dois residuais menores de acessibilidade documentados na v52 foram **aprovados e aplicados**:

- **`--text-faint` (tema claro):** `#93a4b7` (2,55:1) → **`#64707c`** — passa o AA em todas as superfícies claras (≥4,53:1). As dicas ("(opcional)", `.table-note`, `.fim-hint`) ficaram mais legíveis, mantendo a hierarquia.
- **Duplo `<h1>`:** o título do relatório de impressão virou `<p class="pr-title">` (estilo idêntico no PDF via `.pr-header .pr-title`). Agora há **um único `<h1>`** na página.

Auditoria re-executada: **0 falhas de contraste** (15 pares) e `h1=1`. Relatório atualizado em [`relatorio_acessibilidade_v52.md`](relatorio_acessibilidade_v52.md). Smoke (16 passos), run-tests e verificação visual desktop verdes. **A partir da v53 não há residuais de a11y abertos.**

---

## Sessão de 08/07/2026 — conclusão das fases pendentes P3/P4 (v52)

Fechadas as pendências acionáveis do diário. Resta só a **P2 (uptime)**, que depende do gestor.

### O que foi feito

- **P3 — Otimização do ícone (RESOLVIDO):** `assets/icon-512.png` **121KB → 14KB (−88%)** e `icon-192.png` **20KB → 5,6KB (−73%)**, sem perda visual. Como a estação não tem pngquant/ImageMagick/sharp, criei `tools/optimize-icons.mjs`: rasteriza `assets/icon.svg` no Chrome headless, extrai os pixels e **codifica um PNG indexado (paleta ≤256 cores) usando só o `zlib` nativo do Node** — mesma técnica do pngquant, zero dependências. Reexecutável quando o SVG mudar.
- **P3 — Testes de fronteira:** já concluído na v50 (5 casos em `__ac4Testes`).
- **P3 — Acessibilidade documentada (RESOLVIDO):** auditoria de contraste WCAG 2.1 AA (15 pares) + checagem de DOM via Chrome, registrada em [`relatorio_acessibilidade_v52.md`](relatorio_acessibilidade_v52.md). Corrigidos os 2 contrastes falhos mais críticos com ajustes **imperceptíveis**: `--text-muted` claro `#66778c→#627286` (4,23→4,54:1) e `--text-faint` escuro `#71829a→#73859d` (4,42→4,59:1); `#dialogConfirm` ganhou `aria-label`. DOM: `lang`, `alt`, nomes de botões, rótulos de formulário, skip-link e live regions — tudo aprovado.
- **P4 — `window.onerror` anônimo (RESOLVIDO):** handler global (`error` + `unhandledrejection`) em `app.js` (`initObservabilidade`) que avisa o usuário com toast discreto (throttle de 10s) e guarda um **log anônimo local** (`pmgoErros`, máx. 20 entradas: horário/mensagem/origem, **sem dados pessoais** — o origin é removido). Inspeção via `window.__ac4Erros()`, limpeza via `window.__ac4LimparErros()`. Coberto por 1 passo novo de smoke.
- **P4 — JSDoc (RESOLVIDO):** adicionado às funções de contrato não óbvio dos módulos puros (`calculo.mjs` com `@typedef` de Escala/Tabela/ResultadoEscala; `formato.mjs` e `agenda.mjs` nos exports principais).
- **Smoke: 16 passos** (novos: 3 de agenda na v51, 1 de observabilidade). `run-tests` e `mobile-check` verdes. Verificação visual desktop (tema claro) sem regressão.

### Residuais menores (recomendação — dependem de decisão do gestor)

- **`--text-faint` no tema claro (`#93a4b7`, 2,55:1):** falha AA, mas só em textos suplementares pequenos ("(opcional)", dicas). Corrigir pleno (~`#6b7886`) é **mudança visível** e reduz a hierarquia muted/faint — por isso não foi aplicado sem aprovação (regra: estética não muda sem pedido).
- **Dois `<h1>`:** o segundo é o título do relatório de **impressão** (`display:none` em tela). Defensável; se quiser 100% no critério de headings, trocar por `<p>` estilizado.

### Pendência que permanece

| Prioridade | Item | Observação |
| --- | --- | --- |
| P2 | **Monitor de uptime externo** | Depende do gestor: criar conta gratuita (ex.: UptimeRobot), monitor HTTP para a URL pública, 5 min, alerta por e-mail. ~3 min. Não é código. |

---

## Sessão de 08/07/2026 — reformulação do agendamento no celular (v51)

### Problema relatado pelo gestor

Em testes com celulares de colegas, o fluxo de "Agenda" no celular ficou **confuso e ruim**: tocava em Agenda → um confirm "Adicionar à agenda do celular?" → **baixava um `.ics`** → o PM tinha que sair do navegador, achar o arquivo em Downloads e abri-lo, e só então a agenda perguntava de novo. Muitos passos, sem feedback, e em vários Android o `.ics` nem abre a agenda sozinho.

### O que foi feito (v51)

- **Celular e desktop agora usam o MESMO dialog de provedores** (`abrirDialogAgenda`). No celular, tocar **Google Agenda** (ou Outlook) abre o evento **já pré-preenchido** — um toque em *Salvar*. Removidos o `dialogConfirmar` redundante e a função `agendarNoCelular` (`agendarEscalas` não ramifica mais por `isMobileViewport`).
- **"Baixar arquivo (.ics)"** virou uma opção de rodapé no mesmo dialog (separada por filete tracejado), ideal para **Apple Calendar / Samsung / outras agendas** — preserva o comportamento antigo como alternativa, sem forçá-lo. Com N escalas, o `.ics` continua trazendo todas num arquivo só.
- Cópia do hint do Google ajustada para "Abre com o evento pronto".
- **Smoke ganhou 3 passos** (dialog abre com 4 opções; Google presente; alternativa `.ics` presente) — 15 passos no total, todos verdes. `run-tests` e `mobile-check` verdes.
- **Decisão revista**: a decisão anterior (PR #27) de "no celular abrir a agenda padrão via `.ics`" mostrou-se ruim na prática e foi substituída pelo fluxo de link direto + `.ics` como alternativa.

---

## Sessão de 08/07/2026 — testes de fronteira (v50)

### O que foi feito

- **P3 resolvido — Testes de fronteira do cálculo** (§10 da auditoria): adicionados 5 casos novos a `window.__ac4Testes` (`js/app.js`), todos verdes:
  - Fronteira dom→seg cruzando 05h (dom 20h→seg 08h): 3h AD, 2h VD, 7h VN → R$ 485,00.
  - Escala de **1 minuto**: 1 min AD → R$ 0,50.
  - **Término 00:00** (seg 22h→ter 00:00): 2h AN → R$ 66,00 (o minuto do término não é contado — intervalo semiaberto).
  - **Bissexto** ter 29/02/2028 08h→18h: 10h AD → R$ 300,00.
  - Vermelha na madrugada (sex 22h→sáb 06h): 1h VD, 7h VN → R$ 355,00.
  - Valores derivados das regras da Portaria 621/2026 **e** conferidos contra `calculo.mjs` antes de fixados. `calculo.mjs` **não foi alterado**.
- Versão bumpada para **v50** (`node tools/bump-version.mjs 50`).
- Testes locais: `run-tests` (agora 10 casos de cálculo + 7 de agendamento) e `smoke` (12 passos, PDF 73KB) — todos verdes.

### Pendências que seguem abertas

- **P2 — Monitor de uptime externo**: continua dependendo do gestor (criar conta UptimeRobot etc.). Nada a fazer no código.
- **P3 — Otimizar `assets/icon-512.png` (~121KB)**: ainda bloqueado por tooling — esta estação não tem pngquant/ImageMagick/sharp nem projeto npm. (O `convert` do PATH é o do Windows, não ImageMagick.)
- **P3 — Lighthouse a11y documentado**: não executado nesta sessão.
- **P4 — JSDoc / `window.onerror` anônimo**: não executado nesta sessão.

---

## Sessão de 07/07/2026 — encerramento

### Estado ao encerrar

| Item | Estado |
| --- | --- |
| Versão em produção | **v49** (cache `ac4-v49`), verificada em https://calculadora-ac4-pmgo.github.io/ |
| Último merge | PR #31 (`b0dd7da` na `main`) |
| CI | Verde — `test` (run-tests + smoke 12 passos + mobile-check) roda em **PRs e na main**; `deploy` só na main |
| Testes locais | Todos verdes na última execução |
| Auditoria de produção | Nota 8,0/10 — **Fases 1, 2 e 3 do plano de ação executadas** |
| Trabalho inacabado | **Nenhum** — não há branch aberto nem mudança pela metade |

### O que foi feito hoje (sequência completa)

1. **PR #27 (v46)** — Agendamento inteligente por plataforma: no celular, "Agenda" abre o app de agenda **padrão do aparelho** (via `.ics`); no desktop, dialog `#dialogAgenda` com Google Agenda / Outlook pessoal / Outlook corporativo (sem gerar arquivo); com N escalas, lista um link por escala. Botão "Adicionar à agenda" removido da topbar.
2. **PR #28** — Auditoria completa de produção documentada em [`relatorio_auditoria_producao_v46.md`](relatorio_auditoria_producao_v46.md) (15 seções, matriz de riscos, backlog de 10 itens).
3. **PR #29 (v47) — Fase 1 da auditoria:**
   - **P1-A resolvido**: o gestor forneceu o PDF da **Portaria SSP nº 621/2026** — o Anexo I confirma que a tarifa é **por dia da semana em que a hora é trabalhada** (minuto a minuto), exatamente como `calculo.mjs` sempre fez. O README estava errado e foi reescrito. Portaria transcrita em [`portaria-ssp-621-2026.md`](portaria-ssp-621-2026.md). **`calculo.mjs` não foi alterado.**
   - **P1-B resolvido**: teto de duração de **192h** (limite de horas que o policial pode fazer — valor definido pelo gestor) em `validarIntervaloEscala` (`formato.mjs`, `DURACAO_MAX_HORAS`). Elimina o travamento por typo de ano.
4. **PR #30 (v48) — Fase 2 + decisão do gestor:**
   - **Importação de `.ics` removida por completo** (decisão: *"não vamos importar nada — o objetivo é fazer cálculo no sistema"*). Saíram: dialog, input de arquivo, `initImportacao` e funções, `parseICS` do `agenda.mjs`, suíte de testes de importação, CSS `.import-*`. −312 linhas. **Exportações preservadas** (agendar/CSV/PDF/compartilhar).
   - CSV injection neutralizado (`csvTextoSeguro` em `formato.mjs` — apóstrofo em células iniciadas por `=` `+` `-` `@`).
   - CI passou a rodar em pull requests (deploy continua só na main).
5. **PR #31 (v49) — Fase 3:**
   - Site público montado em `_site` **sem `docs/`, `tests/` e `tools/`** (relatórios internos fora do ar; seguem no repo). `assets/brasao-19crpm.png` órfão removido.
   - Link **"Privacidade"** no rodapé (dialog com resumo LGPD); hint "não insira dados pessoais" no campo Unidade; `<noscript>`; Qtd. PM digitada clampada a 999.
   - Horas diurnas/noturnas exibidas **com minutos** (`fmtHoras`) em chips/WhatsApp/métricas/PDF/agenda; `fmtHorasCheias` removida.
   - Smoke ganhou 2 passos: relatório de impressão populado + **PDF real** via `Page.printToPDF` (≥10KB).

### Decisões do gestor registradas hoje (não reabrir sem nova decisão)

- **Regra de cálculo**: minuto a minuto por dia da semana, conforme Portaria 621/2026 — validada e correta. Não mexer em `js/modules/calculo.mjs`.
- **Teto de duração**: **192 horas** (limite de horas do policial).
- **Importação**: o sistema **não importa nada** — é ferramenta de cálculo. Não reintroduzir importação de agenda.
- **Sem identificação de usuário** (LGPD por minimização) — não adicionar login/cadastro/dados pessoais.

### Pendências para as próximas sessões

| Prioridade | Item | Observação |
| --- | --- | --- |
| P2 | **Monitor de uptime externo** | Único item que depende do gestor: criar conta gratuita (ex.: UptimeRobot), monitor HTTP para a URL pública, intervalo 5 min, alerta por e-mail. ~3 minutos. |
| P3 | Otimizar `assets/icon-512.png` (~121KB) | Precisa de ferramenta de quantização PNG (pngquant/squoosh) — não disponível na estação anterior. |
| P3 | Testes de fronteira do cálculo | dom→seg cruzando 05h; exatamente 22h→05h; escala de 1 min; término 00:00; 29/02/2028 (ver §10 da auditoria). |
| P3 | Lighthouse a11y documentado | Rodar auditoria de contraste/acessibilidade e registrar resultado. |
| P4 | JSDoc nos módulos puros; erros JS agregados anônimos (`window.onerror` sem dados pessoais) | Evoluções de manutenção/observabilidade. |

### Como retomar em outra estação de trabalho

1. **Pré-requisitos**: Git, Node.js ≥ 22, Google Chrome instalado, GitHub CLI (`gh`).
2. **Clonar e autenticar**:
   ```sh
   git clone https://github.com/calculadora-ac4-pmgo/calculadora-ac4-pmgo.github.io.git
   cd calculadora-ac4-pmgo.github.io
   gh auth login
   ```
3. **Validar o ambiente** (deve ficar tudo verde; Node 22–24):
   ```sh
   npm ci --ignore-scripts
   npm run verify   # lint + unit (inclui conformidade com o Anexo I) + smoke + mobile + mobile-v55 + Web Vitals
   ```
   (Se o Chrome não for achado automaticamente, defina `CHROME_PATH`. Com a CPU ocupada, os testes de desempenho podem oscilar; o CI é o juiz.)
4. **Fluxo de trabalho do projeto**:
   - Branch → commit → push → `gh pr create` → **aguardar o check `test` do PR** → `gh pr merge --merge --delete-branch` → CI da main testa de novo e faz o deploy. A proteção da `main` exige o check `test` **inclusive para admin**; não há como mesclar com CI vermelho (rode de novo o job ou corrija).
   - Qualquer mudança em `index.html`/`css`/`js` exige bump de versão: `node tools/bump-version.mjs <n>` (versão atual e próxima: ver `CLAUDE.md` na raiz).
   - Smoke pode falhar esporadicamente no runner ("Chrome não expôs o DevTools em 60s") — é flake de infraestrutura; `gh run rerun <id> --failed` resolve. **Exceção**: se o job de *deploy* do Pages falhar, disparar run novo com `gh workflow run deploy.yml` (não usar rerun no deploy).
5. **Ler antes de mexer em regra/valor**: [`portaria-ssp-621-2026.md`](portaria-ssp-621-2026.md) (base normativa) e [`relatorio_auditoria_producao_v46.md`](relatorio_auditoria_producao_v46.md) (riscos e backlog).

### Regras invioláveis do projeto (resumo)

- `js/modules/calculo.mjs` e os valores da Portaria só mudam com **nova norma + decisão formal do gestor**. A suíte "Conformidade com o Anexo I" (`tests/run-tests.mjs`) precisa continuar verde.
- Valor = **só horas inteiras por faixa** (AD/AN/VD/VN) — decisão do gestor em 23/09/2026 (v71).
- Nunca coletar/armazenar dados pessoais (LGPD) — sem login, sem identificação.
- Ações destrutivas na UI sempre via `dialogConfirmar()` (nunca `confirm()` — quebra em iOS PWA).
- Dados novos no navegador sempre em `localStorage` com prefixo `pmgo*`.
- Mobile-first: regras de layout mobile em `@media (max-width: 760px)`; desktop não muda sem pedido.
- Formulário mobile: campos **empilhados** (rótulo em cima) — nunca rótulo à esquerda com `datetime-local`.
- Nunca confiar no repaint de `input[type=datetime-local]` após set via JS no Android — manter o espelho `#fimResumo`.


---

## Sessão de 22/09/2026 — v65 a v67 e estudo estratégico

> Ponto de entrada para agentes de IA agora é o [`CLAUDE.md`](../CLAUDE.md) na raiz; backlog em
> [`ESTUDO_ESTRATEGICO_v67.md`](ESTUDO_ESTRATEGICO_v67.md).

- **v65 (deploy destravado):** o deploy falhava desde o PR #58 porque `tests/run-tests.mjs` fixava `SW_VERSION = '64'`. Testes passaram a ler a versão do app; `force-update.js` virou limpeza única por versão.
- **PR #59:** actions do workflow atualizadas para Node 24 (pin por SHA) e runner `ubuntu-26.04`.
- **v66 (PR #60):** PDF abre após o próximo paint (INP de 11,3 s no RUM); histórico de 6 meses no painel; lembrete de backup (`pmgoUltimoBackup`, `pmgoLembreteBackup`); `bump-version.mjs` passou a atualizar `force-update.js`.
- **v67 (PR #61):** o redesign da v65 nunca tinha ido ao ar (pasta `ac4-v65-files/` apagada em vez de movida no commit `2d6f7a3`). Restaurado a partir de `f31c0f8`; novo teste "Release" (topo do CHANGELOG = versão do app; proibidas pastas de rascunho na raiz).
- **PR #62:** limite de inicialização do Chrome nos testes: 20 s → 60 s.
- **Estudo estratégico v67:** placar, 7 riscos (R1–R7) e backlog de 30/90/365 dias em `ESTUDO_ESTRATEGICO_v67.md`. Próxima tarefa recomendada: **R1** (dados apagados no Safari/iOS).

---

*Histórico anterior a esta sessão: ver `relatorio_auditoria_producao_v46.md`, `ESCOPO_MVP.md`, `CHECKLIST.md` e o log de PRs (#13–#31) no GitHub.*
