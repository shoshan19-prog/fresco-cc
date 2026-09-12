// ASK-IN-A-ROW + THE YAELI MICROPHONE (David, 1.9), pinned.
//
// lia.html: a typed QUESTION no longer waits for the one in flight — each ask
// owns a pending bubble and its answer lands in it, in place. Everything with
// side effects (notes, actions, files) and the microphone stay single-turn.
// yaeli.html: mic (browser speech → Whisper fallback via the lia transcribe
// route) and the same non-blocking ask pattern.
//   node test-ask-row.mjs
import { readFileSync } from 'node:fs';

const lia = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const yaeli = readFileSync(new URL('./yaeli.html', import.meta.url), 'utf8');
let passed = 0, failed = 0;
const check = (n, f) => { try { f(); passed++; console.log('PASS ', n); } catch (e) { failed++; console.log('FAIL ', n, '—', e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };

// ── LIA: the blanket gate is gone, the guards that matter stayed ───────────
check('LIA: the blanket "request in flight" return is out of sendPrimary', () => {
  assert(!/if\(TURN==='PROCESSING'\)return;\s*\/\/ a request is in flight/.test(lia),
    'typed questions still wait for the previous one');
});
check('LIA: actions (DO/EXECUTE) still run one at a time', () => {
  assert(/פעולות רצות אחת-אחת/.test(lia), 'an action could start on top of a live turn');
});
check('LIA: attachments still take the single turn', () => {
  assert(/מסיימת את הקודמת ואז אסתכל על הקובץ/.test(lia));
});
check('LIA: an overflow ask gets its own id; a double-send of the same words within 900ms is one', () => {
  assert(/if\(intent!=='ASK'\)return;/.test(lia), 'non-ask intents can overflow the turn');
  assert(/LASTSEND\.t&&Date\.now\(\)-LASTSEND\.at<900/.test(lia), 'no double-tap guard');
});
check('LIA: every ask owns a pending bubble and resolves IT (answers glued to questions)', () => {
  assert(/function addPendingTurn\(\)/.test(lia) && /function resolvePendingTurn\(/.test(lia));
  assert(/const ph=addPendingTurn\(\);/.test(lia), 'doAsk does not take a pending bubble');
  assert(/finishAsk\(ph,res,spokenAnswer\(res\)\)/.test(lia), 'the answer does not land in its bubble');
});
check('LIA: the turn machine is released by the LAST resolver; overlapped answers are text, not two voices', () => {
  assert(/if\(INFLIGHT>0\)return;\s*\/\/ others still thinking/.test(lia.replace(/ /g, ' ')) || /INFLIGHT>0\)return;/.test(lia));
  assert(/if\(overlapped\)\{setMode\('idle'\);endTurn\(\);\}/.test(lia), 'overlap does not release the turn silently');
  assert(/if\(INFLIGHT===1\)speak\(filler\(\)\)/.test(lia), 'every overlapping ask would speak a filler');
});
check('LIA: the repeat brake fires only when the QUESTION repeats — never across two different asks', () => {
  assert(/const sameAsk=prevAsks\.indexOf\(norm\(text\)\)>=0;/.test(lia), 'no same-question guard');
  assert(/if\(sameAsk&&isRepeatAnswer\(res\.answer,prevAnswers\)\)/.test(lia), 'the brake still fires on different questions');
  assert(/t\.role==='lia'&&!t\.pending/.test(lia), 'pending bubbles counted as previous answers');
});
check('LIA: the composer stays LIVE while she thinks — the send button is never disabled by thinking mode', () => {
  assert(!/m==='thinking'\)\{\s*if\(S\)\{S\.disabled=true/.test(lia), 'thinking mode still locks the send button');
  assert(/שלח שאלה נוספת/.test(lia), 'the button does not invite the next question');
});
check('LIA: an unanswered ask never pairs as an answer in kernel history', () => {
  assert(/else if\(t\.pending\)continue;/.test(lia), 'pending bubbles leak into {q,a} history');
});
// The pairing law, executed — not just grepped.
check('LIA: historyForKernel truly skips pending bubbles (executed)', () => {
  const m = lia.match(/function historyForKernel\(currentText\)\{[\s\S]*?\n return out\.slice\(-4\);\}/);
  assert(m, 'could not slice historyForKernel');
  const SESSION = { turns: [
    { role: 'me', text: 'שאלה 1' }, { role: 'lia', text: 'תשובה 1' },
    { role: 'me', text: 'שאלה 2' }, { role: 'lia', text: '⏳ חושבת על זה…', pending: true },
    { role: 'me', text: 'שאלה 3' }, { role: 'lia', text: 'תשובה 3' },
  ] };
  const fn = new Function('SESSION', 'ENTITY_Q', m[0] + '; return historyForKernel("מה?");');
  const out = fn(SESSION, undefined);
  assert(out.length === 2, `paired ${out.length}, expected 2`);
  assert(out[0].a === 'תשובה 1' && out[1].a === 'תשובה 3', JSON.stringify(out));
  assert(!out.some((p) => /חושבת/.test(p.a)), 'a pending bubble was sent as an answer');
});

// ── LIA: the stuck bubble can no longer exist (David's photo, 1.9) ─────────
check('LIA: a restored session finalizes orphaned pending bubbles — no eternal חושבת', () => {
  assert(/if\(t&&t\.pending\)\{t\.pending=false;/.test(lia.replace(/\n /g, '')) ||
    /for\(const t of SESSION\.turns\)if\(t&&t\.pending\)/.test(lia),
    'restored pending bubbles keep spinning');
  assert(/נשארה בלי תשובה/.test(lia), 'the orphaned bubble is not closed honestly');
});
check('LIA: every ask carries a 150s watchdog; finishAsk releases the machine exactly once', () => {
  assert(/ph\.__wd=setTimeout\(/.test(lia), 'no watchdog on the pending bubble');
  assert(/150000\)/.test(lia), 'the watchdog is not the platform ceiling (150s)');
  assert(/if\(ph&&ph\.__wd\)\{clearTimeout\(ph\.__wd\);delete ph\.__wd;\}/.test(lia), 'a normal finish leaves the watchdog armed');
  assert(/const late=!!\(ph&&ph\.__done\);/.test(lia) && /if\(late\)return;/.test(lia),
    'a late answer would double-release the turn machine');
});
check('LIA: the self-diagnosis path disarms its watchdog before removing the bubble', () => {
  const i = lia.indexOf('res.self_diagnosis');
  assert(i > 0 && /clearTimeout\(ph\.__wd\)/.test(lia.slice(i, i + 400)),
    'the keyless road leaves a live watchdog on a removed bubble');
});
check('LIA: an unwired KPI names its gap instead of dead-ending', () => {
  // Anchor on the DECLARATION: the first 'KPI_GAP_DETAIL' in the file is its
  // usage inside kpiDetailLines, and slicing from there ends at KPI_LABEL's
  // '};' — a slice that "passed" only because KPI_LABEL shares the keys.
  const map = lia.split('const KPI_GAP_DETAIL')[1].split('};')[0];
  for (const key of ['open_orders', 'unbilled', 'receivables', 'gross_profit']) {
    assert(new RegExp(key + ':').test(map), `${key} has no named gap`);
  }
});
check("LIA: the open-orders tile carries David's rulings — 1.9: open = BOOLCLOSED empty (בביצוע/טיוטא tally for a contract row); 12.9: the headline is the TRUE remaining backlog from the one engine", () => {
  assert(/r\.engine==='fresco_snapshot'\)return r\.headline_count\+' פתוחות'\+\(r\.remaining!=null\?' · '\+money\(r\.remaining\)\+' יתרה':''\)/.test(lia), 'the engine row must headline the remaining backlog (null → count only, §9)');
  assert(/יתרה לספק \(צבר אמיתי\)/.test(lia) && /הזמנות מסגרת:/.test(lia), 'the engine detail must show the remaining value, the original, and the framework remaining');
  assert(/function openOrdersKpiText\(/.test(lia) && /פתוחות'\+\(r\.at_cap\?' לפחות':''\)/.test(lia),
    'the headline is not the honest total (with the page-cap floor)');
  // The live status value is "בבצוע" (no yud); the display label is David's
  // word "בביצוע". Both must appear — data matched honestly, labeled his way.
  assert(/by_status\['בבצוע'\]/.test(lia), 'the tile does not read the real live status value');
  assert(/בביצוע/.test(lia), 'the ruling\'s label is missing');
  assert(/סה"כ פתוחות/.test(lia), 'no total line in the detail');
  assert(/r\.open_definition/.test(lia), 'the definition is not surfaced');
});
check("LIA: David's rulings are recorded on the tiles' gap details (4.9: unbilled + receivables wired; 1.9: gross profit still honest)", () => {
  const gaps = lia.split('const KPI_GAP_DETAIL')[1].split('};')[0];
  assert(/unbilled:'תעודות משלוח IVALL=N מה-1 של החודש הקודם \(הכרעת דוד 4\.9/.test(gaps), 'the unbilled ruling (IVALL=N, from the 1st of the previous month since the 11.9 snapshot) is not recorded');
  assert(/receivables:'חייבים = KPI מאומת של חוזה receivables \(הכרעת דוד 4\.9\)/.test(gaps), 'the receivables ruling (the verified KPI, read only when ≤24h fresh) is not recorded');
  assert(/עד מקור עלות אמין/.test(gaps), 'the gross-profit ruling is not recorded');
});
check("LIA (12.9): ONE CANONICAL ENGINE — the tiles read fresco_snapshot (the engine the chat's Pulse/Snapshot answer from), never per-tile contracts or a second cache", () => {
  const rails = lia.slice(lia.indexOf('async function loadRails(){'), lia.indexOf('function kpisFromSnapshot('));
  assert(/cap\('fresco_snapshot',\{\}\)/.test(rails), 'the rail does not read the canonical engine');
  assert(!/cap\('business_query'/.test(rails) && !/loadScanKpis/.test(lia) && !/intent:'unbilled'/.test(lia) && !/intent:'receivables'/.test(lia) && !/intent:'open_orders'/.test(lia), 'a per-tile contract or the old scan path is still fetched');
  assert(/RAILS\.kpis=kpisFromSnapshot\(s\);/.test(rails) && /function kpisFromSnapshot\(s\)/.test(lia), 'the snapshot row is not adapted to the tiles');
  const adapt = lia.slice(lia.indexOf('function kpisFromSnapshot('), lia.indexOf('const HARNESS_RE='));
  assert(adapt.length > 200 && adapt.length < 6000, `adapter slice ${adapt.length}`);
  assert(/remaining:oo\.all_verified\?oo\.open_value:null/.test(adapt), 'open orders must carry the TRUE remaining backlog, null when a line did not verify (§9)');
  assert(/receivables:rc\?\{headline_count:rc\.count,sums:\{TOTPRICE:rc\.total/.test(adapt) && /gross_profit:d\.gross_profit\|\|null/.test(adapt), 'receivables / gross profit are the engine\'s fields, copied — never recomputed');
  assert(/status:s\.verdict\?\{verdict:s\.verdict/.test(adapt), 'the verdict (score, forecast, action) must reach a tile');
  assert(/\['status','מצב פרסקו',statusKpiText\(k\.status\),statusKpiNote\(k\.status\)/.test(lia), 'no status tile');
  assert(/r\.engine==='fresco_snapshot'\|\|\(r\.capabilities_used\|\|\[\]\)\.some\(c=>c==='fresco_snapshot'\|\|c==='fresco_pulse'\)/.test(lia), 'a Pulse/Snapshot chat answer does not route to the status tile');
  assert(/function unbilledKpiText\(/.test(lia) && /function receivablesKpiText\(/.test(lia), 'no headline builders for the two tiles');
  assert(/unbilledKpiText\(k\.unbilled\)/.test(lia) && /receivablesKpiText\(k\.receivables\)/.test(lia), 'the tiles do not read RAILS.kpis');
  assert(/r\.excluded\.billed_via_order/.test(lia) && /r\.aging\[b\]/.test(lia) && /בפיגור \(פריוריטי\)/.test(lia), 'the details do not show what was excluded / the aging / Priority\'s own overdue');
  assert(/function kpiAgeLine\(/.test(lia) && /r\.cached\?'מהמטמון/.test(lia), 'a cached row must say so and how old it is');
});

// ── YAELI: the microphone and the same non-blocking asks ───────────────────
check('YAELI: a microphone button exists beside שלח', () => {
  assert(/id="mic"/.test(yaeli) && /toggleMic\(\)/.test(yaeli));
});
check('YAELI: two engines — browser speech first, Whisper fallback through the lia transcribe route', () => {
  assert(/SpeechRecognition\|\|window\.webkitSpeechRecognition/.test(yaeli));
  assert(/API\+'&transcribe'/.test(yaeli), 'no server transcription fallback');
  assert(/x-audio-type/.test(yaeli), 'audio type header missing');
});
check('YAELI: a transcript becomes a SENT question — a talk, not a form', () => {
  assert(/if\(t\)send\(t\);/.test(yaeli), 'the transcript does not auto-send');
});
check('YAELI: asks never block each other; each answer fills its own bubble', () => {
  assert(!/if\(BUSY\)return/.test(yaeli), 'the composer still blocks while thinking');
  assert(/function fillBubble\(/.test(yaeli) && /fillBubble\(w,ans/.test(yaeli));
  assert(/let INFLIGHT=0/.test(yaeli));
});
check('YAELI: recording is explicit — tap to start, visible state, tap to stop', () => {
  assert(/setRec\(true\)/.test(yaeli) && /setRec\(false\)/.test(yaeli) && /#mic\.rec/.test(yaeli));
});

// ── THE MOBILE COMMS LAW (David, 2.9) — diagnostics behind פתחי פרטים ──────
check('COMMS: the client demotion mirror exists, with the server\'s whitelist', () => {
  assert(/function demoteDiag\(/.test(lia), 'no client demotion');
  assert(/const CANON_LABELS=\['PROJECT','BIGGEST PROGRESS'/.test(lia), 'no shared whitelist');
  assert(/flags\.filter\(Boolean\)\.length<2/.test(lia), 'a single stray label would be demoted');
});
check('COMMS: the bubble renders the CLEAN text; an all-dump reply says where the report went', () => {
  assert(/const dg=demoteDiag\(t\.text\);/.test(lia), 'the bubble ignores the demotion');
  assert(/dg\.tech\.length\?\(dg\.clean\|\|TECH_FALLBACK\):t\.text/.test(lia), 'clean/fallback selection missing');
  assert(/הדוח הטכני המלא הועבר לראיות ופרטים/.test(lia), 'no fallback line');
});
check('COMMS: the technical report renders ONLY in the drawer — LTR, isolated, monospace, wrapped', () => {
  assert(/r&&r\.technical_report\)\|\|\[\],demoteDiag\(txt\|\|''\)\.tech/.test(lia),
    'the drawer misses server-demoted or client-demoted lines');
  assert(/<pre class="tech" dir="ltr">/.test(lia), 'no LTR technical block');
  const css = lia.split('.tech{')[1]?.split('}')[0] || '';
  assert(/direction:ltr/.test(css) && /unicode-bidi:isolate/.test(css) && /monospace/.test(css),
    'the .tech CSS lost its bidi isolation');
  assert(/overflow-wrap:anywhere/.test(css) && /max-width:100%/.test(css), 'the .tech block can overflow a phone');
});
check('COMMS: answer lines take their own direction (plaintext bidi) and cannot overflow', () => {
  const css = lia.split('.msg.lia .bubble{')[1]?.split('}')[0] || '';
  assert(/unicode-bidi:plaintext/.test(css) && /text-align:start/.test(css), 'RTL still shreds English lines');
  assert(/overflow-wrap:anywhere/.test(css), 'a long token can force horizontal scroll');
});

console.log(`\n${passed}/${passed + failed} asserts passed`);
process.exit(failed ? 1 : 0);
