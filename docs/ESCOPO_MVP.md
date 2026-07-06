# Escopo do MVP — Calculadora AC4

> **Status (revisão v27 — 05/07/2026):** o MVP foi entregue e está em produção, com duas
> mudanças formais de escopo em relação ao texto original:
>
> 1. **Dados pessoais removidos do escopo (decisão LGPD).** A aplicação não solicita nem
>    armazena nome, posto/graduação, RG, matrícula ou qualquer dado pessoal do policial.
>    Os campos de identificação previstos originalmente no Módulo 1 e no Módulo 4 estão
>    **fora do escopo** de forma definitiva.
> 2. **Importação de agenda (.ics) movida para o backlog.** O produto atual foca em
>    **exportação** para agenda (arquivo `.ics` e link direto para o Google Agenda),
>    fluxo validado por testes automatizados. A importação de `.ics` (Módulo 3) é
>    **fase futura**, não é requisito da versão em produção.

## Objetivo

Criar uma ferramenta simples, profissional e segura para facilitar ao policial militar o cálculo de horas e do valor estimado a receber em escalas AC4.

A ferramenta deve permitir que o policial:

- lance escalas manualmente;
- calcule horas diurnas e noturnas;
- estime o valor a receber conforme tabela vigente;
- exporte as escalas para agenda (`.ics` / Google Agenda), planilha (`.csv`) e relatório em PDF;
- ~~informe seus dados básicos~~ (removido — LGPD);
- ~~importe eventos da Agenda Google~~ (backlog — fase futura).

## Identidade visual

A interface deve utilizar identidade visual neutra e institucional, sem vínculo visual direto a unidade específica.

Requisito de implementação:

- exibir identificação neutra da Calculadora AC4 no cabeçalho;
- não renderizar brasão específico na interface principal;
- não renderizar brasão específico no relatório gerado em PDF;
- manter visual institucional, claro e profissional.

## Módulo 1 — Calculadora manual

Campos mínimos (revisados — sem dados pessoais, conforme LGPD):

- data e hora de início da escala;
- data e hora de término da escala (ou duração pré-definida com cálculo automático);
- quantidade de PMs na escala;
- unidade (opcional, não identifica o policial);
- origem do remunerado (AC4, convênios etc.).

Cálculos mínimos:

- total de horas;
- horas diurnas;
- horas noturnas;
- valor diurno;
- valor noturno;
- valor total estimado.

## Módulo 2 — Tabela de valores

O sistema deve permitir configurar os valores oficiais vigentes antes do cálculo.

Requisitos:

- cadastrar valores por tipo de escala;
- diferenciar valor diurno e noturno;
- indicar a portaria/tabela utilizada;
- impedir uso profissional quando a tabela estiver vazia ou incompleta;
- preservar possibilidade de atualização futura sem alterar cálculos antigos.

## Módulo 3 — Agenda Google

### Entregue (exportação)

A versão em produção **exporta** escalas para agenda: arquivo `.ics` (RFC 5545, validado por testes automatizados no CI) e link direto para o Google Agenda com os dados pré-preenchidos.

### Backlog — fase futura (importação)

A importação de agenda por arquivo `.ics`, exportado pelo próprio policial no Google Agenda, fica registrada como fase futura.

Parâmetros mínimos:

- arquivo `.ics`;
- data inicial;
- data final;
- palavras-chave para filtrar eventos, como `AC4`, `extra`, `escala` e `serviço extraordinário`;
- pré-visualização dos eventos importados;
- confirmação antes de adicionar os eventos ao cálculo.

### Fase futura — integração direta

A integração direta com Google Agenda por OAuth deve ficar para fase posterior, porque exige:

- credenciais Google Cloud;
- consentimento do usuário;
- política de privacidade;
- tratamento seguro de tokens;
- backend ou fluxo autorizado, sem segredo exposto no frontend público.

## Módulo 4 — Relatório PDF

O sistema deve gerar relatório com (revisado — sem dados pessoais, conforme LGPD):

- título neutro do relatório;
- lista de escalas com unidade e origem do remunerado;
- horas diurnas;
- horas noturnas;
- valor por escala;
- valor total estimado;
- data/hora de geração;
- aviso de que se trata de simulação sujeita à conferência administrativa.

Na versão inicial, a geração pode ser feita por `window.print()`, permitindo ao policial escolher **Salvar como PDF** no navegador.

## Regras profissionais

- Não fixar valor financeiro sem conferência normativa.
- Não armazenar dados pessoais em banco público sem autenticação.
- Não expor credenciais Google no frontend.
- Não apresentar o cálculo como pagamento oficial sem conferência administrativa.
- Toda evolução institucional deve prever autenticação, permissões e auditoria.

## Critérios de aceite da primeira versão

- [x] O cabeçalho exibe identificação neutra da Calculadora AC4.
- [x] O policial consegue lançar uma escala manual.
- [x] O sistema calcula horas e valor estimado.
- [x] O sistema gera relatório pronto para salvar em PDF.
- [x] O sistema exporta escalas para agenda (`.ics` / Google Agenda), com validação automatizada.
- [x] O README explica como usar a aplicação.
- [ ] ~~O sistema importa eventos de arquivo `.ics`~~ → movido para backlog (fase futura).
- [ ] ~~O sistema filtra eventos por palavras-chave~~ → depende da importação (fase futura).
