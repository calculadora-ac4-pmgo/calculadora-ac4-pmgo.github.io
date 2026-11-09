# Changelog

## v95 — Repetir a semana

Segundo dos recursos "inteligentes sem IA" (v94–v97). Sem aviso de novidades (`data-conteudo` continua "93").
- **Cartão "Repetir a semana":** com a semana atual vazia e a passada com escalas, o app oferece "Repetir nesta semana as 4 escalas da semana passada?"; com a semana atual lançada e a próxima vazia, oferece repetir esta na próxima. A semana vai de segunda a domingo, pelo início da escala.
- **Conferência antes de lançar:** "Ver e lançar" abre a lista com dia, horário e valor de cada escala, 7 dias depois (mesmo dia da semana e horário, unidade e PMs da origem). Dá para desmarcar. Destino que sobrepõe escala existente ou fora da vigência fica de fora; dia que já passou vem desmarcado. As novas entram como planejadas, com **Desfazer**.
- **Agora não** vale para a semana de destino (`pmgoRepetirSemanaDispensada`).
- Novos módulos `js/modules/repetir-semana.mjs` (regra pura) e `js/modules/ui/repetir-semana.mjs`, ambos no `SHELL`.
- **Correção no computador:** desde a v89, com os cartões do topo ocultos, a lista subia acima do formulário e do planejamento. Lista e aviso legal agora têm linha fixa no grid (teste de ordem no smoke).
- Testes: unit "Repetir a semana" (semana seg–dom, passada→atual, atual→próxima, +7 dias, dia que passou, destino ocupado, ids novos); smoke (cartão, conferência, desmarcar, lançar, Desfazer, Agora não após recarregar, ordem no computador). Revisão visual em 390 px e 1280 px, claro e escuro.

## v94 — Explicar o valor

Primeiro dos quatro recursos "inteligentes sem IA" aprovados pelo gestor em 09/11/2026 (v94–v97). Sem aviso de novidades agora (`data-conteudo` continua "93"); o aviso sai ao fim da série.
- **Ver conta:** tocar no valor de uma escala (cartão no celular, célula da tabela no computador) abre "Como o valor foi calculado": cada faixa com tempo (diurna/noturna, escala azul/vermelha), horas × tarifa e subtotal, e o valor estimado.
- **Arredondamento à vista:** quando a faixa não fecha hora cheia, a linha mostra, por exemplo, "13h59 conta como 14h". Com mais de um PM, aparece "Por PM × 2 PMs".
- `calculo.mjs`: nova função pura `detalharValor(r, qtdPm)`. Novo módulo `js/modules/ui/explicar-valor.mjs` (no `SHELL`). O valor do cartão virou botão (`.ec-valor-btn`, com a dica "Ver conta").
- Testes: unit "Explicar o valor (conta por faixa)" (domingo 08:01→23:01, 2 PMs, 20 min, subtotais somam o valor); smoke (conta no celular e no computador, cabe em 390 px). Revisão visual em 390 px e 1280 px, claro e escuro.

## v93 — Cada faixa arredondada para a hora mais próxima (igual à planilha)

Decisão do gestor (08/11/2026), depois de conferir o relatório de novembro com a planilha oficial. Novidade para o usuário (`data-conteudo` = "93").
- **Regra de valor:** cada faixa (AD/AN/VD/VN) passa a ser **arredondada para a hora mais próxima** (30 min sobe), como a fórmula `ROUND` da planilha. Antes (v71–v92) só as horas inteiras eram pagas e 13h59 pagava 13h.
- **Motivo:** o sistema oficial exige lançar com ":01" a escala que começa logo depois de uma escala ordinária. Ex.: dom 08/11 08:01→23:01 dava R$ 565,00 na calculadora e R$ 605,00 na planilha; agora dá R$ 605,00. O relatório de novembro do gestor (11 escalas) fecha com a planilha (R$ 6.696,00) mais a escala de 12/11, que não está na planilha.
- Escalas em hora redonda não mudam de valor. Escalas já salvas são recalculadas na hora (o valor não fica gravado).
- `calcularEscala`: `horasPagas[k] = Math.floor((min + 30) / 60)`. Documentado em `docs/portaria-ssp-621-2026.md`, `CLAUDE.md`, `DIARIO_DE_BORDO.md`, `ARQUITETURA.md` e `README.md`.
- Testes: Anexo I com 12h40→13h e 12h20→12h por dia; 6 escalas da planilha de novembro/2026 (incluindo 08:01, 18:01); invariantes com arredondamento; casos de fração atualizados (07:00→19:30 = 13h; 21:30→06:00 = 2h AD + 7h AN).

## v92 — Início e Término à vista; horário de cada dia direto na agenda

Pedido do gestor (08/11/2026). Novidade para o usuário (`data-conteudo` = "92").
- **Nova escala:** **Início** e **Término** ficam sempre visíveis, um abaixo do outro, cada um com Data e Hora (no celular; no computador, os dois campos lado a lado). O Término saiu de "Mais detalhes", que agora guarda só unidade e origem.
- Os atalhos **12h, 14h e 24h** continuam e preenchem o Término; término digitado vale. Saíram os botões de hora 07:00/19:00/Última (v90) e o bloco "Término calculado automaticamente" do quadro de valor (o término já está na tela). A hora sugerida continua sendo a da última escala lançada.
- **Lançar em outros dias:** tocar num dia já abre Início (hora) e Término (Data e Hora) daquele dia, com os atalhos 12h/14h/24h, sem o passo "Alterar". Dia ocupado no horário da base explica e pede outro horário ali mesmo. "Concluir" do painel virou "Pronto".
- Testes: mobile-check (Término visível desde o começo, campos do dia abertos ao tocar, término por Data e Hora no lote); smoke (Término logo abaixo do Início, atalho 12h preenche, término digitado vale). Revisão visual em 390 px e 1280 px, claro e escuro.

