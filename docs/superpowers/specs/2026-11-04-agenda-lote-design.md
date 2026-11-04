# Lançar em outros dias (agenda de lote) — design (v79)

Data: 04/11/2026 · Pedido do usuário (Weliton, 04/11 10:30) · Desenho aprovado em 3 partes no chat.

## Objetivo

No celular, lançar várias escalas iguais com poucos toques: a partir de uma escala já
lançada, o usuário toca nos dias de um calendário e todas são criadas com a mesma hora de
início e duração, podendo trocar o horário de um dia específico antes de lançar.

**Sucesso:** lançar 5 escalas iguais em um mês leva menos de 10 toques depois da primeira,
sem lançamento duplicado ou sobreposto e com o mesmo cálculo da Portaria de um lançamento
feito pelo formulário.

## Decisões do usuário

| Pergunta | Decisão |
|---|---|
| Quando o calendário aparece | Botão após salvar ("Lançar em outros dias" no aviso) e item no menu de cada escala. Nunca abre sozinho. |
| Trocar horário de um dia | Toque marca com o horário da base; a lista de revisão antes de lançar permite trocar o horário de cada dia. |
| Dia que já tem escala sobreposta | Não pode ser marcado: aparece bloqueado e um toque explica o motivo. |
| Abordagem | Calendário próprio num `<dialog>` (abordagem A). Seletor nativo de data e repetição por padrão ficaram de fora. |

## Experiência (aprovada — Parte 1)

1. **Entrada.** Após salvar uma escala nova, o toast ganha a ação **"Lançar em outros dias"**.
   O menu de cada escala (card mobile `ec-more-menu` e botões do desktop) ganha o mesmo item.
   A escala tocada é a **base**: hora de início, duração (fim − início), Qtd. PM, origem e descrição.
2. **Calendário.** Abre no mês do início da base; grade seg–dom; hoje destacado; dia da base
   com marca própria. Navegação por setas até **3 meses** antes e depois do mês da base.
   - **Bloqueados** (aparência apagada, `aria-disabled="true"`; toque mostra o motivo):
     dia cuja escala gerada com o horário da base sobrepõe ou duplica uma escala existente;
     dia fora da vigência da Portaria (sem norma para a data); o próprio dia da base.
3. **Marcar.** Toque marca, outro toque desmarca. Contador "N dias marcados" (`aria-live`).
4. **Revisar.** Botão "Revisar" (desativado com 0 dias) mostra a lista ordenada por data:
   "Sex 13/11 · 18:00 → 08:00". Tocar num item abre a troca de hora de início e duração
   (12h, 14h, 24h ou término personalizado) só daquele dia. Conflito do horário novo com
   escala existente ou com outro dia do lote → aviso no item e "Lançar" bloqueado até corrigir.
5. **Lançar.** "Lançar N escalas" grava tudo de uma vez. Toast "N escalas lançadas" com
   ação **Desfazer**, que remove exatamente as escalas criadas nesse lote.

## Arquitetura (aprovada — Parte 2)

### `js/modules/lote.mjs` (novo, funções puras, sem DOM)

- `LIMITE_LOTE = 31`.
- `escalaDoDia(base, data, horario?)` → `{inicio, fim}` no formato `datetime-local`.
  `data` = `YYYY-MM-DD` (dia do **início**). `horario` opcional `{hora: 'HH:mm', duracaoMin}`;
  sem ele usa a hora e a duração da base. Duração em minutos, calculada de `fim − inicio` da base.
- `situacaoDoDia(escalas, base, data, horario?)` →
  `{estado: 'livre' | 'ocupado' | 'fora-vigencia' | 'base', motivo: string, conflitos: Escala[]}`.
  Usa `detectarConflitos` (persistencia) e `regraNormativaParaData` (calculo). `'base'` quando
  o intervalo gerado coincide com o da própria base.
- `validarLote(escalas, base, dias)` → `{ok, problemas: [{data, motivo}]}`. `dias` =
  `[{data, horario?}]`. Confere: limite (≤ 31, ≥ 1), datas repetidas, cada dia contra as
  escalas existentes (`situacaoDoDia`) e os dias do lote entre si (sobreposição).
- `gerarEscalasLote(base, dias)` → `Escala[]`: para cada dia, `{id: gerarIdEscala(), inicio,
  fim, descricao, origem, qtdPm, status: 'planejada', tabela: tabelaParaData(inicio)}`.
  Não copia `id`, `status` nem `tabela` da base. Sem norma para a data → não gera (lança erro;
  o chamador valida antes).

