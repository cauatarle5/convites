/* =============================================================================
 * seed_content.js — Conteúdo-semente curado (importação idempotente).
 * -----------------------------------------------------------------------------
 * Acionado por botão no Painel (não pelo seed() inicial), então funciona tanto
 * em instalação nova quanto para quem já tem dados. IDEMPOTENTE:
 *   - tópicos: pulados se já existir um com o mesmo nome na disciplina;
 *   - conteúdos: pulados por (tópico + título);
 *   - questões: puladas pelo enunciado.
 * A idempotência NÃO depende do marcador `seed`, então rodar de novo (mesmo
 * após mudar a versão do marcador) nunca duplica.
 *
 * REGRA DE SEGURANÇA DE CONTEÚDO (seções 4/19): NÃO semeamos `texto_legal`.
 * Texto legal é sempre colado manualmente da fonte oficial. Aqui semeamos:
 *   - tópicos + pontos-chave (rótulos pedagógicos, não a lei literal);
 *   - conteúdo `explicacao_didatica` e `hipotese_de_cobranca` (rascunho);
 *   - questões AUTORAIS marcadas `fonte_analoga: true` (não são da ANPD).
 * ============================================================================= */
import { store } from './store.js';

const MARCA = 'seed_v1';

/* Comentários do gabarito (mostrados após responder), por enunciado. Fecham o
 * ciclo de aprendizado e documentam o porquê de cada resposta correta. */
