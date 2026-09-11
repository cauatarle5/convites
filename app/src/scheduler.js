/* =============================================================================
 * scheduler.js — Camada de domínio: gera o plano do dia, a fila de revisão
 * unificada, e atualiza o progresso/SRS a cada interação.
 * ============================================================================= */
import {
  store, getConfig, uid, todayISO, nowISO, daysBetween, addDaysISO,
} from './store.js';
import {
  novoEstadoSRS, revisar, confianca, taxaErroRecente,
} from './srs.js';
import { prioridadeTopico, motivoRecomendacao } from './priority.js';

const HELPERS = { daysBetween, taxaErroRecente, confianca };

/* ---- progresso por tópico ------------------------------------------------ */
export function progressoDe(topicoId) {
  return store.where('topico_progresso', p => p.topico_id === topicoId)[0] || null;
}

function garanteProgresso(topicoId) {
  let p = progressoDe(topicoId);
  if (!p) {
    p = store.insert('topico_progresso', {
      topico_id: topicoId,
      srs: novoEstadoSRS(todayISO()),
      confianca_atual: 0,
    });
  }
  return p;
}

/**
 * Registra o resultado de uma RECUPERAÇÃO ATIVA no tópico (resumo, sessão de
 * estudo com autoavaliação, etc.) e realimenta o SRS do tópico.
 * resultado: 'facil' | 'esforco' | 'esqueceu'
 */
export function registrarRecuperacaoTopico(topicoId, resultado, tempo_s = 0) {
  const p = garanteProgresso(topicoId);
  const novo = revisar(p.srs, resultado, tempo_s, todayISO(), addDaysISO);
  return store.update('topico_progresso', p.id, {
    srs: novo,
    confianca_atual: confianca(novo),
  });
}

/* ---- SESSÃO DE ESTUDO / POMODORO (seção 7) ------------------------------ */
export function registrarSessao({ topicoId, tempoPlanejadoMin, tempoRealMin, nPomodoros }) {
  const topico = store.get('topico', topicoId);
  return store.insert('sessao_estudo', {
    topico_id: topicoId,
    disciplina_id: topico ? topico.disciplina_id : null,
    tempo_planejado_min: tempoPlanejadoMin,
    tempo_real_min: tempoRealMin,
    n_pomodoros: nPomodoros || 1,
    data: todayISO(),
  });
}

/* ---- QUESTÕES (seção 11) ------------------------------------------------- */
export function registrarTentativa({ questaoId, acertou, tempo_s, respostaDada }) {
  const q = store.get('questao', questaoId);
  const tent = store.insert('tentativa_questao', {
    questao_id: questaoId,
    topico_id: q ? q.topico_id : null,
    acertou: !!acertou,
    tempo_resposta_s: tempo_s || 0,
    resposta_dada: respostaDada,
    data: todayISO(),
  });
  // realimenta o SRS do tópico
  if (q) registrarRecuperacaoTopico(q.topico_id, acertou ? 'facil' : 'esqueceu', tempo_s);

  // Detecção de PONTO FRACO: erro recorrente no MESMO assunto (>=2 erros nas
  // últimas 3 tentativas do tópico) dispara revisão + sinalização (seção 11).
  if (q && !acertou) {
    const tents = store.where('tentativa_questao', t => t.topico_id === q.topico_id)
      .sort((a, b) => a.data.localeCompare(b.data)).slice(-3);
    const erros = tents.filter(t => !t.acertou).length;
    if (erros >= 2) {
      agendarRevisao(questaoId, 'questao', todayISO()); // reforço imediato
      marcarPontoFraco(q.topico_id);
    }
  }
  return tent;
}

function marcarPontoFraco(topicoId) {
  const p = garanteProgresso(topicoId);
  store.update('topico_progresso', p.id, { ponto_fraco: true });
}

/* ---- FLASHCARDS (seção 10) ---------------------------------------------- */
export function revisarFlashcard(flashcardId, resultado, tempo_s) {
  const fc = store.get('flashcard', flashcardId);
  if (!fc) return null;
  const novo = revisar(fc.srs, resultado, tempo_s || 0, todayISO(), addDaysISO);
  store.update('flashcard', flashcardId, { srs: novo });
  // flashcard também realimenta o tópico
  registrarRecuperacaoTopico(fc.topico_id, resultado, tempo_s);
  return novo;
}

