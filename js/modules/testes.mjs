/* ==========================================================================
   Calculadora AC4 — suítes de regressão (só em ambiente de teste)
   Carregado sob demanda por app.js apenas em localhost/127.0.0.1: nunca chega
   ao aparelho do usuário em produção (auditoria v67, P3-1/P3-2).
   Expõe window.__ac4Testes, __ac4TestesExtras, __ac4TestesLancamento,
   __ac4ValidarICS e __ac4TestesAgendamento — usados por tests/*.mjs e no console.
   ========================================================================== */
import {
  fmtMoeda, combinarDataHoraLocal, formatarDataHoraInput, calcularTerminoPorDuracao,
  validarIntervaloEscala, csvTextoSeguro,
} from './formato.mjs';
import { PORTARIA_ATUAL, calcularEscala as calcularEscalaBase } from './calculo.mjs';
import { ICS_DOMAIN, dataICS, desdobrarLinhasICS, validarICS as validarICSBase } from './agenda.mjs';

/**
 * Instala as suítes em `window`.
 * @param {Object} ctx Pontes para o estado interno de app.js:
 *   calcularEscala, lerTabelaAtual, tabelaParaCalculo, escalasOrdenadas, montarICS,
 *   gerarLinkOutlookAgenda, salvar, render, $, STORAGE e `estado` (getters/setters
 *   de `escalas` e `filtroMes`).
 */
