/* POST /api/corrigir-resumo — correção semântica de resumo item a item (seção 8). */
import { json, corsHeaders, autorizado, corrigir, erroHttp } from '../_lib/ia.js';

export const onRequestOptions = ({ env }) => new Response(null, { status: 204, headers: corsHeaders(env) });

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500, env);
  if (!autorizado(request, env)) return json({ error: 'não autorizado' }, 401, env);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400, env); }
  try {
    const r = await corrigir(env, body);
    return json(r.body, r.status, env);
  } catch (e) {
    const r = erroHttp(e);
    return json(r.body, r.status, env);
  }
}
