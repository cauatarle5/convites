/* =============================================================================
 * views.js — Renderização de todas as telas + modais (Pomodoro, recuperação
 * ativa, formulários de curadoria, flashcards, questões).
 * ============================================================================= */
import {
  store, getConfig, setConfig, uid, todayISO, addDaysISO, resetAll, exportState,
} from './store.js';
import { novoEstadoSRS } from './srs.js';
import {
  planoDoDia, filaRevisaoHoje, registrarSessao, registrarTentativa,
  revisarFlashcard, agendarRevisao, registrarRecuperacaoTopico,
  faixaDisciplina, FAIXA_LABEL, estatisticas, progressoDe,
} from './scheduler.js';
import {
  esc, h, openModal, closeModal, toast, fmtMin,
  badgeEdital, badgePeso, badgeTipoConteudo, badgeRevisado, TIPO_CONTEUDO,
} from './ui.js';
import { gerarCaderno } from './caderno.js';

let refresh = () => {};
export function setRefresh(fn) { refresh = fn; }

const root = () => document.getElementById('view');

/* =============================================================================
 * ROTEAMENTO DE TELA
 * ============================================================================= */
export function render(route, params) {
  const el = root();
  switch (route) {
    case 'hoje':       el.innerHTML = viewHoje(); wireHoje(); break;
    case 'revisar':    el.innerHTML = viewRevisar(); wireRevisar(); break;
    case 'conteudo':   el.innerHTML = viewConteudo(); wireConteudo(); break;
    case 'topico':     el.innerHTML = viewTopico(params.id); wireTopico(params.id); break;
    case 'flashcards': el.innerHTML = viewFlashcards(); wireFlashcards(); break;
    case 'questoes':   el.innerHTML = viewQuestoes(); wireQuestoes(); break;
    case 'painel':     el.innerHTML = viewPainel(); wirePainel(); break;
    default:           el.innerHTML = viewHoje(); wireHoje();
  }
}

/* =============================================================================
 * TELA "HOJE" (home) — seção 12/20
 * ============================================================================= */
function viewHoje() {
  const plano = planoDoDia();
  const catchUp = plano.alertaCatchUp
    ? `<div class="alert warn">⚠ Você está represando revisão (${fmtMin(plano.tempoRevisoes)} vencidos,
        acima de 60% do seu tempo diário). Considere um <b>dia de catch-up</b> só para revisões.</div>`
    : '';

  const interleaveNote = plano.estudo.length && plano.disciplinasNoDia < 2
    ? `<small class="hint">Cadastre tópicos em outras disciplinas para o intercalamento (interleaving) funcionar melhor.</small>`
    : '';

  const revisoesHtml = plano.revisoes.length
    ? plano.revisoes.slice(0, 8).map(r => `
        <div class="item">
          <div class="body">
            <div class="title">${esc(cut(r.titulo, 90))}</div>
            <div class="meta">🔁 Revisão · ${rotuloTipoItem(r.tipo)} · venceu ${humanData(r.venceu_em)}</div>
          </div>
          <div class="pill-time">${r.tempo_est_min} min</div>
        </div>`).join('')
    : `<div class="empty">Nenhuma revisão vencida hoje. 🎉</div>`;

  const estudoHtml = plano.estudo.length
    ? plano.estudo.map((it, i) => `
        <div class="item">
          <div class="body">
            <div class="row wrap" style="gap:6px">
              <span class="title">${esc(it.topico.nome)}</span>
              ${badgeEdital(it.topico.status_edital)}
            </div>
            <div class="meta">${esc(it.disciplina.nome)} · ${badgePesoInline(it.disciplina.peso_estrategico)}
              · prioridade ${(it.prioridade).toFixed(2)}</div>
            <div class="motivo">“${esc(it.motivo)}”</div>
            <div class="row" style="margin-top:8px;gap:8px">
              <button class="btn primary sm" data-pomo="${esc(it.topico.id)}" data-min="${it.tempo_est_min}">▶ Iniciar Pomodoro</button>
              <a class="btn ghost sm" href="#/topico/${esc(it.topico.id)}">Abrir tópico</a>
            </div>
          </div>
          <div class="pill-time">${it.tempo_est_min} min</div>
        </div>`).join('')
    : `<div class="empty">Cadastre disciplinas e tópicos em <a href="#/conteudo">Conteúdo</a> para gerar seu plano.</div>`;

  return `
    <h1>Plano de hoje <span class="dim" style="font-size:13px">· ${humanData(plano.data)}</span></h1>
    ${catchUp}
    <div class="card tight">
      <div class="row"><b style="flex:1">Revisões de hoje</b>
        <span class="dim" style="font-size:12px">${plano.revisoes.length} item(ns) · ${fmtMin(plano.tempoRevisoes)}</span></div>
      <div class="stack" style="margin-top:10px">${revisoesHtml}</div>
      ${plano.revisoes.length > 8 ? `<small class="hint">+${plano.revisoes.length - 8} em <a href="#/revisar">Revisar</a></small>` : ''}
    </div>
    <h2>Estudar hoje <span class="dim" style="font-size:12px;font-weight:400">· ${plano.disciplinasNoDia} disciplina(s), interleaving</span></h2>
    <div class="stack">${estudoHtml}</div>
    ${interleaveNote}`;
}
function wireHoje() {
  root().querySelectorAll('[data-pomo]').forEach(b => {
    b.onclick = () => abrirPomodoro(b.dataset.pomo, +b.dataset.min);
  });
}
function badgePesoInline(p) { return p === 'alto' ? 'peso alto' : 'peso médio'; }

/* =============================================================================
 * POMODORO (seção 7) — timer + ao final dispara recuperação ativa
 * ============================================================================= */
