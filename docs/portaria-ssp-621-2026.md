# Portaria SSP nº 621, de 15 de junho de 2026 — transcrição de referência

- **Fonte:** Diário Oficial do Estado de Goiás nº 24.801, de 17/06/2026, p. 58-59 (Protocolo 630514, código de autenticação 5529818a).
- **Assinatura:** Renato Brum dos Santos, Secretário de Estado da Segurança Pública.
- **Vigência:** entra em vigor na data da publicação, **produzindo efeitos a partir de 1º de julho de 2026** (Art. 4º).
- **Revogação:** revoga a Portaria nº 550, de 29 de maio de 2024 (Art. 2º da Portaria 621).
- **Objeto:** altera a Portaria 232, de 17/04/2019, que estabeleceu valores para pagamento de indenização pelo Serviço Extraordinário — AC4 a todos os segmentos da SSP/GO.

> Transcrição parcial dos dispositivos que fundamentam o cálculo da aplicação. Em caso de divergência, prevalece o texto publicado no Diário Oficial.

## Art. 1º (nova redação dada à Portaria 232/2019)

> "Art. 1º Ficam estabelecidos os valores para pagamento da indenização pelo Serviço Extraordinário - AC4 a todos os segmentos da Secretaria da Segurança Pública, conforme especificado a seguir:
>
> I - o valor da hora a ser paga, compreendendo o período diurno (de segunda-feira a quinta-feira) será de R$ 30,00 (trinta reais), e o valor da hora compreendendo o período noturno (de segunda-feira a quinta-feira) será de R$ 33,00 (trinta e três reais); e
>
> II - o valor da hora a ser paga compreendendo o período diurno (de sexta-feira à domingo) será de R$ 40,00 (quarenta reais), e o valor da hora a ser paga, compreendendo o período noturno de (sexta-feira a domingo), será de R$ 45,00 (quarenta e cinco reais).
>
> Parágrafo único. Considera-se Serviço Extraordinário Diurno o período de trabalho executado entre 5h01 (cinco horas e um minuto) e 21h59 (vinte e uma horas e cinquenta e nove minutos), e Serviço Extraordinário Noturno o período de trabalho executado entre 22h (vinte e duas horas) de um dia e 5h (cinco horas) do dia seguinte."

## Art. 2º — horários com diferenciação de escala

> "Art. 2º Ficam estabelecidos os valores e horários com diferenciação de escala, conforme se segue:
>
> I - Consideram-se os seguintes horários para a ESCALA AZUL:
> a) Período Diurno (de 5h01 às 21h59): de segunda-feira a quinta-feira, no valor de R$ 30,00 (trinta reais); e
> b) Período Noturno (de 22h às 5h): de segunda-feira a quinta-feira, no valor de R$ 33,00 (trinta e três reais).
>
> II - Consideram-se os seguintes horários para a ESCALA VERMELHA:
> c) Período Diurno (de 5h01 às 21h59): de sexta-feira a domingo, no valor de R$ 40,00 (quarenta reais); e
> d) Período Noturno (de 22h às 5h): de sexta-feira a domingo, no valor de R$ 45,00 (quarenta e cinco reais).
>
> Parágrafo único. A Tabela referente aos horários e valores acima especificados vigorará conforme demonstrativo previsto no Anexo Único desta Portaria."

## Anexo I — tabela por dia da semana

| Período e valores | Domingo | Segunda | Terça | Quarta | Quinta | Sexta | Sábado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Diurno (de 5h01 às 21h59) | R$ 40,00 | R$ 30,00 | R$ 30,00 | R$ 30,00 | R$ 30,00 | R$ 40,00 | R$ 40,00 |
| Noturno (de 22h às 5h) | R$ 45,00 | R$ 33,00 | R$ 33,00 | R$ 33,00 | R$ 33,00 | R$ 45,00 | R$ 45,00 |

## Leitura aplicada pela calculadora

