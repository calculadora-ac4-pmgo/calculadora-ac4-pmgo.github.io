# Checklist de Implementação - Calculadora AC4

> **Status (revisão v27 — 05/07/2026):** MVP entregue e em produção. Itens de
> identificação pessoal foram **removidos do escopo por decisão LGPD** (a aplicação
> não coleta dados pessoais). A importação de `.ics` foi movida para o **backlog**.

## 1. Reestruturação de Dados e Formulário (Módulo 1)
- [x] ~~**Campos de Identificação**~~ — **removido do escopo (LGPD):** a aplicação não solicita nome, posto/graduação ou matrícula.
- [x] **Mudança na Entrada de Tempo:** input de `Data e hora de término` + seletor de duração (12h/14h/24h) com cálculo automático.
- [x] **Descrição da Escala:** campo opcional "Unidade" + seletor "Origem" do remunerado (14 opções).
- [x] **Lógica de Tempo:** cálculo automático de término por duração, validação de intervalo e datas locais.

## 2. Suporte a Múltiplas Escalas e Estado da Aplicação
- [x] **Estrutura de Dados (JS):** array `escalas` persistido em `localStorage`.
- [x] **Interface de Lista/Tabela:** tabela responsiva (cartões no mobile) com filtro por mês.
- [x] **Ações de CRUD Local:** adicionar, editar, duplicar e remover (com desfazer), além de "Limpar tudo" com confirmação.
- [x] **Cálculo Consolidado:** métricas de valor, horas totais, diurnas e noturnas + linha de total geral na tabela.

## 3. Importação da Agenda Google (.ics) — **BACKLOG (fase futura)**
> A versão em produção entrega a via inversa: **exportação** para agenda
> (`.ics` validado por testes no CI + link direto para o Google Agenda).
- [ ] Upload de arquivo `.ics` (backlog)
- [ ] Filtro de datas (backlog)
- [ ] Parser e filtro por palavras-chave (backlog)
- [ ] Tela de revisão antes de consolidar (backlog)

## 4. Design Premium, UI e UX (Estética)
- [x] **Paleta de Cores e Tipografia:** fonte *Inter* (self-hosted desde a v27), tons navy/dourado/verde, dark mode.
- [x] **Sombras e Cards:** cards com profundidade, bordas suaves, contrastes revisados.
- [x] **Micro-interações:** transições de foco/hover, toasts, haptic feedback, animações de lista.
- [x] **Identidade neutra:** sem brasão específico na interface e no PDF.

## 5. Relatório e Impressão (Módulo 4)
- [x] **Layout de Impressão:** seção `#printReport` dedicada, A4 retrato, sem elementos de tela.
- [x] **Cabeçalho do Relatório:** título neutro, data/hora de emissão, base normativa e finalidade.
- [x] **Tabela Impressa:** 11 colunas com totais (diurnas, noturnas, valor) no rodapé da grade.
- [x] **Rodapé Oficial:** aviso legal de simulação sem efeito financeiro.

## Backlog técnico (próximo ciclo)
- [ ] Importação de `.ics` (Módulo 3 completo).
- [ ] Modularizar `js/app.js` (cálculo, agenda/exportações, persistência e UI em módulos separados).
- [ ] Smoke test de interface no CI (headless browser) complementando os testes de regressão atuais.