const COMENTARIOS = {
  'Segundo a LGPD, dado pessoal é:': 'Art. 5º, I: dado pessoal é informação relacionada a pessoa natural identificada ou identificável.',
  'Dado sobre a saúde de uma pessoa é considerado dado pessoal sensível pela LGPD.': 'Art. 5º, II: dado sobre saúde é dado pessoal sensível.',
  'Na LGPD, o operador é a pessoa a quem se referem os dados pessoais objeto de tratamento.': 'Errado: quem se refere aos dados é o titular (Art. 5º, V). O operador (Art. 5º, VII) trata dados em nome do controlador.',
  'O princípio que exige limitação do tratamento ao mínimo necessário para suas finalidades é o da:': 'Art. 6º, III: necessidade = limitação ao mínimo necessário para as finalidades.',
  'O consentimento é a única base legal que autoriza o tratamento de dados pessoais na LGPD.': 'Errado: o Art. 7º traz dez bases legais; o consentimento é apenas uma delas.',
  'Quando exigido, o consentimento do titular deve ser:': 'Art. 5º, XII e Art. 8º: livre, informado e inequívoco, para finalidades determinadas; vedadas autorizações genéricas.',
  'O titular pode solicitar a portabilidade de seus dados a outro fornecedor, observados os regulamentos da ANPD.': 'Art. 18, V: portabilidade a outro fornecedor, conforme regulamentação da ANPD.',
  'NÃO configura um direito do titular expressamente previsto na LGPD:': 'A indenização não é automática — depende de dano e responsabilização (Art. 42). Os demais são direitos do Art. 18.',
  'Em caso de incidente de segurança que possa acarretar risco relevante aos titulares, o controlador deve comunicar a ANPD e o titular.': 'Art. 48: incidente com risco relevante deve ser comunicado à ANPD e ao titular.',
  'Sobre a multa simples da LGPD, o teto por infração é de:': 'Art. 52, II: multa simples de até 2% do faturamento no Brasil, limitada a R$ 50 milhões por infração.',
  'O encarregado (DPO) atua como canal de comunicação entre o controlador, os titulares e a ANPD.': 'Art. 41, §2º, I: o encarregado é canal de comunicação entre controlador, titulares e ANPD.',
  'Compete à ANPD fiscalizar e aplicar sanções em caso de descumprimento da LGPD.': 'Compete à ANPD zelar, fiscalizar e aplicar sanções (Art. 52 e 55-K).',
  'Os princípios expressos da Administração Pública no art. 37 da CF são:': 'Art. 37, caput, CF: Legalidade, Impessoalidade, Moralidade, Publicidade e Eficiência (LIMPE).',
  'São requisitos (elementos) de validade do ato administrativo:': 'Competência, finalidade, forma, motivo e objeto (Lei 4.717/65, art. 2º).',
  'A presunção de legitimidade é um atributo do ato administrativo.': 'Sim: junto com imperatividade e autoexecutoriedade, é atributo do ato administrativo.',
  'O poder de polícia pode limitar o exercício de direitos individuais em benefício do interesse público.': 'Sim: o poder de polícia condiciona/limita direitos individuais em prol do interesse público.',
  'As autarquias integram a administração pública indireta e têm personalidade jurídica de direito público.': 'Sim (DL 200/67): autarquia é da administração indireta, com personalidade de direito público.',
  'A Lei nº 14.133/2021 é a atual Lei de Licitações e Contratos Administrativos.': 'Sim: a Lei 14.133/2021 substituiu a Lei 8.666/93.',
  'Os três pilares clássicos da segurança da informação são:': 'Tríade CID: Confidencialidade, Integridade e Disponibilidade.',
  'Na criptografia simétrica, a mesma chave é usada para cifrar e decifrar a informação.': 'Sim: criptografia simétrica usa a mesma chave para cifrar e decifrar.',
  'Uma função de hash criptográfica é projetada para ser facilmente reversível.': 'Errado: hash criptográfico é unidirecional (não reversível).',
  'O uso de um par de chaves pública e privada caracteriza a criptografia:': 'Par de chaves pública/privada caracteriza a criptografia assimétrica.',
  'Ataque que usa mensagens fraudulentas para induzir a vítima a revelar dados é o:': 'Phishing: mensagens fraudulentas que enganam a vítima para obter dados.',
  'O princípio do menor privilégio recomenda conceder ao usuário apenas os acessos necessários às suas tarefas.': 'Sim: menor privilégio = apenas os acessos necessários à tarefa.',
  'Em "Refiro-me à aluna que chegou", o uso da crase está correto.': '"Referir-se a" + "a aluna" (feminino) = à. Crase correta.',
  'Assinale a frase em que a crase é obrigatória:': '"Ir a" + "a escola" (fem., com artigo) = à. Nas demais não há artigo (a pé, a você, a ele) ou o termo não o exige.',
  'Em "Fazem cinco anos que ele partiu", o verbo fazer está corretamente flexionado.': 'Errado: "fazer" indicando tempo é impessoal — "Faz cinco anos".',
  'Em "Havia muitos alunos na sala", o verbo haver, no sentido de existir, é impessoal e fica no singular.': 'Sim: "haver" com sentido de existir é impessoal — "Havia".',
  'Segundo o Acordo Ortográfico vigente, a palavra "ideia" não recebe acento.': 'Sim: paroxítonas com ditongo aberto "ei"/"oi" perderam o acento — "ideia".',
  'A negação de "Todo A é B" é:': 'A negação de "Todo A é B" é "Algum A não é B" (existe A que não é B).',
  'Pela lei de De Morgan, a negação de (p ∧ q) é (¬p ∨ ¬q).': 'Sim: De Morgan — ¬(p ∧ q) ≡ ¬p ∨ ¬q.',
  'A negação de "Se chove, então molha" é "chove e não molha".': 'Sim: ¬(p → q) ≡ p ∧ ¬q — "chove e não molha".',
  'Quantos anagramas distintos tem a palavra AMOR (todas as letras diferentes)?': '4 letras distintas: 4! = 24 anagramas.',
  'A probabilidade de sair cara ao lançar uma moeda honesta é 1/2.': 'Moeda honesta: P(cara) = 1/2.',
  'Quanto é 20% de 250?': '20% de 250 = 0,2 × 250 = 50.',
};

/* =============================================================================
 * DATASET por disciplina (match = regex sobre o nome da disciplina).
 * ============================================================================= */
