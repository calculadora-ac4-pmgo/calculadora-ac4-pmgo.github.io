# Relatório de Melhorias — Auditoria Completa (v27)

**Projeto:** Calculadora AC4 · PMGO — https://calculadora-ac4-pmgo.github.io
**Data:** 05/07/2026
**Escopo:** Auditoria completa nos moldes de big tech (arquitetura, segurança, performance, acessibilidade, PWA, qualidade de código e lógica de negócio), seguida da implementação de **todas** as correções e melhorias identificadas.
**Resultado:** 15 arquivos alterados/criados · CI verde (testes + deploy) · publicado em produção.

---

## 1. Resumo executivo

A auditoria avaliou 2.838 linhas de código (HTML, CSS, JavaScript, Service Worker, manifest e workflow de CI) e atribuiu nota **8,3/10**, com aprovação para produção. Foram identificados 3 bugs reais (P1), 6 riscos de robustez (P2) e 8 oportunidades de qualidade (P3). **Todos os 17 itens foram corrigidos na versão v27**, validados por testes de regressão automatizados (10 casos, 100% aprovados) e publicados com deploy verde no GitHub Actions.

| Severidade | Itens | Status |
|---|---|---|
| 🔴 P1 — Bugs | 3 | ✅ Corrigidos |
| 🟡 P2 — Robustez | 6 | ✅ Corrigidos |
| 🔵 P3 — Qualidade | 8 | ✅ Implementados |

---

## 2. Correções P1 — Bugs

### 2.1 Vazamento de listeners no diálogo de confirmação
**Problema:** Fechar o diálogo com a tecla **Esc** (comportamento nativo do `<dialog>`) não executava a rotina de limpeza: a Promise ficava pendente e os listeners antigos permaneciam ativos. Na próxima confirmação, o listener antigo também disparava — **uma ação cancelada anteriormente podia ser executada** (ex.: um "Limpar tudo" cancelado com Esc era confirmado ao clicar OK em outro diálogo).
**Correção:** `dialogConfirmar()` agora escuta o evento `close` do `<dialog>`, resolve a Promise como cancelada e remove todos os listeners, com guarda `resolvido` contra dupla resolução. (`js/app.js`)

### 2.2 HTML inválido na tabela de escalas
**Problema:** A linha de total geral (`<tfoot>`) era inserida **dentro** do `<tbody>` ainda aberto — HTML inválido que o navegador corrigia silenciosamente, com risco de comportamento imprevisível no layout mobile de cartões.
**Correção:** O `</tbody>` é fechado antes de concatenar o `<tfoot>`. (`js/app.js`)

### 2.3 Crash na exportação CSV com dados legados
**Problema:** `e.descricao.replace(...)` lançava `TypeError` se alguma escala antiga no localStorage não tivesse o campo `descricao`.
**Correção:** Fallback `(e.descricao || 'Escala AC4')`, igual aos demais pontos do código. (`js/app.js`)

---

## 3. Correções P2 — Robustez

### 3.1 Histórico de valores preservado
`calcularEscala()` passou a usar a **tabela de valores congelada no momento do lançamento** (`e.tabela`), com fallback para a tabela vigente em escalas legadas. Se uma futura Portaria alterar os valores, as escalas antigas continuarão exibindo os valores da época.

### 3.2 Service Worker: fallback correto offline
O fallback para `index.html` agora se aplica **apenas a navegação** (`request.mode === 'navigate'`). Antes, um CSS/JS não cacheado que falhasse offline recebia HTML como resposta, quebrando a página.

### 3.3 Service Worker: sem interceptação de terceiros
Requests para outros domínios (analytics) não passam mais pelo handler de fetch — menos overhead e menos pontos de falha.

### 3.4 Fonte Inter self-hosted
A dependência do Google Fonts foi **eliminada**. A fonte Inter (variable, pesos 100–900) agora é servida do próprio site em 2 arquivos woff2 (~130 KB, subsets latin e latin-ext), pré-cacheados pelo Service Worker. O app funciona 100% offline, exceto o analytics (opcional por natureza).