## v91 — Próxima escala e Planejamento sem número repetido

Ajustes de interface, sem aviso de novidades (`data-conteudo` continua "89").
- **Próxima escala:** cartão abaixo do painel Meu dinheiro com a escala em andamento ("Em andamento · Termina às 19:00") ou a próxima a começar ("Amanhã · 07:00 às 19:00"), com unidade e valor. Olha todas as escalas, sem depender dos filtros; o dia aparece como Hoje, Amanhã ou data abreviada ("sex., 13/11"). Tocar leva até a escala na lista e a destaca; se ela estiver fora da lista (filtro ou limite), os filtros são limpos. Sem escala futura, o cartão não aparece. Novo módulo `js/modules/ui/proxima-escala.mjs` (no `SHELL`).
- **Planejamento:** o valor do mês virou uma linha discreta ("R$ 4.226,00 · 104h · 8 escalas"), porque o número grande já está no topo. A meta (com barra) e a divisão dia/noite saíram de "Ver detalhes do mês" e ficam sempre visíveis; histórico e contadores por situação continuam nos detalhes.
- Desktop: "Próxima escala" e "Já passou?" têm linhas próprias no grid (ocultos, as linhas somem).
- Testes: unit "Próxima escala" (escolha da escala, em andamento, Hoje/Amanhã, virada do mês, textos); smoke (texto do cartão, toque limpa o filtro e destaca, sem escala futura some, Planejamento discreto com meta visível). Revisão visual em 390 px e 1280 px, claro e escuro.

## v90 — Hora rápida, lista vazia e faixa da Portaria recolhida

Ajustes pequenos, sem aviso de novidades (`data-conteudo` continua "89").
- **Hora de início rápida (celular):** na janela Nova escala, botões **07:00**, **19:00** e **Última HH:MM** (só quando a última hora usada é outra), no estilo dos botões de duração.
- **Hora sugerida:** uma escala nova começa com a data de hoje e a **hora da última escala lançada** (07:00 se ainda não houver), em vez da hora do relógio. Vale no celular e no computador (`inicioPadrao`/`horaUltimaEscala` em `ui/formulario.mjs`).
- **Lista vazia:** no celular, "Toque em Nova escala para lançar a primeira." com o botão **Nova escala**; no computador, "Use o formulário Lançar escala para começar." (o texto antigo citava um "formulário acima" que não existe no celular).
- **Faixa da Portaria:** no celular fica recolhida em uma linha ("Valores da Portaria SSP nº 621/2026") e abre com um toque; no computador continua aberta.
- Testes: unit "Hora de início rápida"; smoke (lista vazia no celular e no computador, faixa recolhida/aberta, hora vinda da última escala, botão 19:00). Revisão visual em 390 px e 1280 px, claro e escuro.

## v89 — Meu dinheiro e "Já passou?"

Novidade para o usuário (`data-conteudo` = "89"; o aviso também lembra o Total por mês da v88).
- **Meu dinheiro:** o cartão de valor do topo divide o total em **Recebido** (escalas recebidas), **A receber** (realizadas e conferidas) e **Previsto** (planejadas), com barra e quantidade de escalas. Segue os mesmos filtros da lista; tocar numa parte filtra a lista por ela e tocar de novo limpa. O filtro de situação ganhou a opção "A receber (realizadas e conferidas)", também citada no aviso de filtro do PDF.
- **Já passou?:** cartão abaixo do painel quando há escala encerrada ainda como planejada (todas as escalas, não só o mês). **Marcar como realizadas** muda todas de uma vez, com **Desfazer** no aviso; **Agora não** guarda as escalas dispensadas (`pmgoJaPassouDispensadas`) e o cartão só volta com escala passada nova. Substitui o aviso que ficava escondido em "Ver detalhes do mês".
- Desktop: o cartão de valor ficou mais largo (2 de 5 partes da linha) para caber o painel; o cartão "Já passou?" ocupa uma linha própria (oculto, a linha some).
- Novo módulo `js/modules/ui/dinheiro.mjs` (funções puras `resumirDinheiro` e `escalasPassadasPlanejadas` + fábrica `criarDinheiro`), no `SHELL` do `sw.js`.
- Testes: unit "Meu dinheiro e Já passou" (partes somam o total, A receber = realizadas × PMs + conferidas, cada situação em uma parte só, passadas); smoke (soma igual ao total, filtro por toque, marcar e desfazer, "Agora não" depois de recarregar e volta com escala nova). Revisão visual em 390 px e 1280 px, claro e escuro.

## v88 — Total por mês no relatório PDF

Melhoria no relatório, sem aviso de novidades (`data-conteudo` continua "86").
- Quando o relatório reúne escalas de **2 meses ou mais**, aparece o quadro **Total por mês** logo abaixo do Resumo: mês, escalas, horas, H. diurnas, H. noturnas e valor estimado, em ordem cronológica. Serve para conferir mês a mês. Com um mês só, o relatório fica igual ao anterior.
- A escala conta no mês em que **começa** (uma escala de 31/07 a 01/08 entra em julho).
- Mesmo quadro no PDF do computador (impressão) e no PDF gerado no iPhone (`dadosRelatorio().meses`, colunas em `COLUNAS_MESES`). A tabela principal, o CSV e o texto compartilhado não mudaram.
- Testes: suíte "Total por mês no relatório" (um mês sem quadro, ordem, escala que vira o mês, soma dos meses = total geral, larguras iguais no PDF e no CSS).

## v87 — Atualização que não deixa o app sem abrir

