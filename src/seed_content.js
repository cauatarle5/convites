/* =============================================================================
 * seed_content.js — Conteúdo-semente curado da LGPD (importação idempotente).
 * -----------------------------------------------------------------------------
 * Chamado por um botão no Painel (não pelo seed() inicial), então funciona
 * tanto em instalação nova quanto para quem já tem dados. É IDEMPOTENTE: cada
 * registro carrega marca `seed: 'lgpd_v1'` e não é reinserido.
 *
 * REGRA DE SEGURANÇA DE CONTEÚDO (seções 4/19): NÃO semeamos `texto_legal`.
 * Texto legal é sempre colado manualmente da fonte oficial (planalto.gov.br)
 * por Ricardo/Cauã. Aqui semeamos apenas:
 *   - tópicos + pontos-chave (rótulos pedagógicos, não a lei literal);
 *   - conteúdo `explicacao_didatica` e `hipotese_de_cobranca` (marcado rascunho);
 *   - questões AUTORAIS marcadas `fonte_analoga: true` (não são da ANPD).
 * ============================================================================= */
import { store, todayISO } from './store.js';
import { novoEstadoSRS } from './srs.js';

const MARCA = 'lgpd_v1';

/* ---- tópicos + pontos-chave --------------------------------------------- */
const TOPICOS = [
  { nome: 'Art. 18 — Direitos do titular', ordem: 10, pontos: [
    'direito de confirmação e acesso', 'direito de correção',
    'direito de anonimização/bloqueio/eliminação', 'direito de portabilidade',
    'direito de revogar consentimento', 'direito de revisão de decisões automatizadas (art. 20)',
  ] },
  { nome: 'Art. 37 a 41 — Agentes e encarregado', ordem: 11, pontos: [
    'papel do controlador', 'papel do operador', 'figura do encarregado (DPO)',
    'atribuições do encarregado', 'registro das operações de tratamento',
  ] },
  { nome: 'Art. 46 a 49 — Segurança e boas práticas', ordem: 12, pontos: [
    'medidas de segurança técnicas e administrativas', 'comunicação de incidente à ANPD e ao titular',
    'programa de governança em privacidade', 'relatório de impacto (RIPD)',
  ] },
  { nome: 'Art. 52 a 54 — Sanções administrativas', ordem: 13, pontos: [
    'advertência', 'multa simples (até 2%, teto R$ 50 milhões por infração)',
    'multa diária', 'publicização da infração', 'bloqueio e eliminação dos dados',
    'dosimetria e critérios de aplicação',
  ] },
  { nome: 'ANPD — natureza e competências', ordem: 14, pontos: [
    'natureza da ANPD', 'competência para fiscalizar e aplicar sanções',
    'competência normativa (editar regulamentos)', 'relação com outros órgãos',
  ] },
];

/* ---- conteúdo didático / hipótese (marcado rascunho, tipado) ------------ */
const CONTEUDOS = [
  { topico: 'Art. 18 — Direitos do titular', tipo: 'explicacao_didatica',
    titulo: 'Como memorizar os direitos do titular',
    corpo: 'Pense no titular no controle do ciclo de vida do dado: ele pode SABER (confirmação/acesso), '
      + 'ARRUMAR (correção), SUMIR (anonimização, bloqueio, eliminação), LEVAR (portabilidade) e '
      + 'DIZER NÃO (revogar consentimento; revisar decisão automatizada do art. 20). '
      + 'Mnemônico: "Saber, Arrumar, Sumir, Levar, Dizer não".',
    fonte: '' },
  { topico: 'Art. 52 a 54 — Sanções administrativas', tipo: 'hipotese_de_cobranca',
    titulo: 'Aposta de cobrança: teto da multa',
    corpo: 'É altíssima a chance de a prova cobrar o teto da multa simples: até 2% do faturamento do grupo '
      + 'no Brasil no último exercício, LIMITADO a R$ 50 milhões POR INFRAÇÃO. Bancas adoram trocar '
      + '"por infração" por "por ano" ou inflar o percentual. Fixe o número exato.',
    fonte: '' },
  { topico: 'ANPD — natureza e competências', tipo: 'hipotese_de_cobranca',
    titulo: 'Aposta de cobrança: natureza da ANPD',
    corpo: 'Cuidado com a evolução da natureza jurídica da ANPD (originalmente órgão da administração '
      + 'direta, com transformação posterior em autarquia de natureza especial). Confirme o status vigente '
      + 'na fonte oficial antes da prova — é pegadinha clássica.',
    fonte: '' },
];

