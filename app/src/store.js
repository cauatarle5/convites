/* =============================================================================
 * store.js — Camada de dados (persistência local)
 * -----------------------------------------------------------------------------
 * DECISÃO DE ARQUITETURA (v1):
 *   - Aplicação de usuário ÚNICO, mas modelada como multiusuário no dado.
 *   - TODA entidade relevante carrega `user_id`. Hoje existe um único usuário
 *     fixo (Ricardo), então adicionar um segundo usuário no futuro é uma
 *     MIGRAÇÃO de backend, não uma reescrita do schema.
 *   - Persistência em localStorage (chave por "tabela"). Cada "tabela" é um
 *     array de registros. O acesso passa sempre por helpers que filtram por
 *     user_id, exatamente como um backend faria com `WHERE user_id = ?`.
 *
 * DECISÃO sobre RevisaoAgendada (seção 21 do briefing):
 *   Escolhida a OPÇÃO 1 (App-level integrity). `RevisaoAgendada` usa associação
 *   polimórfica (item_id + tipo_item). Não há FK real. A aplicação garante a
 *   integridade: ao deletar um Flashcard/Questao/Resumo, limpamos antes as
 *   RevisaoAgendada associadas (ver store.remove()). Aceitável para MVP de
 *   usuário único; a Opção 2 (tabelas separadas + view) fica para fase futura.
 * ============================================================================= */

const NS = 'anpd_prep_v1';           // namespace de storage
const SCHEMA_VERSION = 1;

/* Tabelas do schema (seção 21) + tabelas de apoio */
const TABLES = [
  'user', 'disciplina', 'topico', 'conteudo_aula', 'sessao_estudo',
  'resumo', 'flashcard', 'questao', 'tentativa_questao', 'revisao_agendada',
  'meta', 'topico_progresso', 'config',
];

/* ---- utilidades ---------------------------------------------------------- */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function nowISO() {
  return new Date().toISOString();
}
export function daysBetween(aISO, bISO) {
  // dias inteiros de a -> b (b - a). Positivo se b é depois de a.
  const a = new Date(aISO + (aISO.length === 10 ? 'T00:00:00' : ''));
  const b = new Date(bISO + (bISO.length === 10 ? 'T00:00:00' : ''));
  return Math.floor((b - a) / 86400000);
}
export function addDaysISO(iso, days) {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ---- storage bruto ------------------------------------------------------- */
function key(table) { return `${NS}:${table}`; }

function readTable(table) {
  try {
    const raw = localStorage.getItem(key(table));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Falha ao ler tabela', table, e);
    return [];
  }
}
function writeTable(table, rows) {
  localStorage.setItem(key(table), JSON.stringify(rows));
}

/* ---- usuário corrente (v1 = fixo) --------------------------------------- */
let CURRENT_USER_ID = null;
export function currentUserId() { return CURRENT_USER_ID; }

/* ---- CRUD genérico (sempre escopado por user_id quando aplicável) -------- */
export const store = {
  all(table) {
    const rows = readTable(table);
    if (table === 'user' || table === 'config') return rows;
    return rows.filter(r => r.user_id === CURRENT_USER_ID);
  },
  get(table, id) {
    return readTable(table).find(r => r.id === id) || null;
  },
  where(table, predicate) {
    return this.all(table).filter(predicate);
  },
  insert(table, record) {
    const rows = readTable(table);
    const row = { id: record.id || uid(table), ...record };
    if (table !== 'user' && table !== 'config' && !row.user_id) {
      row.user_id = CURRENT_USER_ID;
    }
    rows.push(row);
    writeTable(table, rows);
    return row;
  },
  update(table, id, patch) {
    const rows = readTable(table);
    const i = rows.findIndex(r => r.id === id);
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...patch };
    writeTable(table, rows);
    return rows[i];
  },
  remove(table, id) {
    // Integridade app-level (ver cabeçalho): limpar revisões órfãs.
    if (['flashcard', 'questao', 'resumo'].includes(table)) {
      const revs = readTable('revisao_agendada').filter(r => r.item_id === id);
      revs.forEach(r => this.remove('revisao_agendada', r.id));
    }
    const rows = readTable(table).filter(r => r.id !== id);
    writeTable(table, rows);
  },
};