let pomoTimer = null;
function abrirPomodoro(topicoId, planejadoMin) {
  const cfg = getConfig();
  const topico = store.get('topico', topicoId);
  const foco = cfg.pomodoro_foco_min;
  let restante = foco * 60;      // segundos
  let emPausa = false;
  let rodando = false;
  let segFocoDecorridos = 0;

  const body = openModal(`
    <div class="dim" style="font-size:13px">${esc(topico ? topico.nome : '')}</div>
    <div class="pomo-time" id="pt">${mmss(restante)}</div>
    <div class="row" style="justify-content:center;gap:8px">
      <button class="btn primary" id="p-start">▶ Iniciar</button>
      <button class="btn" id="p-pause" disabled>⏸ Pausar</button>
      <button class="btn ghost" id="p-done">✔ Concluir foco</button>
    </div>
    <small class="hint" style="text-align:center">Foco ${foco} min · pausa ${cfg.pomodoro_pausa_min} min. Ao concluir, entra a recuperação ativa.</small>
  `, { title: '🍅 Pomodoro', onClose: () => { clearInterval(pomoTimer); pomoTimer = null; } });

  const pt = body.querySelector('#pt');
  const bStart = body.querySelector('#p-start');
  const bPause = body.querySelector('#p-pause');
  const bDone = body.querySelector('#p-done');

  const tick = () => {
    if (!rodando) return;
    restante--;
    if (!emPausa) segFocoDecorridos++;
    if (restante <= 0) {
      if (!emPausa) { // terminou o foco -> pausa
        emPausa = true; restante = cfg.pomodoro_pausa_min * 60;
        pt.classList.add('pausa'); toast('Foco concluído! Pausa.');
      } else {
        clearInterval(pomoTimer); pomoTimer = null; rodando = false;
        finalizarFoco();
        return;
      }
    }
    pt.textContent = mmss(restante);
  };
  bStart.onclick = () => {
    if (rodando) return;
    rodando = true; bStart.disabled = true; bPause.disabled = false;
    pomoTimer = setInterval(tick, 1000);
  };
  bPause.onclick = () => {
    rodando = !rodando;
    bPause.textContent = rodando ? '⏸ Pausar' : '▶ Retomar';
  };
  bDone.onclick = () => { clearInterval(pomoTimer); pomoTimer = null; finalizarFoco(); };

  function finalizarFoco() {
    const realMin = Math.max(1, Math.round(segFocoDecorridos / 60)) || planejadoMin;
    registrarSessao({ topicoId, tempoPlanejadoMin: planejadoMin, tempoRealMin: realMin, nPomodoros: 1 });
    closeModal();
    // Recuperação ativa obrigatória (seção 4/8)
    abrirRecuperacaoAtiva(topicoId);
  }
}
function mmss(s) { const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

/* =============================================================================
 * RECUPERAÇÃO ATIVA / RESUMO (seção 8)
 * Fase 1: correção MANUAL por checklist de pontos-chave. A comparação
 * semântica por IA (item a item) é da FASE 3 — NÃO fazemos keyword matching
 * fingindo ser IA.
 * ============================================================================= */
function abrirRecuperacaoAtiva(topicoId) {
  const topico = store.get('topico', topicoId);
  const temChecklist = topico && topico.pontos_chave && topico.pontos_chave.length;

  const checklistHtml = temChecklist
    ? topico.pontos_chave.map((p, i) => `
        <div class="row" style="gap:8px;align-items:flex-start;margin:6px 0">
          <select data-ck="${i}" style="max-width:150px">
            <option value="nao">não coberto</option>
            <option value="parcial">parcialmente</option>
            <option value="coberto">coberto</option>
          </select>
          <div style="flex:1">${esc(p)}</div>
        </div>`).join('')
    : `<div class="alert info">Este tópico não tem <b>pontos-chave</b> cadastrados. O resumo será salvo e marcado como
        <b>correção manual pendente</b>. Cadastre os pontos-chave na aba Conteúdo para habilitar a autoavaliação.</div>`;

  const body = openModal(`
    <div class="dim" style="font-size:13px">${esc(topico ? topico.nome : '')}</div>
    <label class="field"><span class="lab">Escreva um resumo SEM consultar o material</span>
      <textarea id="ra-texto" placeholder="Do que você lembra sobre este tópico?"></textarea></label>
    ${temChecklist ? `<h3>Marque quais pontos-chave você cobriu</h3>` : ''}
    <div>${checklistHtml}</div>
    <hr class="sep">
    <h3>Como foi puxar isso da memória?</h3>
    <div class="grade-btns">
      <button class="btn dangerbtn" data-grade="esqueceu">Esqueci</button>
      <button class="btn warnbtn" data-grade="esforco">Com esforço</button>
      <button class="btn good" data-grade="facil">Fácil</button>
    </div>
    <small class="hint">Isto realimenta o algoritmo de repetição do tópico.</small>
  `, { title: '🧠 Recuperação ativa' });

  body.querySelectorAll('[data-grade]').forEach(b => {
    b.onclick = () => {
      const texto = body.querySelector('#ra-texto').value.trim();
      const cobertos = [], faltantes = [];
      if (temChecklist) {
        topico.pontos_chave.forEach((p, i) => {
          const v = body.querySelector(`[data-ck="${i}"]`).value;
          if (v === 'coberto') cobertos.push(p);
          else faltantes.push(p); // 'nao' e 'parcial' contam como reforço
        });
      }
      const status = !temChecklist ? 'correcao_manual_pendente'
        : (faltantes.length === 0 ? 'aprovado' : 'incompleto');

      const resumo = store.insert('resumo', {
        topico_id: topicoId, texto,
        pontos_cobertos: cobertos, pontos_faltantes: faltantes, status,
        data: todayISO(),
      });

      // resumo incompleto entra na fila de revisão unificada (seção 9)
      if (status === 'incompleto') agendarRevisao(resumo.id, 'resumo', addDaysISO(todayISO(), 1));

      // Gera flashcards a partir dos pontos FALTANTES (reforço) — seção 8/10
      if (status === 'incompleto') {
        faltantes.forEach(p => criarFlashcardAuto(topicoId, `Explique: ${p}`, `(ponto-chave de ${topico.nome})`, 'resumo_incompleto'));
      }

      registrarRecuperacaoTopico(topicoId, b.dataset.grade, 0);
      closeModal();
      toast(status === 'aprovado' ? 'Resumo aprovado ✔' : status === 'incompleto' ? 'Reforço agendado' : 'Resumo salvo');
      refresh();
    };
  });
}

function criarFlashcardAuto(topicoId, frente, verso, origem) {
  store.insert('flashcard', {
    topico_id: topicoId, frente, verso, origem: origem || 'auto',
    srs: novoEstadoSRS(todayISO()),
  });
}

/* =============================================================================
 * TELA "REVISAR" — fila unificada (seção 9)
 * ============================================================================= */
function viewRevisar() {
  const fila = filaRevisaoHoje();
  if (!fila.length) return `<h1>Revisar</h1><div class="empty">Sem revisões vencidas. Volte amanhã. 🎉</div>`;
  const cards = fila.map((r, i) => `
    <div class="item">
      <div class="body">
        <div class="title">${esc(cut(r.titulo, 100))}</div>
        <div class="meta">${rotuloTipoItem(r.tipo)} · ${esc(nomeTopico(r.topico_id))} · venceu ${humanData(r.venceu_em)}</div>
      </div>
      <button class="btn primary sm" data-rev="${i}">Revisar</button>
    </div>`).join('');
  return `<h1>Revisar <span class="dim" style="font-size:13px">· ${fila.length} item(ns)</span></h1>
    <div class="stack" id="fila">${cards}</div>`;
}
function wireRevisar() {
  const fila = filaRevisaoHoje();
  root().querySelectorAll('[data-rev]').forEach(b => {
    b.onclick = () => {
      const item = fila[+b.dataset.rev];
      if (item.tipo === 'flashcard') abrirRevisaoFlashcard(item.ref.id);
      else if (item.tipo === 'questao') abrirQuiz([item.ref.id], item.revisao_id);
      else if (item.tipo === 'resumo') abrirRecuperacaoAtiva(item.topico_id);
    };
  });
}

/* =============================================================================
 * FLASHCARDS (seção 10)
 * ============================================================================= */
function viewFlashcards() {
  const cards = store.all('flashcard');
  const hoje = todayISO();
  const vencidos = cards.filter(c => c.srs.proxima_revisao <= hoje).length;
  const lista = cards.slice().sort((a, b) => a.srs.proxima_revisao.localeCompare(b.srs.proxima_revisao)).map(c => `
    <div class="item">
      <div class="body">
        <div class="title">${esc(cut(c.frente, 90))}</div>
        <div class="meta">${esc(nomeTopico(c.topico_id))} · caixa ${c.srs.box}/5 · próxima ${humanData(c.srs.proxima_revisao)}
          ${c.srs.proxima_revisao <= hoje ? '· <b style="color:var(--warn)">vencido</b>' : ''}</div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn sm" data-edit="${esc(c.id)}">✎</button>
        <button class="btn ghost sm" data-del="${esc(c.id)}">🗑</button>
      </div>
    </div>`).join('');
  return `
    <h1>Flashcards</h1>
    <div class="row" style="margin-bottom:12px;gap:8px">
      <button class="btn primary" id="fc-novo">+ Novo card</button>
      <button class="btn good" id="fc-revisar" ${vencidos ? '' : 'disabled'}>Revisar vencidos (${vencidos})</button>
    </div>
    ${cards.length ? `<div class="stack">${lista}</div>` : `<div class="empty">Nenhum flashcard ainda. Crie o primeiro ou gere a partir de resumos.</div>`}`;
}
function wireFlashcards() {
  root().querySelector('#fc-novo').onclick = () => formFlashcard();
  const rev = root().querySelector('#fc-revisar');
  if (rev && !rev.disabled) rev.onclick = () => {
    const hoje = todayISO();
    const fila = store.all('flashcard').filter(c => c.srs.proxima_revisao <= hoje).map(c => c.id);
    abrirRevisaoFlashcardFila(fila);
  };
  root().querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formFlashcard(b.dataset.edit));
  root().querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (confirm('Excluir este flashcard?')) { store.remove('flashcard', b.dataset.del); refresh(); }
  });
}
function formFlashcard(id) {
  const fc = id ? store.get('flashcard', id) : null;
  const topicos = store.all('topico');
  const opts = topicos.map(t => `<option value="${esc(t.id)}" ${fc && fc.topico_id === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('');
  const body = openModal(`
    <label class="field"><span class="lab">Tópico</span><select id="f-top">${opts}</select></label>
    <label class="field"><span class="lab">Frente (pergunta)</span><textarea id="f-frente">${esc(fc?.frente || '')}</textarea></label>
    <label class="field"><span class="lab">Verso (resposta)</span><textarea id="f-verso">${esc(fc?.verso || '')}</textarea></label>
    <button class="btn primary" id="f-save">Salvar</button>
  `, { title: id ? 'Editar flashcard' : 'Novo flashcard' });
  body.querySelector('#f-save').onclick = () => {
    const topico_id = body.querySelector('#f-top').value;
    const frente = body.querySelector('#f-frente').value.trim();
    const verso = body.querySelector('#f-verso').value.trim();
    if (!topico_id || !frente || !verso) return toast('Preencha tópico, frente e verso');
    if (id) store.update('flashcard', id, { frente, verso, topico_id });
    else store.insert('flashcard', { topico_id, frente, verso, origem: 'manual', srs: novoEstadoSRS(todayISO()) });
    closeModal(); refresh();
  };
}
function abrirRevisaoFlashcard(id) { abrirRevisaoFlashcardFila([id]); }
function abrirRevisaoFlashcardFila(ids) {
  let i = 0;
  const mostra = () => {
    if (i >= ids.length) { closeModal(); toast('Revisão concluída ✔'); refresh(); return; }
    const fc = store.get('flashcard', ids[i]);
    if (!fc) { i++; return mostra(); }
    const t0 = Date.now();
    const body = openModal(`
      <div class="dim" style="font-size:12px">${esc(nomeTopico(fc.topico_id))} · ${i + 1}/${ids.length}</div>
      <div class="fc" id="fc-face">${esc(fc.frente)}</div>
      <button class="btn" id="fc-flip" style="width:100%;margin-top:10px">Mostrar resposta</button>
      <div id="fc-grade" hidden>
        <div class="grade-btns" style="margin-top:10px">
          <button class="btn dangerbtn" data-g="esqueceu">Esqueci</button>
          <button class="btn warnbtn" data-g="esforco">Com esforço</button>
          <button class="btn good" data-g="facil">Fácil</button>
        </div>
      </div>
    `, { title: '🃏 Revisão' });
    body.querySelector('#fc-flip').onclick = () => {
      body.querySelector('#fc-face').textContent = fc.verso;
      body.querySelector('#fc-flip').hidden = true;
      body.querySelector('#fc-grade').hidden = false;
    };
    body.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      revisarFlashcard(fc.id, b.dataset.g, Math.round((Date.now() - t0) / 1000));
      i++; mostra();
    });
  };
  mostra();
}

/* =============================================================================
 * QUESTÕES (seção 11) — múltipla escolha + certo/errado
 * ============================================================================= */
function viewQuestoes() {
  const qs = store.all('questao');
  const lista = qs.map(q => {
    const tents = store.where('tentativa_questao', t => t.questao_id === q.id);
    const acc = tents.length ? Math.round(100 * tents.filter(t => t.acertou).length / tents.length) : null;
    return `<div class="item">
      <div class="body">
        <div class="title">${esc(cut(q.enunciado, 100))}</div>
        <div class="meta">${esc(nomeTopico(q.topico_id))} · ${q.tipo === 'certo_errado' ? 'certo/errado' : 'múltipla escolha'}
          · ${esc(q.dificuldade)} ${q.fonte_analoga ? '· <span class="badge fora" style="font-size:10px">fonte análoga</span>' : ''}
          ${acc != null ? `· acerto ${acc}%` : ''}</div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn primary sm" data-play="${esc(q.id)}">Responder</button>
        <button class="btn ghost sm" data-delq="${esc(q.id)}">🗑</button>
      </div>
    </div>`;
  }).join('');
  return `
    <h1>Banco de questões</h1>
    <div class="row" style="margin-bottom:12px;gap:8px">
      <button class="btn primary" id="q-nova">+ Nova questão</button>
      <button class="btn good" id="q-simulado" ${qs.length ? '' : 'disabled'}>Simulado (${qs.length})</button>
    </div>
    <div class="alert info" style="font-size:12.5px">Não existe histórico de prova da ANPD (primeiro concurso do órgão).
      Questões de bancas afins entram marcadas como <b>fonte análoga</b>.</div>
    ${qs.length ? `<div class="stack">${lista}</div>` : `<div class="empty">Nenhuma questão cadastrada ainda.</div>`}`;
}
function wireQuestoes() {
  root().querySelector('#q-nova').onclick = () => formQuestao();
  const sim = root().querySelector('#q-simulado');
  if (sim && !sim.disabled) sim.onclick = () => abrirQuiz(store.all('questao').map(q => q.id));
  root().querySelectorAll('[data-play]').forEach(b => b.onclick = () => abrirQuiz([b.dataset.play]));
  root().querySelectorAll('[data-delq]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta questão?')) { store.remove('questao', b.dataset.delq); refresh(); }
  });
}
function formQuestao() {
  const topicos = store.all('topico');
  const opts = topicos.map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('');
  const body = openModal(`
    <label class="field"><span class="lab">Tópico</span><select id="q-top">${opts}</select></label>
    <div class="inline-fields">
      <label class="field"><span class="lab">Formato</span>
        <select id="q-tipo"><option value="multipla">Múltipla escolha (5)</option><option value="certo_errado">Certo/Errado</option></select></label>
      <label class="field"><span class="lab">Dificuldade</span>
        <select id="q-dif"><option value="facil">Fácil</option><option value="media" selected>Média</option><option value="dificil">Difícil</option></select></label>
    </div>
    <label class="field"><span class="lab">Enunciado</span><textarea id="q-enun"></textarea></label>
    <div id="q-mult">
      <span class="lab">Alternativas (marque a correta)</span>
      ${[0, 1, 2, 3, 4].map(i => `<div class="row" style="margin:5px 0"><input type="radio" name="qcorreta" value="${i}" ${i === 0 ? 'checked' : ''} style="width:auto">
        <input type="text" id="q-alt-${i}" placeholder="Alternativa ${String.fromCharCode(65 + i)}"></div>`).join('')}
    </div>
    <div id="q-ce" hidden>
      <label class="field"><span class="lab">Gabarito</span>
        <select id="q-ce-resp"><option value="true">Certo</option><option value="false">Errado</option></select></label>
    </div>
    <label class="field"><span class="row"><input type="checkbox" id="q-fa" checked style="width:auto"> <span>Fonte análoga (não é questão real da ANPD)</span></span></label>
    <label class="field"><span class="lab">Descrição da fonte</span><input id="q-fonte" placeholder="Ex.: Cebraspe 2023, questão adaptada"></label>
    <button class="btn primary" id="q-save">Salvar questão</button>
  `, { title: 'Nova questão' });
  const tipoSel = body.querySelector('#q-tipo');
  tipoSel.onchange = () => {
    const ce = tipoSel.value === 'certo_errado';
    body.querySelector('#q-mult').hidden = ce;
    body.querySelector('#q-ce').hidden = !ce;
  };
  body.querySelector('#q-save').onclick = () => {
    const tipo = tipoSel.value;
    const rec = {
      topico_id: body.querySelector('#q-top').value,
      tipo, enunciado: body.querySelector('#q-enun').value.trim(),
      dificuldade: body.querySelector('#q-dif').value,
      fonte_analoga: body.querySelector('#q-fa').checked,
      fonte_desc: body.querySelector('#q-fonte').value.trim(),
    };
    if (!rec.topico_id || !rec.enunciado) return toast('Preencha tópico e enunciado');
    if (tipo === 'multipla') {
      const correta = +body.querySelector('input[name=qcorreta]:checked').value;
      rec.alternativas = [0, 1, 2, 3, 4].map(i => ({
        texto: body.querySelector(`#q-alt-${i}`).value.trim(), correta: i === correta,
      })).filter(a => a.texto);
      if (rec.alternativas.length < 2) return toast('Informe ao menos 2 alternativas');
      if (!rec.alternativas.some(a => a.correta)) rec.alternativas[0].correta = true;
    } else {
      rec.resposta_ce = body.querySelector('#q-ce-resp').value === 'true';
      rec.alternativas = [];
    }
    store.insert('questao', rec);
    closeModal(); refresh();
  };
}
function abrirQuiz(ids, revisaoId) {
  let i = 0;
  const mostra = () => {
    if (i >= ids.length) { closeModal(); toast('Concluído ✔'); refresh(); return; }
    const q = store.get('questao', ids[i]);
    if (!q) { i++; return mostra(); }
    const t0 = Date.now();
    let corpo;
    if (q.tipo === 'certo_errado') {
      corpo = `<div class="grade-btns" style="grid-template-columns:1fr 1fr">
        <button class="btn" data-ce="true">CERTO</button>
        <button class="btn" data-ce="false">ERRADO</button></div>`;
    } else {
      corpo = q.alternativas.map((a, k) => `<button class="btn" style="width:100%;text-align:left;margin:5px 0" data-alt="${k}">
        ${String.fromCharCode(65 + k)}) ${esc(a.texto)}</button>`).join('');
    }
    const body = openModal(`
      <div class="dim" style="font-size:12px">${esc(nomeTopico(q.topico_id))} · ${i + 1}/${ids.length}
        ${q.fonte_analoga ? '· fonte análoga' : ''}</div>
      <div style="white-space:pre-wrap;margin:10px 0;font-size:16px">${esc(q.enunciado)}</div>
      <div id="q-opts">${corpo}</div>
      <div id="q-fb" hidden></div>
    `, { title: '❓ Questão' });

    const responder = (acertou, respostaDada) => {
      registrarTentativa({ questaoId: q.id, acertou, tempo_s: Math.round((Date.now() - t0) / 1000), respostaDada });
      if (revisaoId) { store.update('revisao_agendada', revisaoId, { concluida: true, resultado: acertou ? 'facil' : 'esqueceu' }); }
      const fb = body.querySelector('#q-fb');
      body.querySelector('#q-opts').style.opacity = '.5';
      body.querySelectorAll('#q-opts button').forEach(x => x.disabled = true);
      fb.hidden = false;
      fb.innerHTML = `<div class="alert ${acertou ? 'info' : 'danger'}">${acertou ? '✔ Correto!' : '✕ Incorreto.'}
        ${q.tipo === 'certo_errado' ? `Gabarito: <b>${q.resposta_ce ? 'CERTO' : 'ERRADO'}</b>.` : `Correta: <b>${gabaritoMult(q)}</b>.`}
        ${!acertou ? '<br>Erro recorrente aqui agenda reforço automaticamente (revisão + flashcards).' : ''}</div>
        <button class="btn primary" id="q-next" style="width:100%">Próxima</button>`;
      fb.querySelector('#q-next').onclick = () => { i++; mostra(); };
    };

    if (q.tipo === 'certo_errado') {
      body.querySelectorAll('[data-ce]').forEach(b => b.onclick = () => {
        const dado = b.dataset.ce === 'true';
        responder(dado === q.resposta_ce, dado);
      });
    } else {
      body.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => {
        const k = +b.dataset.alt;
        responder(!!q.alternativas[k].correta, k);
      });
    }
  };
  mostra();
}
function gabaritoMult(q) {
  const k = q.alternativas.findIndex(a => a.correta);
  return k >= 0 ? `${String.fromCharCode(65 + k)}) ${cut(q.alternativas[k].texto, 60)}` : '—';
}