/* ---- questões autorais (fonte análoga) ---------------------------------- */
const QUESTOES = [
  { topico: 'Art. 5º — Definições', tipo: 'multipla', dificuldade: 'facil',
    enunciado: 'Segundo a LGPD, dado pessoal é:',
    alternativas: [
      { texto: 'Informação relacionada a pessoa natural identificada ou identificável', correta: true },
      { texto: 'Qualquer informação sobre pessoa jurídica', correta: false },
      { texto: 'Somente dados de documentos oficiais', correta: false },
      { texto: 'Apenas dados divulgados publicamente', correta: false },
      { texto: 'Dados exclusivamente digitais', correta: false },
    ] },
  { topico: 'Art. 5º — Definições', tipo: 'certo_errado', dificuldade: 'media',
    enunciado: 'Dado sobre a saúde de uma pessoa é considerado dado pessoal sensível pela LGPD.',
    resposta_ce: true },
  { topico: 'Art. 5º — Definições', tipo: 'certo_errado', dificuldade: 'media',
    enunciado: 'Na LGPD, o operador é a pessoa a quem se referem os dados pessoais objeto de tratamento.',
    resposta_ce: false }, // isso é o titular; operador realiza o tratamento em nome do controlador
  { topico: 'Art. 6º — Princípios do tratamento', tipo: 'multipla', dificuldade: 'media',
    enunciado: 'O princípio que exige limitação do tratamento ao mínimo necessário para suas finalidades é o da:',
    alternativas: [
      { texto: 'Necessidade', correta: true },
      { texto: 'Publicidade', correta: false },
      { texto: 'Responsabilização', correta: false },
      { texto: 'Livre acesso', correta: false },
      { texto: 'Segurança', correta: false },
    ] },
  { topico: 'Art. 7º ao 11 — Bases legais', tipo: 'certo_errado', dificuldade: 'media',
    enunciado: 'O consentimento é a única base legal que autoriza o tratamento de dados pessoais na LGPD.',
    resposta_ce: false }, // há dez bases legais no art. 7º
  { topico: 'Art. 7º ao 11 — Bases legais', tipo: 'multipla', dificuldade: 'dificil',
    enunciado: 'Quando exigido, o consentimento do titular deve ser:',
    alternativas: [
      { texto: 'Livre, informado e inequívoco, para finalidades determinadas', correta: true },
      { texto: 'Genérico, cobrindo quaisquer finalidades futuras', correta: false },
      { texto: 'Sempre por escrito e com firma reconhecida', correta: false },
      { texto: 'Presumido a partir do silêncio do titular', correta: false },
      { texto: 'Irrevogável após concedido', correta: false },
    ] },
  { topico: 'Art. 18 — Direitos do titular', tipo: 'certo_errado', dificuldade: 'facil',
    enunciado: 'O titular pode solicitar a portabilidade de seus dados a outro fornecedor, observados os regulamentos da ANPD.',
    resposta_ce: true },
  { topico: 'Art. 18 — Direitos do titular', tipo: 'multipla', dificuldade: 'media',
    enunciado: 'NÃO configura um direito do titular expressamente previsto na LGPD:',
    alternativas: [
      { texto: 'Receber indenização automática por qualquer tratamento de dados', correta: true },
      { texto: 'Confirmação da existência de tratamento', correta: false },
      { texto: 'Correção de dados incompletos ou desatualizados', correta: false },
      { texto: 'Eliminação dos dados tratados com base no consentimento', correta: false },
      { texto: 'Portabilidade dos dados', correta: false },
    ] },
  { topico: 'Art. 46 a 49 — Segurança e boas práticas', tipo: 'certo_errado', dificuldade: 'media',
    enunciado: 'Em caso de incidente de segurança que possa acarretar risco relevante aos titulares, o controlador deve comunicar a ANPD e o titular.',
    resposta_ce: true },
  { topico: 'Art. 52 a 54 — Sanções administrativas', tipo: 'multipla', dificuldade: 'dificil',
    enunciado: 'Sobre a multa simples da LGPD, é correto afirmar que o teto por infração é de:',
    alternativas: [
      { texto: 'R$ 50 milhões por infração, até 2% do faturamento no Brasil', correta: true },
      { texto: 'R$ 50 milhões por ano, sem percentual', correta: false },
      { texto: '10% do faturamento global', correta: false },
      { texto: 'R$ 100 milhões por infração', correta: false },
      { texto: 'Não há teto definido em lei', correta: false },
    ] },
  { topico: 'Art. 37 a 41 — Agentes e encarregado', tipo: 'certo_errado', dificuldade: 'media',
    enunciado: 'O encarregado (DPO) atua como canal de comunicação entre o controlador, os titulares e a ANPD.',
    resposta_ce: true },
  { topico: 'ANPD — natureza e competências', tipo: 'certo_errado', dificuldade: 'media',
    enunciado: 'Compete à ANPD fiscalizar e aplicar sanções em caso de descumprimento da LGPD.',
    resposta_ce: true },
];

