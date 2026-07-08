# Diário de Bordo — Calculadora AC4

> Documento de continuidade do projeto. Registra onde paramos, o que está pendente e como retomar o trabalho **em qualquer estação de trabalho**. Atualizar ao final de cada sessão relevante de desenvolvimento.

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
3. **Validar o ambiente** (deve ficar tudo verde):
   ```sh
   node tests/run-tests.mjs     # regras de cálculo + geração .ics
   node tests/smoke.mjs         # fluxo E2E em Chrome headless (12 passos, inclui PDF)
   node tests/mobile-check.mjs  # UX mobile (3 viewports + roteiro iOS)
   ```
   (Se o Chrome não for achado automaticamente, defina `CHROME_PATH`.)
4. **Fluxo de trabalho do projeto**:
   - Branch → commit → push → `gh pr create` → **aguardar o check `test` do PR** → `gh pr merge --merge --delete-branch` → CI da main testa de novo e faz o deploy.
   - Qualquer mudança em `index.html`/`css`/`js` exige bump de versão: `node tools/bump-version.mjs <n>` (próxima: **v50**).
   - Smoke pode falhar esporadicamente no runner ("Chrome não expôs o DevTools em 20s") — é flake de infraestrutura; `gh run rerun <id> --failed` resolve. **Exceção**: se o job de *deploy* do Pages falhar, disparar run novo com `gh workflow run deploy.yml` (não usar rerun no deploy).
5. **Ler antes de mexer em regra/valor**: [`portaria-ssp-621-2026.md`](portaria-ssp-621-2026.md) (base normativa) e [`relatorio_auditoria_producao_v46.md`](relatorio_auditoria_producao_v46.md) (riscos e backlog).

### Regras invioláveis do projeto (resumo)

- `js/modules/calculo.mjs` e os valores da Portaria só mudam com **nova norma + decisão formal do gestor**.
- Nunca coletar/armazenar dados pessoais (LGPD) — sem login, sem identificação.
- Ações destrutivas na UI sempre via `dialogConfirmar()` (nunca `confirm()` — quebra em iOS PWA).
- Dados novos no navegador sempre em `localStorage` com prefixo `pmgo*`.
- Mobile-first: regras de layout mobile em `@media (max-width: 760px)`; desktop não muda sem pedido.
- Formulário mobile: campos **empilhados** (rótulo em cima) — nunca rótulo à esquerda com `datetime-local`.
- Nunca confiar no repaint de `input[type=datetime-local]` após set via JS no Android — manter o espelho `#fimResumo`.

---

*Histórico anterior a esta sessão: ver `relatorio_auditoria_producao_v46.md`, `ESCOPO_MVP.md`, `CHECKLIST.md` e o log de PRs (#13–#31) no GitHub.*
