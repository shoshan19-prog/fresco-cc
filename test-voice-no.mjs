// Runtime proof of the NO path: rejection cancels, sends nothing, clears state,
// and does not become a new request.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport:{width:390,height:844} });
const sent = [];
await page.route('**/functions/v1/**', r => {
  sent.push(r.request().postData() || '');
  return r.fulfill({ status:200, contentType:'application/json',
                     body: JSON.stringify({ ok:true, reply:'ok', turns:[] }) });
});
await page.route('**/fonts.googleapis.com/**', r => r.abort());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8899/lia.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(500);

const out = await page.evaluate(() => {
  // arm a pending note exactly as the review flow does
  PENDING_NOTE = 'להתקשר לאלדר מחר';
  setMode('review');
  const note = document.getElementById('note');
  note.value = 'לא';
  const before = { mode: MODE, pending: PENDING_NOTE };
  sendPrimary();                            // the real entry point
  return { before, afterMode: MODE, afterPending: PENDING_NOTE,
           box: note.value,
           lastTurn: (SESSION.turns.slice(-1)[0] || {}).text || '' };
});

const pass = [], fail = [];
const ok = (n,c,w='') => (c?pass:fail).push(n + (c?'':'  — '+w));
ok('nothing was sent on rejection', sent.length === 0, JSON.stringify(sent).slice(0,120));
ok('pending note is cleared', out.afterPending === '', out.afterPending);
ok('the box is cleared', out.box === '', out.box);
ok('returns to idle, not review', out.afterMode === 'idle', out.afterMode);
ok('she confirms the cancellation', /ביטלתי/.test(out.lastTurn), out.lastTurn);
ok('rejection did not become a new request', !/להתקשר לאלדר/.test(out.lastTurn));
ok('no console errors', errs.length === 0, errs.join(' | '));

// sendNote is async — each case must settle before the next one starts, or a
// late request from the previous case is read as this one's.
await page.waitForTimeout(600);
ok('rejection still sent nothing after settling', sent.length === 0,
   JSON.stringify(sent).slice(0,120));

// the positive path still files the note
sent.length = 0;
await page.evaluate(() => {
  PENDING_NOTE='להתקשר לאלדר מחר'; setMode('review');
  document.getElementById('note').value='כן'; sendPrimary();
});
await page.waitForTimeout(600);
console.log('YES payloads:', sent.map(x => {
  try { const o = JSON.parse(x); return o.action + (o.submission_id ? ':' + o.submission_id.slice(0,8) : ''); }
  catch (e) { return x.slice(0,40); } }).join(' | '));
const noteCalls = sent.filter(x => { try { return JSON.parse(x).action === 'note'; } catch(e){ return false; } });
const ids = new Set(noteCalls.map(x => JSON.parse(x).submission_id));
ok('a yes files the pending note exactly once',
   noteCalls.length >= 1 && ids.size === 1 && noteCalls[0].includes('להתקשר לאלדר'),
   `note calls=${noteCalls.length} distinct ids=${ids.size}`);

// an unrelated sentence containing כן must NOT approve
sent.length = 0;
await page.evaluate(() => {
  PENDING_NOTE='להתקשר לאלדר מחר'; setMode('review');
  document.getElementById('note').value='כן טוב אבל תבדוק לי משהו אחר';
  sendPrimary();
});
await page.waitForTimeout(600);
ok('a sentence containing כן does not file the pending note',
   !sent.some(x => x.includes('להתקשר לאלדר')), JSON.stringify(sent).slice(0,140));

await b.close();
pass.forEach(p=>console.log('PASS  '+p));
fail.forEach(f=>console.log('FAIL  '+f));
console.log(`\n${pass.length}/${pass.length+fail.length} passed`);
process.exit(fail.length?1:0);
