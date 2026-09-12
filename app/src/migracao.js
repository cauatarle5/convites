/* =============================================================================
 * migracao.js — Migração ASSISTIDA pré-edital → pós-edital (seção 18).
 * -----------------------------------------------------------------------------
 * NÃO é matching automático puro. O fluxo é:
 *   1. O usuário cola a lista de disciplinas/tópicos do edital (uma por linha).
 *      (A extração automática por IA a partir do PDF do edital é uma melhoria
 *       futura — exige chave server-side. Aqui a lista é colada/curada.)
 *   2. O sistema SUGERE, para cada disciplina da matriz provisória, um match
 *      com um item do edital (por similaridade textual) — é sugestão, não
 *      decisão. Também detecta itens do edital sem correspondência (novos).
 *   3. O usuário confirma/corrige cada match e ajusta pesos.
 *   4. aplicarMigracao(): confirma disciplinas casadas (status_edital=confirmado,
 *      renomeia para o nome oficial), marca as sem correspondência como
 *      fora_do_edital (NADA é apagado; continuam visíveis no histórico), cria
 *      disciplinas novas para itens do edital não previstos, define a data da
 *      prova e recalcula o tempo restante. 100% do histórico é preservado.
 * ============================================================================= */
import { store, todayISO } from './store.js';

/* ---- similaridade textual (para SUGERIR, o usuário confirma) ------------- */
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os',
  'lei', 'federal', 'n', 'no', 'para', 'com', 'em', 'oficiais']);

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w && !STOP.has(w));
}
/** Índice de Jaccard entre os conjuntos de tokens (0..1). */
export function similaridade(a, b) {
  const A = new Set(normalizar(a)), B = new Set(normalizar(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

/**
 * Sugere matches entre a matriz provisória (disciplinas atuais) e a lista
 * oficial do edital.
 * @param {string[]} oficiais  linhas do edital (uma disciplina/tópico por linha)
 * @returns {{sugestoes:Array, oficiais:string[]}}
 *   sugestoes: [{disciplinaId, nomeProvisorio, pesoAtual, sugestaoIdx|null, score}]
 */
export function sugerirMatches(oficiais) {
  const limpos = oficiais.map(s => s.trim()).filter(Boolean);
  const disciplinas = store.all('disciplina').filter(d => !d.fora_do_edital);
  const sugestoes = disciplinas.map(d => {
    let melhor = -1, melhorScore = 0;
    limpos.forEach((of, i) => {
      const s = similaridade(d.nome, of);
      if (s > melhorScore) { melhorScore = s; melhor = i; }
    });
    return {
      disciplinaId: d.id,
      nomeProvisorio: d.nome,
      pesoAtual: d.peso_estrategico,
      sugestaoIdx: melhorScore >= 0.2 ? melhor : null, // limiar de confiança
      score: +melhorScore.toFixed(2),
    };
  });
  return { sugestoes, oficiais: limpos };
}

/**
 * Aplica a migração confirmada pelo usuário.
 * @param {object} args
 *   - decisoes: [{disciplinaId, oficialNome|null, peso}]  (null => fora do edital)
 *   - novosOficiais: string[]  (itens do edital que viram disciplinas novas)
 *   - provaData: 'YYYY-MM-DD' | null
 * @returns {object} resumo da migração
 */
export function aplicarMigracao({ decisoes, novosOficiais, provaData }) {
  let confirmadas = 0, foras = 0, novas = 0;

  decisoes.forEach(dec => {
    if (dec.oficialNome) {
      // casada: confirma, renomeia para o nome oficial, ajusta peso
      store.update('disciplina', dec.disciplinaId, {
        nome: dec.oficialNome,
        status_edital: 'confirmado',
        peso_estrategico: dec.peso,
        fora_do_edital: false,
      });
      // confirma também os tópicos existentes
      store.where('topico', t => t.disciplina_id === dec.disciplinaId)
        .forEach(t => store.update('topico', t.id, { status_edital: 'confirmado' }));
      confirmadas++;
    } else {
      // sem correspondência: marca fora do edital (NADA é apagado)
      store.update('disciplina', dec.disciplinaId, { fora_do_edital: true });
      store.where('topico', t => t.disciplina_id === dec.disciplinaId)
        .forEach(t => store.update('topico', t.id, { fora_do_edital: true }));
      foras++;
    }
  });

  // itens do edital não previstos -> disciplinas novas, já confirmadas
  (novosOficiais || []).forEach(nome => {
    if (!nome.trim()) return;
    store.insert('disciplina', {
      nome: nome.trim(),
      peso_estrategico: 'medio',
      status_edital: 'confirmado',
      fora_do_edital: false,
    });
    novas++;
  });

  // data da prova + tempo restante
  let diasRestantes = null;
  if (provaData) {
    const u = store.all('user')[0];
    store.update('user', u.id, { prova_data: provaData });
    diasRestantes = Math.max(0, Math.ceil((new Date(provaData) - new Date(todayISO())) / 86400000));
  }

  return { confirmadas, foras, novas, diasRestantes };
}
