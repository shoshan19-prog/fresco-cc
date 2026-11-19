// A task that waits on a mail (19.11, David: "יש משימות שתקועות ואין לי אפשרות לאשר אותם") — real browser, phone and desktop.
// Stubbed server: work_status has a WAITING_APPROVAL task whose approval_id is an 8-day-old mail; outbound_pending (no id)
// returns only the newest mails, without it — as in production (rank 31, older than 7 days). Proves: the old mail still
// gets a card with its buttons; the task's own page names the mail and takes him to it; אשר ושלח reaches outbound_decide.
//   node --experimental-strip-types qa-linked-draft.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url)); mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const NOW = new Date().toISOString();
const OLD = new Date(Date.now() - 8 * 864e5).toISOString();
const TOWER = { at: NOW, departments: [], projects: [], approvals: [], alerts: [], work_running: [], next_action: { what: '', why: '' }, changed: [],
  opportunities: { count: 0, signals: 0 }, deliverables: { count: 0, recent: [] }, money: {}, manifest: [], totals: {} };
const DID = '8e9bdc5e-283a-4fa5-b3e0-874542ca1d24';
const WID = 'cb5544863a13c63782159157afb6adb9';
const TASK = { work_id: WID, status: 'WAITING_APPROVAL', state: 'WAITING_APPROVAL', objective: 'הזדמנות ברנדייס 8 מגיעה להצעת מחיר', goal: 'הזדמנות ברנדייס 8 מגיעה להצעת מחיר',
  kind: 'other', owner: 'david', parked_for_david: false, approval_id: DID, created_at: OLD, updated_at: OLD, steps: [], steps_total: 0 };
const FRESH = { draft_id: 'aaaa1111-2222-3333-4444-555566667777', status: 'PENDING', decided_at: null, created_at: NOW, mailbox: 'david@frescocolors.com',
  to: 'a@example.org', cc: '', subject: 'מייל אחר', body: 'שלום', commitments: [], payload_hash: 'h-a', edit_count: 0 };
const LINKED = { draft_id: DID, status: 'PENDING', decided_at: null, created_at: OLD, mailbox: 'david@frescocolors.com',
  to: 'tatiyana@ecocity.co.il', cc: '', subject: 'פרסקו — הצעת מחיר לחומרי גמר לפרויקטים הקרובים', body: 'שלום טטיאנה,\n\nאנחנו עובדים יחד כבר כמה שנים.',
  commitments: [], payload_hash: 'h-linked', edit_count: 0, work_id: WID };

const browser = await chromium.launch();
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const calls = [];
  let decided = false;
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', isMobile: tag === 'mobile', hasTouch: tag === 'mobile' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'status') return j({ setup: false });
    if (body.action === 'tower') return j(TOWER);
    if (body.action === 'cap') calls.push({ name: body.name, args: body.args || {} });
    if (body.action === 'cap' && body.name === 'work_status') return j({ rows: (body.args || {}).closed_since ? [] : [TASK] });
    if (body.action === 'cap' && body.name === 'outbound_pending') {
      if ((body.args || {}).draft_id === DID) return j({ rows: [decided ? { ...LINKED, status: 'EXECUTED', decided_at: NOW } : LINKED] });
      return j({ rows: [FRESH] });   // the list endpoint: newest 20 — the linked mail is not among them
    }
    if (body.action === 'cap' && body.name === 'outbound_decide') { decided = true; return j({ rows: [{ draft_id: DID, sent: true }], source: 'נשלח · אומת בפריטים שנשלחו' }); }
    return j({ ok: true, rows: [] });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('#drillBtn', { timeout: 8000 });
  await page.click('#drillBtn');
  const card = '#dr' + DID.slice(0, 8);
  await page.waitForSelector(card, { timeout: 8000 });
  ok(`${tag}: the 8-day-old mail the task waits on has a card`, (await page.locator(card).textContent()).includes('tatiyana@ecocity.co.il'));
  ok(`${tag}: it was fetched by its id`, calls.some((c) => c.name === 'outbound_pending' && c.args.draft_id === DID));
  ok(`${tag}: the card offers אשר ושלח · ערוך · בטל`, (await page.locator(card + ' .btns button').allTextContents()).join('|') === 'אשר ושלח|ערוך|בטל');
  ok(`${tag}: a fresh mail still shows beside it`, await page.locator('#dr' + FRESH.draft_id.slice(0, 8)).count() === 1);
  await page.click(`[data-open="${WID}"]`);
  await page.waitForSelector('#detail.on #dec');
  ok(`${tag}: the task page says it waits on a mail and names it`, /מחכה לאישור שלך על מייל/.test(await page.locator('#dec h3').textContent())
     && (await page.locator('#dec').textContent()).includes('tatiyana@ecocity.co.il'));
  await page.screenshot({ path: `${OUT}linked-draft-${tag}-task.png`, fullPage: false });
  await page.click('#dec button[data-goto]');
  await page.waitForTimeout(600);
  ok(`${tag}: "פתח את המייל לאישור" closes the task page`, !(await page.locator('#detail').evaluate((e) => e.classList.contains('on'))));
  const inView = await page.locator(card).evaluate((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  ok(`${tag}: and brings the mail into view`, inView);
  await page.screenshot({ path: `${OUT}linked-draft-${tag}-mail.png`, fullPage: false });
  await page.click(card + ' .draftDec[data-d=approve]');
  await page.waitForTimeout(400);
  const de = calls.find((c) => c.name === 'outbound_decide');
  ok(`${tag}: אשר ושלח reaches outbound_decide for that mail with its fingerprint`, de && de.args.draft_id === DID && de.args.decision === 'approve' && de.args.expect_payload_hash === 'h-linked');
  await page.evaluate(() => { fetchAll().then(render); loadExec(); });
  await page.waitForTimeout(600);
  ok(`${tag}: once decided, the mail leaves the pending cards`, await page.locator(card + ' .draftDec').count() === 0);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${tag}: no horizontal overflow`, over <= 1, String(over));
  ok(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`\n${total - bad}/${total} passed`);
process.exit(bad ? 1 : 0);
