# Divisão do `app.js` em módulos de interface — desenho

- **Data:** 03/11/2026
- **Versões alvo:** v74 (entrega 1) e v75 (entrega 2)
- **Subprojeto 2 de 4** da refatoração (1. dados da Portaria ✅ v73 → **2. divisão do `app.js`** → 3. CSS + piso de fonte → 4. acabamento profissional)
- **Continua:** o item "Dividir `js/app.js` em módulos" (P3-2, v72) de `docs/ESTUDO_ESTRATEGICO_v67.md`

## Objetivo

Deixar o código mais fácil de manter e mais profissional para quem o avaliar. Para isso, o `js/app.js`
(1.820 linhas na v73) passa a conter só a "central" da aplicação: estado, `render()`, `init()` e a
ligação das peças. Cada área da interface vai para um módulo próprio.

**Critérios de sucesso**

1. **Nada muda para o policial.** A "fotografia" de equivalência (seção Testes) fica idêntica à da
   v73 ao fim de cada entrega.
2. `npm run verify` passa inteiro em cada entrega.
3. Sem piora dos orçamentos de Web Vitals no CI.
4. Tamanho do `app.js`: cerca de 1.150 linhas ao fim da v74 e cerca de 450 ao fim da v75.
5. Cada módulo declara no topo, num único `const { … } = ctx`, tudo o que recebe do `app.js`.

## Decisões do gestor (03/11/2026)

- **Abordagem A:** módulos por área, no padrão de fábrica `criarX(ctx)` que o `pwa.mjs` já usa. Foram
  descartados framework/store reativo (viola "zero dependências") e a extração só de funções puras
  (ganho pequeno).
- **Duas entregas**, cada uma com versão e PR próprios. O gestor faz o merge.
- **Teste de equivalência permanente** no repositório e no CI.

## Restrições

- Zero dependências em produção, sem build e CSP inalterada.
- Sem mudança de comportamento, de texto ou visual. O `#dialogNovidades` não ganha itens, e o
  `data-conteudo` fica como está.
- Fluxo e armadilhas do `CLAUDE.md` valem integralmente: bump de versão, CHANGELOG, `SHELL` do
  `sw.js`, `git checkout -- artifacts/`, revisão visual.

## Fora de escopo

- Mudar a lógica de qualquer fluxo, mesmo onde houver melhoria possível. Achados viram itens de
  backlog e não entram no PR.
- Estilos (subprojeto 3) e documentação de apresentação (subprojeto 4).
- Reescrever os testes existentes. Eles só se ajustam se mudar o caminho de um import.

## Arquitetura

### Estrutura

```
js/app.js                  central: estado, render(), init(), ligação das peças
js/modules/                funções puras (como hoje): calculo, formato, agenda, persistencia,
                           templates, relatorio, portarias, pwa, testes
js/modules/ui/             módulos que tocam o DOM, um por área
  avisos.mjs               toast (fila), dialogConfirmar, haptic                   — v74
  observabilidade.mjs      registrarErro, initObservabilidade (__ac4Erros)         — v74
  aparencia.mjs            tema claro/escuro, novidades da versão                  — v74
  dados.mjs                salvar/carregar, backup/restaurar, lembrete de backup,
                           armazenamento persistente, modelos e metas (normalizar/salvar) — v74
  exportacoes.mjs          CSV, PDF (imprimirRelatorio), agenda (.ics, Google, Outlook,
                           diálogo de provedores)                                  — v74
  compartilhar.mjs         share sheet, WhatsApp, nativo, copiar, canal de feedback — v74
  planejamento.mjs         filtro por mês, painel, histórico, meta mensal          — v75
  formulario.mjs           validar/submeter/editar, data e hora, chips, resumo,
                           sheet mobile, modelos favoritos, repetir, duplicar,
                           remover, limpar tudo                                    — v75
```

A divisão exata de cada função é decidida no plano de cada entrega, com o mapa de linhas do
`app.js`. A tabela acima é o contrato de responsabilidades.

### Contrato com o estado

O `app.js` mantém as variáveis atuais (`escalas`, `editandoId`, `filtroMes`, `filtroOrigem`,
`filtroBusca`, `filtroStatus`, `limiteLista`, `modelos`, `metasMensais`, `sheetAberto` etc.) e cria
**um único objeto `estado`** com getters e setters para elas. É o mesmo formato já passado ao
`testes.mjs`. Assim:

- o código que continua no `app.js` lê as variáveis como hoje;
- os módulos leem e escrevem só por `estado.x`, nunca por variável solta;
- o objeto `estado` passado ao `testes.mjs` passa a ser esse mesmo objeto.

