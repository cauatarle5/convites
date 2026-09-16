/* GET /api/health — verificação simples (não exige chave). */
import { json, corsHeaders, MODEL } from '../_lib/ia.js';

export const onRequestGet = ({ env }) => json({ ok: true, model: MODEL }, 200, env);
export const onRequestOptions = ({ env }) => new Response(null, { status: 204, headers: corsHeaders(env) });