Correção, sem aviso de novidades (`data-conteudo` continua "86").
- **Relato do gestor:** depois da v86, o app instalado no iPhone não abria pelo ícone; voltou depois de fechar e reabrir com boa conexão.
- **Causa reproduzida:** o `sw.js` era *network-first* arquivo por arquivo. Se a rede falhasse no meio de uma atualização, o app juntava arquivos novos da rede com antigos do cache; com módulos de versões diferentes (ex.: `exportacoes.mjs` novo pedindo `dadosRelatorio` a um `relatorio.mjs` antigo) o JavaScript nem inicia e a tela fica parada.
- **Atualização sem mistura:** os arquivos do app agora vêm da **cópia completa da versão instalada** (cache primeiro; abrir o app sempre recebe o `index.html` dessa versão). A versão nova é baixada inteira na instalação do service worker (tudo ou nada) e só passa a valer pelo banner "Atualizar agora" ou ao reabrir o app, como já era o fluxo da v69. Arquivo fora da cópia vai à rede e é guardado; offline, devolve erro, nunca outro arquivo no lugar.
- **Aviso de carregamento** (`js/inicio-seguro.js`, script clássico independente dos módulos): se o app não terminar de abrir em 10 s, ou se um script falhar ao carregar, aparece "O aplicativo não terminou de carregar. Seus dados continuam salvos neste aparelho." com **Recarregar**, que apaga as cópias guardadas (se houver internet) e recarrega a versão publicada. Nunca recarrega sozinho; os dados não são tocados.
- Testes: suíte "Atualização sem mistura de versões", que executa o `sw.js` de verdade com cache e rede simulados (versão A instalada, B publicada, rede falhando, offline, instalação parcial recusada); conferido que o `sw.js` da v86 é reprovado. Smoke: arquivo do app falhando ao baixar mostra o aviso; Recarregar abre o app com as escalas intactas; carregamento normal nunca mostra o aviso.
- **Transição:** quem ainda está com o service worker da v86 recebe a v87 pelo método antigo uma última vez; se a rede falhar nessa troca, o aviso da v87 só aparece quando o `index.html` novo carregar. A partir da v87 a mistura não acontece mais.

## v86 — PDF também no iPhone

Relato do gestor (captura de tela): no iPhone, com o app aberto pelo ícone da tela inicial, o botão **PDF** não fazia nada; o CSV funcionava.
- **Causa:** o PDF dependia de `window.print()`. No app instalado na tela inicial do iPhone, a impressão não abre e o navegador não avisa erro. O CSV funciona porque é um arquivo baixado.
- **Correção:** no iPhone e no iPad, o app **gera o arquivo PDF** (`js/modules/pdf.mjs`, sem bibliotecas: Helvetica padrão do PDF, codificação WinAnsi para os acentos, A4 retrato) e abre a **tela de compartilhar** (`navigator.share` com arquivo): Salvar em Arquivos, WhatsApp ou Imprimir. Sem compartilhamento de arquivo, baixa o PDF como o CSV. Computador e Android continuam com a impressão do navegador.
- **Mesmo conteúdo da impressão:** `dadosRelatorio()` em `relatorio.mjs` passa a ser a base comum do relatório impresso e do PDF do iPhone (cabeçalho, filtros, resumo, 13 colunas, total, aviso legal, "Página X de Y"). As larguras das colunas ficam em `COLUNAS_RELATORIO`, e um teste exige que sejam as mesmas do CSS de impressão. A fotografia de equivalência não muda.
- O iPad moderno se apresenta como Mac com tela de toque e também usa o arquivo.
- Testes: suíte "PDF do iPhone" (estrutura do arquivo, xref, páginas, acentos, escapes, larguras, nenhuma palavra cortada) e smoke com iPhone simulado (arquivo entregue à tela de compartilhar, sem `window.print`; reserva baixando o arquivo).
- Não verificado em aparelho real: precisa do teste do gestor no iPhone.

## v85 — PDF não falha em silêncio

Correção, sem aviso de novidades (`data-conteudo` continua "84").
- **Causa reproduzida:** logo após um deploy, o navegador pode juntar o JavaScript novo com um `index.html` antigo. A v84 passou a procurar `#prFiltros`, que só existe no HTML novo; sem ele, `imprimirRelatorio()` dava erro interno e o toque em **PDF** não fazia nada, sem aviso.
- **Reforço:** `#prFiltros` é opcional (sem ele o PDF sai igual, só sem a linha de filtros) e qualquer falha ao montar o relatório agora mostra "Não foi possível gerar o PDF. Atualize o aplicativo e tente de novo." em vez de silêncio.
- Testes no smoke: impressão ainda abre sem `#prFiltros` e a falha ao montar o relatório mostra o aviso sem abrir a impressão.

## v84 — PDF do relatório corrigido

Auditoria do PDF (pedido do usuário): o relatório gerado desde a v62 estava quebrado.
- **Defeito principal:** a tabela do relatório ganhou a coluna *Situação* na v62, mas o CSS de impressão continuou calibrado para 11 colunas. "Valor Estimado" ficava com largura zero (o valor de cada escala não aparecia) e o texto empilhava uma letra por linha, de modo que cada escala ocupava meia página: 5 escalas = 2 páginas, 30 escalas = **9 páginas**. Também quebrava palavras no meio ("Dura/ção", "Situaçã/o").
- **Larguras recalibradas** pelo conteúdo de cada coluna (13 colunas, A4 retrato). Agora 5 escalas cabem em 1 página e 30 em 2, sem palavra cortada. Só a *Unidade* (texto livre) quebra palavra muito longa.
- **Coluna "PMs"** com a quantidade de cada escala (antes só havia um "R$/PM" miúdo).
- **Fundos cinza** (cabeçalho e total) agora saem mesmo com "Gráficos de segundo plano" desligado, que é o padrão do Chrome (`print-color-adjust: exact`).
- **"TOTAL GERAL" uma vez só**, no fim da tabela (antes repetia no pé de toda página, parecendo total da página).
- **Aviso de lista filtrada:** com filtro de mês, origem, situação ou busca ativo, o PDF diz quais filtros valeram e que os totais consideram só essas escalas (`descreverFiltros` em `relatorio.mjs`).
- **Numeração** "Página X de Y" e "Simulação sem efeito financeiro oficial" em todas as páginas (margens da página; Chrome e Edge; os demais navegadores ignoram sem erro). Letras menores aumentadas (R$/PM 7 pt, rodapé 8 pt) e margem inferior de 14 mm.
- **Nome do arquivo:** o título da página vira `Relatorio-AC4-AAAA-MM-DD` durante a impressão e volta ao original depois.
- **Testes novos no smoke** (PDF real em A4, 30 escalas): nenhuma coluna colapsa, "Valor Estimado" ≥ 60 px, nenhuma linha vira "torre", nenhum texto estoura a coluna, a tabela cabe no papel e o PDF tem até 3 páginas. O smoke antigo só conferia que o PDF tinha mais de 10 KB. Suíte unitária cobre `descreverFiltros` e as 13 colunas.
- Não verificado: Safari do iPhone e o diálogo de impressão do Android (testado no motor do Chrome, A4). A fotografia de equivalência muda de propósito (coluna PMs e linha de filtro).

