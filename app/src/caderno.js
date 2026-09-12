/* =============================================================================
 * caderno.js — Geração do "Caderno de revisão pessoal" (seção 16).
 * -----------------------------------------------------------------------------
 * Sem dependência externa e sem chave de API: montamos um documento HTML
 * imprimível e chamamos window.print(), de onde o usuário salva como PDF
 * (funciona no celular e no desktop). REGERÁVEL a qualquer momento — cada
 * chamada relê o estado atual; não é um export único.
 * ============================================================================= */
import { store, todayISO } from './store.js';
import { esc, TIPO_CONTEUDO } from './ui.js';

function humanFullData(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Monta o HTML do caderno a partir do estado atual. */
function montarHTML() {
  const user = store.all('user')[0];
  const disciplinas = store.all('disciplina');

  let diasProva = '';
  if (user && user.prova_data) {
    const d = Math.max(0, Math.ceil((new Date(user.prova_data) - new Date(todayISO())) / 86400000));
    diasProva = ` · ${d} dias até a prova`;
  }

  // ---- 1) Conteúdo estudado (por disciplina/tópico) ----
  const secoesConteudo = disciplinas.map(disc => {
    const topicos = store.where('topico', t => t.disciplina_id === disc.id)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const blocos = topicos.map(t => {
      const conteudos = store.where('conteudo_aula', c => c.topico_id === t.id);
      if (!conteudos.length) return '';
      const itens = conteudos.map(c => `
        <div class="cad-conteudo tipo-${c.tipo}">
          <span class="cad-tag">${esc(TIPO_CONTEUDO[c.tipo]?.label || c.tipo)}</span>
          ${c.revisado_por_humano ? '' : '<span class="cad-tag rascunho">rascunho</span>'}
          ${c.titulo ? `<b>${esc(c.titulo)}</b><br>` : ''}
          <div class="cad-corpo">${esc(c.corpo)}</div>
          ${c.fonte ? `<div class="cad-fonte">Fonte: ${esc(c.fonte)}</div>` : ''}
        </div>`).join('');
      return `<h3>${esc(t.nome)}</h3>${itens}`;
    }).filter(Boolean).join('');
    return blocos ? `<h2>${esc(disc.nome)}</h2>${blocos}` : '';
  }).filter(Boolean).join('') || '<p class="cad-vazio">Nenhum conteúdo cadastrado ainda.</p>';

  // ---- 2) Resumos aprovados ----
  const aprovados = store.where('resumo', r => r.status === 'aprovado');
  const secResumos = aprovados.length
    ? aprovados.map(r => `
        <div class="cad-resumo"><b>${esc(nomeTopico(r.topico_id))}</b>
          <div class="cad-corpo">${esc(r.texto || '(sem texto)')}</div></div>`).join('')
    : '<p class="cad-vazio">Nenhum resumo aprovado ainda.</p>';

  // ---- 3) Pontos de reforço (faltantes + tópicos marcados ponto fraco) ----
  const faltantes = new Set();
  store.where('resumo', r => r.status === 'incompleto')
    .forEach(r => (r.pontos_faltantes || []).forEach(p => faltantes.add(`${nomeTopico(r.topico_id)}: ${p}`)));
  store.all('topico_progresso').filter(p => p.ponto_fraco)
    .forEach(p => faltantes.add(`${nomeTopico(p.topico_id)} (ponto fraco em questões)`));
  const secReforco = faltantes.size
    ? `<ul>${[...faltantes].map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
    : '<p class="cad-vazio">Nenhum ponto de reforço registrado.</p>';

  // ---- 4) Erros recorrentes (questões com acerto < 50%) ----
  const erros = store.all('questao').map(q => {
    const tents = store.where('tentativa_questao', t => t.questao_id === q.id);
    if (!tents.length) return null;
    const acc = tents.filter(t => t.acertou).length / tents.length;
    return acc < 0.5 ? { q, acc, n: tents.length } : null;
  }).filter(Boolean);
  const secErros = erros.length
    ? erros.map(({ q, acc, n }) => `
        <div class="cad-erro"><b>${esc(nomeTopico(q.topico_id))}</b> — acerto ${Math.round(acc * 100)}% (${n} tent.)
          <div class="cad-corpo">${esc(q.enunciado)}</div>
          <div class="cad-gab">Gabarito: ${esc(gabarito(q))}</div></div>`).join('')
    : '<p class="cad-vazio">Nenhum erro recorrente registrado.</p>';

  // ---- 5) Flashcards ----
  const cards = store.all('flashcard');
  const secCards = cards.length
    ? cards.map(c => `<div class="cad-card"><b>${esc(c.frente)}</b><br><span>${esc(c.verso)}</span></div>`).join('')
    : '<p class="cad-vazio">Nenhum flashcard.</p>';

  return `
    <div class="cad-head">
      <h1>Caderno de revisão</h1>
      <div class="cad-sub">${esc(user?.nome || 'Estudante')} · gerado em ${humanFullData(todayISO())}${diasProva}</div>
      <div class="cad-sub">Concurso ANPD — Especialista em Regulação da Proteção de Dados</div>
    </div>
    <h2 class="cad-sec">1. Conteúdo estudado</h2>${secoesConteudo}
    <div class="cad-break"></div>
    <h2 class="cad-sec">2. Resumos aprovados</h2>${secResumos}
    <h2 class="cad-sec">3. Pontos de reforço</h2>${secReforco}
    <div class="cad-break"></div>
    <h2 class="cad-sec">4. Erros recorrentes</h2>${secErros}
    <div class="cad-break"></div>
    <h2 class="cad-sec">5. Flashcards</h2><div class="cad-cards">${secCards}</div>`;
}

function nomeTopico(id) { const t = store.get('topico', id); return t ? t.nome : '(tópico)'; }
function gabarito(q) {
  if (q.tipo === 'certo_errado') return q.resposta_ce ? 'CERTO' : 'ERRADO';
  const c = (q.alternativas || []).find(a => a.correta);
  return c ? c.texto : '—';
}

/** Renderiza o caderno num container e dispara a impressão (salvar como PDF). */
export function gerarCaderno() {
  let el = document.getElementById('caderno-print');
  if (!el) {
    el = document.createElement('div');
    el.id = 'caderno-print';
    document.body.appendChild(el);
  }
  el.innerHTML = montarHTML();
  const limpar = () => { el.innerHTML = ''; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  window.print();
}
