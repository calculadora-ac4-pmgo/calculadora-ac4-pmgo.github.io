# Reauditoria de Produção — Calculadora AC4 (v53)

- **Data:** 08/07/2026
- **Escopo:** repositório @ `main` (v53, commit `41128e1`); produção verificada ao vivo em `https://calculadora-ac4-pmgo.github.io/`.
- **Baseline:** auditoria v46 de 07/07/2026 ([`relatorio_auditoria_producao_v46.md`](relatorio_auditoria_producao_v46.md)) — nota 8,0/10, 2×P1, 3×P2, 7×P3, backlog de 10 itens.
- **Método:** mesma pauta da auditoria anterior (engenharia, segurança, LGPD, UX/a11y, testes/CI, performance, observabilidade), com evidência re-coletada nesta data: execução local das 3 suítes, inspeção individual dos 8 pontos de `innerHTML`, verificação HTTP da produção (versão, 404 de internos, headers), leitura do workflow e dos módulos.
- **Nota de maturidade: 9,2/10** — sem P0, **sem P1, sem P2 abertos**. Resta apenas polimento P3/P4.

---

## 1. Resumo executivo

Desde a auditoria v46 (ontem), **todos os 10 itens do backlog foram executados** — incluindo os dois P1 (regra normativa validada contra a Portaria transcrita; teto de 192h) e os três P2 (CSV injection, CI em PR, uptime externo). Além do backlog, a versão atual reformulou o fluxo de agendamento mobile (dialog único de provedores + `.ics` como alternativa), adicionou observabilidade anônima de erros JS e passou por auditoria de acessibilidade com **zero falhas de contraste WCAG AA**.

**Resposta à pergunta do gestor ("nível de big tech?"):** para o porte e a classe do produto (SPA estática de utilidade pública, zero backend), o projeto **opera com disciplina comparável à de times maduros**: deploy bloqueado por 3 camadas de teste, E2E real em Chrome (16 passos, inclusive PDF binário), regra de negócio isolada/pura/documentada contra a norma, privacidade por arquitetura, runbook de continuidade (diário de bordo), versionamento disciplinado e auditorias registradas. O que ainda o separa do padrão big tech pleno está listado no §8 — nenhum item é bloqueante e vários são estruturalmente inaplicáveis a um projeto de mantenedor único sem backend.

## 2. Status do backlog da auditoria v46 (10/10 concluídos)

| # | Item (v46) | Status | Evidência |
|---|---|---|---|
| 1 | P1 — Validar Portaria e alinhar README × código | ✅ v47 | Portaria transcrita em [`portaria-ssp-621-2026.md`](portaria-ssp-621-2026.md); código estava correto; README reescrito |
| 2 | P1 — Teto de duração | ✅ v47 | `DURACAO_MAX_HORAS = 192` em `formato.mjs`; 2 testes; typo de ano rejeitado |
| 3 | P2 — CSV injection | ✅ v48 | `csvTextoSeguro` (`formato.mjs:144`) aplicado em `exportarCSV` |
| 4 | P2 — CI em PR | ✅ v48 | `deploy.yml`: gatilho `pull_request`; deploy com `if: github.event_name != 'pull_request'` — verificado nos PRs #33–#36 |
| 5 | P2 — Uptime externo | ✅ 08/07 | Monitor UptimeRobot HTTP, 5 min, alerta e-mail (conta do gestor) |
| 6 | P3 — Artefato sem docs/tests/tools + brasão | ✅ v49 | **Verificado ao vivo:** `/docs/DIARIO_DE_BORDO.md` → 404, `/tests/smoke.mjs` → 404; brasão removido |
| 7 | P3 — Testes de fronteira | ✅ v50 | 5 casos novos (dom→seg 05h, 1 min, término 00:00, bissexto, madrugada vermelha) |
| 8 | P3 — README/noscript/clamp/privacidade | ✅ v49 | Árvore com `js/modules/`; `<noscript>`; clamp 999; dialog Privacidade + hint LGPD na Unidade |
| 9 | P3 — Ícone + teste de PDF | ✅ v49/v52 | PDF real no smoke (74KB); `icon-512` 121KB→**14KB** via `tools/optimize-icons.mjs` (PNG indexado, zero deps) |
| 10 | P4 — Erros JS anônimos + JSDoc | ✅ v52 | `initObservabilidade` (error + unhandledrejection, log `pmgoErros` sem origin/dados pessoais); JSDoc nos 3 módulos puros |

Extras não previstos no backlog: agendamento mobile reformulado (v51, feedback de usuários reais); auditoria a11y com correção de paleta AA (v52–v53, [`relatorio_acessibilidade_v52.md`](relatorio_acessibilidade_v52.md)); h1 único.

## 3. Segurança (re-verificada)

