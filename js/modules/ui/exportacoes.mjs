/* ==========================================================================
   Calculadora AC4 — exportações (v74)
   Planilha CSV, relatório de impressão (PDF pelo navegador; no iPhone e no iPad,
   arquivo PDF gerado no aparelho, v86) e agenda: diálogo de provedores (Google,
   Outlook pessoal/corporativo) e arquivo .ics.
   ========================================================================== */
import { montarRelatorioImpressao, dadosRelatorio, descreverFiltros, montarCSV, baixarArquivo } from '../relatorio.mjs';
import { gerarPdfRelatorio } from '../pdf.mjs';
import { escapeHTML, fmtDataHora } from '../formato.mjs';

/**
 * Cria as exportações.
 * @param {Object} ctx Dependências de app.js: $, estado, toast, haptic, calcularEscala,
 *   escalasOrdenadas, montarICS, gerarLinkGoogleAgenda, gerarLinkOutlookAgenda,
 *   isMobileViewport, aposProximoPaint e ehIOS.
 * @returns {{exportarCSV:Function, imprimirRelatorio:Function, agendarEscalas:Function,
 *   baixarArquivoAgenda:Function, agendarEscalaItem:Function}}
 */
export function criarExportacoes(ctx) {
  const { $, estado, toast, haptic, calcularEscala, escalasOrdenadas, montarICS,
    gerarLinkGoogleAgenda, gerarLinkOutlookAgenda, isMobileViewport, aposProximoPaint, ehIOS = () => false } = ctx;

  function baixarArquivoAgenda(lista, mensagem = 'Arquivo .ics gerado para importar na sua agenda.') {
    const arquivo = montarICS(lista);
    if (!arquivo.eventos) {
      toast('Não há escalas válidas para gerar o arquivo .ics.', { erro: true });
      return null;
    }
    baixarArquivo(arquivo.conteudo, 'escalas-ac4.ics', 'text/calendar;charset=utf-8');
    const total = `${arquivo.eventos} evento${arquivo.eventos === 1 ? '' : 's'}`;
    const ignoradas = arquivo.ignoradas
      ? ` ${arquivo.ignoradas} escala${arquivo.ignoradas === 1 ? '' : 's'} inválida${arquivo.ignoradas === 1 ? '' : 's'} foram ignoradas.`
      : '';
    toast(`${mensagem} ${total}.${ignoradas}`);
    return arquivo;
  }

  /* ------------------------------------------------------- exportações */

  /* Nome sugerido do arquivo: "Relatorio-AC4-AAAA-MM-DD". */
  function nomeDoRelatorio() {
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return `Relatorio-AC4-${dia}`;
  }

  /* iPhone e iPad (o iPad moderno se apresenta como Mac com tela de toque). No app
     instalado na tela inicial, window.print() não abre nada: o PDF vira arquivo. */
  const aparelhoApple = () => ehIOS()
    || (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints || 0) > 1);

  /* Popula #printReport e chama window.print(); no iPhone/iPad gera o arquivo PDF. */
  function imprimirRelatorio() {
    const lista = escalasOrdenadas();
    if (!lista.length) { toast('Adicione escalas antes de imprimir.', { erro: true }); return; }
    let resultados;
    let emitidoEm;
    let filtrosTexto;
    try {
      resultados = lista.map((e) => ({ e, r: calcularEscala(e) }));
      const { resumoHTML, mesesHTML, tabelaHTML, normaTexto } = montarRelatorioImpressao(resultados);
      emitidoEm = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      $('prDate').textContent = emitidoEm;
      $('prNorma').textContent = normaTexto;
      /* Logo após um deploy, o navegador pode juntar o JavaScript novo com um index.html
         antigo (sem #prFiltros). O aviso de filtro é opcional: sem o elemento, o PDF sai igual. */
      filtrosTexto = descreverFiltros({
        mes: estado.filtroMes, origem: estado.filtroOrigem, status: estado.filtroStatus, busca: estado.filtroBusca,
      });
      const linhaFiltros = $('prFiltros');
      if (linhaFiltros) { linhaFiltros.textContent = filtrosTexto; linhaFiltros.hidden = !filtrosTexto; }
      $('prSummary').innerHTML = resumoHTML;
      /* Quadro opcional (como #prFiltros): sem o elemento, o PDF sai sem ele. */
      const quadroMeses = $('prMeses');
      if (quadroMeses) { quadroMeses.innerHTML = mesesHTML; quadroMeses.hidden = !mesesHTML; }
      $('prTableWrap').innerHTML = tabelaHTML;
    } catch {
      toast('Não foi possível gerar o PDF. Atualize o aplicativo e tente de novo.', { erro: true });
      return;
    }
    /* Ainda dentro do toque: o compartilhamento do iOS exige o gesto do usuário. */
    if (aparelhoApple()) { entregarPdfNoAparelho(resultados, emitidoEm, filtrosTexto); return; }
    /* window.print() bloqueia a thread até o diálogo fechar; chamado no próprio
       clique, o tempo no diálogo entra no INP (11s no RUM). Pintar antes. */
    aposProximoPaint(() => imprimirComNomeDoArquivo());
  }

  /* Gera o PDF no aparelho e abre a tela de compartilhar (Salvar em Arquivos,
     WhatsApp, Imprimir). Sem compartilhamento de arquivo, baixa como o CSV. */
  function entregarPdfNoAparelho(resultados, emitidoEm, filtrosTexto) {
    const nome = nomeDoRelatorio();
    let bytes;
    try {
      bytes = gerarPdfRelatorio({ dados: dadosRelatorio(resultados), emitidoEm, filtrosTexto, titulo: nome });
    } catch {
      toast('Não foi possível gerar o PDF. Atualize o aplicativo e tente de novo.', { erro: true });
      return;
    }
    const baixar = () => {
      baixarArquivo(bytes, `${nome}.pdf`, 'application/pdf');
      toast('PDF gerado.');
    };
    let arquivo = null;
    try { arquivo = new File([bytes], `${nome}.pdf`, { type: 'application/pdf' }); } catch { arquivo = null; }
    let podeCompartilhar = false;
    try { podeCompartilhar = !!(arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })); } catch { podeCompartilhar = false; }
    if (!podeCompartilhar) { baixar(); return; }
    navigator.share({ files: [arquivo], title: 'Relatório de Escalas AC4' }).catch((erro) => {
      if (erro && erro.name === 'AbortError') return; /* o usuário fechou a tela de compartilhar */
      baixar();
    });
  }

  /* O navegador sugere o título da página como nome do arquivo PDF: troca por
     "Relatorio-AC4-AAAA-MM-DD" só durante a impressão e restaura ao terminar. */
  function imprimirComNomeDoArquivo() {
    const tituloOriginal = document.title;
    let restaurado = false;
    const restaurar = () => {
      if (restaurado) return;
      restaurado = true;
      document.title = tituloOriginal;
      window.removeEventListener('afterprint', restaurar);
    };
    document.title = nomeDoRelatorio();
    window.addEventListener('afterprint', restaurar);
    /* Alguns navegadores móveis não disparam afterprint: o título volta sozinho. */
    setTimeout(restaurar, 120000);
    try { window.print(); } catch (erro) { restaurar(); throw erro; }
  }

  /* ------------------------------------------------ agendamento
     Celular e desktop usam o MESMO dialog de provedores: tocar em "Google
     Agenda"/"Outlook" abre o evento já pré-preenchido (um toque em Salvar).
     "Baixar .ics" fica como alternativa para outras agendas (Apple, Samsung). */
  const PROVEDORES_AGENDA = [
    {
      id: 'google', nome: 'Google Agenda', hint: 'Abre com o evento pronto',
      classeIco: 'google',
      icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m9.5 14.5 2-2v5"/></svg>',
      link: (e) => gerarLinkGoogleAgenda(e),
    },
    {
      id: 'outlook', nome: 'Outlook pessoal', hint: 'Conta Outlook.com',
      classeIco: 'outlook',
      icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><circle cx="12" cy="15" r="2.6"/></svg>',
      link: (e) => gerarLinkOutlookAgenda(e, false),
    },
    {
      id: 'outlook365', nome: 'Outlook corporativo', hint: 'Conta Microsoft 365 (trabalho)',
      classeIco: 'outlook',
      icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M9.5 17v-4.5h2.2a1.4 1.4 0 0 1 0 2.8H9.5"/></svg>',
      link: (e) => gerarLinkOutlookAgenda(e, true),
    },
  ];

  const ICONE_ICS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';

  function agendarEscalas(lista) {
    if (!lista.length) { toast('Adicione escalas antes de salvar na agenda.', { erro: true }); return; }
    abrirDialogAgenda(lista);
  }

  function abrirDialogAgenda(lista) {
    const dlg = $('dialogAgenda');
    if (!dlg) return;
    $('agendaSub').textContent = lista.length === 1
      ? `${lista[0].descricao} — ${fmtDataHora(lista[0].inicio)}`
      : `${lista.length} escalas selecionadas`;
    montarOpcoesProvedor(lista);
    dlg.showModal();
  }

  /* v82: no iPhone o Calendário só oferece "Adicionar" quando o Safari ABRE o
     arquivo (baixar para Arquivos ou compartilhar mostra o evento sem adicionar).
     Abre o .ics como blob text/calendar; se o navegador bloquear, cai no download. */
  function abrirIcsNoIPhone(lista) {
    const arquivo = montarICS(lista);
    if (!arquivo.eventos) { toast('Não há escalas válidas para gerar o arquivo .ics.', { erro: true }); return; }
    const url = URL.createObjectURL(new Blob([arquivo.conteudo], { type: 'text/calendar;charset=utf-8' }));
    const janela = window.open(url, '_blank');
    if (!janela) { baixarArquivoAgenda(lista, 'Arquivo .ics gerado — abra pelo Safari para adicionar ao Calendário.'); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Toque em “Adicionar” no Calendário. Se não aparecer, abra o app pelo Safari.');
  }

  /* Alternativa universal: baixa o .ics (Samsung, Google pelo arquivo, etc.).
     No celular a mensagem orienta a abrir o arquivo; no desktop, a importar. */
  function baixarIcsDaAgenda(lista) {
    $('dialogAgenda')?.close();
    if (ehIOS()) { abrirIcsNoIPhone(lista); return; }
    baixarArquivoAgenda(lista, isMobileViewport()
      ? 'Arquivo .ics gerado — toque nele (em Downloads) para abrir na agenda.'
      : 'Arquivo .ics gerado para importar na sua agenda.');
  }

  function montarOpcoesProvedor(lista) {
    const body = $('agendaBody');
    const provedores = PROVEDORES_AGENDA.map((p) => `
      <button class="agenda-prov" data-prov="${p.id}" type="button">
        <span class="agenda-prov-ico ${p.classeIco}" aria-hidden="true">${p.icone}</span>
        <span class="agenda-prov-txt">${p.nome}<small>${p.hint}</small></span>
      </button>`).join('');
    body.innerHTML = `${provedores}
      <button class="agenda-prov agenda-prov--ics" data-prov="ics" type="button">
        <span class="agenda-prov-ico ics" aria-hidden="true">${ICONE_ICS}</span>
        <span class="agenda-prov-txt">${ehIOS() ? 'Calendário do iPhone<small>Abre no Calendário com lembrete 2 h antes</small>' : 'Baixar arquivo (.ics)<small>Samsung, Apple ou outra agenda; lembrete 2 h antes</small>'}</span>
      </button>`;
    body.querySelectorAll('.agenda-prov').forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic(10);
        if (btn.dataset.prov === 'ics') { baixarIcsDaAgenda(lista); return; }
        const prov = PROVEDORES_AGENDA.find((p) => p.id === btn.dataset.prov);
        if (!prov) return;
        if (lista.length === 1) {
          window.open(prov.link(lista[0]), '_blank', 'noopener');
          $('dialogAgenda')?.close();
          return;
        }
        montarListaEscalasProvedor(lista, prov);
      });
    });
  }

  /* Agendas web só aceitam um evento por link: com várias escalas, cada uma
     vira um link clicável — evita bloqueio de pop-up e dá controle ao PM. */
  function montarListaEscalasProvedor(lista, prov) {
    const body = $('agendaBody');
    body.innerHTML = `
      <p class="agenda-hint">O ${prov.nome} abre uma escala por vez. Clique em cada uma para adicionar:</p>
      <div class="agenda-lista">
        ${lista.map((e) => `
          <a class="agenda-item" href="${escapeHTML(prov.link(e))}" target="_blank" rel="noopener">
            <span>${escapeHTML(e.descricao || 'Escala AC4')} — ${fmtDataHora(e.inicio)}</span>
          </a>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="agendaVoltar" type="button">‹ Escolher outra agenda</button>`;
    body.querySelectorAll('.agenda-item').forEach((a) => {
      a.addEventListener('click', () => a.classList.add('aberta'));
    });
    $('agendaVoltar')?.addEventListener('click', () => montarOpcoesProvedor(lista));
  }

  function agendarEscalaItem(id) {
    const e = estado.escalas.find((x) => x.id === id);
    if (e) agendarEscalas([e]);
  }

  function exportarCSV() {
    const lista = escalasOrdenadas();
    if (!lista.length) { toast('Adicione escalas antes de exportar CSV.', { erro: true }); return; }
    baixarArquivo(montarCSV(lista.map((e) => ({ e, r: calcularEscala(e) }))), 'escalas-ac4.csv', 'text/csv;charset=utf-8');
    toast('Planilha CSV gerada.');
  }

  return { exportarCSV, imprimirRelatorio, agendarEscalas, baixarArquivoAgenda, agendarEscalaItem };
}
