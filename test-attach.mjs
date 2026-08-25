// LIA's eyes, phase 1 — the composer accepts evidence.
//
// What must be true before this ships:
//   1. Only whitelisted kinds get in — an .exe renamed to nothing, an .svg
//      (script-capable), an .html never become sources.
//   2. "התמונה הראשונה" keeps meaning across turns — the registry resolves
//      David's words to source ids deterministically, precision-first.
//   3. Bytes never enter the conversation record — descriptors only.
//   4. The honesty gate exists in the send path: files sent + no sources_seen
//      in the reply = LIA says she cannot see yet, never a faked answer.
//
//   node test-attach.mjs
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
let bad = 0, total = 0;
const ok = (label, cond, extra) => {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; }
};

// ── load the pure block exactly as the page runs it ─────────────────────
const begin = SRC.indexOf('/*ATT-PURE-BEGIN*/'), end = SRC.indexOf('/*ATT-PURE-END*/');
ok('pure block markers exist', begin > 0 && end > begin);
const pure = SRC.slice(begin + '/*ATT-PURE-BEGIN*/'.length, end);
const api = new Function(pure + `
  return {ATT_KINDS,ATT_ACCEPT,sanitizeName,attKind,attValidate,sourceTypeOf,
          newSourceId,sourceDescriptor,resolveSourceRef,sourcesForKernel,kernelSawSources};`)();

// ── 1. the whitelist ────────────────────────────────────────────────────
ok('png is an image', api.attKind('image/png', 'צילום מסך.png') === 'image');
ok('jpeg by mime alone', api.attKind('image/jpeg', 'blob') === 'image');
ok('xlsx is a sheet', api.attKind('', 'ניסויים 4.56.xlsx') === 'sheet');
ok('pdf is a doc', api.attKind('application/pdf', 'הוראת מנכל 4.56.pdf') === 'doc');
ok('exe is rejected', api.attKind('application/x-msdownload', 'setup.exe') === null);
ok('svg is rejected (script-capable)', api.attKind('image/svg+xml', 'logo.svg') === null);
ok('html is rejected', api.attKind('text/html', 'page.html') === null);
ok('extension wins over a lying mime', api.attKind('image/png', 'not-really.exe') === null);

// ── 2. validation ───────────────────────────────────────────────────────
ok('valid image passes', api.attValidate('a.png', 'image/png', 1024).ok === true);
ok('oversize image fails with a reason', (() => {
  const v = api.attValidate('a.png', 'image/png', 11 * 1024 * 1024);
  return v.ok === false && /גדול מדי/.test(v.reason); })());
ok('unsupported kind fails with a reason', (() => {
  const v = api.attValidate('a.bat', '', 10);
  return v.ok === false && /לא נתמך/.test(v.reason); })());
ok('doc cap is 15MB', api.attValidate('a.pdf', '', 14 * 1024 * 1024).ok === true
  && api.attValidate('a.pdf', '', 16 * 1024 * 1024).ok === false);

// ── 3. names are sanitized, ids are unique, descriptors carry no bytes ──
ok('path components are stripped', api.sanitizeName('C:\\Users\\x\\..\\צילום.png') === 'צילום.png');
ok('control chars are stripped', api.sanitizeName('a\u0000b\u001f<c>.png') === 'abc.png');
ok('empty name gets a fallback', api.sanitizeName('///') === 'קובץ');
ok('long names are capped at 120', api.sanitizeName('x'.repeat(300) + '.png').length <= 120);
ok('source ids are unique', api.newSourceId() !== api.newSourceId());
ok('image → CHAT_IMAGE, sheet → CHAT_FILE',
  api.sourceTypeOf('image') === 'CHAT_IMAGE' && api.sourceTypeOf('sheet') === 'CHAT_FILE');
ok('descriptor never carries bytes', (() => {
  const d = api.sourceDescriptor({source_id: 's1', source_type: 'CHAT_IMAGE', kind: 'image',
    filename: 'a.png', mime: 'image/png', size: 9, created_at: 1, data_b64: 'SECRETBYTES', preview: 'data:'});
  return !('data_b64' in d) && !('preview' in d) && d.filename === 'a.png'; })());

