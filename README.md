# Calculadora AC4

[![Testes e deploy](https://github.com/calculadora-ac4-pmgo/calculadora-ac4-pmgo.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/calculadora-ac4-pmgo/calculadora-ac4-pmgo.github.io/actions/workflows/deploy.yml)

Ferramenta gratuita para policiais militares e servidores da administração de Goiás simularem
as horas e o valor do **Serviço Extraordinário AC4** (Portaria SSP nº 621/2026), direto no celular,
sem cadastro e sem enviar nenhum dado para servidor.

**Acesse:** <https://calculadora-ac4-pmgo.github.io/>. No celular, use "Adicionar à tela inicial" para
instalar como aplicativo; depois do primeiro acesso, funciona também sem internet.

> Resultado **estimativo**, para simulação e conferência preliminar. Não tem efeito financeiro
> oficial e não substitui a conferência administrativa nem a validação pela seção competente.

## O que faz

- **Lança escalas** com início e duração (12h, 14h, 24h ou término livre) e mostra na hora as horas
  diurnas, noturnas e o valor estimado.
- **Lança em outros dias:** ao salvar a primeira escala do mês, abre um calendário. Basta tocar nos
  dias, e cada dia pode ter seu próprio horário. Dias que já têm escala no horário são avisados, e
  tudo pode ser desfeito.
- **Planeja o mês:** totais, comparação com o mês anterior, histórico de 6 meses e metas de valor e
  horas.
- **Acompanha a situação** de cada escala (planejada, realizada, conferida, recebida).
- **Exporta e compartilha:** relatório em PDF, planilha CSV, eventos de agenda (aplicativo do celular,
  Google Agenda ou Outlook) e resumo para WhatsApp.
- **Backup** das escalas num arquivo, com lembrete periódico, e restauração no mesmo ou em outro aparelho.
- **Modelos** para repetir configurações comuns e **repetir a última escala**.
- Tema claro e escuro, letras de no mínimo 12/14 px e alvos de toque de 44 px.

## Regra de cálculo

Base normativa: Portaria SSP nº 621, de 15/06/2026 (DO/GO nº 24.801, de 17/06/2026), com efeitos
a partir de 01/07/2026. Transcrição e leitura das regras em
[docs/portaria-ssp-621-2026.md](docs/portaria-ssp-621-2026.md).

| Faixa | Dias | Valor |
| --- | --- | ---: |
| Azul diurna (AD) | segunda a quinta | R$ 30,00/h |
| Azul noturna (AN) | segunda a quinta | R$ 33,00/h |
| Vermelha diurna (VD) | sexta, sábado e domingo | R$ 40,00/h |
| Vermelha noturna (VN) | sexta, sábado e domingo | R$ 45,00/h |

- O período noturno vai das 22h às 5h. A madrugada pertence ao dia em que o noturno começou.
- A faixa é definida pelo dia em que **cada hora é trabalhada**, não pelo dia de início da escala;
  uma escala que vira o dia pode misturar faixas azuis e vermelhas.
- **Só horas inteiras de cada faixa são pagas**; a fração de hora não entra (decisão do gestor, v71).
  Ex.: sexta 08:00 → 18:20 paga 10h VD = R$ 400,00.
- Cada escala guarda a tabela da Portaria vigente na sua data. Quando sair uma Portaria nova, as
  escalas antigas continuam com os valores da época.

## Privacidade (LGPD)

- Não pede nem guarda nome, RG, CPF, matrícula ou qualquer dado pessoal.
- As escalas, metas e modelos ficam **somente no aparelho** (`localStorage`) e nunca são enviados.
- O site usa Cloudflare Web Analytics (sem cookies, sem rastreamento individual) só para contagem
  agregada de acessos. Nenhum valor ou escala digitada chega a ele.
- Limpar os dados do navegador apaga as escalas. Para não perder nada, use o backup.

## Qualidade

Toda mudança passa por pull request, testes automáticos e revisão antes de ir para o ar. A `main` é
protegida, inclusive para administradores. Os testes cobrem:

- a regra da Portaria, com casos gerados do Anexo I e escalas reais conferidas;
- o fluxo completo num navegador de verdade (lançar, editar, exportar, PDF, backup, atualização);
- a tela no celular de 320 a 393 px (toque, rolagem, tamanho de letra, agenda de lote);
- uma fotografia da interface que só muda de propósito, além de estabilidade de layout e tempo de resposta.

Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#como-a-qualidade-é-garantida).

## Como está montado

Página estática, sem build, sem framework e sem dependências em produção. Publicada no GitHub Pages.

```txt
index.html            página única e janelas
css/src/              estilos por área (montados em css/styles.css por tools/montar-css.mjs)
js/app.js             estado, ligação entre áreas, render() e init()
js/modules/           regras puras: cálculo, Portarias, lote, persistência, formatos, relatórios
js/modules/ui/        um módulo por área da tela (formulário, agenda de lote, planejamento…)
sw.js                 service worker (funcionamento offline, atualização com confirmação)
tests/                testes automáticos (rodam no CI a cada pull request)
tools/                versão, montagem do CSS, piso de fonte
docs/                 documentação (comece pelo índice: docs/README.md)
```

Diagrama e "onde mexer para…": [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Índice dos documentos:
[docs/README.md](docs/README.md). Histórico de versões: [CHANGELOG.md](CHANGELOG.md).

## Rodar os testes

```sh
npm ci            # instala as versões exatas do package-lock.json (só ferramentas de teste)
npm run verify    # lint + todas as suítes (unit, smoke, equivalência, mobile, vitals)
```

As suítes de navegador usam o Chrome instalado na máquina. Como contribuir: [CONTRIBUTING.md](CONTRIBUTING.md).
Segurança: [SECURITY.md](SECURITY.md).

## Aviso institucional

Ferramenta de apoio para simulação e conferência administrativa preliminar. Não substitui escala
validada, folha oficial, ordem de serviço, ato administrativo ou validação pela seção competente.
Confira valores e base normativa com os atos vigentes antes de qualquer uso formal.

## Licença

Todos os direitos reservados ao autor. O uso da aplicação publicada é livre para simulação e
conferência preliminar; redistribuição ou adaptação do código dependem de autorização. Termos em
[LICENSE.md](LICENSE.md).
