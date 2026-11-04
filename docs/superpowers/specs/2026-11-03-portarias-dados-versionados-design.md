# Tabela da Portaria como dado versionado (R5) — desenho

- **Data:** 03/11/2026
- **Versão alvo:** v73
- **Item do backlog:** R5 [código] em `docs/ESTUDO_ESTRATEGICO_v67.md`
- **Subprojeto 1 de 4** da refatoração (1. dados da Portaria → 2. divisão do `app.js` → 3. CSS + piso de fonte → 4. acabamento profissional)

## Objetivo

Os valores da hora AC4 e a identificação da norma passam a existir em **um único arquivo de dados**
com a fonte no Diário Oficial. Quando sair uma portaria nova, a atualização consiste em acrescentar
uma entrada nesse arquivo, sem editar o código de cálculo.

**Critérios de sucesso**

1. Os valores R$ 30/33/40/45 e o texto "Portaria SSP nº 621/2026" aparecem escritos em um só lugar
   do código (`js/modules/portarias.mjs`). A faixa fixa do `index.html` continua sendo HTML estático,
   e um teste garante que ela confere com o arquivo de dados.
2. Os 52 casos de conformidade do Anexo I e as 10 escalas reais da planilha do gestor passam **sem
   alteração**: o cálculo não muda.
3. O PDF informa a norma usada nos valores.
4. Escalas salvas a partir de 01/07/2026 sempre usam a tabela oficial, mesmo que tenham sido
   gravadas com outros valores por versões antigas ou venham de backup.
5. Nenhuma piora de desempenho ou de uso offline: mesmos orçamentos de Web Vitals no CI.

## Decisões do gestor (03/11/2026)

- **Tarifas somente leitura.** O app já é assim na v72: a faixa visível é fixa e os campos `valAD`,
  `valAN`, `valVD` e `valVN` são ocultos, preenchidos com os valores oficiais a cada abertura. Esse
  comportamento passa a valer por desenho, e os campos ocultos são removidos.
- **Escalas salvas são recalculadas pela Portaria vigente na data da escala.**
- **Escalas anteriores à vigência (antes de 01/07/2026) não são de interesse institucional.** Ficam
  como estão: sem recálculo, sem norma histórica e sem tratamento especial. O formulário continua
  recusando datas anteriores à vigência, como hoje.
- **Abordagem escolhida: módulo de dados `.mjs`** (e não JSON carregado pela rede), para preservar o
  uso offline desde o primeiro acesso, a CSP atual e o LCP.

## Fora de escopo

- Cadastrar a Portaria nº 550/2024 ou qualquer norma anterior.
- Mudanças visuais. A faixa de tarifas fica igual e não há item novo no `#dialogNovidades`; o
  `data-conteudo` mantém o valor atual para o aviso não reabrir.
- Divisão do `app.js` além da remoção das funções de tabela citadas abaixo (subprojeto 2).
- Relatório verificável (hash/QR) e versão da tabela em outros formatos além de PDF e CSV.

## Arquitetura

### `js/modules/portarias.mjs` (novo)

Módulo só de dados, com uma consulta pura. Não acessa o DOM.

```js
export const NORMAS = Object.freeze([
  Object.freeze({
    id: 'ssp-621-2026-07-01',            // mesmo id usado hoje (REGRA_NORMATIVA_ATUAL_ID)
    norma: 'Portaria SSP nº 621/2026',
    doe: Object.freeze({ numero: '24.801', data: '2026-06-17', paginas: '58-59', protocolo: '630514' }),
    vigenciaInicio: '2026-07-01',
    // vigenciaFim: preenchido somente quando uma norma nova a substituir
    valores: Object.freeze({ AD: 3000, AN: 3300, VD: 4000, VN: 4500 }), // centavos por hora
  }),
]);

export function normaParaData(valor) { /* 'YYYY-MM-DD…' → norma vigente ou null */ }
export const normaAtual = () => NORMAS[NORMAS.length - 1];
// "Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)" — data do DOE em dd/mm/aaaa
export function citacaoNorma(n) { /* … */ }
```

- O `id` continua `ssp-621-2026-07-01`, para que tabelas já gravadas nos aparelhos continuem
  reconhecidas.
- Regra de manutenção (escrita em comentário no topo do arquivo): **nunca editar uma entrada
  publicada**. Uma norma nova se acrescenta no fim, e a anterior recebe `vigenciaFim`.
- Entra no `SHELL` do `sw.js`. O teste "Módulos no cache offline" já confere isso.

### `js/modules/calculo.mjs`

- `TABELA_OFICIAL`, `PORTARIA_ATUAL`, `REGRA_NORMATIVA_ATUAL_ID` e `REGRAS_NORMATIVAS` passam a ser
  **derivados** de `portarias.mjs`. Os nomes exportados ficam, para não mexer nos pontos de uso nem
  nos testes existentes. `TABELA_OFICIAL` mantém o formato atual
  `{ id, portaria, vigenciaInicio, valores }`.
- `VALORES_OFICIAIS` (valores em texto para os campos ocultos) é removido.
- `regraNormativaParaData` passa a delegar para `normaParaData`.
- `calcularEscala`, `tabelaEscalaValida` e a classificação minuto a minuto **não mudam**.

### `js/modules/persistencia.mjs`

Função pura nova:

```js
/** Grava na escala a tabela oficial da norma vigente na data de início.
 *  Sem norma para a data (antes de 01/07/2026): devolve a escala sem alteração. */
export function aplicarNorma(escala) → { escala, alterada: boolean }
```

