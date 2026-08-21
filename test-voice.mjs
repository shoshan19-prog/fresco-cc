// What LIA sounds like on the phone. Everything here is checked against what a
// speech engine would literally read out — markdown stars, bullet dashes and the
// · separator are all spoken, and that is most of what made her sound like a
// machine. Extracts the real functions from lia.html so this cannot drift.
//   node test-voice.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
const speech = slice('function spokenText', 'let LAST=null');
const { spokenText, speakable } = new Function(speech + '\nreturn {spokenText, speakable};')();
const { filler, FILLERS } = new Function(
  slice('let _fill=0;', 'function pickVoice') + '\nreturn {filler, FILLERS};')();
const { firstClause } = new Function(
  slice('function firstClause', '\nfunction askYesNo') + '\nreturn {firstClause};')();

let bad = 0, total = 0;
function eq(label, got, want) {
  total++;
  if (got !== want) { console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); bad++; }
}
function ok(label, cond) { total++; if (!cond) { console.log(`FAIL  ${label}`); bad++; } }

// --- nothing that is punctuation on a screen may reach the ear --------------
eq('markdown emphasis is never spoken',
  spokenText('זה **חשוב** מאוד'), 'זה חשוב מאוד');
eq('bullet markers are dropped, not read as dashes',
  spokenText('- ראשון\n- שני'), 'ראשון. שני');
eq('the · separator becomes a comma, not a full stop',
  spokenText('מכירות · קריאה חיה'), 'מכירות, קריאה חיה');
eq('bracketed asides stay on the screen',
  spokenText('שלושה פרויקטים (לפי הזמנות) מתקרבים'), 'שלושה פרויקטים מתקרבים');
eq('URLs are not read aloud',
  spokenText('הפרטים כאן https://example.com/x סוף'), 'הפרטים כאן סוף');
eq('an em dash becomes a breath',
  spokenText('דחוף — צריך לענות היום'), 'דחוף, צריך לענות היום');
eq('ellipsis does not become three separate stops',
  spokenText('רגע…'), 'רגע.');
eq('doubled punctuation is collapsed', spokenText('באמת?? כן..'), 'באמת? כן.');
eq('a clean sentence passes through untouched',
  spokenText('מורן מחכה לתשובה כבר יומיים.'), 'מורן מחכה לתשובה כבר יומיים.');

// --- Latin words are SPOKEN; only an identifier dump is deferred to screen ---
ok('a name in Latin letters is still spoken, not deflected to the screen',
  speakable('Davide שאל על מועד האספקה והתשובה שלנו עוד לא יצאה אליו')
    === 'Davide שאל על מועד האספקה והתשובה שלנו עוד לא יצאה אליו');
ok('an English product word does not trigger the screen fallback',
  !/על המסך/.test(speakable('הזמנה חדשה נכנסה מ-Priority הבוקר לפרויקט Marina')));
ok('a wall of identifiers is deferred, and said like a person',
  /קודים ומספרים/.test(speakable(
    'ORD-99213/A ORD-99214/B ORD-99215/C SKU-4410-22 SKU-4411-22 SKU-4412-22 a@b.com c@d.com e@f.com')));
ok('the old canned system line is gone from the panel entirely',
  !src.includes('התשובה המלאה מוצגת על המסך'));

// --- she must not open every answer with the same three words ---------------
ok('there is more than one thinking filler', FILLERS.length >= 3);
ok('two answers in a row never open identically', filler() !== filler());
ok('the fillers are short', FILLERS.every((f) => f.length <= 20));

// --- and must not recite his own sentence back at him -----------------------
eq('the confirmation cuts at a natural break, not a character count',
  firstClause('דיברתי עם יוסי והבטחתי לשלוח לו מפרט מחר, אחרי שנסגור את המחיר'),
  'דיברתי עם יוסי והבטחתי לשלוח לו מפרט מחר');
ok('a short note is confirmed without any echo at all',
  /t\.length<60\?'רשמתי\. לשמור\?'/.test(src));
ok('the old 180-character recital is gone',
  !src.includes("'הבנתי: '+clip(t,180)"));

// --- a technical failure is said in Hebrew, not in variable names -----------
ok('config failures are not read out verbatim',
  !src.includes("'אני לא יכולה לענות על זה עדיין. '+heb((r.missing_information"));
ok('the spoken version points at the screen for the detail',
  src.includes('כתבתי על המסך מה בדיוק חסר'));
ok('internal object-type labels are no longer recited',
  !src.includes("'קלטתי: '+fresh.map"));

// --- the voice itself: the thin "compact" variant is the robot --------------
{
  const pick = new Function(
    slice('function pickVoice', '\nfunction speak(') + '\nreturn pickVoice;')();
  globalThis.window = { speechSynthesis: { getVoices: () => [
    { name: 'Hebrew Compact', lang: 'he-IL' },
    { name: 'Carmit', lang: 'he-IL' },
    { name: 'Daniel', lang: 'en-GB' },
  ] } };
  globalThis.speechSynthesis = window.speechSynthesis;
  eq('the full Hebrew voice wins over the compact one', pick().name, 'Carmit');
  globalThis.speechSynthesis = { getVoices: () => [{ name: 'Daniel', lang: 'en-GB' }] };
  globalThis.window.speechSynthesis = globalThis.speechSynthesis;
  ok('no Hebrew voice at all falls back cleanly rather than picking English',
    pick() === null);
}
ok('the rushed 1.05 cadence is gone', !/u\.rate=1\.05/.test(src));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