## v83 — Gravação que falha não perde o que foi digitado

Correção, sem aviso de novidades (`data-conteudo` continua "82").
- **Editar uma escala:** se a gravação falhasse (aparelho sem espaço, modo privado), o formulário saía da edição antes da tentativa de salvar, e o que foi digitado se perdia. Agora `cancelarEdicao()` só roda depois de gravar; numa falha, a edição continua aberta com os campos preenchidos para tentar de novo.
- **Escala nova:** unidade, Qtd. PM e origem também só são limpas depois de gravar.
- Testes em `tests/mobile-check.mjs`: edição mantida com o texto digitado após a falha, escala salva inalterada, nova tentativa gravando, e campos da escala nova preservados.

## v82 — Escalas na agenda do celular

Pedido do usuário: conferir e melhorar o agendamento nos celulares (Google e iPhone).
- **Lembrete 2 h antes** em cada evento do arquivo `.ics` (`VALARM`, `TRIGGER:-PT2H`; constante `LEMBRETE_ICS` em `js/modules/agenda.mjs`). O validador de `.ics` passa a exigir o lembrete. Os links do Google Agenda e do Outlook não aceitam lembrete: neles vale o alerta padrão da agenda da pessoa.
- **iPhone:** a opção de arquivo vira **"Calendário do iPhone"** e **abre** o `.ics` (blob `text/calendar`) em vez de baixar para Arquivos. No iPhone, baixar ou compartilhar o arquivo mostra o evento sem a opção de adicionar; abrir pelo Safari é o caminho que oferece "Adicionar". Se o navegador bloquear a abertura, cai no download. Android e computador continuam com o download.
- **Agenda de lote:** ao lançar, a janela mostra **"N escalas lançadas."** com **Adicionar à agenda** (abre a janela de agenda só com essas escalas), **Desfazer** e **Concluir**. O aviso com Desfazer continua.
- Testes: suíte "Lembrete na agenda (.ics)"; roteiro do iPhone confere o rótulo, a abertura do arquivo e o lembrete; roteiro do lote cobre a tela de resultado. A fotografia de equivalência muda de propósito: o texto da agenda ganha o lembrete.
- Aviso de novidades reaberto (`data-conteudo="82"`).

## v81 — Agenda direta: abre sozinha e troca o horário no próprio dia

Ajuste pedido pelo usuário depois de usar a v79 ("ficou confuso"): o policial tem várias escalas no mês com horários de início diferentes.
- **Abre sozinha** quando a escala salva é a **primeira do mês** (regra `primeiraDoMes` em `js/modules/lote.mjs`). Nas outras, continua o atalho no aviso e no menu. Editar não abre; falha ao gravar não abre.
- **Sem etapa de revisão:** cada dia marcado mostra a hora de início ("18h", "06h30"). Abaixo do calendário, o painel do dia tocado mostra "Qua 18/11 · 18:00 → 08:00" com **Alterar** (início, 12/14/24 h, término) ali mesmo. Tocar de novo no dia selecionado desmarca; tocar em outro dia marcado só seleciona.
- **Dia ocupado no horário da base** não fica mais travado: mostra "Já existe escala às 18:00 neste dia." e "Escolher outro horário"; um horário livre marca o dia. Dia de origem e fora da vigência continuam bloqueados.
- Dia com problema (sobreposição) fica com borda vermelha e bloqueia "Lançar N escalas", que agora fica sempre no rodapé fixo da janela.
- Testes: roteiro do lote reescrito para o fluxo novo; `primeiraDoMes` na suíte "Lançamento em lote"; smoke e roteiro mobile fecham a agenda que abre sozinha na 1ª escala.
- Aviso de novidades reaberto (`data-conteudo="81"`) com o jeito novo.

## v80 — Janelas centralizadas e ajustes do lote

Correções, sem novidade no aviso (`data-conteudo` continua "79").
- **Janelas centralizadas:** as janelas (`.confirm-dialog`: privacidade, feedback, confirmação, modelo, meta mensal, agenda e lote) ficavam coladas no canto superior esquerdo, no computador e no celular. O `* { margin: 0 }` anulava o centro padrão do `<dialog>`; `.confirm-dialog` ganha `margin: auto`. No celular, a de novidades continua como folha inferior. Teste novo em `tests/mobile-check.mjs` (390 e 1280 px).
- **Desfazer do lote** cancela a edição em andamento de uma das escalas removidas (antes, salvar depois mostrava "Escala atualizada." sem gravar nada). O teste da v79 que dizia cobrir "Desfazer depois de editar" agora edita de fato.
- **Troca de horário de um dia:** apagar o campo Início não deixa mais o campo vazio com a lista mostrando outro horário.
- **Outra aba:** se as escalas mudarem em outra aba com a janela do lote aberta, a janela fecha (a escala de origem pode ter sumido).
- **"Escala adicionada." / "Escala atualizada."** só aparecem depois de gravar; se a gravação falhar, só aparece o aviso de erro.

