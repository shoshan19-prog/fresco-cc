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
console.log(bad ? `\n${bad} FAILED` : `\n${CASES.length + 5}/${CASES.length + 5} routing asserts passed`);
process.exit(bad ? 1 : 0);
