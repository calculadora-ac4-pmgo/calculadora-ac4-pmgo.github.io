# Changelog

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
