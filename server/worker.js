/* =============================================================================
 * worker.js — Backend de IA da plataforma Prep ANPD (Cloudflare Worker).
 * -----------------------------------------------------------------------------
 * Guarda a chave da API server-side (NUNCA no cliente/GitHub Pages) e expõe
 * dois endpoints usados pelas Fases 3 e 4:
 *   POST /corrigir-resumo  -> correção semântica de resumo item a item (seção 8)
 *   POST /extrair-edital   -> extração das disciplinas/tópicos do edital (seção 18)
 *
 * Modelo: claude-opus-5 (padrão do SDK/skill oficial). Usa STRUCTURED OUTPUTS
 * (beta `structured-outputs-2025-11-13`, `output_format: {type:'json_schema'}`)
 * para receber JSON no formato exato — sem parsing frágil de string. Escrito
 * contra o @anthropic-ai/sdk publicado (0.70.x); ver server/README.md.
 *
 * Config: chave em `ANTHROPIC_API_KEY` (secret); `APP_TOKEN` opcional protege o
 * endpoint (pago); `ALLOW_ORIGIN` restringe o CORS ao domínio do app.
 * ============================================================================= */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';
const STRUCTURED_BETA = 'structured-outputs-2025-11-13';

/* ---- JSON Schemas de saída (structured outputs) ------------------------- */
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
          justificativa: { type: 'string' }, // 1 frase apontando o trecho do resumo
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

/* ---- helpers ------------------------------------------------------------- */
function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  });
}
function autorizado(request, env) {
  if (!env.APP_TOKEN) return true; // sem token configurado = aberto (não recomendado)
  return (request.headers.get('Authorization') || '') === `Bearer ${env.APP_TOKEN}`;
}
/** Extrai e faz parse do JSON estruturado do primeiro bloco de texto. */
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

/* ---- prompts ------------------------------------------------------------- */
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

/* ---- handlers ------------------------------------------------------------ */
async function corrigirResumo(request, env) {
  const { topico, pontos_chave, resumo } = await request.json();
  if (!Array.isArray(pontos_chave) || !pontos_chave.length) {
    return json({ error: 'pontos_chave é obrigatório (lista não vazia)' }, 400, env);
  }
  const resp = await chamarModelo(env, SCHEMA_CORRECAO, promptCorrecao({ topico, pontos_chave, resumo }));
  if (resp.stop_reason === 'refusal') return json({ error: 'refusal', detail: resp.stop_details }, 422, env);
  const out = parseSaida(resp);
  if (!out) return json({ error: 'sem saída estruturada' }, 502, env);
  return json({ tipo: 'correcao', ...out }, 200, env);
}

async function extrairEdital(request, env) {
  const { texto } = await request.json();
  if (!texto || !texto.trim()) return json({ error: 'texto é obrigatório' }, 400, env);
  const resp = await chamarModelo(env, SCHEMA_EDITAL, promptEdital(texto));
  if (resp.stop_reason === 'refusal') return json({ error: 'refusal', detail: resp.stop_details }, 422, env);
  const out = parseSaida(resp);
  if (!out) return json({ error: 'sem saída estruturada' }, 502, env);
  return json({ tipo: 'edital', ...out }, 200, env);
}

/* ---- roteador ------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    const url = new URL(request.url);

    if (url.pathname === '/health') return json({ ok: true, model: MODEL }, 200, env);

    if (request.method !== 'POST') return json({ error: 'use POST' }, 405, env);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500, env);
    if (!autorizado(request, env)) return json({ error: 'não autorizado' }, 401, env);

    try {
      if (url.pathname === '/corrigir-resumo') return await corrigirResumo(request, env);
      if (url.pathname === '/extrair-edital') return await extrairEdital(request, env);
      return json({ error: 'rota não encontrada' }, 404, env);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'chave inválida' }, 502, env);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'limite de taxa, tente depois' }, 429, env);
      if (e instanceof Anthropic.APIError) return json({ error: `erro da API (${e.status})` }, 502, env);
      return json({ error: 'falha interna', detail: String((e && e.message) || e) }, 500, env);
    }
  },
};