// ── 4. David's words resolve to sources ─────────────────────────────────
const REG = [
  {source_id: 'img1', kind: 'image', filename: 'תקלה1.png'},
  {source_id: 'pdf1', kind: 'doc',   filename: 'הוראת 4.56.pdf'},
  {source_id: 'img2', kind: 'image', filename: 'תקלה2.png'},
  {source_id: 'xl1',  kind: 'sheet', filename: 'ניסויים.xlsx'},
];
const R = (t) => api.resolveSourceRef(t, REG);
ok('"התמונה הראשונה" → first image', R('מה רואים בתמונה הראשונה?').join() === 'img1');
ok('"התמונה השנייה" → second image', R('ומה בתמונה השנייה').join() === 'img2');
ok('"ה-PDF" → the doc', R('מה תנאי הסף ב-PDF של 4.56?').join() === 'pdf1');
ok('"האקסל" → the sheet', R('איזה ניסוי באקסל נתן pH הכי גבוה?').join() === 'xl1');
ok('"שתי התמונות" → both images', R('מה ההבדל בין שתי התמונות?').sort().join() === 'img1,img2');
ok('"תשווי" alone still needs a type word', R('תשווי בין שתי התמונות').length === 2);
ok('a type word alone → latest of that type', R('תסתכלי על התמונה').join() === 'img2');
ok('no type word → no match (precision first)', R('מה הכי חשוב היום?').length === 0);
ok('empty registry → no match', api.resolveSourceRef('התמונה הראשונה', []).length === 0);

// ── 5. the kernel payload ───────────────────────────────────────────────
ok('pending attachments travel with bytes', (() => {
  const s = api.sourcesForKernel([{source_id: 'a', source_type: 'CHAT_IMAGE', kind: 'image',
    filename: 'x.png', mime: 'image/png', size: 5, created_at: 1, data_b64: 'AAA'}], [], null);
  return s.length === 1 && s[0].data_b64 === 'AAA' && s[0].source_type === 'CHAT_IMAGE'; })());
ok('referenced sources come from the byte store, marked resolved_from', (() => {
  const bytes = (id) => id === 'img1'
    ? {b64: 'BBB', desc: {source_id: 'img1', kind: 'image', filename: 'תקלה1.png'}} : null;
  const s = api.sourcesForKernel([], ['img1'], bytes);
  return s.length === 1 && s[0].data_b64 === 'BBB' && s[0].resolved_from === 'conversation'; })());
ok('a source both pending and referenced is sent once', (() => {
  const s = api.sourcesForKernel(
    [{source_id: 'a', kind: 'image', filename: 'x.png', data_b64: 'AAA'}], ['a'], () => null);
  return s.length === 1; })());
ok('a reference with no bytes left still names itself', (() => {
  const s = api.sourcesForKernel([], ['gone'], () => null);
  return s.length === 1 && s[0].source_id === 'gone' && s[0].data_b64 === null; })());
ok('kernelSawSources demands the proof field',
  api.kernelSawSources({sources_seen: []}) === true
  && api.kernelSawSources({answer: 'ראיתי את התמונה'}) === false);

// ── 6. the wiring that must exist in the page itself ────────────────────
ok('honesty gate guards the send path',
  /srcs\.length&&!kernelSawSources\(res\)/.test(SRC));
ok('the honest answer names the real blocker, not a fake failure',
  /טרם נפרס/.test(SRC) && /eyesNotLiveAnswer/.test(SRC));
ok('attachments force the ASK road — never filed as a note',
  SRC.includes('if(atts.length){') && SRC.indexOf('if(atts.length){') < SRC.indexOf("const intent=classify(t,SESSION.turns.length>0)"));
ok('a file with no words becomes a request to look', SRC.includes("t='תסתכלי על זה'"));
ok('the conversation stores descriptors, not bytes',
  SRC.includes('atts.map(sourceDescriptor)') && !/SESSION\.sources[^\n]*data_b64/.test(SRC));
ok('paste goes straight into the pipeline', /addEventListener\('paste'/.test(SRC));
ok('drop goes straight into the pipeline', /addEventListener\('drop'/.test(SRC));
ok('the picker only offers whitelisted kinds', /setAttribute\('accept',ATT_ACCEPT\)/.test(SRC));
// ── the Orna loop (live, 25.8): what may NEVER re-attach ──────────────────
ok('a dismissal never re-attaches — "עזבי את התמונה"', R('עזבי את התמונה, מה עם בן זיו?').length === 0);
ok('a complaint never re-attaches — "שוב עם התמונה"', R('שוב עם התמונה?!').length === 0);
ok('an entity question never drags old files in', R('מה הסיפור עם בן זיו?').length === 0);
ok('an entity question with an explicit ask still can', R('מה הסיפור עם בן זיו? תסתכלי בתמונה ששלחתי').length === 1);
ok('a bare type word with no question re-attaches nothing', R('התמונה').length === 0);
ok('a real content question about the file still resolves', R('מה כתוב בתמונה?').length === 1);

ok('registry is capped so localStorage cannot grow without bound', /\.slice\(-12\)/.test(SRC));
ok('me-bubbles render the evidence', /class="shots"/.test(SRC));
ok('a send while a file is still reading waits instead of losing it',
  /עוד קוראת את הקובץ/.test(SRC));

console.log(bad ? `\n${bad}/${total} FAILED` : `\nPASS — all ${total} checks`);
process.exit(bad ? 1 : 0);
