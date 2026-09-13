/* =============================================================================
 * srs.js — Spaced Repetition (Leitner adaptado de 5 caixas)
 * -----------------------------------------------------------------------------
 * ESCOLHA (seção 4): Para o MVP usamos um LEITNER ADAPTADO DE 5 CAIXAS, em vez
 * do FSRS completo. A promoção/rebaixamento de caixa depende de TRÊS sinais,
 * exatamente como exige o briefing:
 *    (1) acerto/erro na revisão      -> resultado: 'facil' | 'esforco' | 'esqueceu'
 *    (2) tempo de resposta           -> respostas lentas não promovem
 *    (3) taxa de acerto nas últimas 3 exposições
 *
 * INTERVALOS POR CAIXA (dias) — documentados, não implícitos:
 *    caixa 1 -> 1 dia
 *    caixa 2 -> 3 dias
 *    caixa 3 -> 7 dias
 *    caixa 4 -> 16 dias
 *    caixa 5 -> 35 dias
 *
 * REGRA DE TRANSIÇÃO (aplicada a flashcards e ao progresso de tópico):
 *    resultado 'esqueceu'  -> volta para a caixa 1 (reset)
 *    resultado 'esforco'   -> permanece na mesma caixa
 *    resultado 'facil'     -> sobe 1 caixa (até a 5), MAS:
 *        - se a resposta foi LENTA (tempo > limite_lento), trata como 'esforco'
 *          (não promove) — sinal (2).
 *    Ajuste por sinal (3): se a taxa de acerto das últimas 3 exposições < 0.5,
 *        aplica-se um rebaixamento adicional de 1 caixa (piso = caixa 1).
 *
 * CONFIANÇA / DOMÍNIO (usado pelo motor de priorização, seção 6):
 *    confianca = 0.5 * acc_recente + 0.5 * (caixa - 1) / 4        (0..1)
 *    onde acc_recente = média das últimas 3 exposições com peso por resultado:
 *       facil = 1.0 | esforco = 0.6 | esqueceu = 0.0
 * ============================================================================= */

export const INTERVALOS_CAIXA = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };
export const LIMITE_RESPOSTA_LENTA_S = 30; // > 30s em um flashcard = "lenta"

const PESO_RESULTADO = { facil: 1.0, esforco: 0.6, esqueceu: 0.0 };

/** Estado SRS inicial de um item novo. */
export function novoEstadoSRS(dataInicialISO) {
  return {
    box: 1,
    intervalo_dias: INTERVALOS_CAIXA[1],
    ultima_revisao: null,
    proxima_revisao: dataInicialISO,      // revisa hoje
    historico: [],                         // [{data, resultado, tempo_s}]
  };
}

/**
 * Aplica uma revisão e devolve o NOVO estado SRS.
 * @param {object} estado  estado atual (novoEstadoSRS)
 * @param {'facil'|'esforco'|'esqueceu'} resultado
 * @param {number} tempo_s tempo de resposta em segundos
 * @param {string} dataISO data da revisão (YYYY-MM-DD)
 */
export function revisar(estado, resultado, tempo_s, dataISO, addDaysISO) {
  const historico = [...estado.historico, { data: dataISO, resultado, tempo_s }];

  // sinal (3): taxa de acerto das últimas 3 exposições (facil/esforco contam
  // como "não esqueceu"). Usamos o peso para uma taxa contínua.
  const ult3 = historico.slice(-3);
  const accRecente = ult3.reduce((s, h) => s + (PESO_RESULTADO[h.resultado] ?? 0.5), 0) / ult3.length;

  let box = estado.box;
  if (resultado === 'esqueceu') {
    box = 1; // reset
  } else if (resultado === 'facil') {
    const lenta = tempo_s > LIMITE_RESPOSTA_LENTA_S; // sinal (2)
    box = lenta ? box : Math.min(5, box + 1);
  } // 'esforco' -> mantém

  // ajuste por sinal (3): recorrência de erro recente rebaixa
  if (accRecente < 0.5) box = Math.max(1, box - 1);

  const intervalo = INTERVALOS_CAIXA[box];
  return {
    box,
    intervalo_dias: intervalo,
    ultima_revisao: dataISO,
    proxima_revisao: addDaysISO(dataISO, intervalo),
    historico,
  };
}

/** Confiança/domínio 0..1 a partir do estado (ver cabeçalho). */
export function confianca(estado) {
  if (!estado || estado.historico.length === 0) return 0;
  const ult3 = estado.historico.slice(-3);
  const accRecente = ult3.reduce((s, h) => s + (PESO_RESULTADO[h.resultado] ?? 0.5), 0) / ult3.length;
  return Math.min(1, 0.5 * accRecente + 0.5 * (estado.box - 1) / 4);
}

/** Taxa de ERRO das últimas 3 exposições (0..1). 'esforco' conta como meio-erro. */
export function taxaErroRecente(estado) {
  if (!estado || estado.historico.length === 0) return null; // sem histórico
  const ult3 = estado.historico.slice(-3);
  const accRecente = ult3.reduce((s, h) => s + (PESO_RESULTADO[h.resultado] ?? 0.5), 0) / ult3.length;
  return 1 - accRecente;
}