- **XSS:** os **8** usos de `innerHTML` de `app.js` foram re-inspecionados um a um nesta data (linhas 170, 590, 807, 873, 895, 940, 1015, 1040). Toda interpolação de entrada do usuário (`descricao`/unidade, origem, mensagens, links de agenda, aria-label dos cards) passa por `escapeHTML`; os demais valores interpolados são saídas de formatadores numéricos/data sobre datas validadas. **Sem vetor encontrado.**
- **CSV:** `csvTextoSeguro` neutraliza `= + - @ \t \r` antes do aspas-duplas. ✔
- **CSP** (meta): `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Limitações de plataforma inalteradas e aceitas: `style-src 'unsafe-inline'`; sem `frame-ancestors` (GitHub Pages não permite headers de resposta). Produção envia **HSTS** (`max-age=31556952`) pela plataforma.
- **Service Worker:** network-first `cache: 'no-cache'`, só GET/same-origin, `updateViaCache: 'none'`, shell instalado com `cache: 'reload'`, purge de caches antigos, fallback de navegação apenas para `index.html`. Cache `ac4-v53` coerente com os `?v=53`.
- **Supply chain:** zero dependências npm; único terceiro segue sendo o beacon Cloudflare (cookieless, permitido por CSP; sem SRI — risco aceito e documentado).
- **Segredos:** nenhum (re-verificado).

## 4. LGPD

Inalterado e conforme: nenhum dado pessoal coletado; dados exclusivamente em `localStorage` com prefixo `pmgo*`; dialog "Privacidade" no rodapé; hint no campo Unidade. **Novo desde a v46:** o log de erros (`pmgoErros`) foi desenhado dentro dos limites do §12 da auditoria anterior — grava só horário/mensagem/arquivo:linha, **remove o origin**, nunca conteúdo de campos, máx. 20 entradas, local ao aparelho. A decisão de **não importar nada** e **não identificar usuário** segue registrada como inviolável.

## 5. Testes e CI (executados nesta reauditoria)

- `run-tests`: **10** casos de cálculo + **7** de agendamento — verdes.
- `smoke`: **16 passos** — verdes (fluxo completo + validações + relatório impresso + dialog de agenda + observabilidade + **PDF real de 74KB** via `Page.printToPDF`).
- `mobile-check`: 3 viewports + roteiro iOS — verde.
- CI roda as 3 suítes em PR e na main; deploy só na main após `test` verde. Verificado nos runs dos PRs #33–#37.

**Matriz mínima proposta na v46 — cobertura atual: 6 de 8.** Pendem (P3, não bloqueantes):
1. Teste unitário direto de `csvTextoSeguro` (a função está em produção e é usada, mas sem caso dedicado que fixe o contrato).
2. Teste de propriedade: total geral = Σ dos valores por escala (N escalas aleatórias).
3. Smoke de `localStorage` corrompido — o código **trata** o caso (`carregar()` com `try/catch` + filtro de itens malformados, `app.js:137-146`, re-inspecionado), mas não há passo de teste que o prove.

## 6. Performance

- Payload crítico ≈ **195KB** não comprimido (HTML 28 + CSS 52 + JS 66 + módulos 20 + fonte latina 48; a `inter-latin-ext` de 85KB só baixa se houver glifo estendido, por `unicode-range`). Sem framework. Com gzip da plataforma, a transferência real fica em torno de 60–70KB.
- Ícones agora 5,6KB/14KB (eram 21KB/121KB) — item de performance da v46 encerrado.
- PWA: repeat-visit servido do cache; `Cache-Control: max-age=600` + cache-busting `?v=` + SW network-first eliminam a classe "usuário preso em versão velha".

## 7. Acessibilidade

Estado pós v52/v53 ([relatório dedicado](relatorio_acessibilidade_v52.md)): **0 falhas de contraste** nos 15 pares auditados (claro e escuro), h1 único, todos os dialogs nomeados, 0 imagens sem alt, 0 botões sem nome, 0 campos sem rótulo, skip-link, 4 live regions. Não há residual aberto.

## 8. O que ainda separa o projeto do padrão "big tech" pleno

Nenhum item abaixo é defeito; são deltas estruturais, em ordem de relevância:

| Delta | Situação | Aplicabilidade |
|---|---|---|
| **Bus factor = 1** (um mantenedor; sem code review humano de segundo par) | Mitigado por: diário de bordo detalhado, testes bloqueando deploy, regras invioláveis documentadas | O maior risco real do projeto — organizacional, não técnico |
| Sem lint/análise estática no CI (ESLint/typecheck) | JSDoc adicionado na v52 ajuda, mas nada é imposto pelo CI | Barato de adicionar; valor moderado num codebase vanilla estável |
| Sem ambiente de staging | PRs testam mas não geram preview do site | Aceitável: smoke E2E cobre o fluxo; Pages não oferece preview nativo |
| 2 lacunas de teste da matriz v46 (§5) | csvTextoSeguro, propriedade do total, storage corrompido | ~1h de esforço |
| CSP sem headers reais / sem SRI no beacon | Limitação do GitHub Pages | Só resolvível migrando de hospedagem — não se justifica |
| Telemetria de erros centralizada | **Deliberadamente ausente** (LGPD por minimização); log local + uptime externo cobrem o essencial | Conformidade > telemetria, decisão correta para o contexto |
| `app.js` ~1.500 linhas | Coeso, mas concentra UI+PWA+exportações | P4: extrair módulos se continuar crescendo |

## 9. Veredito

- **Pode permanecer em produção? Sim**, sem ressalvas — pela primeira vez sem nenhum P1/P2 aberto.
- **Nota: 9,2/10** (era 8,0). O ganho veio de: risco normativo eliminado com a Portaria em anexo; risco de disponibilidade eliminado (teto 192h); segurança endurecida (CSV); CI em PR; site público sem artefatos internos; a11y AA verificada; observabilidade dentro da LGPD; uptime monitorado.
- **"Nível de big tech?"** No que é comparável — disciplina de release, testes como portão de deploy, segurança auditada, privacidade por design, documentação de continuidade — **sim, o projeto pratica o padrão**. Os deltas restantes (§8) são ou estruturais (mantenedor único, plataforma de hospedagem) ou polimento de ~1h (lacunas de teste). A nota não é 10 porque big tech pressupõe redundância humana (review de pares, on-call) que um projeto individual não tem como prover — e isso deve ficar registrado como o risco número 1 de longo prazo: **documentar e testar é a compensação, e está sendo feita**.

## 10. Backlog residual (tudo P3/P4)

| Ordem | Prioridade | Tarefa | Esforço |
|---|---|---|---|
| 1 | P3 | 3 testes da matriz v46: `csvTextoSeguro` unitário; propriedade do total (N aleatórias); smoke de storage corrompido | ~1h |
| 2 | P4 | ESLint (flat config, sem build) rodando no CI | ~1h |
| 3 | P4 | Extrair `exportacoes.mjs`/`pwa.mjs` de `app.js` se passar de ~1.700 linhas | sob demanda |
| 4 | P4 | Métrica anônima de versão adotada (detectar clientes presos em cache) | ~2h |

---

## Adendo — Execução das melhorias residuais (08/07/2026, v54)

Itens 1, 2 e 4 do §10 executados. **Item 3** (modularização) segue sob demanda — `app.js` ainda coeso.

### Achado crítico durante a execução (regressão P1 latente, agora corrigida)

Ao escrever o teste de exportação de CSV (item 1), a exportação foi dirigida em Chrome headless e **lançou `Uncaught ReferenceError: csvTextoSeguro is not defined` (`app.js:1067`)**: a função existia em `formato.mjs` e era chamada em `exportarCSV`, mas **nunca foi importada** em `app.js`. Ou seja, **o botão CSV estava quebrado desde a v48** e a auditoria v46/v53 não detectou porque não havia teste de CSV — exatamente a lacuna apontada. Detalhes:

- **Como foi flagrado:** o handler `initObservabilidade` (criado na v52) capturou o erro no log `pmgoErros`, provando o valor da observabilidade anônima.
- **Correção:** `csvTextoSeguro` adicionado ao import de `formato.mjs` em `app.js`.
- **Guardas de regressão:** (a) passo de smoke "Exportar CSV não lança erro"; (b) o novo lint `no-undef` pega estaticamente essa classe de bug antes do runtime.

### Melhorias aplicadas

- **ESLint 9 (flat config) no CI** (`eslint.config.mjs`): regras focadas em bugs (`no-undef`, `no-unused-vars`, `no-const-assign`, `valid-typeof`, `use-isnan`…), globais por contexto (browser/ESM, service worker, node). Zero dependências no repo — o CI roda via `npx --yes eslint@9`. Corrigiu 1 achado real (`catch (e)` não usado em `theme.js`). Excluído do artefato Pages.
- **Suíte `__ac4TestesExtras`** (rodando no CI): 8 casos de `csvTextoSeguro` (neutraliza `= + - @` / tab / CR; preserva texto comum) + invariantes de `calcularEscala` sobre 50 escalas aleatórias (soma das categorias = mins; diurno+noturno = mins; vermelha ≤ mins; valor inteiro ≥ 0 reproduzindo a fórmula; total geral = Σ por escala).
- **Smoke: 16 → 18 passos** (+ "Exportar CSV não lança erro" e "localStorage corrompido: app carrega vazio sem quebrar").
- **Métrica anônima de versão:** `APP_VERSION` carimba cada entrada do log de erros (`v`), `window.__ac4Version` expõe a versão em execução para suporte, e a troca de versão é registrada em `pmgoVersion` (detecta cliente preso em cache) — tudo local, sem dado pessoal. `bump-version.mjs` passou a sincronizar `APP_VERSION`.

**Nota revisada: 9,5/10.** A cobertura de teste agora fecha as 3 lacunas da matriz v46, o lint impede a reincidência da classe de bug que estava viva em produção, e a observabilidade provou seu valor em campo. Os deltas remanescentes para "big tech pleno" são estruturais (bus factor = 1, ausência de staging/preview nativo no Pages, CSP sem headers reais) e não resolvíveis sem mudar hospedagem ou equipe.
