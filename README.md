# Prep ANPD — Especialista em Regulação da Proteção de Dados

Plataforma de preparação (mobile-first) para o **primeiro concurso da ANPD**.
Não é um repositório passivo de conteúdo: é um **motor de decisão de estudo** —
todo dia o app diz *o que estudar, por quê e por quanto tempo*.

> **Estado:** modo **pré-edital** (edital previsto para dez/2026, provas a partir
> de jan/2027). Disciplinas entram como `provisorio` até o edital confirmar.

## Como rodar

App 100% client-side, **sem build**. Basta servir a pasta por HTTP:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000/
```

No GitHub Pages a plataforma é a home (`https://cauatarle5.github.io/convites/`).
O convite original foi preservado em `/convite/`
(`https://cauatarle5.github.io/convites/convite/`).

## Decisões de arquitetura (v1)

- **Usuário único, schema multiusuário.** Existe um único usuário fixo (Ricardo),
  mas **toda entidade carrega `user_id`**. Adicionar um 2º usuário no futuro é uma
  *migração de backend*, não uma reescrita. Ver `src/store.js`.
- **Persistência local** (`localStorage`), uma "tabela" por entidade da seção 21
  do briefing. `exportState()` já produz o JSON base para migrar a um backend.
- **`RevisaoAgendada` — Opção 1 (App-level integrity).** Associação polimórfica
  (`item_id` + `tipo_item`) sem FK real; a aplicação limpa revisões órfãs ao
  deletar flashcard/questão/resumo (`store.remove`). A Opção 2 (tabelas separadas
  + view) fica para uma fase futura.

## O que está implementado (Fase 1 + motor da Fase 2)

| Área | Arquivo |
|------|---------|
| Camada de dados + seed + `user_id` | `src/store.js` |
| SRS — **Leitner adaptado de 5 caixas** (fórmula documentada) | `src/srs.js` |
| **Motor de priorização** (fórmula da seção 6, normalizada) | `src/priority.js` |
| Plano do dia, interleaving, fila de revisão unificada, faixas | `src/scheduler.js` |
| Telas (Hoje, Revisar, Conteúdo, Cards, Questões, Painel) + Pomodoro | `src/views.js` |
| Helpers de UI / badges / modal | `src/ui.js` |
| Roteador / bootstrap | `src/app.js` |

Cobre: tela **Hoje** (home), **Pomodoro** com recuperação ativa ao final,
**resumo com correção por checklist** (Fase 1 = manual), **flashcards** (CRUD +
SRS), **banco de questões** (múltipla escolha *e* certo/errado), **fila de
revisão unificada**, **dashboard com faixas qualitativas** (nunca um % solto),
**metas**, e **memória de progresso automática** (o app nunca pergunta "onde
você parou").

Da **Fase 3**, já entram (sem depender de chave de API):
- **Geração automática de flashcards a partir de erros recorrentes** em questões
  (`src/scheduler.js`), além dos gerados de pontos-chave faltantes em resumos.
- **Caderno de revisão em PDF** (`src/caderno.js`) — conteúdo estudado, resumos
  aprovados, pontos de reforço, erros recorrentes e flashcards, via impressão do
  navegador ("salvar como PDF"), **regerável a qualquer momento**.

### Conteúdo-semente (Painel → Conteúdo-semente)

Botão idempotente que importa tópicos + pontos-chave da LGPD, apoios didáticos e
um banco de **questões autorais marcadas `fonte_analoga`** (`src/seed_content.js`).
Respeita o modelo de segurança: **não semeia `texto_legal`** — este é colado
manualmente da fonte oficial por Ricardo/Cauã.

### As duas fórmulas (documentadas no código)

- **SRS (`src/srs.js`)** — Leitner 5 caixas com intervalos `1·3·7·16·35` dias.
  Promoção/rebaixamento depende de (1) acerto/erro, (2) tempo de resposta e
  (3) taxa de acerto das últimas 3 exposições.
- **Priorização (`src/priority.js`)** — produto de 5 fatores normalizados 0..1:
  `peso × atraso × desempenho × esquecimento × (1 − domínio)`. Tópico nunca
  estudado recebe os fatores forçados da seção 6 e compete como revisão vencida.
  O **amortecimento** `base + (1−base)·fator` (base 0,2) é *ligado por padrão*
  (configurável no Painel) para evitar que um único fator zere o tópico.

## Regras de conteúdo (seções 4 e 19)

Todo conteúdo é rotulado e **visualmente distinto** por tipo:
`texto_legal` · `interpretacao_oficial` · `explicacao_didatica` ·
`hipotese_de_cobranca`. Texto legal nunca é gerado por IA; conteúdo de IA entra
como **rascunho** (`revisado_por_humano: false`) até revisão. Não existe
histórico de prova da ANPD — questões de bancas afins entram como
**fonte análoga**.

Da **Fase 4**, já entram (sem depender de chave de API):
- **Vínculo ANPD↔LGPD** (`src/views.js`, campo `vinculos` no tópico) — um tópico
  (ex.: material/resolução da ANPD) pode apontar para os artigos da LGPD
  correspondentes; os links aparecem clicáveis na tela do tópico.
- **Migração assistida pré→pós-edital** (`src/migracao.js`) — você cola a lista
  do edital, o sistema **sugere** matches por similaridade textual e **você
  confirma/corrige cada um** (a sugestão não decide). Disciplinas casadas viram
  `confirmado` (renomeadas para o nome oficial, peso ajustável); as sem
  correspondência viram `fora_do_edital` (**nada é apagado**, seguem no
  histórico); itens do edital não previstos viram disciplinas novas; a data da
  prova e o tempo restante são recalculados.

## Camada de IA (Fases 3 e 4) — código pronto, precisa de backend + chave

A integração de IA está **implementada de ponta a ponta**; só falta você publicar
o backend e colar a URL:

- **Correção de resumo por IA semântica item a item** (Fase 3) — botão *Corrigir
  com IA* na recuperação ativa. O backend compara o resumo contra cada ponto-chave
  (coberto / parcialmente / não coberto + justificativa). *De propósito não fazemos
  keyword-matching disfarçado de IA* — é comparação semântica de verdade.
- **Extração do edital por IA** (Fase 4) — botão *Extrair com IA* na migração, que
  limpa o texto colado do edital numa lista pronta para a reconciliação.

Como ligar:
1. Publique o worker em `server/` (ver `server/README.md`) — Cloudflare Workers,
   plano gratuito serve. A **chave da API fica só no backend**, nunca no cliente.
2. No app, **Painel → IA**, cole o endpoint (e o token, se configurou um) e clique
   *Testar conexão*.

Sem o backend, o app permanece 100% funcional no modo manual (checklist de resumo
e lista de edital colada). Cliente: `src/ia.js`. Backend: `server/worker.js`
(modelo `claude-opus-5`, structured outputs).

Com isso, as quatro fases do roadmap estão cobertas.
