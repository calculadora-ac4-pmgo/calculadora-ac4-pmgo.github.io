# Contribuindo

## Fluxo obrigatório

1. Crie uma branch a partir de `main`.
2. Faça mudanças pequenas e focadas.
3. Execute `npm ci` e `npm run verify`.
4. Abra um pull request descrevendo risco, evidências e testes.
5. Aguarde os checks e a revisão do proprietário do código.

Não envie dados pessoais, escalas reais, credenciais ou documentos restritos ao repositório.

## Mudanças críticas

Alterações em tarifas, vigência, classificação de horas, arredondamento ou base normativa devem incluir casos de regressão e validação administrativa independente. O pull request deve indicar a fonte oficial, a vigência e o impacto sobre lançamentos históricos.

## Versionamento

O número público da aplicação é atualizado por `node tools/bump-version.mjs <versão>`. O cache do PWA, os assets e o rodapé precisam permanecer sincronizados. Todo bump exige uma entrada nova no topo do [CHANGELOG.md](CHANGELOG.md) com a mesma versão.

## Documentação

Comece pela [arquitetura](docs/ARQUITETURA.md) e pelo [índice dos documentos](docs/README.md). Documento que deixou de valer vai para `docs/historico/` com uma linha no índice dessa pasta; links relativos quebrados nos `.md` fazem o teste falhar.
