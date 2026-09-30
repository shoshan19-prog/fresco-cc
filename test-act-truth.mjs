// THE DO ROAD SAYS ONLY WHAT WAS DONE (David, 30.9), pinned.
//
// doAct posted David's sentence to command_request and then spoke "הכנתי את זה
// והשארתי לאישור שלך" / "רשמתי אותה לאישור במסך". Nothing reads that row and
// nothing approves it — the sentence claimed work that did not exist. The road
// now asks the kernel and speaks the kernel's answer; it prepares nothing and
// records nothing, and says so when the ask reached out of the OS.
//   node test-act-truth.mjs
import { readFileSync } from 'node:fs';

const lia = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const start = lia.indexOf('async function doAct(');
const end = lia.indexOf('/* The composer grows with what is typed', start);
const doAct = lia.slice(start, end);
let passed = 0, failed = 0;
const check = (n, f) => { try { f(); passed++; console.log('PASS ', n); } catch (e) { failed++; console.log('FAIL ', n, '—', e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };

check('doAct is found and bounded', () => assert(start > 0 && end > start && doAct.length > 400, 'slice'));
check('doAct posts nothing to command_request (no ask/change_request)', () => {
  assert(!/action:\s*'ask'/.test(doAct), 'still posts an ask');
  assert(!/change_request/.test(doAct.replace(/\/\*[\s\S]*?\*\//g, '')), 'still names change_request in code');
});
check('doAct never claims it prepared something or left it for approval', () => {
  const code = doAct.replace(/\/\*[\s\S]*?\*\//g, '');
  // a denial ("לא ניסחתי ולא רשמתי כלום") is the truth; an affirmative claim is not
  const strings = [...code.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  for (const w of ['הכנתי', 'השארתי לאישור', 'רשמתי', 'מוכן לאישור', 'נרשם לאישור', 'התחלתי', 'פתחתי'])
    for (const str of strings)
      if (str.includes(w)) assert(new RegExp('(?:^|\\s)(?:ו)?לא\\s+\\S*\\s*(?:ו)?לא\\s+' + w + '|לא\\s+' + w + '|ולא\\s+' + w).test(str), 'affirmative claim: ' + w + ' in "' + str + '"');
});
check('doAct outward branch says nothing left the OS', () => {
  assert(/לא בוצעה ולא נרשמה/.test(doAct), 'outward path does not deny');
});
check('doAct never hands David a phrase to say', () => {
  assert(!/אמרי (אותה|את זה) שוב/.test(doAct), 'hands a phrase');
});
check('the rest of lia.html still has no "הכנתי את זה והשארתי לאישור"', () => {
  assert(!/הכנתי את זה והשארתי לאישור/.test(lia), 'the false claim is back somewhere');
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
