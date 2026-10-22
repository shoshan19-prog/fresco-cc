// David edits a queued mail before he approves it (22.10) — driven in a real browser, phone and desktop, RTL.
// Stubbed server: outbound_pending answers one draft; outbound_edit stores what the page sends; outbound_decide records
// the args. Proves: ערוך opens recipients/subject/body; typing survives a re-render; שמור טיוטה calls outbound_edit with
// exactly the typed text and sends nothing; אשר ושלח carries the fingerprint of the saved version.
//   node --experimental-strip-types qa-draft-edit.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url)); mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const NOW = new Date().toISOString();
const TOWER = { at: NOW, departments: [], projects: [], approvals: [], alerts: [], work_running: [], next_action: { what: '', why: '' }, changed: [],
  opportunities: { count: 0, signals: 0 }, deliverables: { count: 0, recent: [] }, money: {}, manifest: [], totals: {} };

const browser = await chromium.launch();
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  let draft = { draft_id: 'dddd1111-2222-3333-4444-555566667777', status: 'PENDING', decided_at: null, created_at: NOW, mailbox: 'david@frescocolors.com',
    to: 'david@frescocolors.com', cc: '', subject: 'טיוטה לעיונך: מכתב לבהאים', body: 'שלום,\n\nבהמשך לשיחה עם נטע…\n\nבברכה,\nדוד', about: 'טיוטה פנימית',
    commitments: [], payload_hash: 'h-original', edit_count: 0 };
  const calls = [];
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
    if (body.action === 'cap' && body.name === 'outbound_pending') return j({ rows: [draft] });
    if (body.action === 'cap' && body.name === 'outbound_edit') {
      const a = body.args; draft = { ...draft, to: a.to, cc: a.cc, subject: a.subject, body: a.body, payload_hash: 'h-edited', edit_count: 1 };
      return j({ rows: [{ draft_id: draft.draft_id, saved: true, sent: false }], source: 'נשמר' });
    }
    if (body.action === 'cap' && body.name === 'outbound_decide') return j({ rows: [{ draft_id: draft.draft_id, sent: true }], source: 'נשלח' });
    return j({ ok: true, rows: [] });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('#drillBtn', { timeout: 8000 });
  await page.click('#drillBtn');
  await page.waitForSelector('#drill .draftEdit', { timeout: 8000 });
  ok(`${tag}: the draft card offers אשר ושלח · ערוך · בטל`, (await page.locator('#dr' + draft.draft_id.slice(0, 8) + ' .btns button').allTextContents()).join('|') === 'אשר ושלח|ערוך|בטל');
  await page.click('.draftEdit');
  await page.waitForSelector('.dedit textarea');
  ok(`${tag}: ערוך opens recipients, CC, subject and the whole body`, await page.locator('.dedit [data-f]').count() === 4
     && (await page.inputValue('.dedit textarea')).includes('בהמשך לשיחה עם נטע'));
  ok(`${tag}: while editing, אשר ושלח is not on the card`, await page.locator('.draftDec[data-d=approve]').count() === 0);
  await page.fill('.dedit [data-f=to]', 'neta@example.org');
  await page.fill('.dedit [data-f=subject]', 'המשך השיחה');
  await page.fill('.dedit textarea', 'שלום נטע,\n\nתודה על השיחה.\n\nדוד');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); renderExec(); render(); });
  ok(`${tag}: a re-render keeps what was typed`, (await page.inputValue('.dedit [data-f=to]')) === 'neta@example.org' && (await page.inputValue('.dedit textarea')).includes('תודה על השיחה'));
  await page.screenshot({ path: `${OUT}draft-edit-${tag}-editing.png`, fullPage: false });
  await page.click('.draftSave');
  await page.waitForSelector('.draftDec[data-d=approve]');
  const ed = calls.find((c) => c.name === 'outbound_edit');
  ok(`${tag}: שמור טיוטה sends exactly the typed text to outbound_edit`, ed && ed.args.to === 'neta@example.org' && ed.args.subject === 'המשך השיחה' && /תודה על השיחה/.test(ed.args.body) && /שמור טיוטה/.test(ed.args.david_quote));
  ok(`${tag}: saving sends nothing`, !calls.some((c) => c.name === 'outbound_decide'));
  ok(`${tag}: the card now shows the saved letter and that it was edited`, (await page.locator('.letter').first().textContent()).includes('תודה על השיחה')
     && (await page.locator('.appr').filter({ hasText: 'נערך על ידך' }).count()) === 1);
  await page.click('.draftDec[data-d=approve]');
  await page.waitForTimeout(300);
  const de = calls.find((c) => c.name === 'outbound_decide');
  ok(`${tag}: אשר ושלח carries the fingerprint of the saved version`, de && de.args.decision === 'approve' && de.args.expect_payload_hash === 'h-edited');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${tag}: no horizontal overflow`, over <= 1, String(over));
  ok(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`\n${total - bad}/${total} passed`);
process.exit(bad ? 1 : 0);
