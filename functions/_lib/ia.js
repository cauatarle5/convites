/* =============================================================================
 * functions/_lib/ia.js — Lógica compartilhada das Cloudflare Pages Functions
 * de IA (Fases 3 e 4). Diretórios com "_" NÃO viram rota no Pages, então este
 * arquivo é apenas biblioteca, consumida por functions/api/*.js.
 *
 * Guarda a chave server-side (env.ANTHROPIC_API_KEY). Modelo claude-opus-5 com
 * structured outputs (beta structured-outputs-2025-11-13). Escrito contra o
 * @anthropic-ai/sdk publicado (0.70.x) — o Pages instala a dependência do
 * package.json da raiz no build.
 * ============================================================================= */
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5';
const STRUCTURED_BETA = 'structured-outputs-2025-11-13';

const SCHEMA_CORRECAO = {
  type: 'object', additionalProperties: false,
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          ponto: { type: 'string' },
          status: { type: 'string', enum: ['coberto', 'parcialmente', 'nao_coberto'] },
          justificativa: { type: 'string' },
        },
        required: ['ponto', 'status', 'justificativa'],
      },
    },
  },
  required: ['itens'],
};

const SCHEMA_EDITAL = {
  type: 'object', additionalProperties: false,
  properties: { itens: { type: 'array', items: { type: 'string' } } },
  required: ['itens'],
};

export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
export function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}
export function autorizado(request, env) {
  if (!env || !env.APP_TOKEN) return true; // sem token = aberto (não recomendado)
  return (request.headers.get('Authorization') || '') === `Bearer ${env.APP_TOKEN}`;
}
function parseSaida(resp) {
  const bloco = (resp.content || []).find(b => b.type === 'text');
  if (!bloco) return null;
  try { return JSON.parse(bloco.text); } catch { return null; }
}
async function chamarModelo(env, schema, prompt) {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
  });
  return client.beta.messages.create({
    betas: [STRUCTURED_BETA],
    model: MODEL,
    max_tokens: 4000,
    output_format: { type: 'json_schema', schema },
    messages: [{ role: 'user', content: prompt }],
  });
}

function promptCorrecao({ topico, pontos_chave, resumo }) {
  return [
    'Você é um corretor de resumos de estudo para concurso de proteção de dados (LGPD/ANPD).',
    'Compare o RESUMO DO ALUNO contra cada PONTO-CHAVE, um a um. A comparação é SEMÂNTICA,',
    'nunca por correspondência de palavras. Matéria jurídica é sensível a nuance: por exemplo,',
    'trocar "titular" por "controlador" é ERRO GRAVE e deve ser marcado como não coberto, mesmo',
    'que as palavras se pareçam.',
    'Para cada ponto retorne: status (coberto | parcialmente | nao_coberto) e uma justificativa',
    'de UMA frase apontando o trecho do resumo que sustenta o veredito (ou dizendo que faltou).',
    '',
    `TÓPICO: ${topico}`,
    '',
    'PONTOS-CHAVE:',
    ...pontos_chave.map((p, i) => `${i + 1}. ${p}`),
    '',
    'RESUMO DO ALUNO:',
    resumo || '(vazio)',
  ].join('\n');
}
function promptEdital(texto) {
  return [
    'Extraia do texto de edital abaixo a lista de DISCIPLINAS/TÓPICOS de conhecimentos',
    '(específicos e básicos) cobrados na prova. Retorne uma lista limpa, um item por elemento,',
    'sem numeração, sem texto introdutório e sem repetição. Preserve o nome oficial de cada item.',
    '',
    'TEXTO DO EDITAL:',
    texto,
  ].join('\n');
}

/* Handlers reutilizáveis (recebem env + body já parseado) -> {status, body} */
export async function corrigir(env, body) {
  const { topico, pontos_chave, resumo } = body || {};
  if (!Array.isArray(pontos_chave) || !pontos_chave.length) {
    return { status: 400, body: { error: 'pontos_chave é obrigatório (lista não vazia)' } };
  }
  const resp = await chamarModelo(env, SCHEMA_CORRECAO, promptCorrecao({ topico, pontos_chave, resumo }));
  if (resp.stop_reason === 'refusal') return { status: 422, body: { error: 'refusal', detail: resp.stop_details } };
  const out = parseSaida(resp);
  if (!out) return { status: 502, body: { error: 'sem saída estruturada' } };
  return { status: 200, body: { tipo: 'correcao', ...out } };
}
export async function extrair(env, body) {
  const { texto } = body || {};
  if (!texto || !texto.trim()) return { status: 400, body: { error: 'texto é obrigatório' } };
  const resp = await chamarModelo(env, SCHEMA_EDITAL, promptEdital(texto));
  if (resp.stop_reason === 'refusal') return { status: 422, body: { error: 'refusal', detail: resp.stop_details } };
  const out = parseSaida(resp);
  if (!out) return { status: 502, body: { error: 'sem saída estruturada' } };
  return { status: 200, body: { tipo: 'edital', ...out } };
}

/* Mapeia erros do SDK para status HTTP amigáveis. */
export function erroHttp(e) {
  if (e instanceof Anthropic.AuthenticationError) return { status: 502, body: { error: 'chave inválida' } };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'limite de taxa, tente depois' } };
  if (e instanceof Anthropic.APIError) return { status: 502, body: { error: `erro da API (${e.status})` } };
  return { status: 500, body: { error: 'falha interna', detail: String((e && e.message) || e) } };
}
