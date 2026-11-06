/* ==========================================================================
   Calculadora AC4 — PDF do relatório gerado no próprio aparelho (v86)
   No app instalado na tela inicial do iPhone, window.print() não abre nada.
   Este módulo escreve o arquivo PDF direto (texto, linhas e retângulos), sem
   bibliotecas, com o mesmo conteúdo e as mesmas larguras de coluna do relatório
   de impressão. Fontes padrão do PDF (Helvetica), codificação WinAnsi: cobre os
   acentos do português. Função pura: recebe dados, devolve os bytes.
   ========================================================================== */
import { COLUNAS_RELATORIO, COLUNAS_MESES } from './relatorio.mjs';

/* Larguras (milésimos do corpo) da Helvetica e da Helvetica-Bold, códigos WinAnsi
   32 a 255 — métricas AFM da Adobe. */
const LARG_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722,
  667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
  667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334,
  584, 350, 556, 350, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350,
  350, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 350, 500, 667, 278, 333,
  556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333,
  556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000,
  722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722,
  722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278,
  278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500
];
const LARG_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  350, 556, 350, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350, 350,
  278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 350, 500, 667, 278, 333, 556,
  556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611,
  556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722,
  667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722,
  722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278,
  278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556
];

/* Caracteres fora do Latin-1 que existem na WinAnsi (0x80–0x9F). */
const WINANSI_EXTRA = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B,
  'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
};

/** Texto → códigos WinAnsi (caractere sem equivalente vira "?"). */
export function codigosWinAnsi(texto) {
  const out = [];
  for (const ch of String(texto ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 0xA0 && c <= 0xFF)) out.push(c);
    else if (WINANSI_EXTRA[ch]) out.push(WINANSI_EXTRA[ch]);
    else if (c === 9 || c === 10 || c === 13) out.push(32);
    else out.push(63);
  }
  return out;
}

/** Largura do texto em pontos. */
export function larguraTexto(texto, tamanho, negrito = false) {
  const tabela = negrito ? LARG_NEGRITO : LARG_NORMAL;
  return codigosWinAnsi(texto).reduce((s, c) => s + (tabela[c - 32] || 0), 0) * tamanho / 1000;
}

/* String literal do PDF só com ASCII: parênteses e barra escapados, acentos em octal. */
function literal(texto) {
  return `(${codigosWinAnsi(texto).map((c) => {
    if (c === 40 || c === 41 || c === 92) return `\\${String.fromCharCode(c)}`;
    if (c > 126) return `\\${c.toString(8).padStart(3, '0')}`;
    return String.fromCharCode(c);
  }).join('')})`;
}