/* =============================================================================
 * CONTEÚDO / CURADORIA (seção 3) — disciplinas > tópicos
 * ============================================================================= */
function viewConteudo() {
  const disc = store.all('disciplina');
  const html = disc.map(d => {
    const tops = store.where('topico', t => t.disciplina_id === d.id);
    return `<div class="card">
      <div class="row wrap" style="gap:8px">
        <b style="flex:1;min-width:140px">${esc(d.nome)}</b>
        ${badgePeso(d.peso_estrategico)} ${badgeEdital(d.status_edital)}
        ${d.fora_do_edital ? '<span class="badge fora">fora do edital</span>' : ''}
      </div>
      <div class="stack" style="margin-top:10px">
        ${tops.length ? tops.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(t => `
          <a class="item" href="#/topico/${esc(t.id)}" style="text-decoration:none;color:inherit">
            <div class="body"><div class="title">${esc(t.nome)}</div>
              <div class="meta">${(t.pontos_chave || []).length} ponto(s)-chave · ${store.where('conteudo_aula', c => c.topico_id === t.id).length} conteúdo(s)</div></div>
            <span class="dim">›</span>
          </a>`).join('') : '<div class="empty" style="padding:12px">Sem tópicos.</div>'}
      </div>
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="btn sm" data-novo-top="${esc(d.id)}">+ Tópico</button>
        <button class="btn ghost sm" data-edit-disc="${esc(d.id)}">Editar disciplina</button>
      </div>
    </div>`;
  }).join('');
  return `<h1>Conteúdo & curadoria</h1>
    <div class="alert info" style="font-size:12.5px">Disciplinas <b>provisórias</b> (pré-edital) podem mudar quando o edital sair.
      Conteúdo gerado por IA entra como <b>rascunho</b> até revisão humana.</div>
    <button class="btn primary" id="nova-disc" style="margin-bottom:12px">+ Nova disciplina</button>
    ${html}`;
}
function wireConteudo() {
  root().querySelector('#nova-disc').onclick = () => formDisciplina();
  root().querySelectorAll('[data-edit-disc]').forEach(b => b.onclick = e => { e.preventDefault(); formDisciplina(b.dataset.editDisc); });
  root().querySelectorAll('[data-novo-top]').forEach(b => b.onclick = e => { e.preventDefault(); formTopico(b.dataset.novoTop); });
}
function formDisciplina(id) {
  const d = id ? store.get('disciplina', id) : null;
  const body = openModal(`
    <label class="field"><span class="lab">Nome</span><input id="d-nome" value="${esc(d?.nome || '')}"></label>
    <div class="inline-fields">
      <label class="field"><span class="lab">Peso estratégico</span>
        <select id="d-peso"><option value="alto" ${d?.peso_estrategico === 'alto' ? 'selected' : ''}>Alto</option>
        <option value="medio" ${!d || d?.peso_estrategico === 'medio' ? 'selected' : ''}>Médio</option></select></label>
      <label class="field"><span class="lab">Status do edital</span>
        <select id="d-status"><option value="provisorio" ${!d || d?.status_edital === 'provisorio' ? 'selected' : ''}>Provisório</option>
        <option value="confirmado" ${d?.status_edital === 'confirmado' ? 'selected' : ''}>Confirmado</option></select></label>
    </div>
    <button class="btn primary" id="d-save">Salvar</button>
    ${id ? '<button class="btn dangerbtn" id="d-del" style="margin-top:8px">Excluir disciplina</button>' : ''}
  `, { title: id ? 'Editar disciplina' : 'Nova disciplina' });
  body.querySelector('#d-save').onclick = () => {
    const rec = {
      nome: body.querySelector('#d-nome').value.trim(),
      peso_estrategico: body.querySelector('#d-peso').value,
      status_edital: body.querySelector('#d-status').value,
    };
    if (!rec.nome) return toast('Informe o nome');
    if (id) store.update('disciplina', id, rec);
    else store.insert('disciplina', { ...rec, fora_do_edital: false });
    closeModal(); refresh();
  };
  const del = body.querySelector('#d-del');
  if (del) del.onclick = () => {
    if (confirm('Excluir disciplina e seus tópicos?')) {
      store.where('topico', t => t.disciplina_id === id).forEach(t => store.remove('topico', t.id));
      store.remove('disciplina', id); closeModal(); refresh();
    }
  };
}
function formTopico(disciplinaId, id) {
  const t = id ? store.get('topico', id) : null;
  const body = openModal(`
    <label class="field"><span class="lab">Nome do tópico</span><input id="t-nome" value="${esc(t?.nome || '')}"></label>
    <label class="field"><span class="lab">Ordem</span><input id="t-ordem" type="number" value="${t?.ordem || 1}"></label>
    <label class="field"><span class="lab">Pontos-chave (um por linha) — usados na correção de resumo</span>
      <textarea id="t-pk" placeholder="definição de dado pessoal&#10;definição de dado sensível">${esc((t?.pontos_chave || []).join('\n'))}</textarea></label>
    <button class="btn primary" id="t-save">Salvar</button>
  `, { title: id ? 'Editar tópico' : 'Novo tópico' });
  body.querySelector('#t-save').onclick = () => {
    const nome = body.querySelector('#t-nome').value.trim();
    const ordem = +body.querySelector('#t-ordem').value || 1;
    const pontos_chave = body.querySelector('#t-pk').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!nome) return toast('Informe o nome');
    if (id) store.update('topico', id, { nome, ordem, pontos_chave });
    else {
      const disc = store.get('disciplina', disciplinaId);
      store.insert('topico', { disciplina_id: disciplinaId, nome, ordem, pontos_chave,
        status_edital: disc ? disc.status_edital : 'provisorio', fora_do_edital: false });
    }
    closeModal(); refresh();
  };
}

