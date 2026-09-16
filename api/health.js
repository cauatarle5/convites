/* GET /api/health — Vercel Serverless Function (verificação simples). */
import { corsHeaders, MODEL } from '../functions/_lib/ia.js';

function cors(res) { for (const [k, v] of Object.entries(corsHeaders(process.env))) res.setHeader(k, v); }

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  return res.status(200).json({ ok: true, model: MODEL });
}