/* =============================================================================
 * FILA DE REVISÃO UNIFICADA (seção 9)
 * Flashcards vencidos + questões erradas reagendadas + resumos incompletos
 * entram na MESMA fila. Não são sistemas paralelos.
 * ============================================================================= */
export function agendarRevisao(itemId, tipoItem, dataPrevistaISO) {
  // evita duplicar revisão aberta para o mesmo item
  const existe = store.where('revisao_agendada',
    r => r.item_id === itemId && !r.concluida);
  if (existe.length) return existe[0];
  return store.insert('revisao_agendada', {
    item_id: itemId,
    tipo_item: tipoItem, // 'flashcard' | 'questao' | 'resumo'
    data_prevista: dataPrevistaISO,
    resultado: null,
    concluida: false,
  });
}

/** Fila de hoje (itens vencidos até hoje). */
export function filaRevisaoHoje() {
  const hoje = todayISO();
  const itens = [];

  // 1) Flashcards cujo proxima_revisao <= hoje
  store.all('flashcard').forEach(fc => {
    if (fc.srs.proxima_revisao && fc.srs.proxima_revisao <= hoje) {
      itens.push({
        tipo: 'flashcard', ref: fc, topico_id: fc.topico_id,
        titulo: fc.frente, venceu_em: fc.srs.proxima_revisao,
        tempo_est_min: 2,
      });
    }
  });

  // 2) RevisaoAgendada explícitas (questões erradas, resumos incompletos)
  store.where('revisao_agendada', r => !r.concluida && r.data_prevista <= hoje)
    .forEach(r => {
      if (r.tipo_item === 'flashcard') return; // flashcards já cobertos acima
      const ref = store.get(r.tipo_item === 'questao' ? 'questao' : 'resumo', r.item_id);
      if (!ref) return;
      itens.push({
        tipo: r.tipo_item, ref, revisao_id: r.id,
        topico_id: ref.topico_id,
        titulo: r.tipo_item === 'questao' ? ref.enunciado : `Resumo: ${nomeTopico(ref.topico_id)}`,
        venceu_em: r.data_prevista,
        tempo_est_min: r.tipo_item === 'questao' ? 3 : 8,
      });
    });

  return itens.sort((a, b) => a.venceu_em.localeCompare(b.venceu_em));
}

function nomeTopico(id) {
  const t = store.get('topico', id);
  return t ? t.nome : '(tópico)';
}

/* =============================================================================
 * PLANO DO DIA — "O que estudar hoje" (seções 6, 12) com INTERLEAVING
 * ============================================================================= */
export function planoDoDia() {
  const cfg = getConfig();
  const hoje = todayISO();
  const amortecido = cfg.prioridade_amortecimento;

  // --- (A) Revisões vencidas ---
  const revisoes = filaRevisaoHoje();
  const tempoRevisoes = revisoes.reduce((s, r) => s + r.tempo_est_min, 0);

  // Regra de conflito (seção 6): revisões atrasadas têm prioridade, com TETO.
  // Se ultrapassam 60% do tempo diário -> alerta de catch-up.
  const tetoRevisao = cfg.tempo_diario_min * 0.6;
  const alertaCatchUp = tempoRevisoes > tetoRevisao;

  // --- (B) Conteúdo novo/priorizado por tópico ---
  const discById = {};
  store.all('disciplina').forEach(d => { discById[d.id] = d; });

  const topicos = store.all('topico').filter(t => !t.fora_do_edital);
  const ranked = topicos.map(t => {
    const disciplina = discById[t.disciplina_id];
    const progresso = progressoDe(t.id);
    const { prioridade, fatores } = prioridadeTopico({
      disciplina, progresso, hojeISO: hoje, amortecido, helpers: HELPERS,
    });
    return {
      topico: t, disciplina, progresso, prioridade, fatores,
      motivo: motivoRecomendacao({ topico: t, disciplina, progresso, fatores }),
    };
  }).filter(r => r.disciplina) // ignora tópicos órfãos
    .sort((a, b) => b.prioridade - a.prioridade);

  // Orçamento restante para conteúdo novo (revisão tem prioridade, com teto).
  const tempoRevisaoUsado = Math.min(tempoRevisoes, tetoRevisao);
  let restante = Math.max(25, cfg.tempo_diario_min - tempoRevisaoUsado);

  // INTERLEAVING obrigatório: garante 2–3 disciplinas distintas no dia.
  const estudo = [];
  const discUsadas = new Set();
  const TEMPO_ITEM = cfg.pomodoro_foco_min; // 1 pomodoro por item de estudo

  // 1ª passada: pega o topo respeitando o orçamento
  for (const r of ranked) {
    if (restante < TEMPO_ITEM) break;
    estudo.push(itemEstudo(r, TEMPO_ITEM));
    discUsadas.add(r.disciplina.id);
    restante -= TEMPO_ITEM;
  }

  // 2ª passada: se caiu tudo em <2 disciplinas, força diversidade trocando o
  // último item por um de disciplina ainda não representada.
  if (discUsadas.size < 2) {
    const outra = ranked.find(r => !discUsadas.has(r.disciplina.id));
    if (outra && estudo.length) {
      estudo[estudo.length - 1] = itemEstudo(outra, TEMPO_ITEM);
      discUsadas.add(outra.disciplina.id);
    }
  }

  return {
    data: hoje,
    revisoes,
    estudo,
    tempoRevisoes,
    tempoDiario: cfg.tempo_diario_min,
    alertaCatchUp,
    disciplinasNoDia: discUsadas.size,
    rankingCompleto: ranked, // usado pelo dashboard
  };
}