## v79 — Lançar em outros dias

Novidade pedida pelo usuário: lançar várias escalas iguais com poucos toques no celular.
- **Entrada:** item "Lançar em outros dias" no menu de cada escala (celular e computador) e atalho no aviso "Escala adicionada.".
- **Calendário** (`<dialog id="dialogLote">`): um mês por vez, seg–dom, até 3 meses antes e depois do mês da escala de origem. Toque marca/desmarca. Dias com escala sobreposta, fora da vigência da Portaria ou da própria escala de origem ficam bloqueados, e o motivo aparece na janela. Limite de 31 dias por lote.
- **Revisão:** lista "Dom 15/11 · 18:00 → 08:00"; tocar num dia troca a hora de início e a duração (12/14/24 h ou término) só daquele dia. Dias do lote que se sobrepõem entre si bloqueiam o lançamento.
- **Lançar:** uma única gravação; se falhar, nada é salvo. Antes de gravar, confere de novo: dia que ficou ocupado sai do lote e pede novo toque. Aviso "N escalas lançadas." com **Desfazer** (remove só as escalas do lote).
- **Código:** regra pura em `js/modules/lote.mjs` (suíte "Lançamento em lote") e interface em `js/modules/ui/agenda-dias.mjs`; ambos no cache offline. `tests/mobile-check.mjs`: roteiro completo em 390 px (calendário, revisão, toque duplo, falha de gravação, Desfazer, revalidação, atalho).
- Aviso de novidades reaberto (`data-conteudo="79"`).

## v78 — Desmarcar a duração rápida

Correção pedida pelo usuário: no celular, depois de tocar num chip de duração rápida (12h, 14h, 24h) não havia como desmarcá-lo.
- **Tocar de novo no chip ativo desmarca:** a duração volta a "Personalizada", o término já calculado é mantido e o campo Término aparece para o ajuste manual (o mesmo caminho de quando se edita o término à mão). Tocar de novo marca outra vez.
- **`tests/mobile-check.mjs`:** três verificações novas (desmarca, mantém o término e abre o campo, marca de novo).
- Sem aviso de novidades (`data-conteudo` continua "77"). Equivalência e textos preservados idênticos.

## v77 — Letras maiores (piso de fonte, R6)

Mudança visível: nenhum texto de tela fica menor que **12 px** (rótulos) e os textos de leitura (dicas, avisos, mensagens, informações dos cards) têm no mínimo **14 px**. O layout é o mesmo.
- **86 regras de tela estavam abaixo de 14 px, 36 delas abaixo de 12 px.** 63 subiram para o mínimo da sua classe (rótulo 12 px, leitura 14 px); as outras 23 já estavam no mínimo ou acima e não foram tocadas. `@media print` (PDF) ficou fora.
- **Duas variáveis em `css/src/00-base.css`:** `--fs-rotulo` (0,75 rem) e `--fs-leitura` (0,875 rem), a fonte única dos mínimos.
- **`tools/piso-fonte.mjs`** confere os fontes de `css/src/` e acusa qualquer tamanho abaixo do mínimo ou que não consiga avaliar. Os seletores de leitura ficam em `tests/fixtures/fontes-leitura.json`. **Testes novos no `npm run test:unit`:** "Piso de fonte (R6)" e "casos de borda do verificador" (seletor composto, em grupo, com pseudo-classe, e item obsoleto na lista de leitura). Pseudo-elementos (`::before`) não herdam a classe do elemento.
- **Inventário** de todas as regras, com a classe de cada uma e as decisões: `docs/inventario-fontes-v77.md`.
- **Histórico de 6 meses até 414 px:** com 12 px, valores como "8,8 mil" (320 px) e "12,5 mil"/"125,3 mil" (360–400 px) passavam a ser cortados. O espaço entre as barras cai de 6 para 2 px e as letras ficam 3 % mais juntas, só em telas de até 414 px. Regra: nunca pior que a v76.
- **`tests/mobile-check.mjs`:** verificação de herança (nenhum texto visível abaixo de 12 px, medido no navegador, com sheet aberto, lista, painel do mês realmente expandido e Compartilhar) e `roteiroHistorico` (valores do histórico cabem na coluna em 320, 360, 375 e 393 px).
- **`tests/capturas-fontes.mjs`** (apoio, fora do `npm test`): capturas em 320, 390 e 1280 px, claro e escuro, para comparar versões. Antes × depois sem texto cortado nem rolagem horizontal; as páginas ficam ~4–5 % mais altas.
- Aviso de novidades reaberto uma vez (`data-conteudo="77"`): letras maiores, só horas inteiras, lista mais rápida.
- Equivalência (26 capturas) e textos preservados continuam idênticos: só CSS e o aviso de novidades mudaram.

## v76 — CSS organizado em css/src/

Sem mudança para o usuário: o `css/styles.css` publicado é idêntico ao da v75, exceto pelo comentário de cabeçalho.
- **11 arquivos-fonte em `css/src/`**, um por área: base, PWA, topo e botões, layout, formulário, tarifas e planejamento, métricas e lista, barra e avisos, diálogos, responsivo, rodapé e impressão. Cada um é uma fatia contínua do CSS anterior, na mesma ordem, porque a cascata depende da ordem.
- **`tools/montar-css.mjs`** junta os fontes no único `styles.css` (o celular continua baixando um arquivo só). `--verificar` confere se está em dia.
- **`tools/bump-version.mjs`** grava a versão em `css/src/00-base.css` e monta o CSS.
- **Teste novo "CSS montado a partir de css/src"**: bloqueia `styles.css` editado direto ou desatualizado.
- `css/src/` fica fora do site publicado.
- Prova: `diff` com a v75 mostra só a linha "Arquivo gerado por tools/montar-css.mjs", e todas as suítes passam sem regravar referências.

