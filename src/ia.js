/* =============================================================================
 * ia.js — Adaptador client-side para o backend de IA (server/worker.js).
 * -----------------------------------------------------------------------------
 * O app NUNCA fala com a API da Anthropic diretamente (a chave é secreta e
 * ficaria exposta num site estático). Ele chama o worker configurado em
 * config.ia_endpoint. Se não houver endpoint, iaDisponivel() é false e a UI
 * mantém o fluxo manual (checklist de resumo, lista de edital colada).
 * ============================================================================= */
import { getConfig } from './store.js';

export function iaDisponivel() {
  return !!(getConfig().ia_endpoint || '').trim();
}

async function chamar(rota, corpo) {
  const cfg = getConfig();
  const base = (cfg.ia_endpoint || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('IA não configurada');
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.ia_token) headers.Authorization = `Bearer ${cfg.ia_token}`;
  const resp = await fetch(`${base}${rota}`, {
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

/** Teste rápido de conectividade (GET /health). */
export async function testarIA() {
  const base = (getConfig().ia_endpoint || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('IA não configurada');
  const resp = await fetch(`${base}/health`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
