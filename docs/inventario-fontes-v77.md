# Inventário de fontes — v77 (piso de fonte, R6)

Gerado a partir de `css/src/` por `tools/piso-fonte.mjs`. Lista as **86 regras de tela abaixo de 14 px**
(fora de `@media print`), com a classe de cada uma e o que a v77 faz.

- **Rótulo** (mínimo 12 px / `--fs-rotulo`): texto curto, reconhecido de relance — eyebrow, chip, nome de mês,
  valor compacto, legenda curta, unidade, rótulo de campo, texto de botão.
- **Leitura** (mínimo 14 px / `--fs-leitura`): texto em forma de frase que precisa ser lido — dica, explicação,
  mensagem, aviso, informação secundária de card. Lista oficial em `tests/fixtures/fontes-leitura.json`.
- Na dúvida, a regra foi classificada como **leitura** (o mínimo maior protege o usuário).
- Só muda a regra que está **abaixo** do mínimo da sua classe: **63** de 86. As demais ficam como estão.
- O verificador não encontrou nenhum tamanho "não avaliável" (`em`, `%`, `calc`…). `clamp()` é avaliado pelo piso
  (primeiro argumento). `font-size: 0` (texto escondido de propósito) é ignorado.

| arquivo | seletor | atual | classe | novo | observação |
|---|---|---|---|---|---|
| 00-base.css | `.field-optional` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 05-pwa.css | `.pwa-banner-content p` | 0.75rem (12 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 05-pwa.css | `.update-banner-content p` | 0.75rem (12 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 10-topo-botoes.css | `.brand-text p` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 10-topo-botoes.css | `.btn-sm` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 15-layout.css | `.quick-launch-btn` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 15-layout.css | `.template-select` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 20-formulario.css | `.field label` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 20-formulario.css | `.field-error` | 0.75rem (12 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 20-formulario.css | `.field-hint` | 0.72rem (11.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 20-formulario.css | `.fim-auto` | 0.78rem (12.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 20-formulario.css | `.launch-advanced-toggle span` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 20-formulario.css | `.launch-advanced-toggle small` | 0.7rem (11.2 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 20-formulario.css | `.launch-result-title` | 0.7rem (11.2 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 20-formulario.css | `.launch-result-helper` | 0.8rem (12.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 20-formulario.css | `.launch-result-hours` | 0.82rem (13.1 px) | rótulo | sem mudança |  |
| 20-formulario.css | `.launch-result-end-label` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.tariff-strip-label` | 0.7rem (11.2 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.tariff-chip` | 0.74rem (11.8 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.planning-eyebrow` | 0.7rem (11.2 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.planning-total span` | 0.75rem (12 px) | rótulo | sem mudança |  |
| 25-tarifas-planejamento.css | `.planning-total small` | 0.8rem (12.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 25-tarifas-planejamento.css | `.planning-comparison` | 0.74rem (11.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 25-tarifas-planejamento.css | `.planning-progress-head` | 0.76rem (12.2 px) | rótulo | sem mudança |  |
| 25-tarifas-planejamento.css | `.planning-hours-labels` | 0.7rem (11.2 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.planning-history-head` | 0.76rem (12.2 px) | rótulo | sem mudança |  |
| 25-tarifas-planejamento.css | `.planning-history-value` | 0.64rem (10.2 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.planning-history-month` | 0.68rem (10.9 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.planning-status span` | 0.68rem (10.9 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.planning-alert` | 0.76rem (12.2 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 25-tarifas-planejamento.css | `.status-select` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.tariff-period` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.tariff-value small` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 25-tarifas-planejamento.css | `.config-note` | 0.78rem (12.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 25-tarifas-planejamento.css | `.select-sm` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 30-metricas-lista.css | `.metric-label` | 0.7rem (11.2 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 30-metricas-lista.css | `.metric-sub` | 0.74rem (11.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 30-metricas-lista.css | `.feed-filter .control` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 30-metricas-lista.css | `.lista-anteriores` | 0.8125rem (13 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 30-metricas-lista.css | `.escala-table th` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 30-metricas-lista.css | `.escala-table td` | 0.86rem (13.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 30-metricas-lista.css | `.table-total-row td` | 0.82rem (13.1 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 30-metricas-lista.css | `.table-note` | 0.72rem (11.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 30-metricas-lista.css | `.chip` | 0.69rem (11 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 30-metricas-lista.css | `.empty-state p` | 0.85rem (13.6 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 30-metricas-lista.css | `.legal-alert` | 0.84rem (13.4 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 35-barra-avisos.css | `.mobile-bar-total .label` | 0.68rem (10.9 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 35-barra-avisos.css | `.toast` | 0.85rem (13.6 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 35-barra-avisos.css | `.toast-action` | 0.82rem (13.1 px) | rótulo | sem mudança |  |
| 40-dialogos.css | `.whats-new-badge` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 40-dialogos.css | `.whats-new-heading p` | 0.86rem (13.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.whats-new-list strong` | 0.84rem (13.4 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.whats-new-list div > span` | 0.76rem (12.2 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.whats-new-privacy` | 0.72rem (11.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.share-backup-status` | 0.8125rem (13 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.share-opt` | 0.74rem (11.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.agenda-sub` | 0.84rem (13.4 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.agenda-prov-txt small` | 0.76rem (12.2 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.agenda-hint` | 0.84rem (13.4 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.agenda-item` | 0.86rem (13.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.fb-tipo` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 40-dialogos.css | `.fb-label` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 40-dialogos.css | `.fb-hint` | 0.72rem (11.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 40-dialogos.css | `.fb-copy` | 0.76rem (12.2 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.planning-toggle` | 0.76rem (12.2 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.planning-status span` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 90-responsivo.css | `.status-select` | 0.76rem (12.2 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.escala-table td::before` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 90-responsivo.css | `.launch-panel .field > label` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.mobile-datetime-part span` | 0.72rem (11.5 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 90-responsivo.css | `.dur-chip.is-active::after` | 0.68rem (10.9 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 90-responsivo.css | `.auto-tag` | 0.68rem (10.9 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 90-responsivo.css | `.fim-hint` | 0.74rem (11.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.metric-resumo-mobile` | 0.82rem (13.1 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.ec-date-line` | 0.7rem (11.2 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.ec-duration` | 0.8rem (12.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.ec-qtd` | 0.74rem (11.8 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.ec-per-pm` | 0.72rem (11.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 90-responsivo.css | `.ec-action-btn` | 0.78rem (12.5 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.ec-more-menu button` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.brand-text p` | 0.74rem (11.8 px) | rótulo | `var(--fs-rotulo)` (12 px) |  |
| 90-responsivo.css | `#mobileAdd` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.update-banner-content strong` | 0.76rem (12.2 px) | rótulo | sem mudança |  |
| 90-responsivo.css | `.mobile-add-label::after` | 0.8rem (12.8 px) | rótulo | sem mudança |  |
| 95-rodape-impressao.css | `.site-footer-copy` | 0.82rem (13.1 px) | leitura | `var(--fs-leitura)` (14 px) |  |
| 95-rodape-impressao.css | `.site-footer-meta` | 0.78rem (12.5 px) | leitura | `var(--fs-leitura)` (14 px) |  |

## Ajustes de layout

(Nenhum até agora. Cada ajuste de espaço ou quebra de linha feito para o aumento caber em 320–390 px entra aqui, com o motivo.)