## v75 — Interface dividida em módulos (conclusão)

Refatoração sem mudança para o usuário. O `js/app.js` passou de 1.234 para **408 linhas**; eram 2.489 na v71 e 1.820 antes desta refatoração. Agora ele cuida só do estado, da ligação dos módulos, do `render()` e de um `init()` de 64 linhas.
- **Novos módulos em `js/modules/ui/`:**
  - `planejamento`: seletor de mês, painel do mês, histórico, meta mensal e filtros da lista;
  - `formulario`: lançamento, edição, data e hora, chips, stepper, sheet do celular com foco preso, e as ações da lista (duplicar, remover com desfazer, limpar, situação);
  - `modelos`: modelos favoritos e "Repetir última".
- **`ligarEventos()`:** cada módulo da v75 registra os próprios eventos; o `init()` só chama `ligarEventos()` e liga as áreas entre si.
- **Novo teste "Textos preservados em refatoração":** compara os 443 textos de `app.js` + `ui/` com a referência da v74 (`tests/fixtures/literais.json`). Teria pegado o incidente da v74 ("As estado.escalas…"), e foi provado com esse mesmo caso. A versão (`APP_VERSION`) fica fora da comparação, para não quebrar a cada bump.
- **Mais testes:** módulos de `ui/` sem atribuição direta a variáveis de estado (só via `estado.`); listener de teclado do documento registrado uma única vez.
- **Equivalência:** as 26 capturas (lista, totais, planejamento, CSV, PDF, texto compartilhado, agenda, `.ics`) continuam idênticas às da v73.
- **Pendências da revisão da v74 resolvidas:** comentário corrompido em `dados.mjs`, cabeçalho do `app.js` e testes que não restauravam globais.

## v74 — Interface dividida em módulos (1ª entrega)

Refatoração sem mudança para o usuário: `js/app.js` passou de 1.820 para 1.234 linhas.
- **Nova pasta `js/modules/ui/`**, com um módulo por área da interface, cada um criado por uma fábrica `criarX(ctx)` (padrão do `pwa.mjs`):
  - `avisos` (toast em fila única, confirmação, vibração);
  - `observabilidade` (log local de erros e ganchos de suporte);
  - `aparencia` (tema e aviso de novidades);
  - `dados` (salvar/carregar, backup, restaurar, lembrete de backup);
  - `exportacoes` (CSV, PDF, agenda e .ics);
  - `compartilhar` (WhatsApp, cópia, compartilhar nativo, feedback).
- **Objeto `estado`** no `app.js`: os módulos leem e gravam escalas, filtros, modelos e metas só por ele. Um módulo de interface nunca importa outro; o `app.js` faz a ligação.
- **Teste de equivalência permanente** (`tests/equivalencia.mjs`, também no CI): abre o app com 20 escalas fixas em 390 px e 1280 px e compara 26 capturas com a referência da v73. Captura lista, totais, planejamento, CSV, PDF, texto compartilhado, links do Google/Outlook e o arquivo .ics. Todas idênticas.
- **Novos testes:** cada módulo de `ui/` exporta a fábrica e as funções esperadas, sem tocar o DOM ao ser criado; a fila de toasts é única; restaurar backup grava no estado; textos exatos do backup e do lembrete; módulos de `ui/` no cache offline e na varredura de ganchos de teste.
- A v75 conclui a divisão (formulário e planejamento).

## v73 — Tabela da Portaria como dado versionado (R5)

Sem mudança visível na tela; o cálculo é o mesmo.
- **Fonte única:** valores da hora, número da norma, DOE (nº 24.801, 17/06/2026, p. 58-59, protocolo 630514) e vigência ficam só em `js/modules/portarias.mjs`. `calculo.mjs` deriva `TABELA_OFICIAL` dele. Portaria nova = nova entrada no fim da lista, sem editar a anterior.
- **Escalas salvas seguem a Portaria:** ao abrir o app e ao restaurar backup, escalas a partir de 01/07/2026 recebem a tabela oficial. Se algum valor mudar (escala gravada por versão antiga ou backup adulterado), aparece um aviso único. Escalas anteriores à vigência ficam como estão (decisão do gestor, 03/11/2026).
- **Edição de data** reaplica a tabela da norma da nova data (antes mantinha a tabela antiga).
- **Campos ocultos removidos:** `valAD`/`valAN`/`valVD`/`valVN` e a chave `pmgoConfig` do `localStorage` (apagada na abertura).
- **PDF e texto compartilhado** citam a norma a partir dos dados: "Base normativa: Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)".
- **Equivalência:** os 52 casos do Anexo I e as 10 escalas reais da planilha passam sem alteração.
- **Novos testes:** integridade das normas (vigências, valores, congelamento), `aplicarNorma` (inclusive aviso que não se repete), fonte única (nenhum literal da Portaria fora de `portarias.mjs`; faixa do `index.html` confere com os dados), citação no PDF e no texto compartilhado.

## v72 — `app.js` dividido em módulos (auditoria v67, P3-2)

Refatoração sem mudança de comportamento: `js/app.js` passou de 2.489 para ~1.860 linhas.
- `js/modules/templates.mjs`: cards, botões de ação e seletor de situação. Agora os **ids das escalas são escapados** no HTML: um backup adulterado não consegue mais injetar marcação (a CSP já bloqueava scripts).
- `js/modules/relatorio.mjs`: relatório do PDF, planilha CSV e texto de compartilhamento, como funções puras testadas em Node.
- `js/modules/pwa.mjs`: atualização segura e instalação da PWA, com estado encapsulado.
- `js/modules/testes.mjs`: suítes de regressão **carregadas sob demanda só em localhost** (`window.__ac4TestesProntos`); não vão mais para o aparelho do usuário.
- **Equivalência conferida:** lista, totais, CSV e relatório do PDF idênticos byte a byte aos da v71, com 20 escalas variadas em 390 px e 1280 px.
- Texto compartilhado usa `labelOrigem()` para a origem, como a tela e o PDF (resto do P3-6). Ex.: "Prefeituras" em vez de "PREFEITURAS".
- **Novos testes:** todo módulo precisa estar no cache offline do SW; ganchos de teste só em localhost, varrendo também os módulos; templates e exportações, incluindo id hostil e CSV injection.