/* ---- tela de um tópico (conteúdo + ações) ------------------------------- */
function viewTopico(id) {
  const t = store.get('topico', id);
  if (!t) return `<div class="empty">Tópico não encontrado. <a href="#/conteudo">Voltar</a></div>`;
  const disc = store.get('disciplina', t.disciplina_id);
  const conteudos = store.where('conteudo_aula', c => c.topico_id === id);
  const prog = progressoDe(id);

  const pk = (t.pontos_chave || []).map(p => `<span class="chip">${esc(p)}</span>`).join('') || '<span class="dim">nenhum</span>';

  const conteudosHtml = conteudos.length ? conteudos.map(c => `
    <div class="card tight conteudo tipo-${c.tipo}">
      <div class="row wrap" style="gap:6px">${badgeTipoConteudo(c.tipo)} ${badgeRevisado(c.revisado_por_humano)}
        <span class="spacer"></span>
        <button class="btn ghost sm" data-editc="${esc(c.id)}">✎</button>
        <button class="btn ghost sm" data-delc="${esc(c.id)}">🗑</button></div>
      ${c.titulo ? `<h3 style="margin-top:8px">${esc(c.titulo)}</h3>` : ''}
      <div class="corpo">${esc(c.corpo)}</div>
      ${c.fonte ? `<div class="fonte">Fonte: ${esc(c.fonte)}</div>` : ''}
      ${!c.revisado_por_humano ? `<button class="btn sm good" data-aprovar="${esc(c.id)}" style="margin-top:8px">Marcar como revisado</button>` : ''}
    </div>`).join('') : `<div class="empty">Nenhum conteúdo cadastrado. Adicione o texto legal, interpretações e apoios.</div>`;

  return `
    <div class="row" style="margin-bottom:6px"><a href="#/conteudo" class="dim">‹ Conteúdo</a></div>
    <h1 style="margin-bottom:6px">${esc(t.nome)}</h1>
    <div class="row wrap" style="gap:8px;margin-bottom:10px">
      ${esc(disc?.nome || '')} ${badgeEdital(t.status_edital)}
      ${prog ? `<span class="dim" style="font-size:12px">· caixa ${prog.srs.box}/5 · confiança ${(prog.confianca_atual * 100).toFixed(0)}%</span>` : '<span class="dim" style="font-size:12px">· nunca estudado</span>'}
    </div>
    <div class="card tight"><h3>Pontos-chave</h3><div>${pk}</div></div>
    <div class="row" style="gap:8px;margin:12px 0">
      <button class="btn primary" data-pomo-top="${esc(id)}">▶ Pomodoro</button>
      <button class="btn good" data-ra="${esc(id)}">🧠 Recuperação ativa</button>
      <button class="btn" data-edit-top="${esc(id)}">✎ Editar tópico</button>
    </div>
    <div class="row"><h2 style="flex:1">Conteúdo</h2><button class="btn sm" id="add-conteudo">+ Conteúdo</button></div>
    ${conteudosHtml}`;
}
function wireTopico(id) {
  root().querySelector('[data-pomo-top]').onclick = () => abrirPomodoro(id, getConfig().pomodoro_foco_min);
  root().querySelector('[data-ra]').onclick = () => abrirRecuperacaoAtiva(id);
  root().querySelector('[data-edit-top]').onclick = () => { const t = store.get('topico', id); formTopico(t.disciplina_id, id); };
  root().querySelector('#add-conteudo').onclick = () => formConteudo(id);
  root().querySelectorAll('[data-editc]').forEach(b => b.onclick = () => formConteudo(id, b.dataset.editc));
  root().querySelectorAll('[data-delc]').forEach(b => b.onclick = () => { if (confirm('Excluir conteúdo?')) { store.remove('conteudo_aula', b.dataset.delc); refresh(); } });
  root().querySelectorAll('[data-aprovar]').forEach(b => b.onclick = () => { store.update('conteudo_aula', b.dataset.aprovar, { revisado_por_humano: true }); refresh(); });
}
function formConteudo(topicoId, id) {
  const c = id ? store.get('conteudo_aula', id) : null;
  const tipoOpts = Object.entries(TIPO_CONTEUDO).map(([k, v]) =>
    `<option value="${k}" ${c?.tipo === k ? 'selected' : ''}>${esc(v.label)} — ${esc(v.desc)}</option>`).join('');
  const body = openModal(`
    <label class="field"><span class="lab">Tipo de conteúdo (rotulagem obrigatória)</span>
      <select id="c-tipo">${tipoOpts}</select></label>
    <div class="alert warn" id="c-aviso" style="font-size:12px"></div>
    <label class="field"><span class="lab">Título (opcional)</span><input id="c-tit" value="${esc(c?.titulo || '')}"></label>
    <label class="field"><span class="lab">Corpo</span><textarea id="c-corpo" style="min-height:140px">${esc(c?.corpo || '')}</textarea></label>
    <label class="field"><span class="lab">Fonte / citação (obrigatória p/ texto legal e interpretação oficial)</span>
      <input id="c-fonte" value="${esc(c?.fonte || '')}" placeholder="Ex.: LGPD Art. 5º / Guia ANPD ..."></label>
    <label class="field"><span class="row"><input type="checkbox" id="c-rev" ${c?.revisado_por_humano ? 'checked' : ''} style="width:auto"> <span>Revisado por humano</span></span></label>
    <button class="btn primary" id="c-save">Salvar</button>
  `, { title: id ? 'Editar conteúdo' : 'Novo conteúdo' });

  const sel = body.querySelector('#c-tipo');
  const aviso = body.querySelector('#c-aviso');
  const upd = () => {
    const v = sel.value;
    if (v === 'texto_legal') aviso.textContent = 'Texto legal NUNCA é gerado por IA — cole literalmente da fonte oficial.';
    else if (v === 'interpretacao_oficial') aviso.textContent = 'Baseie em guia/nota técnica real da ANPD e cite a fonte.';
    else if (v === 'explicacao_didatica') aviso.textContent = 'Apoio pedagógico gerado por IA — pode conter erro; deixe como rascunho até revisar.';
    else aviso.textContent = 'Hipótese de cobrança = chute qualificado sobre a prova, não é fato.';
  };
  sel.onchange = upd; upd();

  body.querySelector('#c-save').onclick = () => {
    const tipo = sel.value;
    const rec = {
      topico_id: topicoId, tipo,
      titulo: body.querySelector('#c-tit').value.trim(),
      corpo: body.querySelector('#c-corpo').value.trim(),
      fonte: body.querySelector('#c-fonte').value.trim(),
      revisado_por_humano: body.querySelector('#c-rev').checked,
    };
    if (!rec.corpo) return toast('Escreva o corpo do conteúdo');
    if ((tipo === 'texto_legal' || tipo === 'interpretacao_oficial') && !rec.fonte)
      return toast('Fonte é obrigatória para esse tipo');
    rec.criado_por = 'humano';
    if (id) store.update('conteudo_aula', id, rec);
    else store.insert('conteudo_aula', rec);
    closeModal(); refresh();
  };
}

