# Deploy — site fora do GitHub + IA (Vercel)

O GitHub passa a ser **só o repositório** (código-fonte). O **site** é servido pela
**Vercel** (domínio `*.vercel.app` ou o seu domínio) e a **IA** roda no mesmo
site, em `/api/*` (Vercel Serverless Functions). Não há CORS e o app **detecta a
IA automaticamente** — depois do deploy, nada a configurar no app.

> Precisa de: conta **Vercel** (grátis) e sua **chave da Anthropic** (`sk-ant-…`).
> Estes passos abrem o painel da Vercel — só você pode fazê-los (eu não tenho
> acesso à sua conta). Ao final, me mande a URL `*.vercel.app` que eu valido o
> `/api/health`.

## Passo a passo (dashboard, ~5 min)

1. Acesse **vercel.com → Add New… → Project → Import Git Repository** e escolha
   **`cauatarle5/convites`** (autorize o GitHub se pedir).
2. **Configure Project:**
   - Framework Preset: **Other** (o `vercel.json` já fixa isso; sem build).
   - Root Directory: **`/`** (raiz). Build Command / Output: deixe como está.
   - A Vercel instala sozinha a dependência (`@anthropic-ai/sdk`) do `package.json`
     para as funções em `/api`.
3. **Environment Variables** (antes ou depois do 1º deploy):
   - `ANTHROPIC_API_KEY` = sua chave `sk-ant-…`
   - *(opcional)* `APP_TOKEN` = uma senha longa, se quiser exigir token
   - *(opcional)* `ALLOW_ORIGIN` = a URL do site, para restringir o CORS
   Se adicionar depois, faça **Redeploy** para valer.
4. **Deploy.** Sai uma URL tipo `https://convites-xxx.vercel.app`.
5. Abra a URL → **Painel → IA → Testar conexão**: deve dizer *"Conectado ✔
   (modelo claude-opus-5)"*. Os botões **✨ Corrigir com IA** e **✨ Extrair com
   IA** já aparecem sozinhos.

### Domínio próprio (opcional)
No projeto da Vercel → **Settings → Domains → Add** e siga o DNS. Assim o site
fica no seu domínio, totalmente fora do github.io.

### Desligar o github.io (opcional)
GitHub → **Settings → Pages → Source → None**. O repositório continua igual; só o
site do GitHub sai do ar. (O convite continua em `/convite/` no novo host.)

## O que já está no repositório (para a Vercel)

- Site estático na raiz (`index.html`, `app.css`, `src/`, `icons/`, `convite/`).
- **Serverless Functions**: `api/health.js`, `api/corrigir-resumo.js`,
  `api/extrair-edital.js` (lógica compartilhada em `functions/_lib/ia.js`).
- `vercel.json` (sem build, saída = raiz) e `package.json` (dependência instalada
  no deploy). A chave nunca vai para o cliente.
- O cliente (`src/ia.js`) detecta `/api` no mesmo domínio e liga a IA sem
  configuração; ainda dá para colar um endpoint externo em Painel → IA.

## Alternativas (mesmos endpoints /api)
- **Cloudflare Pages**: use `functions/api/*` (Pages Functions) — conecte o repo
  no Pages, build vazio, output `/`, e defina `ANTHROPIC_API_KEY` como secret.
- **Worker isolado** (`server/`): backend num subdomínio próprio, colado
  manualmente em Painel → IA (ver `server/README.md`).