## v71 — Horas inteiras e lista rápida com histórico longo

- **Regra de valor (decisão do gestor, 23/09/2026):** só as horas inteiras de cada faixa (AD/AN/VD/VN) são pagas; a fração de hora não é paga. Os valores ficam sempre em reais inteiros. Ex.: sex 08:00→18:20 paga 10h VD = R$ 400,00 (antes R$ 413,33). Escalas em hora cheia não mudam: 32.256 combinações conferidas (1–192h, todo início de hora da semana). `calcularEscala` passa a retornar `horasPagas`. Registrado em `docs/portaria-ssp-621-2026.md`. Novos casos de teste, incluindo o exemplo do gestor (qui 18:00→sex 05:00 = R$ 351,00).
- **Desempenho com histórico longo (auditoria v67, P2-1):** com 300 escalas, adicionar escala levava 2,1–3,7 s (até 8 s sob carga). Agora custa 1,4–1,9× o de 5 escalas:
  - a lista mostra as 30 escalas mais recentes, com o botão "Mostrar escalas anteriores". Os totais somam todas. Antes eram ~21 mil nós por render;
  - formatadores de data (`Intl.DateTimeFormat`) reaproveitados em vez de criados a cada chamada (~1 s com 300 escalas), com saída idêntica em 80.000 comparações;
  - cache do resultado do cálculo por início, fim e tabela;
  - ordenação sem converter datas no comparador.
- **Conformidade com a Portaria:** nova suíte com 52 casos: 42 gerados do Anexo I (cada dia × diurno, noturno, madrugada do dia anterior, viradas das 5h e das 22h, fração não paga) + 10 escalas reais da planilha do gestor, todas iguais coluna a coluna. Documento da Portaria atualizado: leitura das fronteiras com horas inteiras e o que a Portaria não trata (fração, feriados, teto de 192h).
- Web Vitals: cenário 7 com 300 escalas mede a lista em partes, os totais e os CTAs em relação ao cenário de 5 escalas (robusto ao ruído do runner).

## v70 — Dados mais protegidos e novidades sem repetição

Itens P2-3 (R1) de `docs/relatorio_auditoria_producao_v67.md` e aviso de novidades repetido:

- **Armazenamento persistente:** depois do primeiro lançamento da sessão, o app chama `navigator.storage.persist()` para o navegador não apagar as escalas. A recusa é tolerada. A chamada não acontece ao abrir a página porque o Firefox pode perguntar ao usuário.
- **Situação do backup no Compartilhar:** "Último backup: dd/mm/aaaa (há N dias)" ou aviso de que ainda não houve backup. No iPhone fora do app instalado, explica que o Safari pode apagar dados de sites sem uso por 7 dias.
- **Novidades por conteúdo:** o `#dialogNovidades` ganhou `data-conteudo` (versão do texto). O aviso só reabre sozinho quando esse número passa do último conteúdo visto, e versões técnicas não repetem o mesmo aviso. **Ao mudar o texto das novidades, atualize `data-conteudo`.**
- Novidades da v70: armazenamento protegido, data do último backup e atualização sob controle do usuário (v69).
- Smoke +4 passos: status do backup (sem backup, com data, no Compartilhar) e novidades já vistas que não reaparecem.

## v69 — Fim da recarga forçada a cada versão

Item P2-2 de `docs/relatorio_auditoria_producao_v67.md`:

- Removido `js/force-update.js` (hotfix da v65). A cada versão nova ele desregistrava todos os Service Workers, apagava os caches e recarregava a página sem perguntar, anulando a atualização com confirmação da v64.
- A atualização volta a acontecer só pelo banner "Nova versão disponível". Os caches antigos continuam sendo apagados no `activate` do `sw.js`.
- A chave `pmgoForceUpdate` que sobrou é removida do `localStorage` na inicialização.
- `tools/bump-version.mjs` não mexe mais no arquivo removido. O teste "Atualização PWA" impede que a limpeza forçada volte.

## v68 — Higiene da auditoria v67

Primeiros itens do plano de ação de `docs/relatorio_auditoria_producao_v67.md`:

- Ganchos de teste (`__ac4Testes*`, `__ac4ValidarICS`, `__ac4MailtoFeedback`) só existem em `localhost`; em produção ficam apenas os de suporte (`__ac4Erros`, `__ac4Version`). Evita que `__ac4TestesLancamento`, que regrava as escalas, rode no aparelho do usuário (P3-1).
- Origem do remunerado com o mesmo rótulo na tela e no PDF, via `labelOrigem()` (ex.: "Prefeituras", "Faz./Sec. Econ.") (P3-6).
- Deploy deixa de publicar `artifacts/` (capturas dos testes) e `.editorconfig` (P3-4).

## v67 — Design premium (restaurado)

O redesign planejado para a v65 foi descartado por engano no PR #58 (a pasta
`ac4-v65-files/` foi apagada em vez de movida para a raiz) e nunca chegou à
produção. Esta versão o aplica sobre a v66:

