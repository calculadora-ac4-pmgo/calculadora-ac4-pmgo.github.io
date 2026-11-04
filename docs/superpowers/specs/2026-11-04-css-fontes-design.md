# CSS organizado e piso de fonte — desenho

- **Data:** 04/11/2026
- **Versões alvo:** v76 (organização, sem mudança visual) e v77 (piso de fonte, mudança visível)
- **Subprojeto 3 de 4** da refatoração (1. dados da Portaria ✅ v73 → 2. divisão do `app.js` ✅ v74–v75 → **3. CSS + piso de fonte** → 4. acabamento profissional)
- **Itens do backlog:** R6 [código] (piso de fonte) em `docs/ESTUDO_ESTRATEGICO_v67.md`

## Objetivo

1. **v76:** tornar o CSS fácil de manter, dividido por área como o JS, **sem mudar nada que o celular baixa**.
2. **v77:** texto legível para quem usa o app na viatura, no sol, com uma mão e em qualquer idade, com **mínimo de 12 px em rótulos e 14 px em texto de leitura**, sem mudar o layout.

**Critérios de sucesso**

- v76: o `css/styles.css` montado é **idêntico** ao da v75, exceto pelo comentário de cabeçalho. Todas as suítes passam sem regravar referências.
- v77: nenhuma regra de tela (fora `@media print`) abaixo de 12 px; nenhuma regra de texto de leitura abaixo de 14 px; sem rolagem horizontal em 320 px; botões continuam tocáveis (≥ 44 px); Web Vitals dentro do orçamento.

## Decisões do gestor (03–04/11/2026)

- **Caminho C:** arquivos-fonte em `css/src/` juntados num único `css/styles.css` por um script. Foram descartados vários `<link>` (risco de abertura lenta no celular) e `@import` (carregamento em cascata).
- **Duas entregas:** v76 reorganiza e v77 aumenta as letras.
- **v77: só o piso, layout igual.** Foram descartadas a escala tipográfica nova e o mínimo de 13/16 px.
- **Aviso de novidades na v77:** um dos 3 itens anuncia as letras maiores; `data-conteudo` passa a `77`.

## Fora de escopo

- Mover regras de celular para junto de cada componente: muda a ordem da cascata. Se valer a pena um dia, será uma mudança separada, com comparação visual própria.
- Mudar tamanhos que já estão em 12/14 px ou acima, cores, espaçamentos ou componentes, exceto onde o aumento de letra quebrar o layout em 320–390 px, e só o mínimo para não quebrar.
- Estilos de impressão (PDF): papel tem outra régua, e o relatório já foi desenhado para caber na folha.
- Avaliação eMAG completa e testes com usuários (R6 [gestão]).

## v76 — organização

### Arquivos-fonte

Fatias **contínuas** do `styles.css` da v75, **na mesma ordem** (a cascata depende da ordem):

| Arquivo `css/src/` | Começa em (v75) | Conteúdo |
|---|---|---|
| `00-base.css` | linha 1 | cabeçalho, fontes, variáveis claro/escuro, reset, link de pular |
| `05-pwa.css` | `/* ===== PWA BANNER ===== */` | banners de instalação e atualização |
| `10-topo-botoes.css` | `/* ===== TOPBAR ===== */` | topbar e botões |
| `15-layout.css` | `/* ===== LAYOUT ===== */` | layout e superfícies |
| `20-formulario.css` | `/* ===== FORM FIELDS ===== */` | campos, grade e painel de lançamento, resultado, sheet |
| `25-tarifas-planejamento.css` | `/* ===== TARIFF STRIP` | faixa de tarifas, planejamento, lista de tarifas |
| `30-metricas-lista.css` | `/* ===== METRICS ===== */` | métricas, lista de escalas, barreira de primeiro paint |
| `35-barra-avisos.css` | `/* ===== MOBILE BAR ===== */` | barra do celular e toasts |
| `40-dialogos.css` | `/* ===== CONFIRM DIALOG ===== */` | confirmação, novidades, compartilhar, agenda, privacidade, feedback |
| `90-responsivo.css` | `/* ===== PRINT ===== */` | marcador de impressão e todo o bloco responsivo |
| `95-rodape-impressao.css` | `/* ===== SITE FOOTER ===== */` | rodapé e estilos de impressão |

