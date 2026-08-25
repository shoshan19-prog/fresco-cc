// Conversation-session behaviour, verified offline against the real lia.html.
// The point being locked: the timeline David reads and the history the kernel
// reasons over are ONE array — plus that a refresh restores it.
//   node test-session.mjs
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./lia.html', import.meta.url), 'utf8')
  .match(/<script>([\s\S]*)<\/script>/)[1];
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`missing ${a}`); return src.slice(i, j); };

let bad = 0, total = 0;
const check = (l, c) => { total++; if (!c) { console.log('FAIL  ' + l); bad++; } };

// a minimal localStorage + the session block lifted straight from the panel
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.document = { getElementById: () => null };
const entityQ = src.match(/const ENTITY_Q=[^\n]+/)[0] + '\n';
const block = entityQ + cut("const SKEY='lia_sessions'", 'function nearBottom')
  // one counter across module instances, so a "fresh page" cannot re-mint an old id
  + 'function uuid(){return "id-"+(globalThis.__n=(globalThis.__n||0)+1);}'
  + 'function clip(s,n){s=(s||"").trim();return s.length>n?s.slice(0,n)+"…":s;}'
  + 'function renderThread(){}function esc(s){return s;}'
  + 'function closePanel(){}function renderSessions(){}'
  + '\nreturn {openSession,addTurn,historyForKernel,newSession,get SESSION(){return SESSION;}};';
const M = new Function(block)();

M.openSession();
const first = M.SESSION.id;
M.addTurn('me', 'מה קורה עם לקוח למדא?');
M.addTurn('lia', 'בדקתי. המכירות שלהם ירדו החודש.', { answer: 'x' });
M.addTurn('me', 'למה?');
M.addTurn('lia', 'שני דברים השתנו.', { answer: 'y' });

check('every turn is kept in order', M.SESSION.turns.map(t => t.role).join(',') === 'me,lia,me,lia');
const h = M.historyForKernel();
check('history is derived, paired q/a', h.length === 2 && h[0].q === 'מה קורה עם לקוח למדא?' && h[1].q === 'למה?');
check('history carries LIA answers, not placeholders', h[0].a.startsWith('בדקתי'));
check('follow-up stays under the original question', M.SESSION.turns[2].text === 'למה?');

// a refresh: same storage, fresh module state
const M2 = new Function(block)();
M2.openSession();
check('refresh restores the same session', M2.SESSION.id === first);
check('refresh restores every turn', M2.SESSION.turns.length === 4);
check('refresh restores the kernel history too', M2.historyForKernel().length === 2);

// history is bounded, the visible thread is not truncated to match
for (let i = 0; i < 6; i++) { M2.addTurn('me', 'q' + i); M2.addTurn('lia', 'a' + i, { answer: 'z' }); }
check('kernel history stays bounded to 4 exchanges', M2.historyForKernel().length === 4);
check('kernel history keeps the MOST RECENT exchanges', M2.historyForKernel()[3].q === 'q5');
check('the visible thread keeps everything', M2.SESSION.turns.length === 16);

// a new conversation does not destroy the old one
M2.newSession();
check('new session starts empty', M2.SESSION.turns.length === 0);
check('new session has a new id', M2.SESSION.id !== first);
const idx = JSON.parse(store['lia_sessions']);
check('the previous conversation is still listed', idx.some(s => s.id === first));
check('the previous conversation body survives', !!store['lia_s_' + first]);

// one canonical source: nothing else may hold a parallel history
check('no separate HISTORY array remains', !/\blet\s+HISTORY\b/.test(src));
check('kernel calls send the derived history, with the current turn for context filtering',
  (src.match(/history:historyForKernel\(text\)/g) || []).length === 2);


// ── the Orna loop, second carrier: image-description turns leave the context
// of an entity question (and ONLY that request's context — the turns stay).
M.addTurn('me', 'מה יש בתמונה?');
M.addTurn('lia', 'בתמונה נראית חתימת מייל של אורנה שלם');
M.addTurn('me', 'מה הסיפור עם בן זיו?');
M.addTurn('lia', 'בן זיו: הפרויקט הסתיים');
check('entity question: image-description pairs are filtered from ITS history',
  !M.historyForKernel('מה קורה עם בן זיו?').some(p => /בתמונה/.test(p.a)));
check('an ordinary question keeps the full history',
  M.historyForKernel('מה עוד היה?').some(p => /בתמונה/.test(p.a)));
check('an entity question that mentions the picture keeps it',
  M.historyForKernel('מה הסיפור עם בן זיו בתמונה?').some(p => /בתמונה/.test(p.a)));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
