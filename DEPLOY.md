# Deploy — site fora do GitHub + IA, tudo em um (Cloudflare Pages)

O GitHub passa a ser **só o repositório** (código-fonte). O **site** é servido pelo
**Cloudflare Pages** (domínio `*.pages.dev` ou o seu domínio) e a **IA** roda no
mesmo site, em `/api/*` (Cloudflare **Pages Functions**). Não há CORS e o app
**detecta a IA automaticamente** — depois do deploy, nada a configurar no app.

> Precisa de: conta **Cloudflare** (grátis) e sua **chave da Anthropic** (`sk-ant-…`).
> Estes passos abrem o navegador/painel da Cloudflare — só você pode fazê-los
> (eu não tenho acesso à sua conta). Ao final, me mande a URL `*.pages.dev` que
> eu valido o `/api/health`.

## Passo a passo (dashboard, ~5 min)

1. Acesse **dash.cloudflare.com → Workers & Pages → Create → Pages →
   Connect to Git**. Autorize o GitHub e escolha o repositório **`cauatarle5/convites`**.
2. **Build settings:**
   - Framework preset: **None**
   - Build command: **(deixe vazio)**
   - Build output directory: **`/`** (a raiz)
   - O Cloudflare instala sozinho a dependência (`@anthropic-ai/sdk`) do
     `package.json` para as Functions.
3. **Save and Deploy.** Sai uma URL tipo `https://convites-xxx.pages.dev`.
4. **Definir o segredo da IA:** no projeto do Pages → **Settings → Variables and
   secrets → Add** →
   - `ANTHROPIC_API_KEY` = sua chave `sk-ant-…` (marque como **Secret/Encrypt**)
   - *(opcional)* `APP_TOKEN` = uma senha longa qualquer, se quiser exigir token
   - *(opcional)* `ALLOW_ORIGIN` = a URL do site, para restringir o CORS
   Depois clique em **Retry deployment** (ou faça um novo commit) para o segredo valer.
5. Abra a URL do Pages → **Painel → IA → Testar conexão**: deve dizer
   *"Conectado ✔ (modelo claude-opus-5)"*. Os botões **✨ Corrigir com IA** e
   **✨ Extrair com IA** já aparecem sozinhos.

### Domínio próprio (opcional)
No projeto do Pages → **Custom domains → Set up a domain** e siga as instruções de
DNS. Assim o site fica no seu domínio, totalmente fora do github.io.

### Desligar o github.io (opcional)
Se não quiser mais o site em `cauatarle5.github.io/convites/`: no GitHub →
**Settings → Pages → Source → None**. O repositório continua igual; só o site do
GitHub sai do ar. (O convite continua acessível em `/convite/` no novo host.)

## O que já está no repositório

- Site estático na raiz (`index.html`, `app.css`, `src/`, `icons/`, `convite/`).
- **Pages Functions** de IA: `functions/api/health.js`, `functions/api/corrigir-resumo.js`,
  `functions/api/extrair-edital.js` (lógica em `functions/_lib/ia.js`).
- `package.json` na raiz declara a dependência que o Pages instala no build.
- O cliente (`src/ia.js`) detecta `/api` no mesmo domínio e liga a IA sem
  configuração; ainda dá para colar um endpoint externo em Painel → IA.

## Alternativas
- **Worker isolado** (`server/`, ver `server/README.md`): backend de IA num
  subdomínio próprio, colado manualmente em Painel → IA. Funciona, mas exige
  configurar o endpoint no app e cuidar de CORS — o Pages Functions acima é mais
  simples.
- **Netlify / Vercel**: dá para adaptar (funções serverless equivalentes). Posso
  preparar os arquivos se você preferir um desses — é só pedir.