/* ---- config (chave/valor por usuário) ------------------------------------ */
const DEFAULT_CONFIG = {
  pomodoro_foco_min: 25,
  pomodoro_pausa_min: 5,
  tempo_diario_min: 120,      // orçamento diário de estudo
  prioridade_amortecimento: true, // usa base + (1-base)*fator (ver priority.js)
};
export function getConfig() {
  const rows = readTable('config');
  const row = rows.find(r => r.user_id === CURRENT_USER_ID);
  return { ...DEFAULT_CONFIG, ...(row ? row.data : {}) };
}
export function setConfig(patch) {
  const rows = readTable('config');
  const i = rows.findIndex(r => r.user_id === CURRENT_USER_ID);
  const data = { ...(i >= 0 ? rows[i].data : DEFAULT_CONFIG), ...patch };
  if (i >= 0) rows[i].data = data;
  else rows.push({ id: uid('config'), user_id: CURRENT_USER_ID, data });
  writeTable('config', rows);
  return data;
}

/* =============================================================================
 * SEED — dados iniciais (seção 5). Roda uma única vez.
 * ============================================================================= */
function seed() {
  // Usuário único fixo (v1)
  const user = store.insert('user', {
    id: 'user_ricardo',
    nome: 'Ricardo',
    email: 'contato@routeinvestimentos.com.br',
    prova_data: null, // preenchido quando o edital sair (previsão jan/2027)
  });
  CURRENT_USER_ID = user.id;

  // Matriz de disciplinas PROVISÓRIA (pré-edital) — seção 5
  const disciplinas = [
    { nome: 'LGPD (Lei 13.709/2018)', peso: 'alto' },
    { nome: 'Materiais oficiais ANPD', peso: 'alto' },
    { nome: 'Direito Administrativo Federal', peso: 'medio' },
    { nome: 'Segurança da Informação', peso: 'medio' },
    { nome: 'Língua Portuguesa', peso: 'medio' },
    { nome: 'Raciocínio Lógico-Matemático', peso: 'medio' },
  ];
  const discIds = {};
  disciplinas.forEach(d => {
    const rec = store.insert('disciplina', {
      nome: d.nome,
      peso_estrategico: d.peso,     // 'alto' | 'medio'
      status_edital: 'provisorio',  // 'provisorio' | 'confirmado'
      fora_do_edital: false,
    });
    discIds[d.nome] = rec.id;
  });

  // Alguns tópicos-semente para a LGPD, com pontos-chave (seção 8) para
  // demonstrar a correção de resumo. Conteúdo real é cadastrado na Curadoria.
  const lgpd = discIds['LGPD (Lei 13.709/2018)'];
  const topicosLGPD = [
    { nome: 'Art. 1º ao 4º — Fundamentos e aplicação', ordem: 1,
      pontos: ['objetivo da lei', 'fundamentos da proteção de dados', 'hipóteses de não aplicação (art. 4º)'] },
    { nome: 'Art. 5º — Definições', ordem: 2,
      pontos: ['definição de dado pessoal', 'definição de dado sensível', 'definição de titular', 'definição de controlador', 'definição de operador'] },
    { nome: 'Art. 6º — Princípios do tratamento', ordem: 3,
      pontos: ['princípio da finalidade', 'princípio da necessidade', 'princípio da transparência', 'princípio da segurança'] },
    { nome: 'Art. 7º ao 11 — Bases legais', ordem: 4,
      pontos: ['consentimento', 'bases legais para dados pessoais', 'bases legais para dados sensíveis'] },
  ];
  topicosLGPD.forEach(t => {
    store.insert('topico', {
      disciplina_id: lgpd,
      nome: t.nome,
      ordem: t.ordem,
      status_edital: 'provisorio',
      pontos_chave: t.pontos,
      fora_do_edital: false,
    });
  });

  // Metas iniciais (seção 15)
  store.insert('meta', { tipo: 'horas', valor_alvo: 2, periodo: 'diario' });
  store.insert('meta', { tipo: 'questoes', valor_alvo: 20, periodo: 'semanal' });

  setConfig({}); // materializa config default
  localStorage.setItem(`${NS}:__schema__`, String(SCHEMA_VERSION));
}

/* =============================================================================
 * init — chamado no boot da aplicação
 * ============================================================================= */
export function initStore() {
  const seeded = localStorage.getItem(`${NS}:__schema__`);
  if (!seeded) {
    seed();
  } else {
    const u = readTable('user')[0];
    CURRENT_USER_ID = u ? u.id : 'user_ricardo';
  }
  return store.get('user', CURRENT_USER_ID);
}

/* Reset total (útil em dev / botão "recomeçar") */
export function resetAll() {
  TABLES.forEach(t => localStorage.removeItem(key(t)));
  localStorage.removeItem(`${NS}:__schema__`);
}

/* Export/import do estado inteiro (base para migração futura) */
export function exportState() {
  const out = { schema: SCHEMA_VERSION };
  TABLES.forEach(t => { out[t] = readTable(t); });
  return out;
}