/* =============================================================================
 * PAINEL (dashboard, seção 14) + metas + config
 * ============================================================================= */
function viewPainel() {
  const st = estatisticas();
  const disc = store.all('disciplina');
  const faixas = disc.map(d => {
    const f = faixaDisciplina(d.id);
    return `<div class="item"><div class="body">
      <div class="row wrap" style="gap:6px"><span class="title">${esc(d.nome)}</span> ${badgeEdital(d.status_edital)}</div>
      </div><span class="faixa ${f}">${FAIXA_LABEL[f]}</span></div>`;
  }).join('');

  const metas = store.all('meta').map(m => {
    const real = realizadoMeta(m);
    const pct = Math.min(100, Math.round(100 * real / m.valor_alvo));
    return `<div class="item"><div class="body">
      <div class="title">${rotuloMeta(m)}</div>
      <div class="meta">${real} / ${m.valor_alvo} · ${pct}%</div>
      <div style="height:6px;background:var(--bg);border-radius:6px;margin-top:6px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--accent-2)"></div></div>
    </div><button class="btn ghost sm" data-delm="${esc(m.id)}">🗑</button></div>`;
  }).join('') || '<div class="empty">Nenhuma meta.</div>';

  const cfg = getConfig();
  return `
    <h1>Painel</h1>
    <div class="tiles">
      <div class="tile"><div class="n">${st.horasEstudadas}</div><div class="k">horas estudadas</div></div>
      <div class="tile"><div class="n">${st.diasConsecutivos}</div><div class="k">dias consecutivos</div></div>
      <div class="tile"><div class="n">${st.taxaAcerto == null ? '—' : st.taxaAcerto + '%'}</div><div class="k">acerto em questões</div></div>
      <div class="tile"><div class="n">${st.revisoesPendentes}</div><div class="k">revisões pendentes</div></div>
    </div>

    <h2>Desempenho por disciplina <span class="dim" style="font-size:12px;font-weight:400">· faixa qualitativa, não %</span></h2>
    <div class="stack">${faixas}</div>

    <div class="row" style="margin-top:22px"><h2 style="flex:1">Metas</h2><button class="btn sm" id="nova-meta">+ Meta</button></div>
    <div class="stack">${metas}</div>

    <h2>Configurações</h2>
    <div class="card">
      <div class="inline-fields">
        <label class="field"><span class="lab">Pomodoro foco (min)</span><input type="number" id="cfg-foco" value="${cfg.pomodoro_foco_min}"></label>
        <label class="field"><span class="lab">Pomodoro pausa (min)</span><input type="number" id="cfg-pausa" value="${cfg.pomodoro_pausa_min}"></label>
      </div>
      <label class="field"><span class="lab">Tempo diário disponível (min)</span><input type="number" id="cfg-diario" value="${cfg.tempo_diario_min}"></label>
      <label class="field"><span class="row"><input type="checkbox" id="cfg-amort" ${cfg.prioridade_amortecimento ? 'checked' : ''} style="width:auto">
        <span>Amortecer fatores de prioridade (base 0,2) — evita que um único fator zere o tópico</span></span></label>
      <button class="btn primary" id="cfg-save">Salvar configurações</button>
    </div>

    <h2>Data da prova</h2>
    <div class="card">
      <label class="field"><span class="lab">Data da prova (quando o edital sair)</span>
        <input type="date" id="cfg-prova" value="${store.get('user', store.all('user')[0]?.id)?.prova_data || ''}"></label>
      <button class="btn" id="prova-save">Salvar data</button>
    </div>

    <h2>Caderno de revisão (PDF)</h2>
    <div class="card">
      <p class="subtle" style="margin:0 0 10px;font-size:13px">Gera um caderno pessoal com conteúdo estudado,
        resumos aprovados, pontos de reforço, erros recorrentes e flashcards. Regerável a qualquer momento —
        use "Salvar como PDF" na janela de impressão.</p>
      <button class="btn primary" id="caderno">📄 Gerar caderno de revisão</button>
    </div>

    <h2>Migração pré-edital → pós-edital (Fase 4)</h2>
    <div class="alert info" style="font-size:12.5px">Quando o edital for publicado, a reconciliação assistida (você cola o edital,
      a IA sugere os matches e <b>você confirma cada um</b>) entra aqui. Nenhum histórico é apagado; tópicos que saírem do
      edital ficam marcados como <b>fora do edital</b> e continuam visíveis. <i>Recurso planejado para a Fase 4.</i></div>

    <h2>Dados</h2>
    <div class="card"><div class="row wrap" style="gap:8px">
      <button class="btn" id="exp">Exportar dados (JSON)</button>
      <button class="btn dangerbtn" id="reset">Recomeçar do zero</button>
    </div><small class="hint">Exportar é a base para uma futura migração ao backend (o schema já usa user_id).</small></div>
  `;
}
function wirePainel() {
  root().querySelector('#caderno').onclick = () => gerarCaderno();
  root().querySelector('#nova-meta').onclick = () => formMeta();
  root().querySelectorAll('[data-delm]').forEach(b => b.onclick = () => { store.remove('meta', b.dataset.delm); refresh(); });
  root().querySelector('#cfg-save').onclick = () => {
    setConfig({
      pomodoro_foco_min: +root().querySelector('#cfg-foco').value || 25,
      pomodoro_pausa_min: +root().querySelector('#cfg-pausa').value || 5,
      tempo_diario_min: +root().querySelector('#cfg-diario').value || 120,
      prioridade_amortecimento: root().querySelector('#cfg-amort').checked,
    });
    toast('Configurações salvas'); refresh();
  };
  root().querySelector('#prova-save').onclick = () => {
    const u = store.all('user')[0];
    store.update('user', u.id, { prova_data: root().querySelector('#cfg-prova').value || null });
    toast('Data salva'); refresh(); atualizarCountdown();
  };
  root().querySelector('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `prep-anpd-${todayISO()}.json`; a.click();
  };
  root().querySelector('#reset').onclick = () => {
    if (confirm('Isso apaga TODOS os dados locais. Continuar?')) { resetAll(); location.reload(); }
  };
}
function formMeta() {
  const body = openModal(`
    <div class="inline-fields">
      <label class="field"><span class="lab">Tipo</span><select id="m-tipo">
        <option value="horas">Horas</option><option value="questoes">Questões</option>
        <option value="modulos">Módulos (sessões)</option><option value="revisoes">Revisões</option></select></label>
      <label class="field"><span class="lab">Período</span><select id="m-per">
        <option value="diario">Diário</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></label>
    </div>
    <label class="field"><span class="lab">Valor alvo</span><input type="number" id="m-val" value="2"></label>
    <button class="btn primary" id="m-save">Salvar meta</button>
  `, { title: 'Nova meta' });
  body.querySelector('#m-save').onclick = () => {
    store.insert('meta', {
      tipo: body.querySelector('#m-tipo').value,
      periodo: body.querySelector('#m-per').value,
      valor_alvo: +body.querySelector('#m-val').value || 1,
    });
    closeModal(); refresh();
  };
}
function realizadoMeta(m) {
  const desde = inicioPeriodo(m.periodo);
  if (m.tipo === 'horas') {
    const min = store.where('sessao_estudo', s => s.data >= desde).reduce((a, s) => a + (s.tempo_real_min || 0), 0);
    return +(min / 60).toFixed(1);
  }
  if (m.tipo === 'questoes') return store.where('tentativa_questao', t => t.data >= desde).length;
  if (m.tipo === 'modulos') return store.where('sessao_estudo', s => s.data >= desde).length;
  if (m.tipo === 'revisoes') return store.where('revisao_agendada', r => r.concluida && (r.data_prevista >= desde)).length;
  return 0;
}
function inicioPeriodo(periodo) {
  if (periodo === 'diario') return todayISO();
  if (periodo === 'semanal') return addDaysISO(todayISO(), -6);
  return addDaysISO(todayISO(), -29);
}
function rotuloMeta(m) {
  const t = { horas: 'Horas de estudo', questoes: 'Questões respondidas', modulos: 'Sessões concluídas', revisoes: 'Revisões feitas' }[m.tipo];
  const p = { diario: 'por dia', semanal: 'por semana', mensal: 'por mês' }[m.periodo];
  return `${t} ${p}`;
}

/* =============================================================================
 * helpers de exibição
 * ============================================================================= */
function nomeTopico(id) { const t = store.get('topico', id); return t ? t.nome : '(tópico)'; }
function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function rotuloTipoItem(t) { return { flashcard: 'flashcard', questao: 'questão errada', resumo: 'resumo incompleto' }[t] || t; }
function humanData(iso) {
  if (!iso) return '—';
  const hoje = todayISO();
  if (iso === hoje) return 'hoje';
  if (iso === addDaysISO(hoje, -1)) return 'ontem';
  if (iso === addDaysISO(hoje, 1)) return 'amanhã';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/* countdown até a prova (header) */
export function atualizarCountdown() {
  const u = store.all('user')[0];
  const elc = document.getElementById('prova-countdown');
  if (!elc) return;
  if (u && u.prova_data) {
    const dias = Math.max(0, Math.ceil((new Date(u.prova_data) - new Date(todayISO())) / 86400000));
    elc.innerHTML = `⏳ <b>${dias}</b> dias até a prova`;
  } else {
    elc.innerHTML = `<span class="badge provisorio">pré-edital</span>`;
  }
}
