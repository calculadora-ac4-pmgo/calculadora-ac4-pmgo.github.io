# Changelog

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
