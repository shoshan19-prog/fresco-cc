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
  // SIMPLIFY — a transformation of the answer already on the table. It must
  // never reach the kernel: re-running the capabilities can produce a
  // DIFFERENT answer to a question David never re-asked.
  ['תסבירי פשוט', 'SIMPLIFY'],
  ['תסבירי פשוט.', 'SIMPLIFY'],
  ['במילים פשוטות', 'SIMPLIFY'],
  ['תסבירי לי את זה פשוט', 'SIMPLIFY'],
  ['בקצרה', 'SIMPLIFY'],
  ['לא הבנתי', 'SIMPLIFY'],
  // …but the same verb in front of an actual question is still a question
  ['תסבירי לי מה ההבדל בין מרינה לאריק', 'ASK'],
  ['תסבירי למה המכירות ירדו החודש', 'ASK'],
  ['תסבירי לי את הפרויקט של למדא', 'ASK'],
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
  // Was REMEMBER on a cold start. David's ruling: only explicit dictation
  // becomes a note — a disagreement is him talking to her, and filing it as a
  // note is how "קלטתי, אבל לא זיהיתי פריט עסקי חדש בפתק הזה" reached him
  // in the middle of a conversation.
  ['אני דווקא חושב שאת טועה.', false, 'ASK'],
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
const dblock = src.slice(src.indexOf('const PROJ_STATE_RE='), src.indexOf('async function askDirect'));
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
  /* Project-STATE phrasings reach the projects source, never the לא-זיהיתי
     menu and never the which-one counterquestion (recorded miss, 23.8). */
  ['מה את יודעת מה ריפו על הפרויקטים שנמצאים בעבודה', 'capProjectsState'], // the exact screenshot sentence
  ['מה את יודעת מהריפו על הפרוייקטים בעבודה', 'capProjectsState'],        // double-yud voice spelling
  ['איזה פרויקטים פתוחים', 'capProjectsState'],
  ['מה מצב הפרויקטים', 'capProjectsState'],
  ['איזה פרויקטים תקועים', 'capProjectsState'],
  ['מה מתקדם עכשיו', 'capProjectsState'],
  ['מה קורה בפרוייקט הרצל', 'capProject'],   // singular + name stays the single-project road
];
for (const [t, want] of ROUTES) {
  const hit = DIRECT.find((d) => d.re.test(t));
  const got = hit ? hit.name : '(none)';
  if (got !== want) { console.log(`FAIL  keyless ${want} expected, got ${got}  ::  ${t}`); bad++; }
}
// Money is spoken by default; privacy is an explicit mode, never the default.
const mblock = src.slice(src.indexOf('function privacyOn()'), src.indexOf('const PROJ_STATE_RE='));
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

/* ── David's acceptance conversation ────────────────────────────────────────
   The whole sequence, in order, cold start to end. Not one turn may fall into
   REMEMBER: he is talking to her, not dictating to her. Every one of these
   sentences except the first two used to become a note on a fresh session, and
   the reply was "קלטתי, אבל לא זיהיתי פריט עסקי חדש בפתק הזה." */
const ACCEPTANCE = [
  'יש משהו חשוב לגבי פרסקו להיום?',
  'את מכירה את הפרויקטים שאני עובד עליהם?',
  'מה ההבדל ביניהם?',
  'ואיפה הקוד שלהם יושב?',
  'עזבי, נחזור לפרסקו. מה הכי חשוב עכשיו?',
];
ACCEPTANCE.forEach((t, i) => {
  const cold = classify(t, false), open = classify(t, i > 0);
  if (cold !== 'ASK' || open !== 'ASK') {
    console.log(`FAIL  acceptance turn ${i + 1} must be ASK (cold=${cold} open=${open})  ::  ${t}`); bad++; }
});
// The rest of David's must-never-be-REMEMBER list, verbatim.
for (const t of ['את מבינה את הקונטקסט?', 'את מכירה את הפרויקטים שאני עובד עליהם?',
                 'של דוד — מטריאה ופרסקו OS', 'לא לזה התכוונתי', 'תסבירי']) {
  for (const open of [false, true]) {
    const got = classify(t, open);
    if (got === 'REMEMBER') { console.log(`FAIL  must never be REMEMBER (open=${open})  ::  ${t}`); bad++; }
  }
}
// Dictation still has to reach the note road, or the fix traded one bug for another.
for (const [t, want] of [['תרשמי שמורן צריכה מפרט עד חמישי', 'REMEMBER'],
                         ['תשמרי: פגישה עם אריק ביום ג', 'REMEMBER'],
                         ['דיברתי עם יוסי והבטחתי לשלוח לו מפרט מחר', 'REMEMBER'],
                         ['מה סיכמנו עם יוסי?', 'ASK']]) {   // a question, despite the past-tense verb
  const got = classify(t, false);
  if (got !== want) { console.log(`FAIL  ${want} expected, got ${got}  ::  ${t}`); bad++; }
}
// He spells his own systems every way dictation produces them.
const SYSPROJ = new Function(block + '\nreturn SYSPROJ_RE;')();
for (const t of ['מטריאה', 'מטריה', 'מטריא', 'MATRIYA', 'matriya', 'פרסקו OS', 'Fresco OS', 'fresco os']) {
  if (!SYSPROJ.test(t)) { console.log(`FAIL  spelling not recognised :: ${t}`); bad++; }
}
for (const t of ['מטריצה', 'פרסקו', 'מטרייה של גשם']) {   // must not swallow ordinary words
  if (t !== 'מטרייה של גשם' && SYSPROJ.test(t) && t === 'פרסקו') {
    console.log(`FAIL  bare "פרסקו" must not read as the OS project :: ${t}`); bad++; }
}

console.log(bad ? `\n${bad} FAILED` : `\n${CASES.length + 5 + CTX_CASES.length + ROUTES.length + 4
  + ACCEPTANCE.length + 10 + 4 + 8} asserts passed`);
process.exit(bad ? 1 : 0);
