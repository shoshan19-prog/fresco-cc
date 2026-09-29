// One tap copies what was actually said (David, 28.9 — "שיחה קודם, מערכת אחר כך").
// Both sides of the conversation carry a role mark and a copy control; the copy is
// the full original text — David's verbatim, LIA's as he reads it — with line
// breaks kept and the demoted diagnostic labels left out.
//   node test-copy.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
const lineOf = (from) => { const a = src.indexOf(from); return src.slice(a, src.indexOf('\n', a)); };
const { copyTextOf, copyBtn } = new Function(
  lineOf('function esc(s)') + '\n'
  + slice('const HE_TERMS', 'function heb(x)') + lineOf('function heb(x)') + '\n'
  + slice('const NO_CHECK', 'function detailsHtml(r,txt)') + '\n'
  + slice('function copyTextOf', 'async function copyTurn') + '\n'
  + 'return { copyTextOf, copyBtn };')();

let bad = 0, total = 0;
function eq(label, got, want) { total++; if (got !== want) { console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); bad++; } }
function ok(label, cond) { total++; if (!cond) { console.log(`FAIL  ${label}`); bad++; } }

// David's side: the full original, line breaks kept — even when the bubble shows the execution summary
eq('David: verbatim with line breaks', copyTextOf({ role: 'me', text: 'שורה ראשונה\nשורה שנייה\n\nשלישית' }), 'שורה ראשונה\nשורה שנייה\n\nשלישית');
const full = 'ליה, תבני את המסך.\n1. פתיחה נקייה\n2. פרטי מערכת בהמשך המסך';
eq('David: an execution prompt copies the whole instruction, not the one-line summary', copyTextOf({ role: 'me', text: full, exec: { sum: 'ליה, תבני את המסך.', n: 3 } }), full);
// LIA's side: exactly what he reads
eq('LIA: a plain answer, line breaks kept', copyTextOf({ role: 'lia', text: 'א\nב', res: { __plain: true } }), 'א\nב');
eq('LIA: demoted diagnostic labels are not copied — they are metadata, not the answer',
  copyTextOf({ role: 'lia', text: 'הזמנה 174 נטענה היום.\nSTATUS: ok\nBLOCKER: none', res: null }), 'הזמנה 174 נטענה היום.');
eq('LIA: the canonical status labels David mandated stay in the copy', copyTextOf({ role: 'lia', text: 'PROJECT: פרסקו\nNEXT: לחייב', res: null }), 'PROJECT: פרסקו\nNEXT: לחייב');
eq('LIA: the copy matches the bubble — the same term translation', copyTextOf({ role: 'lia', text: 'PROPOSED', res: { __plain: true } }), 'ממתין לאישור');
eq('LIA: a pending placeholder copies nothing', copyTextOf({ role: 'lia', text: '⏳ חושבת על זה…', pending: true }), '');
eq('LIA: a contradicted no-check sentence copies the data lead the bubble shows', copyTextOf({ role: 'lia', text: 'לא בדקתי בפועל', res: { facts: ['14 הזמנות'] } }), 'הנה מה שמצאתי במערכות:');
// the control
const b = copyBtn(3, 'העתק את התשובה');
ok('the control is a real button with the label for a screen reader', /^<button type="button" class="cp" onclick="copyTurn\(3,this\)" title="העתק" aria-label="העתק את התשובה">⧉<\/button>$/.test(b));
ok('both sides render the role tag and the copy control', src.includes(`<div class="msg me"><div class="who"><span class="tag">אתה</span>'+copyBtn(i,'העתק את ההודעה שלך')+'</div>`) && src.includes(`<div class="msg lia"><div class="who"><span class="tag">LIA</span>'+(t.pending?'':copyBtn(i,'העתק את התשובה'))+'</div>`));
ok('the confirmation has a polite live region and a visible ✓ on the control', html.includes('<div id="copyLive" class="srOnly" aria-live="polite"></div>') && src.includes("btn.textContent=ok?'✓':'!'"));
ok('clipboard API first, textarea fallback second — both under the user tap', src.includes('navigator.clipboard.writeText(s)') && src.includes("document.execCommand('copy')"));
ok('role marks: David blue, LIA her orb; David\'s bubble has the accent edge', html.includes('.msg.me .who .tag::before{background:var(--acc)}') && html.includes('.msg.lia .who .tag::before{background:radial-gradient') && html.includes('.msg.me .bubble{border-inline-start:3px solid var(--acc)}'));
ok('the phone gets a real tap target for the copy control', html.includes(' .msg .cp{width:32px;height:32px;font-size:14px}'));
ok('nothing else moved: the evidence and explain controls are still the two under the answer', src.includes(`<button class="det" onclick="toggleDeep('+i+')" title="ראיות ופרטים"`) && src.includes(`<button class="det" onclick="explainTurn('+i+')" title="תסבירי פשוט"`));
ok('the build stamp moved', /const LIA_BUILD='2026-09-29\.2';/.test(src));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
