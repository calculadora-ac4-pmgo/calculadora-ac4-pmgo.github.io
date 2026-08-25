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

O número público da aplicação é atualizado por `node tools/bump-version.mjs <versão>`. O cache do PWA, os assets e o rodapé precisam permanecer sincronizados.