/* ---- importação idempotente --------------------------------------------- */
export function carregarSeedLGPD() {
  const disc = store.all('disciplina').find(d => /lgpd/i.test(d.nome));
  if (!disc) return { erro: 'Disciplina LGPD não encontrada' };

  let topicosAdd = 0, conteudosAdd = 0, questoesAdd = 0;

  // mapa nome->id dos tópicos existentes da LGPD
  const idPorNome = {};
  store.where('topico', t => t.disciplina_id === disc.id).forEach(t => { idPorNome[t.nome] = t.id; });

  // tópicos
  TOPICOS.forEach(t => {
    if (idPorNome[t.nome]) return; // já existe (pelo nome)
    const rec = store.insert('topico', {
      disciplina_id: disc.id, nome: t.nome, ordem: t.ordem,
      status_edital: disc.status_edital, pontos_chave: t.pontos,
      fora_do_edital: false, vinculos: [], seed: MARCA,
    });
    idPorNome[t.nome] = rec.id;
    topicosAdd++;
  });

  // conteúdos didáticos/hipótese (marcados rascunho)
  CONTEUDOS.forEach(c => {
    const topicoId = idPorNome[c.topico];
    if (!topicoId) return;
    const existe = store.where('conteudo_aula', x => x.seed === MARCA && x.topico_id === topicoId && x.titulo === c.titulo).length;
    if (existe) return;
    store.insert('conteudo_aula', {
      topico_id: topicoId, tipo: c.tipo, titulo: c.titulo, corpo: c.corpo,
      fonte: c.fonte || '', revisado_por_humano: false, criado_por: 'ia', seed: MARCA,
    });
    conteudosAdd++;
  });

  // questões (fonte análoga)
  QUESTOES.forEach(q => {
    const topicoId = idPorNome[q.topico];
    if (!topicoId) return;
    const existe = store.where('questao', x => x.seed === MARCA && x.enunciado === q.enunciado).length;
    if (existe) return;
    store.insert('questao', {
      topico_id: topicoId, tipo: q.tipo, enunciado: q.enunciado,
      dificuldade: q.dificuldade, fonte_analoga: true,
      fonte_desc: 'Questão autoral de treino (fonte análoga)',
      alternativas: q.alternativas || [],
      ...(q.tipo === 'certo_errado' ? { resposta_ce: q.resposta_ce } : {}),
      seed: MARCA,
    });
    questoesAdd++;
  });

  return { topicosAdd, conteudosAdd, questoesAdd };
}

/** Quantos itens-semente já existem (para rótulo do botão). */
export function seedJaCarregado() {
  return store.all('questao').some(q => q.seed === MARCA);
}
