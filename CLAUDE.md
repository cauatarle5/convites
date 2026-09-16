# CLAUDE.md — orientação para sessões futuras

Repositório `cauatarle5/convites`. Contém **dois** sites estáticos servidos por
GitHub Pages a partir da raiz (branch `main`, `.nojekyll` presente):

1. **Plataforma Prep ANPD** (a home, `/`) — app de preparação para o 1º concurso
   da ANPD. É o foco de desenvolvimento.
2. **Convite** (`/convite/`) — convite original, preservado. Não mexer sem pedido
   explícito.

## Layout

```
index.html          # app (home)
app.css             # estilos do app (inclui @media print do caderno)
src/                # ES modules do app (sem build)
  store.js          # dados em localStorage; user_id em toda entidade; seed()
  srs.js            # Leitner 5 caixas (fórmula documentada no arquivo)
  priority.js       # motor de priorização (fórmula da seção 6, documentada)
  scheduler.js      # plano do dia, fila de revisão, faixas, progresso
  views.js          # todas as telas + modais (arquivo grande)
  ui.js             # helpers de DOM, badges, modal
  caderno.js        # caderno de revisão em PDF (via window.print)
  migracao.js       # reconciliação assistida pré/pós-edital
  ia.js             # adaptador cliente p/ o backend de IA (opcional)
  seed_content.js   # conteúdo-semente idempotente (NÃO semeia texto_legal)
  app.js            # bootstrap + hash router; registra o SW; detecta IA em /api
  ia.js             # adaptador de IA: /api same-origin (Pages) OU endpoint colado
manifest.webmanifest # PWA (instalável)
sw.js               # service worker: precache do app shell (bump CACHE ao mudar assets); ignora /api
icons/              # ícones PNG do PWA (bullseye da marca)
api/                # Vercel Serverless Functions de IA (host escolhido): health/corrigir-resumo/extrair-edital.js
functions/          # Cloudflare Pages Functions de IA (alternativa)
  api/health.js, api/corrigir-resumo.js, api/extrair-edital.js
  _lib/ia.js        # lógica compartilhada (SDK, structured outputs) — usada por AMBOS os hosts
vercel.json         # Vercel: sem build, saída = raiz; /api vira função automaticamente
package.json        # raiz: declara @anthropic-ai/sdk (Vercel/Pages instalam no deploy). type:module
server/             # backend de IA ALTERNATIVO (Worker isolado) — ver server/README.md
convite/index.html  # convite original (não relacionado ao app)
tests/core.test.mjs # regressão das fórmulas de SRS e priorização (Node, sem navegador)
DEPLOY.md           # deploy no Cloudflare Pages (site fora do github + IA em /api)
README.md           # doc do produto e das fases
```

## Como rodar e testar

- Rodar: `python3 -m http.server 8000` e abrir `http://localhost:8000/`.
- Sem build/bundler: os módulos são ESM nativos. Servir por HTTP (não `file://`).
- Teste de fumaça no navegador: Chromium headless já instalado. Use o
  `headless_shell` (o `chrome` full recusa `--headless=old` do Playwright 1.48):
  `executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'`.
  Instale `playwright` como devDep temporária e rode o teste. **Nunca commite
  `node_modules`/`package-lock.json`** (gitignored). Atenção: existe um
  `package.json` PERMANENTE na raiz (declara `@anthropic-ai/sdk` para o build do
  Pages Functions e `type:module`) — não apague; ao instalar playwright, remova
  só a entrada `devDependencies` antes de commitar, mantendo o resto.
- O único erro de console esperado localmente é o Google Fonts sendo bloqueado
  pelo proxy do sandbox; em produção carrega normal. Ignore `net::ERR_*`.
- Ícones do PWA: sem Pillow no ambiente; foram gerados rasterizando um SVG com o
  próprio Chromium (Playwright `page.screenshot`). Ao trocar o desenho, regenere
  os PNGs em `icons/` e faça bump do `CACHE` em `sw.js`.
- Testar service worker: use um contexto Playwright com `serviceWorkers: 'allow'`
  e `waitUntil: 'load'`.
- Teste de regressão do núcleo (SRS + priorização), sem navegador:
  `node tests/core.test.mjs` (o `package.json` da raiz já tem `type:module`).
  Rode-o após mexer em `srs.js` ou `priority.js`.

## Regras de conteúdo (NÃO QUEBRAR — seções 4/19 do briefing)

- Todo conteúdo tem um `tipo`: `texto_legal` | `interpretacao_oficial` |
  `explicacao_didatica` | `hipotese_de_cobranca`, com badge visual distinto.
- **Nunca gerar `texto_legal`.** É sempre colado manualmente da fonte oficial.
  `seed_content.js` propositalmente NÃO semeia texto legal.
- Conteúdo gerado por IA entra como rascunho (`revisado_por_humano: false`).
- Questões que não são da ANPD levam `fonte_analoga: true`. Nunca fingir que há
  histórico de prova da ANPD (é o 1º concurso do órgão).
- A correção de resumo por IA é **semântica item a item** — nunca keyword match.

## Decisões de arquitetura já tomadas

- Usuário único fixo, mas schema multiusuário: `user_id` em toda entidade.
- Persistência em localStorage (namespace `anpd_prep_v1`). `exportState()` é a
  base de uma futura migração a backend.
- `RevisaoAgendada`: integridade app-level (Opção 1). `store.remove()` limpa
  revisões órfãs de flashcard/questão/resumo.
- Priorização: produto de 5 fatores 0..1 com desconto `(1 - domínio)` e
  amortecimento opcional `base + (1-base)·fator` (base 0.2, ligado por padrão).
  Ver comentários em `priority.js`.
- IA: cliente nunca fala direto com a API da Anthropic. Host escolhido =
  **Vercel** (funções em `api/*`; mesmo domínio; o cliente detecta `/api` no boot
  — zero config). A lógica é compartilhada em `functions/_lib/ia.js` e reusada
  também pelas Cloudflare Pages Functions (`functions/api/*`) e pelo Worker
  isolado (`server/`). Modelo `claude-opus-5`, structured outputs. Sem backend,
  o app fica 100% no modo manual. Deploy: `DEPLOY.md`.
- Acessibilidade: modais (`ui.js`) têm foco inicial, `Escape` para fechar, trap
  de `Tab` e devolvem o foco ao gatilho; toasts são `role=status`; botões
  só-ícone levam `aria-label`; tab ativa usa `aria-current="page"`; foco de
  teclado usa `:focus-visible`. Mantenha esses padrões ao criar telas novas.

## Backend de IA (`server/`)

- Cloudflare Worker (`worker.js`). Deploy e segredos em `server/README.md`.
- Escrito contra o `@anthropic-ai/sdk` publicado (0.70.x): usa
  `client.beta.messages.create` + `output_format: {type:'json_schema'}` com o
  beta `structured-outputs-2025-11-13`. Se o SDK novo (com `output_config.format`
  + helper zod) sair, é uma migração pequena.
- A chave (`ANTHROPIC_API_KEY`) e o `APP_TOKEN` são secrets; nunca commitar.

## Git

- Desenvolver e commitar em `main`. Mensagens de commit em pt-BR, descritivas.
- Não abrir PR sem pedido explícito. Não commitar `node_modules`.
