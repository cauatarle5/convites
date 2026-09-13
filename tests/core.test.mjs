/* =============================================================================
 * tests/core.test.mjs — Teste de regressão das fórmulas-núcleo (SRS + priorização).
 * -----------------------------------------------------------------------------
 * Verifica numericamente o "cérebro" do app (seções 4 e 6 do briefing) sem
 * navegador. Como o projeto é ESM puro sem package.json (site estático), rode a
 * partir da raiz com um package.json temporário:
 *
 *   echo '{"type":"module"}' > package.json && node tests/core.test.mjs; rm -f package.json
 *
 * Saída: uma linha PASS/FAIL por asserção; exit code != 0 se algo falhar.
 * ============================================================================= */
import { novoEstadoSRS, revisar, confianca, taxaErroRecente, INTERVALOS_CAIXA } from '../src/srs.js';
import { prioridadeTopico, BASE_AMORTECIMENTO } from '../src/priority.js';
import { daysBetween, addDaysISO, todayISO } from '../src/store.js';

const HELP = { daysBetween, taxaErroRecente, confianca };
let ok = true;
const chk = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + n); if (!c) ok = false; };
const approx = (a, b, e = 0.02) => Math.abs(a - b) <= e;

/* ---- SRS (Leitner 5 caixas) --------------------------------------------- */
let s = novoEstadoSRS('2026-09-13');
chk('novo SRS box=1 vence hoje', s.box === 1 && s.proxima_revisao === '2026-09-13');
s = revisar(s, 'facil', 5, '2026-09-13', addDaysISO);
chk('facil rápido: box 1->2', s.box === 2 && s.proxima_revisao === addDaysISO('2026-09-13', 3));
const sLento = revisar(novoEstadoSRS('2026-09-13'), 'facil', 45, '2026-09-13', addDaysISO);
chk('facil LENTO (>30s) não promove', sLento.box === 1);
const sEsq = revisar({ box: 4, intervalo_dias: 16, ultima_revisao: null, proxima_revisao: 'x', historico: [{ data: 'a', resultado: 'facil', tempo_s: 1 }] }, 'esqueceu', 3, '2026-09-13', addDaysISO);
chk('esqueceu reseta para box 1', sEsq.box === 1);
const base = { box: 3, intervalo_dias: 7, ultima_revisao: null, proxima_revisao: 'x', historico: [{ data: '1', resultado: 'esqueceu', tempo_s: 1 }, { data: '2', resultado: 'esqueceu', tempo_s: 1 }] };
const sReb = revisar(base, 'facil', 3, '2026-09-13', addDaysISO); // facil ->4, mas acc ult3 = 0.33 < 0.5 => -1 = 3
chk('acc recente baixa aplica rebaixamento extra', sReb.box === 3);
chk('confianca em [0,1]', confianca(s) >= 0 && confianca(s) <= 1);
chk('taxaErroRecente null sem histórico', taxaErroRecente(novoEstadoSRS('x')) === null);
chk('intervalos das caixas', INTERVALOS_CAIXA[1] === 1 && INTERVALOS_CAIXA[5] === 35);

/* ---- Priorização (produto de 5 fatores 0..1) ---------------------------- */
const alto = { peso_estrategico: 'alto' }, medio = { peso_estrategico: 'medio' };
const hoje = todayISO();
const pA = prioridadeTopico({ disciplina: alto, progresso: null, hojeISO: hoje, amortecido: true, helpers: HELP });
const pM = prioridadeTopico({ disciplina: medio, progresso: null, hojeISO: hoje, amortecido: true, helpers: HELP });
chk('novo peso alto ~0.6 (amortecido)', approx(pA.prioridade, 0.6));
chk('novo peso medio ~0.36 (amortecido)', approx(pM.prioridade, 0.36));
chk('fatores forçados p/ tópico novo', pA.fatores.fator_esquecimento === 1 && pA.fatores.fator_atraso === 1 && pA.fatores.fator_desempenho === 0.5 && pA.fatores.fator_dominio === 0);
const pN = prioridadeTopico({ disciplina: alto, progresso: null, hojeISO: hoje, amortecido: false, helpers: HELP });
chk('novo peso alto sem amortecimento = 0.5', approx(pN.prioridade, 0.5));
chk('prioridade sempre em [0,1]', [pA, pM, pN].every(x => x.prioridade >= 0 && x.prioridade <= 1));
const prog = { srs: revisar(novoEstadoSRS(hoje), 'facil', 5, hoje, addDaysISO), confianca_atual: 0 };
const pHoje = prioridadeTopico({ disciplina: alto, progresso: prog, hojeISO: hoje, amortecido: true, helpers: HELP });
chk('tópico revisado hoje é fortemente suprimido', pHoje.prioridade < pA.prioridade * 0.2);
chk('BASE_AMORTECIMENTO = 0.2', BASE_AMORTECIMENTO === 0.2);

console.log('\nRESULT:', ok ? 'ALL PASS' : 'FAILURES');
process.exit(ok ? 0 : 1);
