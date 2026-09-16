/* POST /api/extrair-edital — Vercel Serverless Function (extração de edital, seção 18). */
import { corsHeaders, extrair, erroHttp } from '../functions/_lib/ia.js';

function cors(res) { for (const [k, v] of Object.entries(corsHeaders(process.env))) res.setHeader(k, v); }
function lerBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  return b || {};
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const env = process.env;
  if (!env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
  if (env.APP_TOKEN && (req.headers.authorization || '') !== `Bearer ${env.APP_TOKEN}`) {
    return res.status(401).json({ error: 'não autorizado' });
  }
  try {
    const r = await extrair(env, lerBody(req));
    return res.status(r.status).json(r.body);
  } catch (e) {
    const r = erroHttp(e);
    return res.status(r.status).json(r.body);
  }
}