1. **A tarifa é por dia da semana em que a hora é trabalhada** (Anexo I organiza os valores por coluna de dia) — não pelo dia de início da escala. Escala que atravessa a virada do dia combina faixas.
2. **O período noturno "de 22h de um dia às 5h do dia seguinte" pertence ao dia em que começou** (Art. 1º, parágrafo único): a madrugada até 4h59 é remunerada pela tarifa noturna do dia anterior. Ex.: noturno de quinta = 22h de quinta às 5h de sexta, a R$ 33,00.
3. A aplicação classifica **minuto a minuto** e paga **cada faixa (AD/AN/VD/VN) arredondada para a hora mais próxima** (30 min sobe), como a planilha do gestor (fórmula `ROUND`). A Portaria não trata de fração de hora; a regra foi definida pelo gestor em 08/11/2026 (v93): o sistema oficial exige lançar com ":01" a escala que começa logo depois de uma escala ordinária (ex.: ordinário até 08:00 → AC4 a partir de 08:01), e esse minuto não pode tirar uma hora do valor. Ex.: dom 08:01→23:01 = 13h59 VD + 1h01 VN → paga 14h + 1h = R$ 605,00 (igual a 08:00→23:00); sex 08:00→18:20 = 10h20 VD → paga 10h (R$ 400,00); qui 18:00→sex 05:00 = 4h AD + 7h AN → R$ 351,00. Histórico: até a v70 a fração era paga proporcionalmente; da v71 à v92, só horas inteiras (13h59 pagava 13h).

### Observação de fronteira (registrada na auditoria v46)

A Portaria descreve o diurno como "5h01 às 21h59" e o noturno como "22h às 5h" — texto que deixa o minuto exato das 5h00 e o intervalo 21h59–22h00 sem enquadramento literal contínuo. A aplicação adota a leitura contínua padrão: noturno = [22h00, 05h00) e diurno = [05h00, 22h00), ou seja, as horas noturnas são 22h–23h, …, 4h–5h (7 horas) e as diurnas 5h–6h, …, 21h–22h (17 horas).

Essa leitura preserva as horas cheias: escalas em hora redonda dão sempre horas exatas por faixa. Com o arredondamento por faixa (v93), um deslocamento de 1 minuto também não muda o valor (59 minutos contam como 1 hora).

### Fonte dos dados no código

Valores, DOE e vigência desta Portaria estão em `js/modules/portarias.mjs` (fonte única desde a v73). Nenhum outro arquivo de código repete esses valores.

### Conferência automática

`tests/run-tests.mjs` → "Conformidade com a Portaria 621/2026 (Anexo I)": 52 casos derivados diretamente desta tabela (para cada dia da semana: hora diurna, hora noturna, madrugada paga pelo noturno do dia anterior, viradas das 5h e das 22h, arredondamento da fração) e escalas reais das planilhas do gestor (agosto/setembro e novembro de 2026, incluindo inícios com ":01"), conferidas coluna a coluna (ex.: qui 24/09/2026 18h → sex 05h = R$ 351,00; seg 21/09/2026 04h → 06h = R$ 75,00; qui 13/08/2026 18h → sex 08h = R$ 471,00). Roda no CI em todo PR.

### O que a Portaria não trata

- **Fração de hora:** decisão do gestor (08/11/2026, v93) — cada faixa arredondada para a hora mais próxima, como a planilha. Antes (v71): só horas inteiras.
- **Feriados:** a Portaria classifica só por dia da semana; feriado em dia útil segue a tarifa daquele dia.
- **Limite de horas:** o teto de 192h por lançamento é regra do gestor (limite de horas do policial), não da Portaria.
- **Limite mensal (v97–v99):** 192 h por mês por policial, confirmado pelo gestor em 10/11/2026. O app conta só escalas individuais (1 PM), avisa e pergunta, e nunca bloqueia. Escala com mais de um PM é planejamento da seção e fica fora dessa conta.
