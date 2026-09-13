# Backend de IA — Prep ANPD (Cloudflare Worker)

Guarda a **chave da API da Anthropic server-side** (nunca no cliente/GitHub Pages)
e expõe dois endpoints que ligam as Fases 3 e 4 da plataforma:

| Rota | Fase | O que faz |
|------|------|-----------|
| `POST /corrigir-resumo` | 3 | Correção **semântica item a item** do resumo contra os pontos-chave (seção 8) |
| `POST /extrair-edital`  | 4 | Extrai a lista de disciplinas/tópicos do texto do edital (seção 18) |
| `GET /health`           | —  | Verificação simples |

Modelo: `claude-opus-5`, com *structured outputs* (JSON validado por schema).

## Por que um backend?

A chave da API é secreta e não pode ir para um site estático. Este worker é a
peça mínima que faltava: o app client-side chama estes endpoints e a chave fica
só aqui. Se você não publicar o worker, o app continua 100% funcional no modo
manual (checklist de resumo e lista de edital colada) — a IA é um acréscimo.

## Deploy (Cloudflare Workers — plano gratuito serve)

```bash
cd server
npm install
npx wrangler login                     # autentica na sua conta Cloudflare
npx wrangler secret put ANTHROPIC_API_KEY   # cole a chave sk-ant-...
npx wrangler secret put APP_TOKEN           # opcional: um token qualquer p/ proteger o endpoint
npx wrangler deploy                    # publica; imprime a URL https://prep-anpd-ia.<sub>.workers.dev
```

Depois, em `wrangler.toml`, troque `ALLOW_ORIGIN` para o domínio do app
(`https://cauatarle5.github.io`) e rode `npx wrangler deploy` de novo para
restringir o CORS.

> Outros hosts (Netlify/Vercel/Deno Deploy) também servem: o `worker.js` usa só
> `fetch`, `@anthropic-ai/sdk` e `zod`; adapte o handler ao formato do host.

## Ligar no app

No app (aba **Painel → IA**), cole:
- **Endpoint**: a URL do worker (ex.: `https://prep-anpd-ia.<sub>.workers.dev`)
- **Token** (se você configurou `APP_TOKEN`)

A partir daí aparecem os botões **Corrigir com IA** (na recuperação ativa) e
**Extrair do edital com IA** (na migração).

## Contratos

`POST /corrigir-resumo`
```json
// entrada
{ "topico": "Art. 5º — Definições", "pontos_chave": ["definição de dado pessoal", "..."], "resumo": "texto do aluno" }
// saída
{ "tipo": "correcao", "itens": [ { "ponto": "...", "status": "coberto|parcialmente|nao_coberto", "justificativa": "..." } ] }
```

`POST /extrair-edital`
```json
// entrada
{ "texto": "colar aqui o trecho de conhecimentos do edital" }
// saída
{ "tipo": "edital", "itens": ["Proteção de Dados Pessoais ...", "Direito Administrativo", "..."] }
```

Autenticação: se `APP_TOKEN` estiver setado, envie `Authorization: Bearer <APP_TOKEN>`.