Cada arquivo termina exatamente onde o próximo começa. A junção, sem separador extra, reproduz o original.

### `tools/montar-css.mjs`

- Lê `css/src/*.css` em ordem alfabética, concatena sem acrescentar nada e grava `css/styles.css`.
- Modo `--verificar`: não grava; sai com 1 se o arquivo atual for diferente da junção. É usado pelo teste.
- O comentário de cabeçalho em `00-base.css` ganha a linha "Arquivo gerado por tools/montar-css.mjs — edite css/src/". É a única diferença em relação à v75.

### Integrações

- **`tools/bump-version.mjs`:** a regra da versão passa de `css/styles.css` para `css/src/00-base.css`, seguida de `montarCSS()`, chamado no mesmo processo.
- **Teste novo "CSS montado a partir de css/src"** em `tests/run-tests.mjs`: `styles.css` precisa ser igual à junção.
- **Deploy (`.github/workflows/deploy.yml`):** `--exclude 'css/src'` no rsync. O `SHELL` do `sw.js` não muda (continua só `styles.css`).
- **`CLAUDE.md`:** "edite `css/src/`, rode `node tools/montar-css.mjs`"; o teste bloqueia o esquecimento.

### Prova

`diff` entre o `styles.css` da v75 e o montado mostra **só** o cabeçalho. Equivalência, textos, smoke, celular, mobile-v55 e vitals passam **sem regravar** nenhuma referência.

## v77 — piso de fonte

### Variáveis

Em `00-base.css`, no `:root`: `--fs-rotulo: 0.75rem;` (12 px) e `--fs-leitura: 0.875rem;` (14 px). É a fonte única dos mínimos.

### Classificação

- **Rótulo (≥ 12 px):** texto curto reconhecido de relance, sem frase: eyebrows em maiúsculas, chips e etiquetas, nomes de mês e valores compactos do histórico, legendas curtas, "(opcional)", unidades.
- **Leitura (≥ 14 px):** texto que forma frase e precisa ser lido: dicas de campo, explicações, descrições em diálogos, mensagens de toast, informações secundárias dos cards de escala, avisos.
- **Inventário (primeira tarefa da v77):** `docs/inventario-fontes-v77.md`, com cada regra de tela abaixo de 14 px (seletor, arquivo, tamanho atual, classe, tamanho novo). Começa pelos casos do R6 (`.planning-history-value`, cards de escala). Vai no PR para conferência do gestor.

### Regra de mudança

- Rótulo abaixo de 0,75 rem → `var(--fs-rotulo)`. Leitura abaixo de 0,875 rem → `var(--fs-leitura)`. Acima disso, nada muda.
- Se o aumento quebrar o layout em 320–390 px (texto cortado, sobreposição, rolagem horizontal), o ajuste mínimo de espaço ou quebra de linha entra no inventário com o motivo.

### Testes

- **Teste novo "Piso de fonte"** (lê o `styles.css` montado):
  - fora de `@media print`, todo `font-size` em `rem`/`px` precisa ser ≥ 0,75 rem / 12 px;
  - os seletores marcados como leitura no inventário (lista em `tests/fixtures/fontes-leitura.json`) precisam resolver para ≥ 0,875 rem.
- Em cada tarefa: `mobile-check` (sem rolagem horizontal em 320 px, alvos ≥ 44 px), mobile-v55, smoke e vitals.
- **Revisão visual obrigatória:** capturas antes e depois em 320, 390 e 1280 px, temas claro e escuro, anexadas ao PR.
- Equivalência e textos continuam idênticos (a v77 só mexe em CSS e no aviso de novidades). Se o aviso de novidades alterar uma captura de equivalência, a referência é regravada com `--atualizar` e explicada no PR.

### Para o usuário

- `#dialogNovidades`: exatamente 3 itens, um deles "Letras maiores e mais fáceis de ler"; `data-conteudo="77"`.
- `docs/DESIGN.md`: tabela de tipografia atualizada (rótulo 0,7 → 0,75 rem; variáveis `--fs-rotulo`/`--fs-leitura`).
- Backlog: R6 [código] marcado como concluído na v77.
