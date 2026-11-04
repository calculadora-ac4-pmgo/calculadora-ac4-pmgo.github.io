# Relatório de Auditoria de Produção — Calculadora AC4 v67

**Auditoria:** BIH TECHS · **Data:** 23/09/2026 · **Versão auditada:** v67 (`main` = `37e9f13`, PR #63)
**Produção:** <https://calculadora-ac4-pmgo.github.io/> · **Auditoria anterior:** v53/v54 (nota 9,5/10)

---

## 1. Resumo executivo

**Nota: 8,6 / 10.** Não há P0 nem P1. A regra de cálculo continua correta e bem testada, a segurança
de base está boa e todas as suítes passam. A nota caiu em relação à v54 (9,5) porque as 13 versões
seguintes (v55–v67) trouxeram dívida nova: custo de cálculo que cresce com o histórico, um mecanismo
de atualização forçada que anula a atualização segura da v64 e documentação que se contradiz.

| Área | Situação |
| --- | --- |
| Regra de negócio (Portaria SSP 621/2026) | ✅ Conferida contra o Anexo I — tarifas, faixa noturna e madrugada no dia anterior |
| Testes | ✅ Lint + unit + smoke (40 passos, PDF real) + mobile (2 suítes) + Web Vitals — todos verdes nesta máquina |
| Segurança | ✅ CSP, `escapeHTML` em todos os dados do usuário, CSV neutralizado, HSTS, sem segredos, `npm audit` = 0 |
| Produção | ✅ HTTP 200, `sw.js` = v67, `docs/` `tests/` `package.json` em 404 |
| Desempenho com histórico longo | ⚠️ Cálculo minuto a minuto sem cache, repetido várias vezes por render |
| Ciclo de atualização da PWA | ⚠️ `force-update.js` recarrega a página a cada versão, sem confirmação |
| Documentação/governança | ⚠️ Diário, escopo e backlog se contradizem |

## 2. Evidências coletadas

- `npm ci` → 0 vulnerabilidades; `npm run lint` → limpo.
- `tests/run-tests.mjs` → todas as suítes OK (cálculo, extras/CSV, lançamento, agendamento, hardening v58, atualização PWA, release).
- `tests/smoke.mjs` → **40 passos OK** (PDF de 63 KB); `mobile-check` OK; `mobile-v55-check` 24 verificações OK; `web-vitals-check` OK.
- Produção: `curl -sI` → 200, HSTS presente; `sw.js` linha 4 = `ac4-v67`.
- GitHub: CI verde nas últimas execuções; proteção da `main` com check `test` obrigatório; secret scanning + push protection ativos; Dependabot ativo (1 PR aberto: eslint 10.11.0, verde).
- Regra conferida em `js/modules/calculo.mjs` contra `docs/portaria-ssp-621-2026.md` (Art. 1º e Anexo I).

## 3. Achados

### P2 — Corrigir no próximo ciclo

**P2-1. Custo do cálculo cresce com o histórico e é refeito várias vezes por render.**
`calcularEscala` classifica minuto a minuto, criando um `Date` por minuto (até 11.520 por escala de
192h). `render()` (`js/app.js:1572`), o resumo de planejamento (`js/app.js:1144`) e o histórico de
6 meses (`js/app.js:1307`) recalculam todas as escalas a cada render, sem cache. Cada chamada ainda lê
a tabela do DOM (`tabelaParaCalculo`, `js/app.js:283`). Os dados nunca são descartados, então o custo
só aumenta.
*Medição:* 300 escalas de 24h × 3 passagens = **808 ms** no Node de desktop. Num celular
intermediário (3–5× mais lento), isso passa de 2 s por interação que chame `render()`. O teste de
Web Vitals não pega o problema porque usa poucas escalas.
*Recomendação:* (a) memoizar o resultado por `id` + `inicio` + `fim` + tabela; (b) trocar o laço
minuto a minuto por segmentação em fronteiras (05h, 22h, meia-noite), com as mesmas regras, validada
contra o laço atual nas 50 escalas aleatórias de `__ac4TestesExtras`; (c) incluir no Web Vitals um
cenário com 300 escalas.

**P2-2. `force-update.js` anula a atualização segura da v64.**
O script da v65 (hotfix) continua ativo. A cada versão nova ele desregistra **todos** os Service
Workers, apaga os caches e **recarrega a página sem perguntar**. Isso contradiz a regra do
`CLAUDE.md` ("atualização só com confirmação do usuário"). Há também uma corrida possível com o
`register()` de `app.js`, que pode desregistrar o SW recém-registrado (a recarga acaba corrigindo).
*Recomendação:* aposentar o `force-update.js` (ou restringi-lo a clientes com cache anterior à v64) e
deixar só o banner de atualização. Registrar a decisão no diário.

**P2-3. Dados podem sumir no iPhone.**
Tudo fica só no `localStorage`. No Safari/iOS fora do modo instalado, o armazenamento é apagado após
7 dias sem uso, e `navigator.storage.persist()` não é chamado. O lembrete de backup (v66) ajuda, mas só
aparece a partir de 3 escalas. O item já está no backlog (R1). A recomendação é **subir a
prioridade**, porque é o único caminho conhecido de perda de dados do usuário.

**P2-4. Documentação se contradiz.**
- `docs/DIARIO_DE_BORDO.md` abre com "🏁 PROJETO FINALIZADO — v54 / modo de manutenção", mas o projeto está na v67 com backlog ativo. As sessões v55–v67 não estão registradas no diário (só no CHANGELOG).
- Monitor de uptime: o diário diz que o UptimeRobot foi criado na v54; o `ESTUDO_ESTRATEGICO_v67.md` diz que está "pendente desde a v46".
- `docs/ESCOPO_MVP.md` ainda descreve a importação `.ics`, removida na v48 (R7 no backlog).
- `CLAUDE.md` manda fazer merge com `--merge`, mas a proteção da `main` exige histórico linear (ver P3-3).

*Recomendação:* uma única fonte de verdade para o estado. O diário ganha um topo "Estado atual (v67)",
e o bloco "Projeto finalizado" vira histórico.

### P3 — Melhorias

**P3-1. Código de teste vai para produção.** `__ac4Testes`, `__ac4TestesExtras`,
`__ac4TestesLancamento` e `__ac4TestesAgendamento` (~250 linhas em `js/app.js`) são definidos em
qualquer host. O `CLAUDE.md` diz que os ganchos existem "só em localhost". `__ac4TestesLancamento`
zera e regrava as escalas reais (restaura no `finally`). Se alguém o chamar no console de produção e a
aba fechar no meio, os dados se perdem. *Recomendação:* proteger com o mesmo teste de `localhost` ou
mover para um módulo de teste.

**P3-2. `app.js` com 2.394 linhas.** O limite que o próprio diário definiu era ~1.700. A divisão em
módulos já está no backlog. Sugestão de ordem: exportações (CSV/PDF/agenda), planejamento, testes.

**P3-3. A proteção de branch é contornada em todo merge.** A `main` exige `required_linear_history`,
mas todos os PRs entram como merge commit. Isso só funciona porque `enforce_admins` está desligado, ou
seja, o admin passa por cima da proteção, inclusive do check `test`. *Recomendação:* ou mudar o
fluxo para `--squash`/`--rebase`, ou desligar o histórico linear e ligar `enforce_admins`.

**P3-4. Arquivos de desenvolvimento publicados no site.** O `rsync` do deploy não exclui
`artifacts/` (capturas de teste, HTTP 200 em produção) nem `.editorconfig`. *Recomendação:*
acrescentar `--exclude 'artifacts' --exclude '.editorconfig'` em `.github/workflows/deploy.yml`.

**P3-5. Script de terceiros com acesso total à página.** A CSP libera
`static.cloudflareinsights.com` sem SRI (o beacon não é versionado). Se a Cloudflare for comprometida,
o script lê o `localStorage`. O risco é baixo, mas contraria a promessa de "zero dependências em
produção". Vale citá-lo no texto de privacidade (R4), como operador com transferência internacional.

**P3-6. Rótulo de origem inconsistente.** Na tela (`js/app.js:1630`), a origem usa um `replace`
próprio ("Fazendário", "PREFEITURAS"). No PDF usa `labelOrigem()` ("Faz./Sec. Econ.",
"Prefeituras"). *Recomendação:* usar `labelOrigem()` nos dois lugares.

### P4 — Observações

- A CSP via `<meta>` não aceita `frame-ancestors`, então o site pode ser embutido em iframe. O impacto é baixo porque não há ação sensível, e o GitHub Pages não permite cabeçalhos próprios. Resolve junto com o domínio oficial.
- A chave `pmgoConfig` é gravada, mas a tabela é sempre reposta a partir de `VALORES_OFICIAIS` ao carregar. É vestigial.
- O PR do Dependabot (eslint 10.11.0) está verde e pode ser mesclado.

## 4. Pontos fortes (manter)

- Cálculo isolado em módulo puro, com tabela congelada por lançamento e registro normativo por vigência.
- Todo dado do usuário que vai para `innerHTML` passa por `escapeHTML`. Os demais templates só interpolam valores internos formatados.
- Persistência defensiva: normalização, limites de tamanho, backup com limite de 1 MB e confirmação.
- CI como portão de deploy, actions fixadas por SHA, `persist-credentials: false`, permissões mínimas.
- O incidente da v65 virou teste (bloqueio de pastas `ac4-vNN-files/`), um bom exemplo de aprendizado incorporado.

## 5. Plano de ação sugerido

| Ordem | Item | Esforço |
| --- | --- | --- |
| 1 | P3-4 excluir `artifacts/` do deploy · P3-1 proteger os ganchos de teste · P3-6 rótulo de origem | ~1h (v68) |
| 2 | P2-2 aposentar `force-update.js` | ~1h + teste de atualização |
| 3 | P2-3 / R1 `storage.persist()` + guia iOS + data do último backup | ~2h |
| 4 | P2-1 memoização + cenário de 300 escalas no Web Vitals; depois, cálculo por segmentos | ~3–5h |
| 5 | P2-4 reconciliar diário/estudo/escopo · P3-3 alinhar proteção de branch e fluxo de merge | ~1h (gestão) |
| 6 | P3-2 modularizar `app.js` | backlog |

---

## Adendo — resolução (23/09/2026)

| Item | Resolução | Onde |
| --- | --- | --- |
| P2-1 cálculo × histórico longo | Profiling mostrou que o gargalo era o DOM (~21 mil nós) e o `toLocale*` a cada chamada, não o cálculo. Lista em partes (30 + "Mostrar anteriores"), `Intl` cacheado e cache do cálculo. Adicionar escala com 300 escalas caiu de 2,1–3,7 s para 0,2–0,5 s. Web Vitals ganhou cenário relativo com 300 escalas | v71 · PR #67 |
| P2-2 `force-update.js` | Removido. Teste impede a volta | v69 · PR #65 |
| P2-3 dados no iPhone | `storage.persist()` após lançamento + data do último backup + aviso do Safari no Compartilhar | v70 · PR #66 |
| P2-4 documentação contraditória | Diário com "Estado atual" único no topo; escopo e checklist sem a importação `.ics`; backlog do estudo atualizado (R1, R7 e uptime concluídos; R5 parcial) | PR de governança |
| P3-1 ganchos de teste em produção | Só em `localhost` + teste de regressão | v68 · PR #64 |
| P3-2 `app.js` grande | Dividido em módulos (`templates`, `relatorio`, `pwa`, `testes` sob demanda); 2.489 → ~1.860 linhas; saída idêntica byte a byte; ids escapados nos templates | v72 |
| P3-3 proteção contornada | Histórico linear desligado (o projeto usa merge commit); `enforce_admins` ligado. O check `test` agora vale para todos | GitHub Settings, 23/09 |
| P3-4 `artifacts/` publicados | Excluídos do deploy | v68 · PR #64 |
| P3-5 script de terceiros sem SRI | **Aberto** (depende do texto de privacidade, R4) | — |
| P3-6 rótulo de origem | `labelOrigem()` na tela e no PDF | v68 · PR #64 |

**Extra (fora do relatório original):** revisão da regra contra a Portaria a pedido do gestor. Decisão do gestor: pagar **só horas inteiras por faixa**. Suíte "Conformidade com o Anexo I" com 52 casos, 10 deles da planilha do gestor, todos iguais coluna a coluna (v71).

**Situação:** todos os P2 resolvidos. Resta só o P3-5 (SRI/privacidade), sem risco imediato.