/** Quebra o texto em linhas que cabem em `largura`; palavra maior que a linha é cortada. */
export function quebrarLinhas(texto, largura, tamanho, negrito = false) {
  const palavras = String(texto ?? '').split(/\s+/).filter(Boolean);
  if (!palavras.length) return [''];
  const linhas = [];
  let atual = '';
  const cabe = (t) => larguraTexto(t, tamanho, negrito) <= largura;
  for (let palavra of palavras) {
    while (!cabe(palavra)) {
      let n = palavra.length - 1;
      while (n > 1 && !cabe(palavra.slice(0, n))) n -= 1;
      if (atual) { linhas.push(atual); atual = ''; }
      linhas.push(palavra.slice(0, n));
      palavra = palavra.slice(n);
    }
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (cabe(tentativa)) atual = tentativa;
    else { linhas.push(atual); atual = palavra; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/* A4 retrato em pontos; margens de 10 mm e 14 mm embaixo, como o @page da impressão. */
const PAG_L = 595.28;
const PAG_A = 841.89;
const MARGEM = 28.35;
const MARGEM_BAIXO = 39.69;
const UTIL = PAG_L - 2 * MARGEM;
const CINZA_TEXTO = 0.333;
const CINZA_BORDA = 0.8;
const CINZA_FUNDO = 0.94;
/* Folga lateral das células: 3 px da impressão (= 2,25 pt). */
const PAD = 2.25;
const PAD_CAB = PAD;
const LINHA_TAB = 9.6;

/**
 * Gera o PDF do relatório.
 * @param {Object} p
 * @param {{resumo:Array, linhas:Array, total:(Object|null), normaTexto:string}} p.dados Saída de dadosRelatorio().
 * @param {string} p.emitidoEm Data e hora já formatadas ("05/11/2026, 16:20").
 * @param {string} [p.filtrosTexto] Aviso de lista filtrada (descreverFiltros), ou ''.
 * @param {string} [p.titulo] Título do documento (metadados).
 * @returns {Uint8Array} Bytes do arquivo PDF.
 */
export function gerarPdfRelatorio({ dados, emitidoEm, filtrosTexto = '', titulo = 'Relatorio-AC4' }) {
  const paginas = [];
  let ops = null;
  let y = 0;

  const yPdf = (yTopo) => (PAG_A - yTopo).toFixed(2);
  const novaPagina = () => { ops = []; paginas.push(ops); y = MARGEM; };
  const texto = (x, base, t, tam, { negrito = false, cinza = 0 } = {}) => {
    ops.push(`BT /${negrito ? 'F2' : 'F1'} ${tam} Tf ${cinza} g ${x.toFixed(2)} ${yPdf(base)} Td ${literal(t)} Tj ET`);
  };
  const textoAlinhado = (x, largura, base, t, tam, alinhar, opcoes = {}) => {
    const w = larguraTexto(t, tam, opcoes.negrito);
    const dx = alinhar === 'centro' ? (largura - w) / 2 : alinhar === 'direita' ? largura - w : 0;
    texto(x + dx, base, t, tam, opcoes);
  };
  const retangulo = (x, yTopo, w, h, { fundo = null, borda = null, espessura = 0.75 } = {}) => {
    const geo = `${x.toFixed(2)} ${(PAG_A - yTopo - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
    if (fundo != null) ops.push(`${fundo} g ${geo} f`);
    if (borda != null) ops.push(`${borda} G ${espessura} w ${geo} S`);
  };
  const linha = (x1, y1, x2, y2, cinza, espessura) => {
    ops.push(`${cinza} G ${espessura} w ${x1.toFixed(2)} ${yPdf(y1)} m ${x2.toFixed(2)} ${yPdf(y2)} l S`);
  };
  const cabe = (altura) => y + altura <= PAG_A - MARGEM_BAIXO;

  novaPagina();

  /* --- Cabeçalho (só na 1ª página, como no relatório impresso) --- */
  texto(MARGEM, y + 11, 'Relatório de Escalas AC4', 13, { negrito: true });
  texto(MARGEM, y + 25, 'Simulação para conferência administrativa', 8.5, { cinza: CINZA_TEXTO });
  const direita = MARGEM + UTIL;
  const rotEmitido = 'Emitido em: ';
  const wData = larguraTexto(emitidoEm, 8, true);
  texto(direita - wData - larguraTexto(rotEmitido, 8), y + 8, rotEmitido, 8, { cinza: 0.267 });
  texto(direita - wData, y + 8, emitidoEm, 8, { negrito: true, cinza: 0.267 });
  const normaLinhas = quebrarLinhas(`Base normativa: ${dados.normaTexto}`, UTIL * 0.62, 8);
  let yd = y + 8;
  normaLinhas.forEach((l) => { yd += 13.6; textoAlinhado(MARGEM, UTIL, yd, l, 8, 'direita', { cinza: 0.267 }); });
  yd += 13.6;
  textoAlinhado(MARGEM, UTIL, yd, 'Finalidade: Simulação sem efeito financeiro oficial', 8, 'direita', { cinza: 0.267 });
  y = Math.max(y + 30, yd + 4) + 6;
  linha(MARGEM, y, MARGEM + UTIL, y, 0.067, 2);
  y += 12;

  const secao = (nome) => {
    if (!cabe(40)) novaPagina();
    texto(MARGEM, y + 8, nome.toUpperCase(), 8.5, { negrito: true, cinza: 0.2 });
    y += 11.5;
    linha(MARGEM, y, MARGEM + UTIL, y, 0.667, 1);
    y += 5;
  };

  /* --- Resumo --- */
  secao('Resumo Geral');
  if (filtrosTexto) {
    const ls = quebrarLinhas(filtrosTexto, UTIL - 16, 8, true);
    const h = ls.length * 10 + 8;
    retangulo(MARGEM, y, UTIL, h, { fundo: CINZA_FUNDO, borda: 0.6 });
    ls.forEach((l, i) => texto(MARGEM + 8, y + 4 + 7 + i * 10, l, 8, { negrito: true }));
    y += h + 6;
  }
  const wCel = UTIL / dados.resumo.length;
  const celulasResumo = dados.resumo.map(([rotulo, valor]) => {
    const junto = larguraTexto(`${rotulo} ${valor}`, 8) + 2 <= wCel - 16;
    return { rotulo, valor, junto };
  });
  const hResumo = celulasResumo.some((c) => !c.junto) ? 30 : 20;
  celulasResumo.forEach(({ rotulo, valor, junto }, i) => {
    const x = MARGEM + i * wCel;
    retangulo(x, y, wCel, hResumo, { borda: CINZA_BORDA });
    texto(x + 8, y + 12, rotulo, 8, { cinza: CINZA_TEXTO });
    if (junto) texto(x + 8 + larguraTexto(`${rotulo} `, 8), y + 12, valor, 8, { negrito: true });
    else texto(x + 8, y + 22, valor, 8, { negrito: true });
  });
  y += hResumo + (dados.meses && dados.meses.length ? 6 : 12);

  /* --- Total por mês (só com 2 meses ou mais) --- */
  if (dados.meses && dados.meses.length) {
    const lm = COLUNAS_MESES.map((c) => (c.largura * UTIL) / 100);
    const xm = lm.map((_, i) => MARGEM + lm.slice(0, i).reduce((a, w) => a + w, 0));
    const hCab = 15;
    const hLin = 14;
    if (!cabe(hCab + hLin * dados.meses.length + 14)) novaPagina();
    COLUNAS_MESES.forEach((c, i) => {
      retangulo(xm[i], y, lm[i], hCab, { fundo: CINZA_FUNDO, borda: CINZA_BORDA });
      textoAlinhado(xm[i] + PAD, lm[i] - 2 * PAD, y + 10.3, c.titulo, 7.5, 'centro', { negrito: true });
    });
    y += hCab;
    dados.meses.forEach((m) => {
      m.forEach((v, i) => {
        retangulo(xm[i], y, lm[i], hLin, { borda: CINZA_BORDA });
        textoAlinhado(xm[i] + PAD + 1, lm[i] - 2 * PAD - 2, y + 9.8, v, 8, COLUNAS_MESES[i].alinhar, { negrito: i === m.length - 1 });
      });
      y += hLin;
    });
    y += 12;
  }

  /* --- Tabela --- */
  secao('Escalas Lançadas');
  const larguras = COLUNAS_RELATORIO.map((c) => (c.largura * UTIL) / 100);
  const xs = larguras.map((_, i) => MARGEM + larguras.slice(0, i).reduce((s, w) => s + w, 0));
  const titulos = COLUNAS_RELATORIO.map((c, i) => quebrarLinhas(c.titulo, larguras[i] - 2 * PAD_CAB, 7.5, true));
  const hCabecalho = Math.max(...titulos.map((t) => t.length)) * 9 + 8;
  const cabecalhoTabela = () => {
    titulos.forEach((ls, i) => {
      retangulo(xs[i], y, larguras[i], hCabecalho, { fundo: CINZA_FUNDO, borda: CINZA_BORDA });
      ls.forEach((l, k) => textoAlinhado(xs[i] + PAD_CAB, larguras[i] - 2 * PAD_CAB, y + 4 + 6.5 + k * 9, l, 7.5, 'centro', { negrito: true }));
    });
    y += hCabecalho;
  };
  if (!cabe(hCabecalho + 30)) novaPagina();
  cabecalhoTabela();

  dados.linhas.forEach(({ celulas, sub }) => {
    const ultima = celulas.length - 1;
    const conteudo = celulas.map((c, i) => quebrarLinhas(c, larguras[i] - 2 * PAD, 8, i === ultima));
    const altura = Math.max(...conteudo.map((ls, i) => ls.length * LINHA_TAB + (i === ultima && sub ? 9 : 0))) + 7;
    if (!cabe(altura)) { novaPagina(); cabecalhoTabela(); }
    conteudo.forEach((ls, i) => {
      retangulo(xs[i], y, larguras[i], altura, { borda: CINZA_BORDA });
      const alinhar = COLUNAS_RELATORIO[i].alinhar;
      ls.forEach((l, k) => textoAlinhado(xs[i] + PAD, larguras[i] - 2 * PAD, y + 3.5 + 6.6 + k * LINHA_TAB, l, 8, alinhar, { negrito: i === ultima }));
      if (i === ultima && sub) {
        textoAlinhado(xs[i] + PAD, larguras[i] - 2 * PAD, y + 3.5 + 6.6 + ls.length * LINHA_TAB, sub, 7, 'direita', { cinza: CINZA_TEXTO });
      }
    });
    y += altura;
  });

  if (dados.total) {
    const altura = 17;
    if (!cabe(altura)) { novaPagina(); cabecalhoTabela(); }
    const wJunto = larguras.slice(0, 10).reduce((s, w) => s + w, 0);
    retangulo(MARGEM, y, wJunto, altura, { fundo: CINZA_FUNDO, borda: CINZA_BORDA });
    texto(MARGEM + PAD + 1, y + 11.5, 'TOTAL GERAL', 8, { negrito: true });
    [dados.total.diurno, dados.total.noturno, dados.total.valor].forEach((v, k) => {
      const i = 10 + k;
      retangulo(xs[i], y, larguras[i], altura, { fundo: CINZA_FUNDO, borda: CINZA_BORDA });
      textoAlinhado(xs[i] + PAD, larguras[i] - 2 * PAD, y + 11.5, v, 8, k === 2 ? 'direita' : 'centro', { negrito: true });
    });
    linha(MARGEM, y, MARGEM + UTIL, y, 0.467, 2);
    y += altura;
  }

  /* --- Aviso legal --- */
  const aviso = quebrarLinhas('Atenção: os valores apresentados são simulados, não possuem efeito financeiro oficial '
    + 'e estão sujeitos à validação administrativa, conferência do efetivo cumprimento da escala e normas vigentes.', UTIL, 8);
  if (!cabe(14 + aviso.length * 10 + 4)) novaPagina(); else y += 14;
  linha(MARGEM, y, MARGEM + UTIL, y, 0.667, 1);
  aviso.forEach((l, i) => texto(MARGEM, y + 10 + i * 10, l, 8, { cinza: CINZA_TEXTO }));

  /* --- Rodapé de todas as páginas --- */
  const total = paginas.length;
  paginas.forEach((p, i) => {
    ops = p;
    const base = PAG_A - MARGEM_BAIXO + 22;
    texto(MARGEM, base, 'Simulação sem efeito financeiro oficial', 7.5, { cinza: CINZA_TEXTO });
    textoAlinhado(MARGEM, UTIL, base, `Página ${i + 1} de ${total}`, 7.5, 'direita', { cinza: CINZA_TEXTO });
  });

  return montarArquivo(paginas, titulo);
}

/* Objetos PDF 1.4: catálogo, páginas, 2 fontes, metadados e, por página, a página e o conteúdo. */
function montarArquivo(paginas, titulo) {
  const objetos = [];
  const idPagina = (i) => 6 + i * 2;
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objetos[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] /Count ${paginas.length} >>`;
  objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objetos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objetos[5] = `<< /Title ${literal(titulo)} /Producer (Calculadora AC4) >>`;
  paginas.forEach((ops, i) => {
    const conteudo = ops.join('\n');
    objetos[idPagina(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAG_L} ${PAG_A}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idPagina(i) + 1} 0 R >>`;
    objetos[idPagina(i) + 1] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
  });
  let arquivo = '%PDF-1.4\n%âãÏÓ\n';
  const posicoes = [];
  for (let n = 1; n < objetos.length; n += 1) {
    posicoes[n] = arquivo.length;
    arquivo += `${n} 0 obj\n${objetos[n]}\nendobj\n`;
  }
  const inicioXref = arquivo.length;
  arquivo += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objetos.length; n += 1) arquivo += `${String(posicoes[n]).padStart(10, '0')} 00000 n \n`;
  arquivo += `trailer\n<< /Size ${objetos.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  const bytes = new Uint8Array(arquivo.length);
  for (let i = 0; i < arquivo.length; i += 1) bytes[i] = arquivo.charCodeAt(i) & 0xFF;
  return bytes;
}