- Novo sistema visual documentado em `docs/DESIGN.md`: tokens de cor, sombras em camadas, raios e curvas de movimento únicos para todo o app.
- Topbar compacta em Inter; no celular, CSV, PDF e Compartilhar ganham rótulo e a barra rola com a página.
- Cartão "hero" azul institucional com detalhe dourado para o valor estimado.
- Desktop em painel de duas colunas: lançamento à esquerda, planejamento do mês e tabela de valores à direita.
- Cards de escala mais baixos e legíveis: valor à direita, unidade visível, faixa com a cor da situação e situação + ações numa linha.
- Superfícies sólidas no lugar do efeito de vidro (`backdrop-filter`) nas áreas grandes: mais contraste e menos custo de GPU.
- Bottom sheet com alça centralizada e botão fechar com alvo de 44px; ícones de Novidades centralizados; contraste da tabela de valores no modo escuro.
- Histórico de 6 meses e lembrete de backup da v66 mantidos sobre o visual novo.

## v66 — Histórico, backup e PDF mais ágil

- Histórico dos últimos 6 meses no painel mensal, com média e destaque do mês selecionado — HTML/CSS puro, sem biblioteca e com altura reservada (sem CLS).
- Lembrete de backup para quem tem escalas e nunca salvou cópia (ou salvou há mais de 30 dias), no máximo uma vez por semana, com ação “Fazer backup”.
- Botão PDF abre o diálogo de impressão após o próximo paint: o tempo gasto no diálogo deixa de contar como INP (11,3 s no Cloudflare RUM).
- `tools/bump-version.mjs` passa a atualizar também `js/force-update.js`.

## v65 — Correção de deploy e atualização

Publicada sem o redesign anunciado (ver v67).

- `js/force-update.js`: limpeza única por versão — desregistra Service Workers antigos, apaga caches `ac4-*` anteriores e recarrega uma vez.
- Testes deixam de fixar o número da versão, que bloqueava o deploy a cada bump.
- Rótulos de versão do rodapé e de Novidades sincronizados.
- CI: actions atualizadas para Node 24 e runner fixado em `ubuntu-26.04`.

## v64 — Atualização segura da PWA

- Aviso mobile-first quando uma nova versão já está pronta para ser aplicada.
- Botão “Atualizar agora” com ativação controlada e recarregamento único do aplicativo.
- Opção de adiar a atualização sem interromper uma escala em preenchimento.
- Verificação de novas versões na abertura, ao recuperar a conexão e ao retornar ao aplicativo.
- Service Worker passa a aguardar a confirmação do usuário em vez de assumir o controle durante o uso.
- Escalas, metas, modelos e configurações locais permanecem preservados durante a atualização.

## v63 — Novidades da versão

- Apresentação profissional das novidades após uma atualização, exibida uma única vez por versão.
- Bottom sheet mobile-first com resumo objetivo das novas funcionalidades e alvos de toque acessíveis.
- Atalho “Novidades” no rodapé para consultar novamente o conteúdo quando quiser.
- Preferência de visualização armazenada somente no aparelho, sem rastreamento adicional.
- Instalações novas continuam entrando diretamente no fluxo principal, sem interrupção desnecessária.

## v62 — Planejamento AC4 mobile-first

- Painel mensal compacto com valor estimado, horas, quantidade de escalas e comparação com o mês anterior.
- Metas opcionais de valor e horas, armazenadas somente no aparelho e separadas por mês.
- Ciclo de acompanhamento por escala: Planejada, Realizada, Conferida e Recebida.
- Aviso local para escalas passadas que ainda permanecem como planejadas.
- Filtro por situação e atalhos de filtro diretamente no painel mensal.
- Distribuição visual de horas diurnas e noturnas sem bibliotecas externas.
- PDF, CSV e compartilhamento incluem a situação e respeitam os filtros ativos; o backup também preserva as metas.
- Migração defensiva do armazenamento para o schema v2, preservando escalas antigas.

## v61 — Lançamento em segundos

- Formulário progressivo: o fluxo principal mostra só os campos essenciais e mantém término personalizado, unidade e origem em “Mais detalhes”.
- Atalho “Repetir última” preenche a próxima escala sem salvar automaticamente.
- Modelos favoritos locais para reaplicar duração, quantidade, unidade e origem.
- Busca por unidade e filtros por mês e origem na lista de escalas.
- Cards mobile mais compactos, com edição visível e ações secundárias agrupadas.
- Promoção de instalação inteligente após engajamento, sem interromper a primeira visita.

## v60 — Performance orientada por dados reais

- Otimização do INP nos fluxos de adicionar escala, duração rápida e abertura mobile.
- Pré-processamento do compartilhamento para reduzir a latência do botão do WhatsApp.
- Fila de avisos com geometria estável para eliminar deslocamentos do `toastRegion`.
- CTA de lançamento com espaço reservado para evitar deslocamento do rótulo e do valor.
- Beacon oficial da Cloudflare atualizado para o formato `type="module"` recomendado.

## v59 — Métricas de Uso com Privacidade

- Restauração do Cloudflare Web Analytics para análise agregada de utilização.
- Política de segurança ajustada exclusivamente para os endpoints oficiais da Cloudflare.
- Aviso de privacidade atualizado: sem cookies e sem envio dos dados lançados na calculadora.

## v58 — Hardening e Governança

- Pipeline reproduzível com dependências travadas e Actions fixadas por SHA.
- Permissões de publicação restritas exclusivamente ao job de deploy.
- Políticas de segurança, contribuição, propriedade de código e Dependabot.
- Remoção de JavaScript analítico de terceiros para reforço de privacidade.
- Persistência validada e versionada, com migração dos registros legados.
- Identificadores UUID quando suportados pelo navegador.
- Backup e restauração JSON com validação e limite de tamanho.
- Registro normativo imutável por início de vigência e bloqueio de datas sem norma conhecida.
- Acessibilidade modal e gerenciamento de foco no lançamento mobile.
- Atualização mais confiável do cache do PWA.
- Aviso de escalas duplicadas ou sobrepostas.
- CSP sem `unsafe-inline` na aplicação principal e política de referrer restritiva.
