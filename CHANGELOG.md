# Changelog

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