### 3.5 Parsing de datas consistente
`atualizarSelectMes()` passou a usar `parseDateTimeLocal()` como todo o restante do código — eliminando o último ponto de parsing inconsistente (mesma classe de problema que causou o bug da Duração corrigido na v25).

### 3.6 Content Security Policy
Adicionada CSP via `<meta http-equiv>`: `script-src 'self'` + Cloudflare Insights, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Para viabilizar a política sem `unsafe-inline` em scripts, o script inline de tema foi extraído para `js/theme.js` (carregado de forma síncrona no `<head>` para evitar flash de tema incorreto).

---

## 4. Melhorias P3 — Qualidade

| # | Melhoria | Detalhe |
|---|---|---|
| 1 | **Performance do cálculo** | O loop minuto a minuto não aloca mais um objeto `Date` por minuto (até 1.440 por escala a cada render). Substituído por aritmética modular do minuto-do-dia — seguro em Goiás, que não adota horário de verão. |
| 2 | **Ícones PNG no manifest** | Gerados `icon-192.png` e `icon-512.png` a partir do SVG (headless Chrome + redimensionamento .NET de alta qualidade). Adicionados ao manifest e ao `apple-touch-icon` (iOS não renderiza SVG nesse contexto). |
| 3 | **Testes de regressão no CI** | Novo `tests/run-tests.mjs` executa as suítes `__ac4Testes` (5 casos de regras de cálculo AC4) e `__ac4TestesAgendamento` (5 casos de geração .ics) em Node, sem navegador. Novo job `test` no workflow **bloqueia o deploy se qualquer caso falhar**. |
| 4 | **Script de versionamento** | `node tools/bump-version.mjs <n>` atualiza a versão nos 4 pontos do projeto de uma vez (index.html ×2, sw.js, app.js, styles.css) — elimina o risco de esquecimento (o sw.js havia ficado em v24 durante a v25). |
| 5 | **404.html** | Página de erro própria, com dark mode e link de retorno, no lugar da página genérica do GitHub Pages. |
| 6 | **Skip-link de acessibilidade** | Link "Pular para o conteúdo" visível ao foco por teclado (WCAG 2.4.1). |
| 7 | **Código morto removido** | Referência ao elemento `printDate` (extinto desde a v25). |
| 8 | **Higiene do repositório** | 14 branches locais já mergeados foram removidos. |

---

## 5. Validação

| Verificação | Resultado |
|---|---|
| Sintaxe JavaScript (app.js, sw.js, theme.js) | ✅ OK |
| JSON do manifest | ✅ OK |
| Testes de regressão — cálculo AC4 (5 casos) | ✅ 5/5 |
| Testes de regressão — geração .ics (5 casos) | ✅ 5/5 |
| CI GitHub Actions (job `test`) | ✅ success |
| CI GitHub Actions (job `deploy`) | ✅ success |

Os testes validaram inclusive o refactor do `calcularEscala` (item 4.1): os valores calculados permanecem idênticos aos da Portaria SSP n.º 621/2026 em todos os cenários (virada de dia, escala Vermelha, janela noturna 22h–05h).

---

## 6. Pontos fortes confirmados pela auditoria (sem alteração)

- **Segurança de injeção:** `escapeHTML` aplicado em todos os pontos de interpolação; CSV com escaping de aspas; ICS conforme RFC 5545 (incluindo dobra de linha em 75 octetos).
- **LGPD:** nenhum dado pessoal coletado ou solicitado; analytics cookieless; dados exclusivamente no localStorage do dispositivo do usuário.
- **Lógica de negócio:** regras Azul/Vermelha por dia de início e janela noturna [22h–05h) cobertas por testes.
- **CI/CD:** workflow com permissões mínimas, concurrency group e actions atualizadas.

## 7. Itens monitorados (sem ação necessária)

- Aviso de depreciação do Node 20 nas actions do GitHub — informativo; será resolvido pelas próprias actions.
- SRI (Subresource Integrity) no beacon do Cloudflare — inviável por design (o script é atualizado dinamicamente pela Cloudflare); risco mitigado pela CSP.

---

*Relatório gerado como parte do ciclo de auditoria v27 — Calculadora AC4 · PMGO.*