function itemEstudo(r, tempo) {
  return {
    tipo: 'estudo',
    topico: r.topico,
    disciplina: r.disciplina,
    tempo_est_min: tempo,
    prioridade: r.prioridade,
    fatores: r.fatores,
    motivo: r.motivo,
  };
}

/* =============================================================================
 * FAIXAS QUALITATIVAS por disciplina (seção 14) — NUNCA um % solto.
 * Combina taxa de acerto (desempenho recente) + retenção (caixa SRS média).
 * ============================================================================= */
export const FAIXAS = ['nao_iniciado', 'em_desenvolvimento', 'consolidado', 'dominado'];
export const FAIXA_LABEL = {
  nao_iniciado: 'não iniciado',
  em_desenvolvimento: 'em desenvolvimento',
  consolidado: 'consolidado',
  dominado: 'dominado',
};

export function faixaDisciplina(disciplinaId) {
  const topicos = store.where('topico', t => t.disciplina_id === disciplinaId && !t.fora_do_edital);
  if (!topicos.length) return 'nao_iniciado';
  const progressos = topicos.map(t => progressoDe(t.id)).filter(Boolean);
  if (!progressos.length) return 'nao_iniciado';

  const cobertura = progressos.length / topicos.length; // % de tópicos tocados
  const confMedia = progressos.reduce((s, p) => s + (p.confianca_atual || 0), 0) / progressos.length;

  // retenção: caixa média (1..5) -> 0..1
  const boxMedia = progressos.reduce((s, p) => s + (p.srs?.box || 1), 0) / progressos.length;
  const retencao = (boxMedia - 1) / 4;

  const score = 0.5 * confMedia + 0.3 * retencao + 0.2 * cobertura;

  if (cobertura < 0.15) return 'nao_iniciado';
  if (score >= 0.75 && cobertura >= 0.8) return 'dominado';
  if (score >= 0.5) return 'consolidado';
  return 'em_desenvolvimento';
}

/* ---- estatísticas de dashboard ------------------------------------------ */
export function estatisticas() {
  const sessoes = store.all('sessao_estudo');
  const minutos = sessoes.reduce((s, x) => s + (x.tempo_real_min || 0), 0);

  // dias consecutivos com pelo menos uma sessão
  const dias = new Set(sessoes.map(s => s.data));
  let streak = 0;
  let cursor = todayISO();
  while (dias.has(cursor)) { streak++; cursor = addDaysISO(cursor, -1); }

  const tentativas = store.all('tentativa_questao');
  const acertos = tentativas.filter(t => t.acertou).length;

  return {
    horasEstudadas: +(minutos / 60).toFixed(1),
    minutosEstudados: minutos,
    diasConsecutivos: streak,
    totalSessoes: sessoes.length,
    totalQuestoes: tentativas.length,
    taxaAcerto: tentativas.length ? Math.round(100 * acertos / tentativas.length) : null,
    revisoesPendentes: filaRevisaoHoje().length,
  };
}