export function instalarTestes(ctx) {
  const { calcularEscala, lerTabelaAtual, tabelaParaCalculo, escalasOrdenadas, montarICS,
    gerarLinkOutlookAgenda, salvar, render, $, STORAGE, estado } = ctx;

  window.__ac4Testes = function () {
    const h = (n) => n * 60;
    const casos = [
      { caso: '1 sex 03/07 18h→sáb 8h (14h)',  inicio: '2026-07-03T18:00', fim: '2026-07-04T08:00', AD: 0,         AN: 0,    VD: h(7),  VN: h(7),  centavos: 59500 },
      { caso: '2 sáb 04/07 8h→dom 8h (24h)',   inicio: '2026-07-04T08:00', fim: '2026-07-05T08:00', AD: 0,         AN: 0,    VD: h(17), VN: h(7),  centavos: 99500 },
      { caso: 'Azul dia: seg 06/07 8h→18h',     inicio: '2026-07-06T08:00', fim: '2026-07-06T18:00', AD: h(10),     AN: 0,    VD: 0,     VN: 0,     centavos: 30000 },
      { caso: 'Azul noite: seg 06/07 22h→ter 5h',inicio:'2026-07-06T22:00', fim: '2026-07-07T05:00', AD: 0,         AN: h(7), VD: 0,     VN: 0,     centavos: 23100 },
      { caso: 'Início qui, vira sex 02/07 20h→sex 6h', inicio: '2026-07-02T20:00', fim: '2026-07-03T06:00', AD: h(2), AN: h(7), VD: h(1), VN: 0, centavos: 33100 },
      /* Fronteiras (§10 da auditoria) — dom→seg cruzando 05h, 1 min, término 00:00, bissexto */
      { caso: 'Fronteira dom→seg: dom 05/07 20h→seg 08h', inicio: '2026-07-05T20:00', fim: '2026-07-06T08:00', AD: h(3), AN: 0,    VD: h(2), VN: h(7), centavos: 48500 },
      { caso: 'Escala de 1 minuto (seg 06/07 10:00)',      inicio: '2026-07-06T10:00', fim: '2026-07-06T10:01', AD: 1,    AN: 0,    VD: 0,    VN: 0,    centavos: 0 },
      /* Só horas inteiras por categoria (v71): a fração de hora não é paga */
      { caso: 'Fração VD: sex 10/07 08:00→18:20 paga 10h', inicio: '2026-07-10T08:00', fim: '2026-07-10T18:20', AD: 0,    AN: 0,    VD: 620,  VN: 0,    centavos: 40000 },
      { caso: 'Fração VD: sex 10/07 08:00→18:10 paga 10h', inicio: '2026-07-10T08:00', fim: '2026-07-10T18:10', AD: 0,    AN: 0,    VD: 610,  VN: 0,    centavos: 40000 },
      { caso: 'Meia hora AD: seg 06/07 07:00→19:30 paga 12h', inicio: '2026-07-06T07:00', fim: '2026-07-06T19:30', AD: 750, AN: 0,   VD: 0,    VN: 0,    centavos: 36000 },
      { caso: 'Fração por faixa: seg 21:30→ter 06:00',     inicio: '2026-07-06T21:30', fim: '2026-07-07T06:00', AD: 90,   AN: h(7), VD: 0,    VN: 0,    centavos: 26100 },
      { caso: 'Término 00:00 (seg 06/07 22h→ter 00:00)',   inicio: '2026-07-06T22:00', fim: '2026-07-07T00:00', AD: 0,    AN: h(2), VD: 0,    VN: 0,    centavos: 6600 },
      { caso: 'Bissexto: ter 29/02/2028 08h→18h',          inicio: '2028-02-29T08:00', fim: '2028-02-29T18:00', AD: h(10),AN: 0,    VD: 0,    VN: 0,    centavos: 30000 },
      { caso: 'Vermelha madrugada: sex 03/07 22h→sáb 06h', inicio: '2026-07-03T22:00', fim: '2026-07-04T06:00', AD: 0,    AN: 0,    VD: h(1), VN: h(7), centavos: 35500 },
    ];
    const resultados = casos.map((c) => {
      const r = calcularEscala({ inicio: c.inicio, fim: c.fim });
      const ok = ['AD','AN','VD','VN'].every((k) => r.cont[k] === c[k]) && r.valorCentavos === c.centavos;
      return { caso: c.caso, ok, esperado: fmtMoeda(c.centavos), obtido: fmtMoeda(r.valorCentavos) };
    });
    if (console.table) console.table(resultados);
    return resultados.every((r) => r.ok) ? 'TODOS OS CASOS OK' : resultados;
  };

  /* Suíte de segurança + invariantes (§10 da auditoria, itens 5 e 6).
     Puros — rodam em Node no CI e no console em localhost. */
  window.__ac4TestesExtras = function () {
    const resultados = [];
    const add = (caso, ok, detalhes = '') => resultados.push({ caso, ok: Boolean(ok), detalhes: String(detalhes) });

    /* CSV injection: campo iniciado por = + - @ (ou tab/CR) sai com apóstrofo
       protetor; texto comum passa intacto. Cobre o exportarCSV. */
    const casosCSV = [
      ['=2+2', "'=2+2"], ['+1', "'+1"], ['-1', "'-1"], ['@x', "'@x"],
      ['\tTAB', "'\tTAB"], ['1ª CIA', '1ª CIA'], ['', ''], ['a=b', 'a=b'],
    ];
    casosCSV.forEach(([entrada, esperado]) => {
      const got = csvTextoSeguro(entrada);
      add(`csvTextoSeguro(${JSON.stringify(entrada)})`, got === esperado, got);
    });

    /* Invariantes de calcularEscala sobre 50 escalas aleatórias válidas:
       cont soma = mins; diurno+noturno = mins; vermelha ≤ mins; valor é inteiro
       ≥ 0, em reais inteiros, e reproduz Σ horas inteiras×tarifa por categoria;
       total = Σ dos valores por escala. */
    const tabela = { portaria: PORTARIA_ATUAL, valores: { AD: 3000, AN: 3300, VD: 4000, VN: 4500 } };
    const base = new Date('2026-01-01T00:00').getTime();
    let invariantesOk = true, somaManual = 0, somaReduce = 0;
    const lista = [];
    for (let i = 0; i < 50; i++) {
      const ini = new Date(base + Math.floor(Math.random() * 365 * 24 * 60) * 60000);
      const dur = 1 + Math.floor(Math.random() * (192 * 60 - 1)); // 1 min .. 192h
      const fim = new Date(ini.getTime() + dur * 60000);
      const e = { inicio: formatarDataHoraInput(ini), fim: formatarDataHoraInput(fim) };
      const r = calcularEscalaBase(e, tabela);
      const somaCont = r.cont.AD + r.cont.AN + r.cont.VD + r.cont.VN;
      const h = (m) => Math.floor(m / 60);
      const esperadoCent = h(r.cont.AD) * 3000 + h(r.cont.AN) * 3300 + h(r.cont.VD) * 4000 + h(r.cont.VN) * 4500;
      const ok = somaCont === r.mins
        && r.minDiurno + r.minNoturno === r.mins
        && r.minVermelha <= r.mins
        && Number.isInteger(r.valorCentavos) && r.valorCentavos >= 0
        && r.valorCentavos % 100 === 0
        && r.valorCentavos === esperadoCent;
      if (!ok) invariantesOk = false;
      somaManual += r.valorCentavos;
      lista.push(r.valorCentavos);
    }
    somaReduce = lista.reduce((s, v) => s + v, 0);
    add('Invariantes de cálculo em 50 escalas aleatórias', invariantesOk);
    add('Total geral = Σ dos valores por escala', somaManual === somaReduce, `${somaManual} = ${somaReduce}`);

    if (console.table) console.table(resultados);
    return resultados.every((r) => r.ok) ? 'TODOS OS TESTES EXTRAS OK' : resultados;
  };

  /* Fluxo de lançamento contra o estado real — zera e regrava as escalas,
     restaurando tudo no finally. Por isso só existe em localhost. */
  window.__ac4TestesLancamento = function () {
    const resultados = [];
    const add = (caso, ok, detalhes = '') => resultados.push({ caso, ok: Boolean(ok), detalhes });
    const idsCampos = ['escalaInicio', 'escalaFim', 'escalaDuracao', 'escalaQtdPm', 'escalaDescricao', 'escalaOrigem'];
    const snapshot = {
      escalas: JSON.parse(JSON.stringify(estado.escalas)),
      filtroMes: estado.filtroMes,
      local: localStorage.getItem(STORAGE.escalas),
      session: sessionStorage.getItem(STORAGE.escalas),
      campos: Object.fromEntries(idsCampos.map((id) => [id, $(id)?.value ?? ''])),
    };

    try {
      const inicio12 = formatarDataHoraInput(combinarDataHoraLocal('2026-07-05', '08:00'));
      const fim12 = calcularTerminoPorDuracao(inicio12, 12);
      const inicio14 = formatarDataHoraInput(combinarDataHoraLocal('2026-07-10', '18:00'));
      const fim14 = calcularTerminoPorDuracao(inicio14, 14);
      const inicio24 = formatarDataHoraInput(combinarDataHoraLocal('2026-07-05', '08:00'));
      const fim24 = calcularTerminoPorDuracao(inicio24, 24);

      add('Combinar data + hora inicial', inicio12 === '2026-07-05T08:00', inicio12);
      add('Calcular término de 12h', fim12 === '2026-07-05T20:00', fim12);
      add('Calcular término de 14h com virada de dia', fim14 === '2026-07-11T08:00', fim14);
      add('Calcular término de 24h com virada de dia', fim24 === '2026-07-06T08:00', fim24);
      add('Aceitar término maior que início', validarIntervaloEscala(inicio24, fim24).ok);
      add('Rejeitar término igual ao início', !validarIntervaloEscala(inicio24, inicio24).ok);
      add('Rejeitar término anterior ao início', !validarIntervaloEscala(fim24, inicio24).ok);
      add('Aceitar duração no limite de 192h', validarIntervaloEscala('2026-07-05T08:00', '2026-07-13T08:00').ok);
      const acimaLimite = validarIntervaloEscala('2026-07-05T08:00', '2036-07-05T08:00');
      add('Rejeitar duração acima de 192h (typo de ano)', !acimaLimite.ok && acimaLimite.campo === 'fim', acimaLimite.mensagem);

      const escalaTeste = {
        id: 'teste-lancamento-ac4',
        inicio: inicio24,
        fim: fim24,
        descricao: 'Escala AC4',
        origem: 'AC4',
        qtdPm: 1,
        tabela: lerTabelaAtual(),
      };
      add('Simular criação de objeto de escala', escalaTeste.inicio === '2026-07-05T08:00' && escalaTeste.fim === '2026-07-06T08:00' && escalaTeste.origem === 'AC4');

      estado.escalas = [];
      estado.filtroMes = '';
      estado.escalas.push(escalaTeste);
      salvar();
      const gravadas = JSON.parse(localStorage.getItem(STORAGE.escalas) || '[]');
      add('Adicionar escala válida ao estado', estado.escalas.length === 1 && estado.escalas[0].id === escalaTeste.id);
      add('Storage grava e recupera escalas', gravadas.length === 1 && gravadas[0].fim === '2026-07-06T08:00');

      render();
      const linhas = document.querySelectorAll('#listaEscalas tbody tr').length;
      add('Renderizar lista/tabela após adicionar escala', linhas === 1, `${linhas} linha(s)`);
      add('Totais recalculados após adicionar escala', $('totHoras')?.textContent === '24h' && $('totValor')?.textContent !== 'R$ 0,00', `${$('totHoras')?.textContent} / ${$('totValor')?.textContent}`);
    } finally {
      estado.escalas = snapshot.escalas;
      estado.filtroMes = snapshot.filtroMes;
      if (snapshot.local === null) localStorage.removeItem(STORAGE.escalas);
      else localStorage.setItem(STORAGE.escalas, snapshot.local);
      if (snapshot.session === null) sessionStorage.removeItem(STORAGE.escalas);
      else sessionStorage.setItem(STORAGE.escalas, snapshot.session);
      Object.entries(snapshot.campos).forEach(([id, valor]) => { if ($(id)) $(id).value = valor; });
      render();
    }

    if (console.table) console.table(resultados);
    return resultados.every((r) => r.ok) ? 'TODOS OS TESTES DE LANCAMENTO OK' : resultados;
  };

  window.__ac4ValidarICS = function (entrada) {
    const fonte = Array.isArray(entrada) ? entrada : escalasOrdenadas();
    const resultado = validarICSBase(fonte, tabelaParaCalculo());
    if (resultado.falhas.length && console.table) console.table(resultado.falhas);
    return resultado;
  };

  window.__ac4TestesAgendamento = function () {
    const casos = [
      { id: 'agenda-2027-08-03', inicio: '2027-08-03T18:00', fim: '2027-08-04T08:00', descricao: 'Escala 03/08/2027', origem: 'AC4', qtdPm: 1 },
      { id: 'agenda-2026-08-05', inicio: '2026-08-05T08:00', fim: '2026-08-06T08:00', descricao: 'Escala 05/08/2026', origem: 'AC4', qtdPm: 1 },
    ];
    const arquivo = montarICS(casos);
    const linhas = desdobrarLinhasICS(arquivo.conteudo);
    const eventos = linhas.filter((l) => l === 'BEGIN:VEVENT').length;
    const uids = linhas.filter((l) => l.startsWith('UID:')).map((l) => l.slice(4));
    const esperado = [
      `DTSTART:${dataICS(casos[0].inicio)}`,
      `DTEND:${dataICS(casos[0].fim)}`,
      `DTSTART:${dataICS(casos[1].inicio)}`,
      `DTEND:${dataICS(casos[1].fim)}`,
    ];
    const resultados = [
      { caso: 'Gera dois eventos no mesmo arquivo .ics', ok: arquivo.eventos === 2 && eventos === 2 },
      { caso: 'Inclui as datas da escala de 03/08/2027', ok: linhas.includes(esperado[0]) && linhas.includes(esperado[1]) },
      { caso: 'Inclui as datas da escala de 05/08/2026', ok: linhas.includes(esperado[2]) && linhas.includes(esperado[3]) },
      { caso: 'Gera UIDs estáveis e únicos', ok: uids.length === 2 && new Set(uids).size === 2 && uids.every((uid) => uid.endsWith(`@${ICS_DOMAIN}`)) },
      { caso: 'Validação iCalendar aprova múltiplas escalas', ok: window.__ac4ValidarICS(casos).ok },
      {
        caso: 'Link do Outlook pessoal com datas UTC e evento',
        ok: (() => {
          const url = new URL(gerarLinkOutlookAgenda(casos[0], false));
          return url.origin === 'https://outlook.live.com'
            && url.searchParams.get('rru') === 'addevent'
            && url.searchParams.get('startdt') === new Date(casos[0].inicio).toISOString()
            && url.searchParams.get('enddt') === new Date(casos[0].fim).toISOString()
            && url.searchParams.get('subject') === casos[0].descricao;
        })(),
      },
      {
        caso: 'Link do Outlook corporativo usa outlook.office.com',
        ok: new URL(gerarLinkOutlookAgenda(casos[0], true)).origin === 'https://outlook.office.com',
      },
    ];
    if (console.table) console.table(resultados);
    return resultados.every((r) => r.ok) ? 'TODOS OS TESTES DE AGENDAMENTO OK' : resultados;
  };
}