const DATASET = [
  /* -------------------------------------------------- LGPD ---------------- */
  {
    match: /lgpd/i,
    topicos: [
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
        'multa diária', 'publicização da infração', 'bloqueio e eliminação dos dados', 'dosimetria',
      ] },
      { nome: 'ANPD — natureza e competências', ordem: 14, pontos: [
        'natureza da ANPD', 'competência para fiscalizar e aplicar sanções',
        'competência normativa (editar regulamentos)', 'relação com outros órgãos',
      ] },
    ],
    conteudos: [
      { topico: 'Art. 18 — Direitos do titular', tipo: 'explicacao_didatica',
        titulo: 'Como memorizar os direitos do titular',
        corpo: 'Pense no titular no controle do ciclo de vida do dado: SABER (confirmação/acesso), '
          + 'ARRUMAR (correção), SUMIR (anonimização, bloqueio, eliminação), LEVAR (portabilidade) e '
          + 'DIZER NÃO (revogar consentimento; revisar decisão automatizada do art. 20).' },
      { topico: 'Art. 52 a 54 — Sanções administrativas', tipo: 'hipotese_de_cobranca',
        titulo: 'Aposta: teto da multa',
        corpo: 'Alta chance de cobrar o teto da multa simples: até 2% do faturamento no Brasil no último '
          + 'exercício, LIMITADO a R$ 50 milhões POR INFRAÇÃO. Bancas trocam "por infração" por "por ano".' },
      { topico: 'ANPD — natureza e competências', tipo: 'hipotese_de_cobranca',
        titulo: 'Aposta: natureza da ANPD',
        corpo: 'Confirme na fonte oficial o status vigente da natureza jurídica da ANPD antes da prova — '
          + 'houve evolução (de órgão para autarquia de natureza especial). Pegadinha clássica.' },
    ],
    questoes: [
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
        enunciado: 'Dado sobre a saúde de uma pessoa é considerado dado pessoal sensível pela LGPD.', resposta_ce: true },
      { topico: 'Art. 5º — Definições', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Na LGPD, o operador é a pessoa a quem se referem os dados pessoais objeto de tratamento.', resposta_ce: false },
      { topico: 'Art. 6º — Princípios do tratamento', tipo: 'multipla', dificuldade: 'media',
        enunciado: 'O princípio que exige limitação do tratamento ao mínimo necessário para suas finalidades é o da:',
        alternativas: [
          { texto: 'Necessidade', correta: true }, { texto: 'Publicidade', correta: false },
          { texto: 'Responsabilização', correta: false }, { texto: 'Livre acesso', correta: false },
          { texto: 'Segurança', correta: false },
        ] },
      { topico: 'Art. 7º ao 11 — Bases legais', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'O consentimento é a única base legal que autoriza o tratamento de dados pessoais na LGPD.', resposta_ce: false },
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
        enunciado: 'O titular pode solicitar a portabilidade de seus dados a outro fornecedor, observados os regulamentos da ANPD.', resposta_ce: true },
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
        enunciado: 'Em caso de incidente de segurança que possa acarretar risco relevante aos titulares, o controlador deve comunicar a ANPD e o titular.', resposta_ce: true },
      { topico: 'Art. 52 a 54 — Sanções administrativas', tipo: 'multipla', dificuldade: 'dificil',
        enunciado: 'Sobre a multa simples da LGPD, o teto por infração é de:',
        alternativas: [
          { texto: 'R$ 50 milhões por infração, até 2% do faturamento no Brasil', correta: true },
          { texto: 'R$ 50 milhões por ano, sem percentual', correta: false },
          { texto: '10% do faturamento global', correta: false },
          { texto: 'R$ 100 milhões por infração', correta: false },
          { texto: 'Não há teto definido em lei', correta: false },
        ] },
      { topico: 'Art. 37 a 41 — Agentes e encarregado', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'O encarregado (DPO) atua como canal de comunicação entre o controlador, os titulares e a ANPD.', resposta_ce: true },
      { topico: 'ANPD — natureza e competências', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Compete à ANPD fiscalizar e aplicar sanções em caso de descumprimento da LGPD.', resposta_ce: true },
    ],
  },

  /* --------------------------------------- Direito Administrativo --------- */
  {
    match: /administrativ/i,
    topicos: [
      { nome: 'Princípios da Administração (LIMPE)', ordem: 1, pontos: [
        'legalidade', 'impessoalidade', 'moralidade', 'publicidade', 'eficiência',
      ] },
      { nome: 'Atos administrativos', ordem: 2, pontos: [
        'requisitos: competência, finalidade, forma, motivo, objeto',
        'atributos: presunção de legitimidade, imperatividade, autoexecutoriedade',
        'anulação x revogação', 'discricionariedade x vinculação',
      ] },
      { nome: 'Poderes administrativos', ordem: 3, pontos: [
        'poder vinculado e discricionário', 'poder hierárquico', 'poder disciplinar',
        'poder regulamentar', 'poder de polícia',
      ] },
      { nome: 'Organização administrativa', ordem: 4, pontos: [
        'administração direta', 'administração indireta',
        'autarquias e fundações públicas', 'empresas públicas e sociedades de economia mista',
      ] },
      { nome: 'Licitações e contratos (Lei 14.133/2021)', ordem: 5, pontos: [
        'princípios da licitação', 'modalidades', 'contratação direta (dispensa e inexigibilidade)',
      ] },
    ],
    questoes: [
      { topico: 'Princípios da Administração (LIMPE)', tipo: 'multipla', dificuldade: 'facil',
        enunciado: 'Os princípios expressos da Administração Pública no art. 37 da CF são:',
        alternativas: [
          { texto: 'Legalidade, impessoalidade, moralidade, publicidade e eficiência', correta: true },
          { texto: 'Legalidade, celeridade, economicidade e moralidade', correta: false },
          { texto: 'Supremacia, autotutela e razoabilidade', correta: false },
          { texto: 'Publicidade, oralidade e gratuidade', correta: false },
          { texto: 'Legalidade, isonomia e proporcionalidade', correta: false },
        ] },
      { topico: 'Atos administrativos', tipo: 'multipla', dificuldade: 'media',
        enunciado: 'São requisitos (elementos) de validade do ato administrativo:',
        alternativas: [
          { texto: 'Competência, finalidade, forma, motivo e objeto', correta: true },
          { texto: 'Presunção, imperatividade e autoexecutoriedade', correta: false },
          { texto: 'Legalidade, moralidade e eficiência', correta: false },
          { texto: 'Sujeito, causa e efeito', correta: false },
          { texto: 'Mérito, conveniência e oportunidade', correta: false },
        ] },
      { topico: 'Atos administrativos', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'A presunção de legitimidade é um atributo do ato administrativo.', resposta_ce: true },
      { topico: 'Poderes administrativos', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'O poder de polícia pode limitar o exercício de direitos individuais em benefício do interesse público.', resposta_ce: true },
      { topico: 'Organização administrativa', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'As autarquias integram a administração pública indireta e têm personalidade jurídica de direito público.', resposta_ce: true },
      { topico: 'Licitações e contratos (Lei 14.133/2021)', tipo: 'certo_errado', dificuldade: 'facil',
        enunciado: 'A Lei nº 14.133/2021 é a atual Lei de Licitações e Contratos Administrativos.', resposta_ce: true },
    ],
  },

  /* --------------------------------------- Segurança da Informação ------- */
  {
    match: /seguran[çc]a da informa/i,
    topicos: [
      { nome: 'Pilares da segurança (CID)', ordem: 1, pontos: [
        'confidencialidade', 'integridade', 'disponibilidade', 'autenticidade', 'não repúdio',
      ] },
      { nome: 'Criptografia', ordem: 2, pontos: [
        'criptografia simétrica', 'criptografia assimétrica (par de chaves)',
        'função de hash', 'assinatura digital', 'certificado digital',
      ] },
      { nome: 'Controle de acesso', ordem: 3, pontos: [
        'identificação, autenticação e autorização', 'autenticação multifator (MFA)',
        'princípio do menor privilégio',
      ] },
      { nome: 'Ameaças e ataques', ordem: 4, pontos: [
        'malware e ransomware', 'phishing e engenharia social', 'negação de serviço (DoS/DDoS)',
      ] },
      { nome: 'Gestão (ISO 27001/27002)', ordem: 5, pontos: [
        'SGSI', 'gestão de riscos', 'gestão de incidentes',
      ] },
    ],
    questoes: [
      { topico: 'Pilares da segurança (CID)', tipo: 'multipla', dificuldade: 'facil',
        enunciado: 'Os três pilares clássicos da segurança da informação são:',
        alternativas: [
          { texto: 'Confidencialidade, integridade e disponibilidade', correta: true },
          { texto: 'Autenticação, autorização e auditoria', correta: false },
          { texto: 'Prevenção, detecção e resposta', correta: false },
          { texto: 'Sigilo, backup e firewall', correta: false },
          { texto: 'Criptografia, hash e assinatura', correta: false },
        ] },
      { topico: 'Criptografia', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Na criptografia simétrica, a mesma chave é usada para cifrar e decifrar a informação.', resposta_ce: true },
      { topico: 'Criptografia', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Uma função de hash criptográfica é projetada para ser facilmente reversível.', resposta_ce: false },
      { topico: 'Criptografia', tipo: 'multipla', dificuldade: 'media',
        enunciado: 'O uso de um par de chaves pública e privada caracteriza a criptografia:',
        alternativas: [
          { texto: 'Assimétrica', correta: true }, { texto: 'Simétrica', correta: false },
          { texto: 'Reversível', correta: false }, { texto: 'De fluxo', correta: false },
          { texto: 'Determinística', correta: false },
        ] },
      { topico: 'Ameaças e ataques', tipo: 'multipla', dificuldade: 'facil',
        enunciado: 'Ataque que usa mensagens fraudulentas para induzir a vítima a revelar dados é o:',
        alternativas: [
          { texto: 'Phishing', correta: true }, { texto: 'Backup', correta: false },
          { texto: 'Firewall', correta: false }, { texto: 'Hashing', correta: false },
          { texto: 'Sniffing físico', correta: false },
        ] },
      { topico: 'Controle de acesso', tipo: 'certo_errado', dificuldade: 'facil',
        enunciado: 'O princípio do menor privilégio recomenda conceder ao usuário apenas os acessos necessários às suas tarefas.', resposta_ce: true },
    ],
  },

  /* --------------------------------------- Língua Portuguesa ------------- */
  {
    match: /portuguesa/i,
    topicos: [
      { nome: 'Interpretação de texto', ordem: 1, pontos: [
        'ideia principal e secundárias', 'inferência', 'tese e argumentos',
      ] },
      { nome: 'Ortografia e acentuação', ordem: 2, pontos: [
        'novo acordo ortográfico', 'regras de acentuação', 'emprego de hífen',
      ] },
      { nome: 'Concordância', ordem: 3, pontos: [
        'concordância verbal', 'concordância nominal', 'casos especiais (haver/fazer impessoais)',
      ] },
      { nome: 'Regência e crase', ordem: 4, pontos: [
        'regência verbal', 'regência nominal', 'uso da crase',
      ] },
      { nome: 'Coesão e coerência', ordem: 5, pontos: [
        'conectivos', 'referenciação (pronomes)', 'progressão textual',
      ] },
    ],
    questoes: [
      { topico: 'Regência e crase', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Em "Refiro-me à aluna que chegou", o uso da crase está correto.', resposta_ce: true },
      { topico: 'Regência e crase', tipo: 'multipla', dificuldade: 'media',
        enunciado: 'Assinale a frase em que a crase é obrigatória:',
        alternativas: [
          { texto: 'Vou à escola todos os dias', correta: true },
          { texto: 'Vou a pé até o trabalho', correta: false },
          { texto: 'Refiro-me a você', correta: false },
          { texto: 'Cheguei a Brasília ontem', correta: false },
          { texto: 'Falei a ele sobre o caso', correta: false },
        ] },
      { topico: 'Concordância', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Em "Fazem cinco anos que ele partiu", o verbo fazer está corretamente flexionado.', resposta_ce: false },
      { topico: 'Concordância', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Em "Havia muitos alunos na sala", o verbo haver, no sentido de existir, é impessoal e fica no singular.', resposta_ce: true },
      { topico: 'Ortografia e acentuação', tipo: 'certo_errado', dificuldade: 'facil',
        enunciado: 'Segundo o Acordo Ortográfico vigente, a palavra "ideia" não recebe acento.', resposta_ce: true },
    ],
  },

  /* --------------------------------------- Raciocínio Lógico-Matemático -- */
  {
    match: /l[óo]gico|racioc[íi]nio/i,
    topicos: [
      { nome: 'Lógica proposicional', ordem: 1, pontos: [
        'conectivos lógicos', 'tabela-verdade', 'equivalências e De Morgan', 'negação de proposições',
      ] },
      { nome: 'Argumentação e validade', ordem: 2, pontos: [
        'argumento válido', 'premissas e conclusão', 'negação de condicional',
      ] },
      { nome: 'Conjuntos e diagramas', ordem: 3, pontos: [
        'operações com conjuntos', 'diagramas de Venn', 'quantificadores (todo/algum/nenhum)',
      ] },
      { nome: 'Combinatória e probabilidade', ordem: 4, pontos: [
        'princípio fundamental da contagem', 'permutação, arranjo, combinação', 'probabilidade básica',
      ] },
      { nome: 'Matemática básica', ordem: 5, pontos: [
        'porcentagem', 'razão e proporção', 'regra de três',
      ] },
    ],
    questoes: [
      { topico: 'Conjuntos e diagramas', tipo: 'multipla', dificuldade: 'media',
        enunciado: 'A negação de "Todo A é B" é:',
        alternativas: [
          { texto: 'Algum A não é B', correta: true },
          { texto: 'Nenhum A é B', correta: false },
          { texto: 'Todo A não é B', correta: false },
          { texto: 'Algum A é B', correta: false },
          { texto: 'Todo B é A', correta: false },
        ] },
      { topico: 'Lógica proposicional', tipo: 'certo_errado', dificuldade: 'media',
        enunciado: 'Pela lei de De Morgan, a negação de (p ∧ q) é (¬p ∨ ¬q).', resposta_ce: true },
      { topico: 'Argumentação e validade', tipo: 'certo_errado', dificuldade: 'dificil',
        enunciado: 'A negação de "Se chove, então molha" é "chove e não molha".', resposta_ce: true },
      { topico: 'Combinatória e probabilidade', tipo: 'multipla', dificuldade: 'media',
        enunciado: 'Quantos anagramas distintos tem a palavra AMOR (todas as letras diferentes)?',
        alternativas: [
          { texto: '24', correta: true }, { texto: '12', correta: false },
          { texto: '4', correta: false }, { texto: '16', correta: false }, { texto: '8', correta: false },
        ] },
      { topico: 'Combinatória e probabilidade', tipo: 'certo_errado', dificuldade: 'facil',
        enunciado: 'A probabilidade de sair cara ao lançar uma moeda honesta é 1/2.', resposta_ce: true },
      { topico: 'Matemática básica', tipo: 'multipla', dificuldade: 'facil',
        enunciado: 'Quanto é 20% de 250?',
        alternativas: [
          { texto: '50', correta: true }, { texto: '25', correta: false },
          { texto: '40', correta: false }, { texto: '60', correta: false }, { texto: '45', correta: false },
        ] },
    ],
  },
];

/* =============================================================================
 * importação idempotente
 * ============================================================================= */
export function carregarSeed() {
  let topicosAdd = 0, conteudosAdd = 0, questoesAdd = 0, comentariosAdd = 0, disciplinasAtingidas = 0;

  DATASET.forEach(bloco => {
    const disc = store.all('disciplina').find(d => bloco.match.test(d.nome) && !d.fora_do_edital);
    if (!disc) return;
    disciplinasAtingidas++;

    const idPorNome = {};
    store.where('topico', t => t.disciplina_id === disc.id).forEach(t => { idPorNome[t.nome] = t.id; });

    (bloco.topicos || []).forEach(t => {
      if (idPorNome[t.nome]) return;
      const rec = store.insert('topico', {
        disciplina_id: disc.id, nome: t.nome, ordem: t.ordem,
        status_edital: disc.status_edital, pontos_chave: t.pontos,
        fora_do_edital: false, vinculos: [], seed: MARCA,
      });
      idPorNome[t.nome] = rec.id;
      topicosAdd++;
    });

    (bloco.conteudos || []).forEach(c => {
      const topicoId = idPorNome[c.topico];
      if (!topicoId) return;
      const existe = store.where('conteudo_aula', x => x.topico_id === topicoId && x.titulo === c.titulo).length;
      if (existe) return;
      store.insert('conteudo_aula', {
        topico_id: topicoId, tipo: c.tipo, titulo: c.titulo, corpo: c.corpo,
        fonte: c.fonte || '', revisado_por_humano: false, criado_por: 'ia', seed: MARCA,
      });
      conteudosAdd++;
    });

    (bloco.questoes || []).forEach(q => {
      const topicoId = idPorNome[q.topico];
      if (!topicoId) return;
      const comentario = COMENTARIOS[q.enunciado] || '';
      const existente = store.all('questao').find(x => x.enunciado === q.enunciado);
      if (existente) {
        // backfill: adiciona o comentário a questões já semeadas que não o tinham
        if (comentario && !existente.comentario) { store.update('questao', existente.id, { comentario }); comentariosAdd++; }
        return;
      }
      store.insert('questao', {
        topico_id: topicoId, tipo: q.tipo, enunciado: q.enunciado,
        dificuldade: q.dificuldade, fonte_analoga: true,
        fonte_desc: 'Questão autoral de treino (fonte análoga)',
        alternativas: q.alternativas || [],
        comentario,
        ...(q.tipo === 'certo_errado' ? { resposta_ce: q.resposta_ce } : {}),
        seed: MARCA,
      });
      questoesAdd++;
    });
  });

  return { topicosAdd, conteudosAdd, questoesAdd, comentariosAdd, disciplinasAtingidas };
}

/** Compatibilidade: nome antigo usado por versões anteriores da UI. */
export const carregarSeedLGPD = carregarSeed;

/** Já existe conteúdo-semente carregado? */
export function seedJaCarregado() {
  return store.all('questao').some(q => !!q.seed);
}
