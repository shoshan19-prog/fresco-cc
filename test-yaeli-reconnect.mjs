// YAELI · ORNA · LAB: A DROPPED CONNECTION IS NOT A LOST ANSWER (Arik, 19.10).
//
// Both of Arik's questions ("מי הלקוח הכי גדול שלנו בארבע שנים האחרונות?") ran ~105s server-side, finished, stored
// the reply and answered 200 — after his phone had already closed the socket. The page showed "Load failed" and
// gave up, though the answer was sitting on the server. This drives the REAL yaeli.html in Chromium against an
// in-memory server with command-center's durable-turn contract (chat_sync · kernel: 202 while RUNNING, replay when
// DONE) and pins:
//   A. the kernel request dies mid-turn → the SAME turn_id is asked again → 202 → the stored answer lands in the
//      question's bubble; the turn runs once; "לא הצלחתי להגיע" never shows
//   B. no durable turn (the conversation could not be stored) → a drop still says so plainly (unchanged)
//
//   node test-yaeli-reconnect.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

/* orna.html and lab.html are copies of yaeli.html for other codes — the same send(), the same gap, the same pin */
const PAGES = [['yaeli', 'yaeli_code'], ['orna', 'orna_code'], ['lab', 'lab_code']];
const ANSWER = 'תדהר בניה בע״מ — 2,421,070 ₪ בחשבוניות סופיות.';
let passed = 0, failed = 0;
const check = (n, c, m) => { if (c) { passed++; console.log('PASS ', n); } else { failed++; console.log('FAIL ', n, '—', m || ''); } };

async function scenario(browser, { storeOk, name, codeKey }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // the 4s wait between re-asks is the page's own pacing — collapsed here so the test runs in seconds
  await page.addInitScript((k) => {
    localStorage.setItem(k, 'test-code');
    const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms >= 1000 ? 5 : ms, ...a);
  }, codeKey);
  const S = { kernel: [], runs: 0 };
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, body: '' });
    const body = JSON.parse(req.postData() || '{}');
    if (req.url().includes('/lia?')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (body.action === 'chat_sync') {
      if (!storeOk) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ conversation_id: 'c'.repeat(32), accepted: true, messages: [] }) });
    }
    if (body.action === 'kernel') {
      S.kernel.push(body);
      const n = S.kernel.length;
      if (n === 1) { S.runs++; return route.abort('failed'); }           // the socket dies; the server keeps working
      if (n === 2 && storeOk) return route.fulfill({ status: 202, contentType: 'application/json',
        body: JSON.stringify({ pending: true, turn_id: body.turn_id }) });   // still RUNNING
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ answer: ANSWER, turn_id: body.turn_id, replayed: true }) });
    }
    return route.fulfill({ status: 400, body: 'unknown' });
  });
  await page.goto('file://' + fileURLToPath(new URL(`./${name}.html`, import.meta.url)));
  await page.waitForSelector('#app', { state: 'visible' });
  await page.fill('#note', 'מי הלקוח הכי גדול שלנו בארבע שנים האחרונות?');
  await page.click('#send');
  await page.waitForFunction(() => !/חושבת…/.test(document.querySelector('#thread .msg.her:last-child .bubble')?.textContent || ''),
    null, { timeout: 15000 });
  const last = await page.textContent('#thread .msg.her:last-child .bubble');
  await ctx.close();
  return { S, last };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
try {
  for (const [name, codeKey] of PAGES) {
    const a = await scenario(browser, { storeOk: true, name, codeKey });
    check(`${name} A: the stored answer lands after the drop`, (a.last || '').includes('תדהר'), a.last);
    check(`${name} A: "לא הצלחתי להגיע" never shows`, !/לא הצלחתי להגיע/.test(a.last || ''), a.last);
    check(`${name} A: the dropped turn is asked again with the SAME turn_id (never a new run)`,
      a.S.kernel.length === 3 && a.S.kernel.every((k) => k.turn_id && k.turn_id === a.S.kernel[0].turn_id), JSON.stringify(a.S.kernel.map((k) => k.turn_id)));
    check(`${name} A: every re-ask names the conversation`, a.S.kernel.every((k) => k.conversation_id === 'c'.repeat(32)));

    const b = await scenario(browser, { storeOk: false, name, codeKey });
    check(`${name} B: without a durable turn a drop is reported, not retried`, /לא הצלחתי להגיע/.test(b.last || '') && b.S.kernel.length === 1,
      `${b.S.kernel.length} kernel calls · ${b.last}`);
  }
} finally { await browser.close(); }
console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
