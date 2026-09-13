/* ui.js — helpers de DOM, badges e modal reutilizáveis pelas telas. */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** cria um elemento a partir de HTML string */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---- badges ------------------------------------------------------------- */
export function badgeEdital(status) {
  return status === 'confirmado'
    ? `<span class="badge confirmado">✓ edital confirmado</span>`
    : `<span class="badge provisorio">⚠ pré-edital, sujeito a mudança</span>`;
}
export function badgePeso(peso) {
  return peso === 'alto'
    ? `<span class="badge peso-alto">peso alto</span>`
    : `<span class="badge peso-medio">peso médio</span>`;
}

export const TIPO_CONTEUDO = {
  texto_legal:            { label: 'texto legal',            desc: 'transcrição literal da fonte oficial' },
  interpretacao_oficial:  { label: 'interpretação oficial',  desc: 'baseada em guia/nota técnica da ANPD' },
  explicacao_didatica:    { label: 'explicação didática (IA)', desc: 'apoio pedagógico — pode conter erro' },
  hipotese_de_cobranca:   { label: 'hipótese de cobrança',   desc: 'aposta sobre a prova — chute qualificado' },
};
export function badgeTipoConteudo(tipo) {
  const t = TIPO_CONTEUDO[tipo] || { label: tipo };
  return `<span class="badge tipo-${tipo}">${esc(t.label)}</span>`;
}
export function badgeRevisado(revisado) {
  return revisado ? '' : `<span class="badge rascunho">rascunho · não revisado</span>`;
}

/* ---- modal -------------------------------------------------------------- */
let onClose = null;
let ultimoFoco = null;   // elemento a receber o foco de volta ao fechar
let onKeydown = null;    // handler de Escape + trap de Tab
const FOCUSAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function openModal(innerHTML, opts = {}) {
  ultimoFoco = document.activeElement;
  const root = document.getElementById('modal-root');
  const titId = 'm-title';
  root.innerHTML = `
    <div class="modal-back" id="mb">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titId}" tabindex="-1">
        <div class="row close">
          <h2 style="flex:1" id="${titId}">${esc(opts.title || '')}</h2>
          <button class="btn ghost sm" id="m-x" aria-label="Fechar">✕</button>
        </div>
        <div id="m-body">${innerHTML}</div>
      </div>
    </div>`;
  onClose = opts.onClose || null;
  const back = document.getElementById('mb');
  const dialog = back.querySelector('.modal');
  document.getElementById('m-x').onclick = closeModal;
  back.onclick = e => { if (e.target === back) closeModal(); };

  // Escape fecha; Tab faz o ciclo (trap) dentro do modal.
  onKeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const foc = [...dialog.querySelectorAll(FOCUSAVEIS)].filter(el => el.offsetParent !== null);
    if (!foc.length) return;
    const first = foc[0], last = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKeydown);

  // Foco inicial: primeiro campo/controle do corpo, senão o próprio diálogo.
  const alvo = document.getElementById('m-body').querySelector(FOCUSAVEIS) || dialog;
  setTimeout(() => alvo.focus(), 0);

  return document.getElementById('m-body');
}
export function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  if (onKeydown) { document.removeEventListener('keydown', onKeydown); onKeydown = null; }
  const cb = onClose; onClose = null;
  if (ultimoFoco && ultimoFoco.focus) { try { ultimoFoco.focus(); } catch { /* ignora */ } }
  ultimoFoco = null;
  if (cb) cb();
}

/* ---- misc --------------------------------------------------------------- */
export function toast(msg) {
  const t = h(`<div role="status" aria-live="polite"
    style="position:fixed;left:50%;bottom:90px;transform:translateX(-50%);
    background:var(--surface-2);border:1px solid var(--line);color:var(--ink);
    padding:10px 16px;border-radius:999px;z-index:200;box-shadow:var(--shadow);font-weight:600">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

export function fmtMin(m) {
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}