- `alterada` é verdadeiro quando os valores ou o id da tabela gravada diferem dos da norma, ou quando
  a escala não tinha tabela.
- `desserializarEscalas` aplica `aplicarNorma` a cada escala válida e passa a devolver também
  `recalculadas` (quantas tiveram o **valor** alterado, isto é, valores diferentes; só o id diferente
  não conta).
- Como a abertura do app e a restauração de backup passam por `desserializarEscalas`, os dois
  caminhos ficam cobertos.

### `js/app.js`

- Removidos: `parseMoedaCampo`, `tabelaVazia`, `lerTabelaAtual`, `validarTabelaAtual`,
  `tabelaParaCalculo`, `salvarConfig` e o preenchimento de `VALORES_OFICIAIS` em `carregar()`.
- A tabela de uma escala nova ou editada é `TABELA_OFICIAL` resolvida por `regraNormativaParaData(inicio)`.
  O formulário já recusa datas sem norma, então não há caminho sem tabela.
- Pontes para agenda e cálculo: a "tabela vigente" de fallback passa a ser `TABELA_OFICIAL`. A chave
  do cache de cálculo continua a mesma.
- `carregar()` e `restaurarBackup()`: se `recalculadas > 0`, um único toast: *"N escala(s)
  recalculada(s) pela Portaria SSP nº 621/2026."* O texto da norma vem de `normaAtual()`.
- A chave `pmgoConfig` do `localStorage` deixa de ser gravada e é apagada em `carregar()`. Ela só
  guardava os valores dos campos ocultos.

### `index.html`

- Saem os 4 `<input type="hidden">` (`valAD`, `valAN`, `valVD`, `valVN`).
- A faixa `.tariff-strip` fica como está: HTML estático, sem custo de renderização.

### `js/modules/relatorio.mjs`

- **PDF** *(ajuste no plano: o cabeçalho já tinha "Base normativa" fixa; ela passa a ser preenchida com a citação, em vez de criar uma linha nova)*: a citação *"Valores: Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)."*
  A norma vem das tabelas das escalas listadas. Se houver mais de uma norma no relatório, todas são
  citadas, separadas por "; ".
- **Texto compartilhado:** `⚠️ _Portaria SSP n.º 621/2026 · Valor simulado_` passa a usar a norma de
  `normaAtual()`. O formato do texto continua o mesmo.
- **CSV:** sem mudança (já tem a coluna "Portaria").

## Fluxo de dados

```
portarias.mjs ──► calculo.mjs (TABELA_OFICIAL derivada) ──► app.js (escala nova / pontes)
      │                                                         │
      ├──► persistencia.mjs (aplicarNorma ao abrir/restaurar) ──┘
      └──► relatorio.mjs (linha do PDF, texto compartilhado)
```

## Tratamento de erros

- Escala sem norma para a data: mantém a tabela gravada. Se a tabela gravada for inválida, o
  cálculo usa `TABELA_OFICIAL` como fallback, que é o comportamento efetivo da v72.
- `aplicarNorma` nunca descarta escalas: quem descarta registros inválidos continua sendo
  `normalizarEscala`, como hoje.
- Falha ao apagar `pmgoConfig` é ignorada (`try/catch`), seguindo o padrão do arquivo.

## Testes

**Inalterados (prova de equivalência):** "Conformidade com a Portaria 621/2026 (Anexo I)" (52 casos
e 10 escalas reais) e todas as demais suítes.

**Novos em `tests/run-tests.mjs`:**

1. *Integridade das normas:* cada entrada tem `id` único, `norma`, `doe.numero`, `doe.data` e
   `vigenciaInicio` no formato ISO; os 4 valores são inteiros positivos; as vigências estão em ordem
   crescente e sem sobreposição; só a última pode não ter `vigenciaFim`; os objetos estão congelados.
2. *`normaParaData`:* 30/06/2026 → `null`; 01/07/2026 → 621; data inválida → `null`.
3. *`aplicarNorma`:*
   - escala de 08/2026 com valores R$ 26,47… → passa a ter 3000/3300/4000/4500, `alterada: true`;
   - escala já oficial → `alterada: false`;
   - escala sem tabela → recebe a oficial;
   - escala de 06/2026 → devolvida sem alteração.
4. *`desserializarEscalas`:* conta `recalculadas` corretamente com uma mistura dos casos acima.
5. *Faixa fixa × dados:* os valores R$/h e o nome da norma na `.tariff-strip` do `index.html`
   conferem com `normaAtual()`.
6. *PDF:* `montarRelatorioImpressao` inclui a citação da norma.
7. *Fonte única:* fora de `portarias.mjs` e de `testes.mjs` (que tem valores esperados de propósito),
   nenhum arquivo em `js/` contém a string `621/2026` em código ou o padrão `AD: 3000`. Comentários
   que citam a regra da Portaria no `calculo.mjs` passam a dizer "Portaria vigente (ver
   portarias.mjs)". A faixa estática do `index.html` é coberta pelo teste 5.

**Fluxo obrigatório:** `npm run verify`; bump para v73 (`node tools/bump-version.mjs 73`); entrada
v73 no `CHANGELOG.md`; atualizar o `CLAUDE.md` (versão atual → v73) e o backlog (R5 marcado `[x]`
com PR); `docs/portaria-ssp-621-2026.md` passa a apontar `js/modules/portarias.mjs` como fonte dos
dados; PR; CI verde; merge; conferir `sw.js` publicado com `v73`.
