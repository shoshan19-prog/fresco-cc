// TEXT MUST WIN OVER A PHANTOM ATTACHMENT (David, 11.9) — the panel half.
//
// Live failure 07:56Z (desktop 28b3c2ac, turn 7412e5c9): David pasted the
// 1,800-character definition of the permanent Fresco snapshot. Nothing was
// attached. resolveSourceRef read "תמונת המצב" as a picture and "כמה" as a
// question about it, re-attached a STALE descriptor from the registry
// nameless; the server dropped it silently, and the honesty gate replaced the
// real answer with "קיבלתי את הקובץ (), אבל אני עדיין לא יכולה לראות אותם" /
// "קובץ: undefined". The laws pinned here:
//   1. "תמונת מצב" is never a type word; a long paste never re-attaches an
//      old file unless it ASKS about one (regression A, D);
//   2. a reference the registry cannot NAME is never sent (phantom guard);
//   3. the honesty gate fires on NAMED sources only, and can never print
//      "undefined" (regression D);
//   4. a real ask about a real file still resolves (B, C keep working).
//   node test-phantom-file.mjs
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
let bad = 0, total = 0;
const ok = (label, cond, extra) => {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; }
};
const begin = SRC.indexOf('/*ATT-PURE-BEGIN*/'), end = SRC.indexOf('/*ATT-PURE-END*/');
ok('pure block markers exist', begin > 0 && end > begin);
const api = new Function(SRC.slice(begin + '/*ATT-PURE-BEGIN*/'.length, end)
  + ' return {resolveSourceRef,sourcesForKernel,kernelSawSources};')();

// The head of David's exact text (chatmsg-0fabafd1) — long, "תמונת המצב", "כמה".
const SPEC_HEAD = `ליה,

אני רוצה שתמונת המצב הקבועה של Fresco תציג תמיד, נכון להיום:

1. חשבוניות
- כמה חשבוניות הוצאו היום
- כמה מתחילת החודש
- סכום נטו
- סכום כולל מע"מ

2. תעודות משלוח שלא חויבו
החל מתחילת החודש הקודם ועד היום.

לכלול:
- מספר תעודות
- סכום כולל
- גיל התעודה
- כמה מהן מחודש קודם
- כמה מהן מהחודש הנוכחי

לא לכלול תעודות שכבר חויבו בפועל.

3. הזמנות פתוחות
לכלול:
- מספר הזמנות פתוחות
- שווי כספי אמיתי שנותר לספק`;
const REG = [
  {source_id: 'img_old', kind: 'image', filename: 'צילום מסך.png'},
  {source_id: 'pdf_old', kind: 'doc',   filename: 'הצעה.pdf'},
];
const R = (t) => api.resolveSourceRef(t, REG);

// ── A / D: the live turn re-attaches NOTHING ─────────────────────────────────
ok('A. David\'s spec head (long paste, "תמונת המצב", "כמה") resolves no source', R(SPEC_HEAD).length === 0, JSON.stringify(R(SPEC_HEAD)));
ok('A. a 5,000+ character paste with the word קובץ inside resolves nothing', R(('קובץ הדרישות אומר: ' + 'x'.repeat(200) + '\n').repeat(25)).length === 0);
ok('D. "תמונת המצב" alone is a snapshot, not a picture', R('כמה עלתה תמונת המצב של פרסקו?').length === 0);
ok('D. "תמונת-מצב" with a hyphen too', R('מה תמונת-מצב ההזמנות?').length === 0);
ok('a three-line message without an ask resolves nothing', R('שורה\nשורה\nכמה תמונות יש?').length === 0);

// ── B / C: a real ask about a real file still works ──────────────────────────
ok('B. a long paste that ENDS with an ask about the picture still resolves it', R(SPEC_HEAD + '\n\nתסתכלי על התמונה ששלחתי').join() === 'img_old');
ok('C. "מה כתוב בתמונה?" still resolves the last image', R('מה כתוב בתמונה?').join() === 'img_old');
ok('C. "ה-PDF" still resolves the doc', R('מה תנאי הסף ב-PDF?').join() === 'pdf_old');

// ── the phantom guard in the payload ─────────────────────────────────────────
ok('a reference the registry cannot name is never sent', api.sourcesForKernel([], ['gone'], () => null).length === 0);
ok('a reference the registry names travels named, bytes or not', (() => {
  const s = api.sourcesForKernel([], ['img_old'], () => null, (id) => REG.find((r) => r.source_id === id) || null);
  return s.length === 1 && s[0].filename === 'צילום מסך.png' && s[0].data_b64 === null; })());
ok('no source in the payload is ever nameless', (() => {
  const s = api.sourcesForKernel([{source_id: 'p', kind: 'image', filename: 'a.png', data_b64: 'AAA'}], ['gone', 'img_old'], () => null, () => null);
  return s.every((x) => typeof x.filename === 'string' && x.filename.length > 0); })());

// ── the wiring in the page ───────────────────────────────────────────────────
ok('the send path passes the registry to sourcesForKernel', SRC.includes('sourcesForKernel(pend,refs,attBytes,srcDesc)'));
ok('srcDesc reads the conversation registry', /function srcDesc\(id\)\{return \(SESSION\.sources\|\|\[\]\)\.find\(/.test(SRC));
ok('the honesty gate fires on NAMED sources only', /const named=srcs\.filter\(s=>s&&s\.filename\);/.test(SRC) && /if\(named\.length&&!kernelSawSources\(res\)\)\{/.test(SRC));
ok('the honest answer is built from the named ones', /eyesNotLiveAnswer\(pend\.length\?pend:named\)/.test(SRC));
ok('eyesNotLiveAnswer can never say "קובץ: undefined"', /atts=\(atts\|\|\[\]\)\.filter\(a=>a&&a\.filename\);/.test(SRC));
ok('build 2026-09-11.2', /const LIA_BUILD='2026-09-11\.2';/.test(SRC));

console.log(bad ? `\n${bad}/${total} FAILED` : `\nPASS — all ${total} checks`);
process.exit(bad ? 1 : 0);
