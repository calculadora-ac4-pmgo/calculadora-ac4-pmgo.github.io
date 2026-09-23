# Estudo estratégico — Calculadora AC4 (v67)

> **Parecer técnico de melhoria contínua** · versão analisada: **v67 (produção)** · data: **22/09/2026**
> Público-alvo: policiais militares e Administração Militar do Estado de Goiás.
> Base: código-fonte, CI, histórico git e Cloudflare Web Analytics (RUM de 23/08 a 22/09/2026).
> Versão visual (página): <https://claude.ai/artifact/PyPBghF8BSAbTKXGUCrhdg> (privada; compartilhar pelo menu Share).
>
> **Para quem continua o trabalho:** o [backlog executável](#backlog-executável) no fim deste
> documento é a fonte de verdade das próximas tarefas. Marque os itens como feitos (`[x]`) com a
> versão e o PR ao concluir.

## Resumo executivo

**Veredito:** a engenharia está em nível de big tech em desempenho, testes automatizados e
minimização de dados. O que impede a escala institucional **não é código**: é a durabilidade
dos dados do policial, a segurança operacional do que ele compartilha e a institucionalização
(domínio, governança, conformidade formal com a LGPD e acessibilidade validada com usuários reais).

- A primeira visita transfere **~117 KB** comprimidos.
- **96%** dos carregamentos têm LCP bom (P75 **1,3 s**).
- **Zero dependências** de terceiros em tempo de execução; 5 suítes no CI antes de cada deploy.

### Cinco decisões para a gestão

1. **Proteger os dados do policial** contra apagamento silencioso (armazenamento persistente, instalação guiada no iPhone; lembrete de backup já entregue na v66).
2. **Tratar horário e unidade como informação operacional sensível**: compartilhamento sem esses campos por padrão.
3. **Decidir o caminho institucional**: domínio oficial (`.go.gov.br`), responsável formal e encarregado de dados.
4. **Programa de acessibilidade e usabilidade com policiais reais**, não só testes automatizados.
5. **Tabela da Portaria como dado versionado**, com processo de atualização e dupla conferência.

## Contexto de uso

| Condição de campo | Implicação de projeto | Situação na v67 |
| --- | --- | --- |
| Celular é o dispositivo principal, em todas as faixas de preço | Orçamento de desempenho para Android de entrada | ✅ 117 KB, sem biblioteca |
| Uso sob sol, em viatura, com uma mão, às vezes com luvas | Texto ≥ 14 px no conteúdo, alvos de 44–48 px, ações ao alcance do polegar | ⚠️ alvos de 44 px testados; 60 regras de fonte < 12,5 px |
| Faixa etária ampla | Respeitar fonte grande do sistema e zoom de 200% | ⚠️ unidades em `rem`; zoom de 200% não testado |
| Conectividade instável | Funcionar offline | ✅ PWA offline-first |
| Aparelho compartilhado ou perdido | Dados operacionais não expostos em texto aberto | ❌ escalas e backups sem proteção |
| Dado sobre remuneração própria | Cálculo auditável, base normativa visível | ✅ Portaria 621/2026 citada e testada |

## Placar por dimensão (0–5, julgamento do analista)

| Dimensão | Nota | Evidência |
| --- | ---: | --- |
| Desempenho | 4,5 | LCP P75 1,3 s; INP bom 91%; orçamentos de Web Vitals no CI |
| Qualidade de engenharia | 4,0 | Zero deps, CSP restrita, 5 suítes. Contra: `app.js` com ~2,4 mil linhas; incidente de release da v65 |
| Minimização de dados | 4,0 | Não coleta nome/CPF/matrícula; tudo no aparelho |
| Usabilidade móvel | 3,5 | Formulário progressivo, bottom sheet; sem dados de uso com policiais |
| Acessibilidade | 3,0 | DOM semântico e contraste AA auditados (v52/v53); fontes pequenas; sem TalkBack/VoiceOver nem eMAG |
| Conformidade formal LGPD | 2,5 | Aviso sem controlador, encarregado, finalidade e operadores (Cloudflare/GitHub, EUA) |
| Segurança operacional | 2,5 | Unidade e horários compartilhados por padrão; backup JSON aberto |
| Durabilidade dos dados | 2,0 | Só `localStorage`; sem `storage.persist()`; remoção automática no Safari/iOS |
| Institucionalização | 1,5 | Domínio `github.io`, um mantenedor, e-mail pessoal, documentação divergente |

### O que já está em nível de big tech

- **Desempenho guiado por RUM real** (Cloudflare): LCP P50 904 ms; INP do PDF corrigido na v66.
- **Privacidade por padrão**: dados pessoais retirados do escopo na v27 (minimização).
- **Cadeia de suprimentos mínima**: nenhuma biblioteca de terceiros no app.
- **Testes do que importa**: fronteiras da Portaria (22h/5h, 29/02, término 00:00) e E2E em Chrome real.
- **Offline-first** com atualização segura (sem recarregar durante o preenchimento).
- **Proteção de release** (v67): CI bloqueia versão sem CHANGELOG e pastas de rascunho na raiz.

## Riscos priorizados

### R1 — Escalas apagadas sem aviso no iPhone · **CRÍTICO**
- **Evidência:** dados só em `localStorage`. Desde 2020 o Safari (WebKit/ITP) apaga todo armazenamento de script de um site após 7 dias de uso do navegador sem interação com esse site; apps na tela inicial são isentos. O código não chama `navigator.storage.persist()`.
- **Impacto:** quem abre o AC4 só no fim do mês, pelo Safari, pode perder o histórico.
- **Ação:** pedir armazenamento persistente; guia de instalação na tela inicial do iPhone (Safari não tem prompt de instalação); mostrar a data do último backup no painel; avaliar IndexedDB (também persistível).

### R2 — Horários e unidade expostos no compartilhamento · **CRÍTICO**
- **Evidência:** `gerarTextoResumo()` (em `js/app.js`) envia ao WhatsApp e ao compartilhamento nativo dia, horários, unidade e origem de cada escala. O backup é JSON legível.
- **Impacto:** não é dado pessoal pela LGPD, mas é **informação operacional** (quando e onde um policial estará de serviço).
- **Ação:** por padrão, compartilhar só totais (horas e valor), com detalhes como opção explícita; aviso antes de compartilhar horários; backup com senha opcional (Web Crypto AES-GCM).

### R3 — Legitimidade e continuidade institucional · **ALTO**
- **Evidência:** `calculadora-ac4-pmgo.github.io` sem domínio institucional; feedback por e-mail pessoal; um único mantenedor.
- **Impacto:** o nome "PMGO" em domínio não oficial dificulta a adoção e abre espaço para cópias falsas; risco de continuidade.
- **Ação:** patrocinador e responsável formal; domínio oficial; canal institucional; segundo mantenedor.

### R4 — Aviso de privacidade incompleto para órgão público · **ALTO**
- **Evidência:** o diálogo `#dialogPrivacidade` não identifica controlador nem encarregado (LGPD art. 41), não cita os operadores Cloudflare (métricas) e GitHub (hospedagem), que recebem o IP nos EUA (art. 33), nem finalidade/base legal (arts. 7º, 9º, 23).
- **Ação:** reescrever com esses elementos, validar com o encarregado e registrar no ROPA. Reavaliar as métricas após a adoção formal.

### R5 — Mudança de Portaria depende de uma pessoa e de um deploy · **ALTO**
- **Evidência:** tarifas e vigências no código (`js/modules/calculo.mjs`, `regraNormativaParaData`). Já versionado por vigência (bom), mas sem processo de detecção, transcrição e conferência.
- **Ação:** tabela em arquivo de dados versionado com fonte (DOE, página, protocolo); dupla conferência obrigatória no PR; testes gerados a partir do Anexo; o PDF mostra a versão da tabela usada.

### R6 — Acessibilidade não validada com pessoas · **MÉDIO**
- **Evidência:** 60 declarações de fonte < 12,5 px; a menor, ~10 px (`.planning-history-value`, 0.64rem, gráfico da v66). Sem teste registrado com TalkBack, VoiceOver, zoom de 200% ou fonte grande; sem avaliação eMAG.
- **Ação:** programa de acessibilidade abaixo. A LBI (Lei 13.146/2015, art. 63) exige acessibilidade em sítios de órgãos de governo.

### R7 — Documentação divergente do produto · **MÉDIO**
- **Evidência:** `docs/ESCOPO_MVP.md` e `docs/CHECKLIST.md` dizem que a importação `.ics` foi entregue na v30; ela foi **removida na v48** (commit `2cbd917`) e não existe no código. O incidente da v65 (redesign descartado por engano no PR #58) segue o mesmo padrão.
- **Ação:** corrigir os documentos; revisão de docs na definição de pronto; manter a proteção de release da v67.

## Programa de acessibilidade e usabilidade

Referências: **WCAG 2.2 AA**, **eMAG 3.1** e **LBI**.

### Manual de testes por release

| Verificação | Como testar | Critério |
| --- | --- | --- |
| Leitor de tela Android | TalkBack: lançar, editar, apagar/desfazer, gerar PDF | Tudo por voz/gestos; nenhum elemento sem nome |
| Leitor de tela iPhone | VoiceOver: mesmas tarefas | Idem; valores lidos como moeda |
| Fonte grande do sistema | Android no máximo; iOS Texto Maior | Nada cortado; sem rolagem horizontal |
| Zoom de 200% / reflow | Navegador a 200% e 320 px de largura | WCAG 1.4.10 |
| Alvos de toque | Teste automatizado + uso com uma mão | WCAG 2.5.8 (≥ 24 px); meta do projeto 44–48 px |
| Contraste e luz solar | Auditoria existente + uso ao ar livre | AA 4,5:1; legível ao sol |
| Movimento reduzido | "Remover animações" no sistema | Nenhuma animação essencial |
| Teclado físico | Tab/Shift+Tab; Esc fecha diálogos | Foco visível, ordem lógica |

### Pesquisa com policiais (5 a 8 por rodada, público variado)

| Tarefa | Meta de tempo | Meta de sucesso |
| --- | ---: | ---: |
| Lançar escala de 12 h do zero | ≤ 20 s | ≥ 95% |
| Conferir quanto vai receber no mês | ≤ 5 s | ≥ 95% |
| Corrigir o horário de uma escala | ≤ 30 s | ≥ 90% |
| Gerar o relatório para conferência | ≤ 30 s | ≥ 90% |
| Backup e restauração em outro aparelho | ≤ 2 min | ≥ 80% |

Ao fim de cada sessão: **SUS** (System Usability Scale). Meta ≥ 80.
**Ajuste imediato:** piso de 12 px em rótulos secundários e 14 px em texto de leitura.

## Desempenho

| Métrica (RUM 23/08–22/09) | Atual | Limite "bom" | Leitura |
| --- | ---: | ---: | --- |
| LCP P75 | 1.300 ms | 2.500 ms | 96% bons |
| LCP P99 | 4.500 ms | — | Cauda de rede/aparelho lento |
| INP (% bom) | 91% | ≥ 75% | Pior caso (`#btnPrint`, 11,3 s) corrigido na v66 |
| CLS (% bom) | 97% | ≥ 75% | Período inclui dias anteriores à correção da v60 |
| Primeira visita (gzip) | ≈ 117 KB | — | Fonte Inter (48 KB) é o maior item |

Tamanhos medidos (gzip -9): `index.html` 11,0 KB · `styles.css` 17,3 KB · `app.js` 30,5 KB · módulos 9,3 KB · `inter-latin.woff2` 48 KB.

Recomendações:
- **Dividir `app.js`** (~2,4 mil linhas): carregar sob demanda relatório, compartilhamento, backup e Novidades.
- **Fonte:** medir se 2 pesos estáticos ou a fonte do sistema no texto corrido reduzem peso sem perda visual (a Inter já é subconjunto latino).
- **Laboratório de aparelho lento no CI:** CPU 4× mais lenta e 3G lento, espelhando o P99.
- **Orçamento de tamanho por arquivo** no CI, além dos limites de Web Vitals.

## LGPD e segurança

### Inventário de tratamento (base do ROPA)

| Dado | Onde fica | Quem acessa | Classificação |
| --- | --- | --- | --- |
| Escalas (datas, horários, unidade, origem, valores) | Só no aparelho (`localStorage`, chaves `pmgo*`) | O próprio policial | Operacional sensível |
| Backup JSON, CSV, PDF | Arquivos no aparelho; depois, onde o usuário enviar | Quem receber | Operacional sensível |
| IP e dados técnicos de navegação | Cloudflare (métricas) e GitHub (hospedagem), EUA | Operadores | Dado pessoal (IP) |
| Log de erros anônimo (máx. 20, `pmgoErros`) | Só no aparelho | Ninguém fora dele | Sem dado pessoal |
| E-mail de feedback | Caixa do mantenedor | Mantenedor | Dado pessoal |

Recomendações:
- **Aviso de privacidade completo:** controlador, encarregado e contato, finalidade, base legal (poder público, art. 23), operadores e transferência internacional, direitos do titular.
- **RIPD (art. 38)** antes de qualquer funcionalidade que envie dados a servidor.
- **Segurança operacional:** compartilhamento enxuto por padrão, backup com senha opcional, "apagar tudo deste aparelho" fácil de achar.
- **Canal institucional** para feedback e direitos do titular.
- **Manter:** CSP restrita, zero dependências em produção, `SECURITY.md`.

> Análise técnica, não parecer jurídico: validar com o encarregado de dados e a assessoria jurídica.

## Inovação com propósito

| Ideia | Problema que resolve | Valor | Esforço |
| --- | --- | --- | --- |
| Relatório verificável (hash + QR code no PDF) | Conferência não sabe se o PDF foi editado | Alto | Médio |
| Conferência contra o contracheque (valor recebido × estimado) | Ajudar a contestar divergências | Alto | Baixo |
| Atalhos do app (manifest `shortcuts`): "Nova escala" | Lançar em segundos após o serviço | Médio | Baixo |
| Transferência entre aparelhos por QR code, sem servidor | Troca de celular sem perder histórico | Alto | Médio |
| Simulador de metas ("quantas escalas faltam para R$ X") | Planejamento financeiro | Médio | Baixo |
| Sincronização E2E com conta institucional | Backup automático real | Alto | Alto (backend + RIPD) |

IA/voz só se a pesquisa mostrar que o lançamento manual é gargalo (hoje é rápido).

## Indicadores

| Indicador | Hoje | Meta | Fonte |
| --- | ---: | ---: | --- |
| LCP P75 | 1,3 s | ≤ 1,5 s | Cloudflare RUM |
| INP bom | 91% | ≥ 95% | Cloudflare RUM |
| SUS | não medido | ≥ 80 | Pesquisa |
| Sucesso "lançar escala" ≤ 20 s | não medido | ≥ 95% | Pesquisa |
| Falhas críticas de a11y (TalkBack/VoiceOver) | não medido | 0 | Manual de testes |
| Releases sem incidente | v65 com incidente | 100% | CI e CHANGELOG |
| Portaria publicada → app atualizado | sem processo | ≤ 5 dias úteis | Registro de PR |

## Governança de melhoria contínua

- **Ciclo quinzenal:** uma entrega pequena por ciclo, sempre por PR com CI verde.
- **Revisão mensal de dados:** painel Cloudflare + feedback → prioridade do próximo ciclo.
- **Rodada trimestral com policiais:** usabilidade, acessibilidade e SUS.
- **Pós-incidente sem culpados** após qualquer falha em produção (modelo: caso v65).

**Definição de pronto (cada PR):**
- `npm run verify` verde, com teste novo para comportamento novo
- Conferência visual em 390 px e 1280 px, temas claro e escuro
- Verificação rápida com TalkBack no fluxo alterado
- Nenhuma fonte abaixo do piso; alvos ≥ 44 px
- CHANGELOG, Novidades e docs de escopo atualizados
- Regra de cálculo nova com fonte normativa citada e segunda conferência
- Nenhum dado novo coletado sem registro no inventário LGPD

## Backlog executável

Ordem recomendada. Itens **[código]** podem ser feitos sem decisão da gestão; itens **[gestão]**
dependem de decisão ou ação humana fora do repositório.

### 30 dias — Proteger
- [x] **R1 [código]** `navigator.storage.persist()` (após o primeiro lançamento, tolerando recusa); aviso do Safari/iOS fora do modo standalone; data do último backup visível no Compartilhar — **v70, PR #66**. O guia "Adicionar à Tela de Início" já existia (banner + Compartilhar → Instalar).
- [ ] **R2 [código]** Compartilhamento enxuto por padrão em `gerarTextoResumo()` (só totais); opção explícita "incluir horários e unidade"; aviso curto antes de compartilhar detalhes.
- [ ] **R6 [código]** Piso de fonte: ≥ 12 px em rótulos secundários, ≥ 14 px em texto de leitura; começar por `.planning-history-value` (0.64rem) e pelos cards de escala. Conferir no teste mobile que nada quebra em 390 px.
- [x] **R7 [código]** Corrigir `docs/ESCOPO_MVP.md` e `docs/CHECKLIST.md`: importação `.ics` removida na v48 — **PR de governança de 23/09/2026**.
- [x] **[gestão]** Monitor de disponibilidade externo — **criado pelo gestor em 08/07/2026** (UptimeRobot, HTTP, 5 min; ver diário). *Pendente:* confirmar que o alerta por e-mail está ativo.

### 90 dias — Institucionalizar
- [ ] **R3/R4 [gestão]** Patrocinador, responsável formal e encarregado de dados definidos.
- [ ] **R4 [código + gestão]** Novo texto do `#dialogPrivacidade` (controlador, encarregado, finalidade, base legal, operadores, transferência internacional) após validação jurídica; ROPA registrado.
- [ ] **[gestão]** Primeira rodada de usabilidade/acessibilidade com 5–8 policiais (tarefas e SUS acima).
- [ ] **R5 [código]** Tabela da Portaria em arquivo de dados versionado (fonte DOE), testes gerados do Anexo, versão da tabela impressa no PDF. *Parcial:* testes gerados do Anexo I feitos na **v71** (suíte "Conformidade com o Anexo I", 52 casos); faltam o arquivo de dados e a versão no PDF.
- [x] **[código]** Dividir `js/app.js` em módulos (item P3-2 da auditoria v67) — **v72**: 2.489 → ~1.860 linhas; `templates`, `relatorio`, `pwa` e `testes` (este sob demanda, só em localhost).
- [ ] **R3 [gestão]** Segundo mantenedor com acesso ao repositório.

### 12 meses — Escalar
- [ ] **R3 [gestão]** Domínio oficial `.go.gov.br`.
- [ ] **[código]** Relatório verificável (hash + QR code no PDF).
- [ ] **[código]** Transferência entre aparelhos por QR code, sem servidor.
- [ ] **R6 [gestão + código]** Avaliação eMAG completa e declaração de acessibilidade.
- [ ] **[gestão]** Decisão sobre sincronização (exige backend e RIPD).

## Método e limitações

- **Fontes:** código da v67, histórico git (171 commits desde 03/07/2026), relatórios de auditoria em `docs/`, CI no GitHub Actions, relatório Cloudflare Web Analytics de 23/08 a 22/09/2026.
- **Medições:** tamanhos com gzip -9; Web Vitals do RUM; fontes pequenas contadas em `css/styles.css`.
- **Limitações:** sem entrevistas ou testes com policiais; notas do placar são julgamento do analista; amostra de RUM pequena (~1,1 mil carregamentos/mês); LGPD sem valor de parecer jurídico.
