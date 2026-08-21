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

// New-build acceptance: focus/question-shaped/mid-conversation utterances must
// reach ASK (the kernel), not silently fall to REMEMBER's reflect-and-confirm.
const CTX_CASES = [
  // acceptance test 5 — must work standalone, cold start, no keyword overlap with Q_RE
  ['תעשי לי פוקוס.', undefined, 'ASK'],
  // acceptance test 2 — question-shaped with none of the Q_RE keywords
  ['יש משהו שאני מפספס?', undefined, 'ASK'],
  // acceptance test 4 — only makes sense as a reply inside an open thread
  ['אני דווקא חושב שאת טועה.', true, 'ASK'],
  // same sentence, cold start (no thread open) — the safe default still applies
  ['אני דווקא חושב שאת טועה.', false, 'REMEMBER'],
  // self-improvement: a request about her own capability, not a note about the day
  ['ליה, תשפרי את עצמך.', undefined, 'ASK'],
  ['איפה את חלשה?', undefined, 'ASK'],
  // still a note — talking ABOUT improving something else is not self-review
  ['סיכמתי עם אריק שנשפר את האריזה.', undefined, 'REMEMBER'],
];
for (const [t, hasOpenThread, want] of CTX_CASES) {
  const got = classify(t, hasOpenThread);
  if (got !== want) { console.log(`FAIL  ${want} expected (hasOpenThread=${hasOpenThread}), got ${got}  ::  ${t}`); bad++; }
}

// The keyless road: with no model key the same sentences must still reach a real
// capability, and the questions that genuinely need a model must say so.
const dblock = src.slice(src.indexOf('const DIRECT='), src.indexOf('async function askDirect'));
const DIRECT = new Function(
  dblock.replace(/,run:cap\w+/g, (m) => ',name:"' + m.slice(5) + '"') + '\nreturn DIRECT;')();
const ROUTES = [
  ['ליה, כמה מכרנו היום?', 'capSales'],
  ['כמה כסף עשינו היום', 'capSales'],
  ['מה הכי חשוב שאני צריך לטפל בו היום?', 'capImportant'],
  ['מה קורה עם לקוח למדא', 'capCustomer'],
  ['תבדקי את המיילים ותראי מה דורש מאיתנו תגובה.', 'capMail'],
  ['ליה, תעשי לי פוקוס', 'capFocus'],
  ['מה ההתחייבויות הפתוחות שלי', 'capOpen'],
  ['מה קורה בפרויקט המלון', 'capProject'],
  ['תביאי לי מפרט של פרסקוליט', 'capProduct'],
  ['מה השתנה השבוע', 'capChanges'],
];
for (const [t, want] of ROUTES) {
  const hit = DIRECT.find((d) => d.re.test(t));
  const got = hit ? hit.name : '(none)';
  if (got !== want) { console.log(`FAIL  keyless ${want} expected, got ${got}  ::  ${t}`); bad++; }
}
// Money is spoken by default; privacy is an explicit mode, never the default.
const mblock = src.slice(src.indexOf('function privacyOn()'), src.indexOf('const DIRECT='));
let store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null),
                            setItem: (k, v) => { store[k] = String(v); } };
const { money, privacyOn } = new Function(mblock + '\nreturn {money, privacyOn};')();
if (privacyOn()) { console.log('FAIL  privacy must default to OFF'); bad++; }
if (money(51960) !== '52 אלף ש"ח') { console.log(`FAIL  money(51960) = ${money(51960)}`); bad++; }
if (money(5365) !== '5.4 אלף ש"ח') { console.log(`FAIL  money(5365) = ${money(5365)}`); bad++; }
if (money(640) !== '640 ש"ח') { console.log(`FAIL  money(640) = ${money(640)}`); bad++; }
store.lia_privacy = '1';
if (money(51960) !== '—') { console.log('FAIL  privacy mode does not hide amounts'); bad++; }
store = {};
console.log(bad ? `\n${bad} FAILED` : `\n${CASES.length + 5 + CTX_CASES.length + ROUTES.length + 4} asserts passed`);
process.exit(bad ? 1 : 0);
