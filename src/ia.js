/* =============================================================================
 * ia.js — Adaptador client-side para o backend de IA.
 * -----------------------------------------------------------------------------
 * O app NUNCA fala com a API da Anthropic diretamente (a chave é secreta e
 * ficaria exposta num site estático). Ele chama um backend, que pode ser:
 *   (a) MESMO ORIGEM: quando hospedado no Cloudflare Pages, as Functions ficam
 *       em /api/* — detectadas automaticamente no boot (zero configuração); ou
 *   (b) ENDPOINT CONFIGURADO: um worker/serviço externo colado em Painel → IA.
 * Sem nenhum dos dois, iaDisponivel() é false e a UI mantém o fluxo manual.
 * ============================================================================= */
import { getConfig } from './store.js';

const SAME_ORIGIN_BASE = `${location.origin}/api`;
let sameOriginIA = false; // definido por detectarIA() no boot

/** Base efetiva: endpoint configurado tem prioridade; senão, /api same-origin. */
function baseAtual() {
  const cfg = (getConfig().ia_endpoint || '').trim().replace(/\/+$/, '');
  if (cfg) return { base: cfg, token: getConfig().ia_token || '' };
  if (sameOriginIA) return { base: SAME_ORIGIN_BASE, token: getConfig().ia_token || '' };
  return null;
}

export function iaDisponivel() { return !!baseAtual(); }

/** Sonda /api/health no mesmo domínio (Pages Functions). Chamado no boot. */
export async function detectarIA() {
  try {
    const r = await fetch(`${SAME_ORIGIN_BASE}/health`, { method: 'GET' });
    sameOriginIA = r.ok;
  } catch { sameOriginIA = false; }
  return sameOriginIA;
}

async function chamar(rota, corpo) {
  const alvo = baseAtual();
  if (!alvo) throw new Error('IA não configurada');
  const headers = { 'Content-Type': 'application/json' };
  if (alvo.token) headers.Authorization = `Bearer ${alvo.token}`;
  const resp = await fetch(`${alvo.base}${rota}`, {
    method: 'POST', headers, body: JSON.stringify(corpo),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

/** Correção semântica de resumo (seção 8). Retorna {itens:[{ponto,status,justificativa}]}. */
export function corrigirResumo({ topico, pontos_chave, resumo }) {
  return chamar('/corrigir-resumo', { topico, pontos_chave, resumo });
}

/** Extração de disciplinas/tópicos do edital (seção 18). Retorna {itens:string[]}. */
export function extrairEdital(texto) {
  return chamar('/extrair-edital', { texto });
}

/** Teste de conectividade (GET /health) contra a base efetiva. */
export async function testarIA() {
  const alvo = baseAtual();
  if (!alvo) throw new Error('IA não configurada');
  const resp = await fetch(`${alvo.base}/health`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
