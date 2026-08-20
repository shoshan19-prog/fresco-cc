// Routing acceptance for the voice executive: David's own sentences must take
// the road he specified. Extracts the classifier from lia.html itself, so the
// test can never drift from what the panel actually runs.
//   node test-router.mjs
import {readFileSync} from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const block = src.slice(src.indexOf('const ACT_RE='), src.indexOf('function afterTranscript'));
const classify = new Function(block + '\nreturn classify;')();

const CASES = [
  // ASK — read-only, answered immediately, no confirmation
  ['ליה, כמה מכרנו היום?', 'ASK'],
  ['תבדקי את המיילים ותראי מה דורש מאיתנו תגובה.', 'ASK'],
  ['מה קורה עם לקוח למדא ומה את ממליצה?', 'ASK'],
  ['מה הכי חשוב שאני צריך לטפל בו היום?', 'ASK'],
  ['מה מצב פרסקו OS?', 'ASK'],
  ['מי מחכה לתשובה ממני?', 'ASK'],
  // REMEMBER — a report of something that happened becomes a note
  ['דיברתי עם יוסי והבטחתי לשלוח לו מפרט מחר. תטפלי בזה.', 'REMEMBER'],
  ['החלטנו לא להמשיך עם הספק.', 'REMEMBER'],
  ['סיכמתי עם אריק על פגישה בשבוע הבא.', 'REMEMBER'],
  ['תזכירי לי מחר לסגור את ההצעה.', 'REMEMBER'],
  // DO — prepared, never executed from voice
  ['תכיני תשובה ל-Davide.', 'DO'],
  ['תשלחי לו את המפרט.', 'DO'],
  ['תעני ל-Davide שאנחנו מאשרים אבל תבקשי זמן אספקה.', 'DO'],
];
let bad = 0;
for (const [t, want] of CASES) {
  const got = classify(t);
  if (got !== want) { console.log(`FAIL  ${want} expected, got ${got}  ::  ${t}`); bad++; }
}
// anything outward must additionally be flagged so voice can never send it
const OUTWARD = new Function(block + '\nreturn OUTWARD_RE;')();
for (const t of ['תשלחי לו את המפרט.', 'תפרסמי את זה', 'תשלמי לספק']) {
  if (!OUTWARD.test(t)) { console.log(`FAIL  outward not detected :: ${t}`); bad++; }
}
for (const t of ['תכיני תשובה ל-Davide.', 'תעני לו שאנחנו מאשרים']) {
  if (OUTWARD.test(t)) { console.log(`FAIL  draft wrongly marked outward :: ${t}`); bad++; }
}

// The keyless road: with no model key the same sentences must still reach a real
// capability, and the questions that genuinely need a model must say so.
const dblock = src.slice(src.indexOf('const MONEY_RE='), src.indexOf('async function askDirect'));
const {DIRECT, MONEY_RE} = new Function(
  dblock.replace(/,run:cap\w+/g, (m) => ',name:"' + m.slice(5) + '"') +
  '\nreturn {DIRECT, MONEY_RE};')();
const ROUTES = [
  ['ליה, כמה מכרנו היום?', 'capSales'],
  ['כמה הזמנות נכנסו היום', 'capSales'],
  ['מה הכי חשוב שאני צריך לטפל בו היום?', 'capImportant'],
  ['מה קורה עם לקוח למדא', 'capCustomer'],
  ['תבדקי את המיילים ותראי מה דורש מאיתנו תגובה.', 'capMail'],
];
for (const [t, want] of ROUTES) {
  const hit = DIRECT.find((d) => d.re.test(t));
  const got = hit ? hit.name : '(none)';
  if (got !== want) { console.log(`FAIL  keyless ${want} expected, got ${got}  ::  ${t}`); bad++; }
}
// money is never spoken — an existing standing rule, so the guard must fire
for (const t of ['כמה כסף עשינו היום', 'מה המחזור החודש', 'מה הרווח על ההזמנה']) {
  if (!MONEY_RE.test(t)) { console.log(`FAIL  money guard missed :: ${t}`); bad++; }
}
if (MONEY_RE.test('כמה הזמנות נכנסו היום')) { console.log('FAIL  money guard over-fires'); bad++; }

console.log(bad ? `\n${bad} FAILED` : `\n${CASES.length + 5 + ROUTES.length + 4}/${CASES.length + 5 + ROUTES.length + 4} routing asserts passed`);
process.exit(bad ? 1 : 0);
