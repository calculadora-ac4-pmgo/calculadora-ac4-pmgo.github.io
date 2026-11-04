/* ==========================================================================
   Calculadora AC4 — normas de valores do Serviço Extraordinário AC4
   Fonte única dos valores da hora e da identificação da norma (R5, v73).

   Manutenção:
   - NUNCA editar uma entrada já publicada: escalas daquele período dependem
     dela. Norma nova vai no FIM da lista, e a anterior recebe `vigenciaFim`
     (dia anterior à nova `vigenciaInicio`).
   - Ao trocar a norma vigente, atualizar também a faixa `.tariff-strip` do
     index.html (o teste "Fonte única da Portaria" confere) e a transcrição
     em docs/.
   - Valores em centavos por hora: AD/AN = azul diurno/noturno (seg–qui),
     VD/VN = vermelha diurno/noturno (sex–dom).

   Portaria SSP nº 621/2026 — DOE/GO nº 24.801, de 17/06/2026, p. 58-59,
   protocolo 630514. Transcrição: docs/portaria-ssp-621-2026.md
   ========================================================================== */

const congelar = (n) => Object.freeze({ ...n, doe: Object.freeze({ ...n.doe }), valores: Object.freeze({ ...n.valores }) });

export const NORMAS = Object.freeze([
  congelar({
    id: 'ssp-621-2026-07-01',
    norma: 'Portaria SSP nº 621/2026',
    doe: { numero: '24.801', data: '2026-06-17', paginas: '58-59', protocolo: '630514' },
    vigenciaInicio: '2026-07-01',
    valores: { AD: 3000, AN: 3300, VD: 4000, VN: 4500 },
  }),
]);

/**
 * Norma vigente na data informada.
 * @param {string} valor Data ISO (`YYYY-MM-DD`, pode trazer hora depois).
 * @returns {Object|null} Norma ou `null` (formato inválido ou fora de toda vigência).
 */
export function normaParaData(valor) {
  const data = String(valor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  return [...NORMAS].reverse().find((n) =>
    data >= n.vigenciaInicio && (!n.vigenciaFim || data <= n.vigenciaFim)) || null;
}

/** Norma mais recente da lista. */
export const normaAtual = () => NORMAS[NORMAS.length - 1];

/** Ex.: "Portaria SSP nº 621/2026 (DOE nº 24.801, 17/06/2026)". */
export function citacaoNorma(n) {
  return `${n.norma} (DOE nº ${n.doe.numero}, ${n.doe.data.split('-').reverse().join('/')})`;
}