### Fábricas

Cada módulo exporta uma fábrica `criarX(ctx)` que devolve um objeto com as funções públicas da área.
`ctx` traz `estado`, utilitários (`$`, `on`, `STORAGE`, `lerLocal`, `aposProximoPaint`…) e as funções
de outras áreas que o módulo precisa (`toast`, `render`, `salvar`, `calcularEscala`,
`escalasOrdenadas`…).

- **Módulo de UI não importa outro módulo de UI.** Quem conecta é o `app.js`. Isso evita ciclos.
- Módulos de UI podem importar funções puras de `js/modules/` diretamente.
- **Ordem de criação no `app.js`:** avisos → observabilidade → aparência → dados → exportações →
  compartilhar → planejamento → formulário. Quem vem depois recebe o que os anteriores devolveram.
- Dependência em "ciclo" (ex.: `dados` precisa de `render`, que o `app.js` define): passa-se uma
  função que chama a outra no momento do uso (`render: () => render()`), como já é feito com
  `totalEscalas` no `criarPWA`.

### `sw.js` e carregamento

- Todo módulo novo entra no `SHELL` do `sw.js`. O teste "Módulos no cache offline" confere e precisa
  passar a varrer também `js/modules/ui/`.
- Os módulos ficam em cadeia de no máximo 3 níveis (`app.js` → `ui/x.mjs` → módulo puro). Se os Web
  Vitals piorarem, entram `<link rel="modulepreload">` no `index.html` para os módulos do primeiro
  carregamento. Isso só acontece com medição que justifique.

## Entregas

### v74 — áreas mais independentes

`avisos`, `observabilidade`, `aparencia`, `dados`, `exportacoes` e `compartilhar`, mais o teste de
equivalência (criado **antes** de qualquer extração, com a fotografia tirada da v73).

### v75 — áreas entrelaçadas com o estado

`planejamento` e `formulario`. O `init()` fica enxuto: cada módulo expõe uma função
`ligarEventos()` ou equivalente, chamada pelo `init()`.

## Testes

### Existentes (sem alteração de conteúdo)

Lint, unit (`run-tests.mjs`, que carrega o `app.js` no Node com stubs), smoke (44 passos),
`mobile-check`, `mobile-v55` e Web Vitals, inclusive a sabotagem do init, que garante que a tela não
fica presa em "carregando" se a inicialização falhar. Rodam a cada tarefa.

### Novo: `tests/equivalencia.mjs` (permanente)

1. Abre o app no Chrome headless, servido localmente como nos outros testes, com **20 escalas fixas**:
   ids fixos; azul e vermelha; diurno, noturno e madrugada; viradas de dia; 1 e vários PMs; várias
   origens; as 4 situações; dois meses (julho e agosto de 2026). Grava também uma meta mensal.
2. Coleta, em **390 px e 1280 px**:
   - HTML da lista de escalas (cards e tabela);
   - painel do mês e totais;
   - histórico do planejamento;
   - os resultados de `montarCSV`, `montarRelatorioImpressao` e `montarTextoResumo`, a partir das
     escalas exibidas;
   - o conteúdo do `.ics` das escalas.
3. **Normaliza** o que varia sozinho: a data e hora de emissão do PDF e o carimbo `DTSTAMP` do `.ics`.
   Se houver ids gerados na hora, substitui por marcadores estáveis.
4. Compara com `tests/fixtures/equivalencia.json` e mostra a primeira diferença de cada item.
   `node tests/equivalencia.mjs --atualizar` regrava a referência (uso intencional; a diferença
   aparece no PR).
5. Entra em `npm test` (logo, no `verify` e no CI) como `test:equivalencia`.

A fotografia de referência é gerada a partir da **v73 (`main`)** antes de qualquer extração. A coleta
deve depender só do DOM e das funções públicas dos módulos puros, nunca de funções internas do
`app.js`, para continuar válida enquanto o código se move.

## Tratamento de erros

- Nenhuma mudança de comportamento: os `try/catch` atuais se movem junto com o código.
- A falha de carregamento de um módulo é coberta pela proteção de init existente (teste de sabotagem
  nos Web Vitals).

## Documentação a atualizar em cada entrega

- `CHANGELOG.md` (entrada da versão), `CLAUDE.md` (seção "Arquitetura em uma tela" com `ui/` e o
  contrato de `estado`/`ctx`; versão atual) e o backlog do estudo estratégico.
