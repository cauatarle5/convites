/* =============================================================================
 * priority.js — MOTOR DE PRIORIZAÇÃO (seção 6). O "cérebro" do sistema.
 * -----------------------------------------------------------------------------
 * FÓRMULA (produto de fatores, todos normalizados 0..1):
 *
 *   prioridade(topico) =
 *       peso_estrategico(disciplina)
 *     × fator_atraso(dias_desde_ultima_revisao_programada)
 *     × fator_desempenho(taxa_erro_recente)
 *     × fator_esquecimento(intervalo_esperado_pelo_SRS)
 *     × (1 - fator_dominio(confianca_acumulada))
 *
 * DEFINIÇÕES EXATAS (todas 0..1):
 *   peso_estrategico : alto = 1.0 | medio = 0.6
 *   fator_atraso     : min(dias_atraso / 14, 1.0)
 *   fator_desempenho : taxa de erro nas últimas 3 exposições (0..1);
 *                      SEM histórico => 0.5 (neutro), nunca 0, nunca 1.0.
 *   fator_esquecimento: fração do intervalo SRS já decorrida (0..1; 1 = venceu)
 *   fator_dominio    : confiança acumulada (0..1); entra como DESCONTO
 *                      MULTIPLICATIVO via (1 - fator_dominio), nunca subtração.
 *
 * TÓPICO NUNCA ESTUDADO (sem entrada de progresso) — forçar:
 *   fator_esquecimento = 1.0 ; fator_atraso = 1.0 ;
 *   fator_desempenho = 0.5   ; fator_dominio = 0  => (1 - dominio) = 1.0
 *   -> tratado como revisão vencida, compete de igual com conteúdo já visto.
 *
 * TRAVA FINAL: prioridade = max(0, prioridade). Rede de segurança; com o
 *   desconto multiplicativo o resultado já fica em [0,1].
 *
 * -----------------------------------------------------------------------------
 * DECISÃO CONSCIENTE SOBRE A MULTIPLICAÇÃO (documentada, como exige a seção 6):
 *   A fórmula é PRODUTO PURO: um único fator baixo derruba o score. Isso é
 *   intencional — um tópico resolvido em qualquer eixo não deve liderar a fila.
 *   Como o briefing observa que isso pode ficar agressivo demais, oferecemos o
 *   AMORTECIMENTO opcional por termo:  base + (1 - base) * fator, com base=0.2.
 *   Assim nenhum fator isolado zera o resultado. A escolha entre PRODUTO PURO e
 *   AMORTECIDO é do usuário (config.prioridade_amortecimento) e o valor default
 *   é AMORTECIDO (true), por ser o comportamento mais estável na prática.
 *   -> Registrado aqui, no código, qual abordagem está em uso.
 * ============================================================================= */

export const BASE_AMORTECIMENTO = 0.2;

const PESO_ESTRATEGICO = { alto: 1.0, medio: 0.6 };

/** Aplica amortecimento opcional a um fator. */
function amortecer(fator, ligado) {
  return ligado ? BASE_AMORTECIMENTO + (1 - BASE_AMORTECIMENTO) * fator : fator;
}

/**
 * Calcula a prioridade de UM tópico.
 * @param {object} args
 *   - disciplina: {peso_estrategico}
 *   - progresso:  registro topico_progresso | null (null = nunca estudado)
 *   - hojeISO
 *   - amortecido: boolean (config.prioridade_amortecimento)
 *   - helpers: {daysBetween, taxaErroRecente, confianca}
 * @returns {object} {prioridade, fatores}
 */
export function prioridadeTopico({ disciplina, progresso, hojeISO, amortecido, helpers }) {
  const peso = PESO_ESTRATEGICO[disciplina.peso_estrategico] ?? 0.6;

  let fAtraso, fDesempenho, fEsquecimento, fDominio;

  if (!progresso || !progresso.srs || progresso.srs.historico.length === 0) {
    // Tópico nunca estudado — regra obrigatória da seção 6.
    fEsquecimento = 1.0;
    fAtraso = 1.0;
    fDesempenho = 0.5;
    fDominio = 0;
  } else {
    const srs = progresso.srs;

    // fator_atraso: dias desde a revisão PROGRAMADA (proxima_revisao) até hoje.
    const diasAtraso = Math.max(0, helpers.daysBetween(srs.proxima_revisao, hojeISO));
    fAtraso = Math.min(diasAtraso / 14, 1.0);

    // fator_desempenho: taxa de erro recente; sem histórico => 0.5.
    const te = helpers.taxaErroRecente(srs);
    fDesempenho = te == null ? 0.5 : te;

    // fator_esquecimento: fração do intervalo SRS já decorrida desde a última
    // revisão. 1.0 = já passou do previsto.
    if (srs.ultima_revisao) {
      const decorrido = helpers.daysBetween(srs.ultima_revisao, hojeISO);
      fEsquecimento = Math.min(1, decorrido / Math.max(1, srs.intervalo_dias));
    } else {
      fEsquecimento = 1.0;
    }

    // fator_dominio: confiança acumulada.
    fDominio = helpers.confianca(srs);
  }

  const ap = f => amortecer(f, amortecido);
  // (1 - fator_dominio) é o desconto; amortecemos o desconto, não o domínio.
  const descontoDominio = ap(1 - fDominio);

  let prioridade =
      peso
    * ap(fAtraso)
    * ap(fDesempenho)
    * ap(fEsquecimento)
    * descontoDominio;

  prioridade = Math.max(0, prioridade); // trava final

  return {
    prioridade,
    fatores: {
      peso_estrategico: peso,
      fator_atraso: fAtraso,
      fator_desempenho: fDesempenho,
      fator_esquecimento: fEsquecimento,
      fator_dominio: fDominio,
    },
  };
}

/**
 * Gera uma FRASE de motivo (seção 12) a partir dos fatores dominantes.
 */
export function motivoRecomendacao({ topico, disciplina, progresso, fatores }) {
  const nunca = !progresso || !progresso.srs || progresso.srs.historico.length === 0;
  const pesoTxt = disciplina.peso_estrategico === 'alto' ? 'peso alto' : 'peso médio';
  if (nunca) {
    return `Você ainda não estudou isso e ${disciplina.nome} tem ${pesoTxt}.`;
  }
  if (fatores.fator_esquecimento >= 0.99) {
    return `Revisão vencida pelo algoritmo de repetição (${disciplina.nome}).`;
  }
  if (fatores.fator_desempenho >= 0.5) {
    return `Você tem errado bastante aqui — reforço recomendado (${disciplina.nome}).`;
  }
  if (fatores.fator_atraso >= 0.7) {
    return `Está atrasado no ciclo de revisão (${disciplina.nome}, ${pesoTxt}).`;
  }
  return `Manutenção do domínio antes de esquecer (${disciplina.nome}).`;
}