Reutiliza: `detectarConflitos`, `gerarIdEscala` (persistencia), `regraNormativaParaData`,
`tabelaParaData` (calculo), `parseDateTimeLocal`, `toInputLocal`, `calcularTerminoPorDuracao`
(formato). Nenhuma regra de cálculo nova.

### `js/modules/ui/agenda-dias.mjs` (novo)

`criarAgendaDias(ctx)` no padrão dos módulos de UI (não toca o DOM ao ser criada; expõe
`abrir(idBase)` e `ligarEventos()`). `ctx`: `$`, `on`, `estado`, `toast`, `salvar`, `render`,
`haptic`, `aposProximoPaint`. Estado interno: base, mês exibido, `Map` data → horário opcional.
Monta a grade com `document.createElement` / `textContent` (CSP: sem `style="…"` e sem HTML
com dados do usuário). Não importa outro módulo de UI.

### Alterações

- `index.html`: `<dialog id="dialogLote">` (cabeçalho com mês e setas, grade, contador,
  área de revisão, botões). Novidades v79 (3 itens, `data-conteudo="79"`).
- `templates.mjs`: item "Lançar em outros dias" (`data-acao="lote"`) no menu mobile e no desktop.
- `formulario.mjs`: após salvar escala **nova** (não edição), toast com ação "Lançar em outros
  dias" → `abrirLote(id)` recebido por `ctx`.
- `app.js`: cria `criarAgendaDias`, liga `ligarEventos()` no `init()`, trata `data-acao="lote"`
  e repassa `abrirLote` ao formulário por função de chamada tardia.
- `sw.js`: `lote.mjs` e `ui/agenda-dias.mjs` no `SHELL`.
- CSS: `css/src/40-dialogos.css` (janela) e `90-responsivo.css` (celular). Dias e lista com
  `var(--fs-leitura)`; rótulos com `var(--fs-rotulo)`; alvos ≥ 44 px. Textos de leitura novos
  em `tests/fixtures/fontes-leitura.json`.

### Fluxo de dados

Toque em "Lançar em outros dias" → `abrir(idBase)` → cada célula do mês consulta
`situacaoDoDia` → marcar/desmarcar altera o `Map` → "Revisar" lista os dias e
`validarLote` → "Lançar": `validarLote` de novo sobre `estado.escalas` atual →
`gerarEscalasLote` → `estado.escalas.push(...novas)` → **um** `salvar()`; se falhar,
restaura o array anterior e mostra erro → `render()` → toast com Desfazer (remove pelos ids gerados).

## Erros e casos especiais (aprovado — Parte 3)

- Escala que vira a noite: o dia marcado é o do início; conflito usa o intervalo completo.
- Dias do lote sobrepostos entre si (ex.: um dia trocado para 24h): aviso no item, "Lançar" bloqueado.
- Dia sem norma da Portaria: bloqueado com motivo.
- Escalas mudaram com a janela aberta: revalida no "Lançar"; dias que ficaram ocupados saem
  do lote com aviso, e o restante só é lançado após nova confirmação do usuário.
- 0 dias: "Revisar" e "Lançar" desativados. Mais de 31: não marca o 32º e avisa.
- Falha ao gravar: nada é salvo, estado restaurado, toast de erro.
- Fora de escopo: repetição por padrão, vários meses de uma vez, lote a partir do formulário
  sem escala salva.

## Testes

- **Unit** (`tests/run-tests.mjs`, suíte "Lançamento em lote"), escritos antes do código (TDD):
  cópia dos campos certos e ids únicos; norma por data; conflito com escala existente,
  inclusive a que vira a noite; duplicada; conflito dentro do lote; data fora da vigência;
  limite 31 e datas repetidas; horário trocado de um dia; `'base'` reconhecida.
- **Navegador** (`tests/mobile-check.mjs`): abrir pelo menu, marcar 3 dias, trocar o horário
  de um, lançar, conferir 3 escalas e totais, Desfazer remove as 3; dia ocupado não marca;
  alvos ≥ 44 px; sem rolagem horizontal em 320 e 390 px; nenhum texto < 12 px (`menoresQue12`).
- **Smoke:** novidades com 3 itens (já coberto).
- **Equivalência:** muda de propósito (item novo no menu); atualizar com `--atualizar` e
  explicar no PR. Literais novos: `LITERAIS_ATUALIZAR=1`.
- `npm run verify` completo.

## Revisão visual

Capturas em 390 px e 1280 px, temas claro e escuro: calendário aberto, dias bloqueados,
revisão e troca de horário de um dia.

## Release

v79, `CHANGELOG.md`, novidades (3 itens, `data-conteudo="79"`), `docs/DESIGN.md` (componente
novo), `CLAUDE.md` (módulos `lote` e `ui/agenda-dias` na arquitetura; versão v79 → próxima v80).
