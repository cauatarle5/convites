/* =============================================================================
 * app.js — bootstrap + roteador (hash router). Ponto de entrada.
 * ============================================================================= */
import { initStore } from './store.js';
import { render, setRefresh, atualizarCountdown } from './views.js';
import { detectarIA } from './ia.js';

function parseHash() {
  const raw = (location.hash || '#/hoje').replace(/^#\//, '');
  const [route, ...rest] = raw.split('/');
  return { route: route || 'hoje', params: { id: rest[0] } };
}

function currentRoute() { return parseHash(); }

function marcarTab(route) {
  document.querySelectorAll('nav.tabs a').forEach(a => {
    const tab = a.dataset.tab;
    // 'topico' pertence à seção Conteúdo
    const ativo = tab === route || (route === 'topico' && tab === 'conteudo');
    a.classList.toggle('active', ativo);
    if (ativo) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function navigate() {
  const { route, params } = currentRoute();
  render(route, params);
  marcarTab(route);
  window.scrollTo(0, 0);
}

function boot() {
  initStore();
  setRefresh(() => {
    // re-render mantendo a rota atual (memória de progresso: nunca perde o fio)
    const { route, params } = currentRoute();
    render(route, params);
    atualizarCountdown();
  });
  window.addEventListener('hashchange', navigate);
  if (!location.hash) location.hash = '#/hoje';
  atualizarCountdown();
  navigate();
  registrarServiceWorker();
  // Detecta IA no mesmo domínio (Pages Functions em /api). Se achar, re-renderiza
  // para os botões de IA aparecerem sem configuração manual.
  detectarIA().then(ok => { if (ok) navigate(); });
}

/* PWA: registra o service worker (offline + instalável). Falha silenciosa em
 * contextos sem SW (ex.: file://) — o app continua funcionando normalmente. */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sem PWA, tudo bem */ });
  });
}

boot();
