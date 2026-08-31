// THE NEXT-ACTION BUTTON, EXECUTED (David, 27.8 — "לא עובד בנייד").
//
// He pressed the ▶ and nothing happened. Not a mobile problem: the render path
// and the click path each had their own idea of what the next action was.
// Rendering fell back to the plain sentence when the server sent no typed plan;
// the click read res.next_action with NO fallback. So against the currently
// deployed build the pill drew itself, he pressed it, and it did nothing.
//
// These tests RUN the real functions out of lia.html rather than reading them
// as text, because a text check would have passed on the broken version — both
// paths existed, they simply disagreed.
//   node test-next-action.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
const { nextActionOf, nextActionText } = new Function(
  /* runNext became async (chat_action_run round) — the end anchor must name
     the full declaration or the slice ends on a dangling `async`. */
  slice('function nextActionOf', 'async function runNext')
  + '\nreturn { nextActionOf, nextActionText };')();

let bad = 0, total = 0;
function ok(label, cond, detail) {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`); bad++; }
  else console.log(`PASS  ${label}`);
}

// ── THE LIVE FAILURE ───────────────────────────────────────────────────────
// The exact answer shape the DEPLOYED build returns today: a sentence, and no
// next_action object at all. This is what was on his screen.
const deployedShape = {
  answer: '…',
  recommended_next_action: 'לפתוח את הטיוטות הממתינות ולסמן אילו מהן מבטלים לפני כל אישור.',
};

ok('LIVE: the deployed shape still produces a pressable action',
  (() => { const a = nextActionOf(deployedShape); return !!(a && a.button && a.mode !== 'NONE'); })(),
  'this is the exact regression: the pill rendered and the click found nothing');

ok('LIVE: and the click produces the instruction that carries it out',
  (() => {
    const a = nextActionOf(deployedShape);
    return nextActionText(a).startsWith('בצעי: לפתוח את הטיוטות');
  })());

// ── THE TWO PATHS AGREE ────────────────────────────────────────────────────
// The bug was an ASYMMETRY, so the test is symmetry: whatever the renderer
// would draw a button for, the click must find the same action for.
for (const [name, res] of [
  ['typed plan', { next_action: { label: 'לבדוק מכירות', mode: 'RUN', button: 'בצעי', cap: 'business_query' } }],
  ['legacy sentence', { recommended_next_action: 'לבדוק מול אורנה' }],
  ['both present', { next_action: { label: 'מוטפס', mode: 'RUN', button: 'בצעי' }, recommended_next_action: 'ישן' }],
  ['nothing at all', {}],
  ['explicit no action', { recommended_next_action: 'אין כרגע פעולה שנדרשת ממך.' }],
]) {
  const a = nextActionOf(res);
  const renderable = !!(a && a.label);
  const clickable = !!(a && a.label && a.mode !== 'NONE' && a.button);
  ok(`SYMMETRY (${name}): render and click see the same action`,
    // A rendered pill is either pressable or explicitly inert — never a button
    // that looks alive and does nothing.
    !renderable || clickable || a.mode === 'NONE',
    JSON.stringify(a));
}

ok('TYPED: a typed plan wins over the legacy sentence',
  nextActionOf({ next_action: { label: 'מוטפס', mode: 'RUN', button: 'בצעי' }, recommended_next_action: 'ישן' }).label === 'מוטפס');

ok('EMPTY: no action at all yields nothing to draw',
  nextActionOf({}) === null && nextActionOf(null) === null);

ok('NO-ACTION: "אין כרגע פעולה" never sprouts a button',
  (() => { const a = nextActionOf({ recommended_next_action: 'אין כרגע פעולה שנדרשת ממך.' }); return a.mode === 'NONE' && !a.button; })());

ok('NO-ACTION: but a real action starting with a different word still works',
  (() => { const a = nextActionOf({ recommended_next_action: 'אינטגרציה מול אורנה' }); return a.mode === 'ASK' && !!a.button; })(),
  'the guard must match the word "אין", not any word beginning with it');

// ── THE WORDS MATCH WHO ACTS ───────────────────────────────────────────────
ok('WORDS: RUN says she does it',
  nextActionText({ label: 'לבדוק X', mode: 'RUN', cap: 'business_query' }).startsWith('בצעי: לבדוק X'));
ok('WORDS: QUEUE with a capability prepares, never sends',
  nextActionText({ label: 'לענות לרחל', mode: 'QUEUE', cap: 'outbound_decide' }) === 'הכיני לאישור: לענות לרחל');
ok('WORDS: QUEUE without one goes to his decisions',
  nextActionText({ label: 'להחליט על מחיר', mode: 'QUEUE' }) === 'הוסיפי להחלטות שלי: להחליט על מחיר');
ok('WORDS: DRAFT names the person who must act',
  nextActionText({ label: 'להרחיב הרשאה', mode: 'DRAFT', to: 'אורנה' }) === 'נסחי בקשה לאורנה: להרחיב הרשאה');

// ── THE MARKUP ─────────────────────────────────────────────────────────────
ok('MARKUP: the button passes itself, so only the pressed one is disabled',
  /onclick="runNext\('\+i\+',this\)"/.test(src),
  'disabling every pill on the page would kill the buttons on older answers');
ok('MARKUP: type="button" — inside a form a bare button submits instead',
  /<button type="button" class="nextPill act"/.test(src));
ok('MARKUP: the click path uses the shared plan, not its own lookup',
  /const na=nextActionOf\(turn\.res\)/.test(src),
  'reading res.next_action directly is the bug that was just fixed');
ok('MARKUP: a tap while she is mid-turn says so instead of doing nothing silently',
  /if\(busy\(\)\)\{stat\(/.test(src));

console.log(`\n${total - bad}/${total} passed`);
process.exit(bad ? 1 : 0);
