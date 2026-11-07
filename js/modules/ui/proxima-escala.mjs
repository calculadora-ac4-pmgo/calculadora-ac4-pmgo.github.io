/* ==========================================================================
   Calculadora AC4 — cartão "Próxima escala" (v91)
   Mostra a escala em andamento ou a próxima que ainda vai começar (todas as
   escalas, sem depender dos filtros). Tocar leva até ela na lista.
   ========================================================================== */
import { fmtMoeda, fmtHora, parseDateTimeLocal } from '../formato.mjs';

const dataDe = (v) => parseDateTimeLocal(v) || new Date(v);
const diaSemanaBR = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Escala em andamento (começou e não terminou) ou, se não houver, a próxima a começar.
 * @param {Array<Object>} escalas Todas as escalas salvas.
 * @param {Date} [agora]
 * @returns {{escala:Object, emAndamento:boolean}|null}
 */
export function proximaEscala(escalas, agora = new Date()) {
  const validas = escalas
    .map((e) => ({ e, ini: dataDe(e.inicio), fim: dataDe(e.fim) }))
    .filter((x) => !Number.isNaN(x.ini.getTime()) && !Number.isNaN(x.fim.getTime()));
  const andamento = validas.filter((x) => x.ini <= agora && x.fim > agora).sort((a, b) => a.fim - b.fim)[0];
  if (andamento) return { escala: andamento.e, emAndamento: true };
  const futura = validas.filter((x) => x.ini > agora).sort((a, b) => a.ini - b.ini)[0];
  return futura ? { escala: futura.e, emAndamento: false } : null;
}

/**
 * "Hoje", "Amanhã" ou a data abreviada ("sáb., 14/11").
 * @param {Date} data
 * @param {Date} [agora]
 * @returns {string}
 */
export function rotuloDia(data, agora = new Date()) {
  if (mesmoDia(data, agora)) return 'Hoje';
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 12);
  if (mesmoDia(data, amanha)) return 'Amanhã';
  const dia = `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
  return `${diaSemanaBR.format(data)}, ${dia}`;
}

/**
 * Textos do cartão.
 * @param {{escala:Object, emAndamento:boolean}} proxima
 * @param {Object} resultado Resultado de calcularEscala da escala.
 * @param {Date} [agora]
 * @returns {{rotulo:string, quando:string, detalhe:string}}
 */
export function textosProximaEscala({ escala, emAndamento }, resultado, agora = new Date()) {
  const fim = dataDe(escala.fim);
  const unidade = escala.descricao && escala.descricao !== 'Escala AC4' ? escala.descricao : '';
  const valor = fmtMoeda(resultado.valorCentavos * (escala.qtdPm || 1));
  const detalhe = unidade ? `${unidade} · ${valor}` : valor;
  if (emAndamento) {
    const dia = mesmoDia(fim, agora) ? '' : `${rotuloDia(fim, agora).toLocaleLowerCase('pt-BR')} `;
    return { rotulo: 'Em andamento', quando: `Termina ${dia}às ${fmtHora(escala.fim)}`, detalhe };
  }
  return {
    rotulo: 'Próxima escala',
    quando: `${rotuloDia(dataDe(escala.inicio), agora)} · ${fmtHora(escala.inicio)} às ${fmtHora(escala.fim)}`,
    detalhe,
  };
}

/**
 * Cria o cartão "Próxima escala".
 * @param {Object} ctx Dependências de app.js: $, on, estado, calcularEscala, render.
 * @returns {{renderProximaEscala:Function, ligarEventos:Function}}
 */
export function criarProximaEscala(ctx) {
  const { $, on, estado, calcularEscala, render } = ctx;
  let idAtual = null;

  function renderProximaEscala() {
    const cartao = $('proximaEscala');
    if (!cartao) return;
    const proxima = proximaEscala(estado.escalas);
    cartao.classList.toggle('hidden', !proxima);
    if (!proxima) { idAtual = null; return; }
    idAtual = String(proxima.escala.id);
    const t = textosProximaEscala(proxima, calcularEscala(proxima.escala));
    $('proximaRotulo').textContent = t.rotulo;
    $('proximaQuando').textContent = t.quando;
    $('proximaDetalhe').textContent = t.detalhe;
    cartao.classList.toggle('is-andamento', proxima.emAndamento);
    cartao.setAttribute('aria-label', `${t.rotulo}: ${t.quando}. ${t.detalhe}. Mostrar na lista.`);
  }

  const acharCard = (id) => [...document.querySelectorAll('#listaEscalas .escala-card')]
    .find((c) => c.querySelector(`[data-id="${window.CSS.escape(id)}"]`));

  /* Se a escala não estiver na lista (filtros ou limite), limpa os filtros. */
  function mostrarNaLista() {
    if (!idAtual) return;
    let card = acharCard(idAtual);
    if (!card) {
      estado.filtroMes = ''; estado.filtroOrigem = ''; estado.filtroBusca = ''; estado.filtroStatus = '';
      ['filtroMes', 'filtroOrigem', 'filtroBusca', 'filtroStatus'].forEach((id) => { if ($(id)) $(id).value = ''; });
      estado.limiteLista = Math.max(estado.limiteLista, estado.escalas.length);
      render();
      card = acharCard(idAtual);
    }
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-destaque');
    void card.offsetWidth;
    card.classList.add('is-destaque');
    setTimeout(() => card.classList.remove('is-destaque'), 1800);
  }

  function ligarEventos() {
    on('proximaEscala', 'click', mostrarNaLista);
  }

  return { renderProximaEscala, ligarEventos };
}
