# Design system — Calculadora AC4

Referência única de decisões visuais a partir da v65. Todo valor abaixo existe
como variável CSS em `css/styles.css` (`:root` e `[data-theme="dark"]`).
Componentes novos devem usar os tokens, nunca valores soltos.

## Princípios

1. **O número primeiro.** O usuário abre o app para saber quanto vai receber.
   O valor estimado tem o maior peso visual da tela (cartão "hero").
2. **Institucional, sem brasão.** Azul-marinho e dourado transmitem a
   identidade da PMGO sem usar símbolos oficiais.
3. **Uma mão, um polegar.** Alvos de toque ≥ 44px, ações principais na
   barra inferior e no bottom sheet.
4. **Leve por padrão.** Sem bibliotecas de UI, sem CDN, sem
   `backdrop-filter` em superfícies grandes. Os orçamentos de Core Web Vitals
   em `tests/web-vitals-check.mjs` são parte do design.
5. **Acessível sempre.** Contraste AA, foco visível, `prefers-reduced-motion`
   e `forced-colors` respeitados.

## Cores

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--navy-900` | `#0b1f3a` | — | Marca, topbar, cartão hero |
| `--gold-500` / `--gold-300` | `#d6ad55` / `#f2dd9b` | — | Destaques, botão primário, ícones da topbar |
| `--bg` | `#f4f6fa` | `#07111f` | Fundo da página |
| `--surface` | `#ffffff` | `#0d1b2e` | Cartões |
| `--surface-2` / `--surface-3` | `#f8fafc` / `#eef2f7` | `#111f34` / `#172941` | Campos, chips, hover |
| `--border` / `--border-strong` | `#dde4ee` / `#c3cfdd` | `#20334d` / `#38506e` | Bordas de cartão / de campo |
| `--text` / `--text-muted` / `--text-faint` | `#122033` / `#627286` / `#64707c` | `#e8eef7` / `#a5b4c7` / `#73859d` | Texto |
| `--green-600` / `--green-700` | `#059669` / `#047857` | `#34d399` | Valores em R$ |

**Situação da escala** (faixa lateral do card, borda do seletor e painel do mês):
Planejada `--gold-500` · Realizada `--blue-600` · Conferida `--green-600` · Recebida `#7c3aed`.

## Tipografia

Inter variável, hospedada no próprio site (`assets/fonts`).

| Papel | Tamanho | Peso | Observação |
|---|---|---|---|
| Valor hero | 1.85–2rem | 800 | `letter-spacing: -0.025em`, `tabular-nums` |
| Resultado do lançamento | 2.3rem (desktop) / até 3.15rem (sheet) | 900 | |
| Título de seção | ~1.02rem | 750 | `letter-spacing: -0.01em` |
| Rótulo (eyebrow) | 0.7rem | 750–800 | Maiúsculas, `letter-spacing: 0.07em` |
| Corpo | 15px (14px < 560px) | 400–600 | |

Todo número monetário ou de horas usa `font-variant-numeric: tabular-nums`.

## Forma, sombra e movimento

- Raios: `--radius-sm` 10px (campos, botões) · `--radius-md` 12px (cards de escala) · `--radius-lg` 16px (painéis) · `--radius-xl` 22px (bottom sheet).
- Sombras em camadas: `--shadow-sm` (contato), `--shadow-md` (cartões), `--shadow-lg` (diálogos e sheets).
- Movimento: `--ease-out` para entradas e hover, `--ease-spring` para sheets; durações `--dur-fast` (120ms) e `--dur` (200ms). Animar só `transform` e `opacity`.

## Layout

- **Mobile (≤ 760px):** coluna única; topbar rola com a página; barra fixa inferior com total, compartilhar e "Nova escala"; lançamento em bottom sheet.
- **Tablet (761–1099px):** coluna única com tabela.
- **Desktop (≥ 1100px):** grade de duas colunas — lançamento (esquerda) | planejamento + tabela de valores (direita); métricas, lista e aviso legal em largura total. A ordem do DOM não muda.

## Componentes

- **Cartão hero** (`.metric-card.highlight`): fundo `--hero-bg`, texto branco, rótulo dourado.
- **Card de escala** (`.escala-card`): data (eyebrow dourado) → horário → duração · unidade; valor à direita; rodapé com seletor de situação + Editar + Mais.
- **Botão primário** (`.btn-primary`): gradiente dourado vertical, borda e brilho interno de 1px.
- **Botões da topbar**: fundo branco 6%, borda branca 16%, ícone dourado.

## Checklist para mudanças visuais

1. Usar tokens existentes; criar token novo só se o valor se repetir.
2. Conferir claro **e** escuro, em 320px, 390px e 1280px.
3. Rodar `npm run verify` — os testes de toque, overflow e CLS precisam passar.
