// An expired approval and a reply that could not go out inside its thread (David, 28.10) — real browser, phone and desktop, RTL.
// Stubbed server. Proves: an expired draft has NO send button, only "פתח ובדוק מחדש"; opening shows recipients, subject and
// the whole body; "חדש אישור ל-24 שעות" calls outbound_renew with the reviewed fingerprint and sends nothing; a reply refused
// because the original sits in another mailbox shows "פתח תשובה באאוטלוק" and "שלח כמכתב חדש…"; the new-letter choice opens a
// panel naming recipients, subject and the thread impact, and only its confirm calls outbound_decide with send_as_new.
//   node --experimental-strip-types qa-draft-expired.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url)); mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const NOW = new Date().toISOString(), PAST = new Date(Date.now() - 3 * 36e5).toISOString(), FUT = new Date(Date.now() + 24 * 36e5).toISOString();
const TOWER = { at: NOW, departments: [], projects: [], approvals: [], alerts: [], work_running: [], next_action: { what: '', why: '' }, changed: [],
  opportunities: { count: 0, signals: 0 }, deliverables: { count: 0, recent: [] }, money: {}, manifest: [], totals: {} };

const browser = await chromium.launch();
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  let exp = { draft_id: 'eeee1111-2222-3333-4444-555566667777', status: 'PENDING', decided_at: null, created_at: NOW, mailbox: 'david@frescocolors.com',
    to: 'client@example.org', cc: 'arik@frescocolors.com', subject: 'Re: הצעת מחיר', body: 'שלום,\n\nמצורפת ההצעה המעודכנת.\n\nדוד', in_reply_to: 'MSG-1',
    commitments: [], payload_hash: 'h-exp', expires_at: PAST, expired: true, outlook_link: null, original_mailbox: 'david@frescocolors.com', last_failure: null };
  let rep = { draft_id: 'ffff1111-2222-3333-4444-555566667777', status: 'PENDING', decided_at: null, created_at: NOW, mailbox: 'david@frescocolors.com',
    to: 'supplier@example.org', cc: '', subject: 'Re: משלוח', body: 'תודה, מאשר את המועד.', in_reply_to: 'MSG-2',
    commitments: [], payload_hash: 'h-rep', expires_at: FUT, expired: false, outlook_link: 'https://outlook.office365.com/owa/?ItemID=MSG-2',
    original_mailbox: 'meital@frescocolors.com', last_failure: { code: 'REPLY_OTHER_MAILBOX', reason: 'ההודעה המקורית נמצאת בתיבה של meital@frescocolors.com' } };
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
    if (body.action === 'cap' && body.name === 'outbound_pending') return j({ rows: [exp, rep] });
    if (body.action === 'cap' && body.name === 'outbound_renew') {
      exp = { ...exp, expired: false, expires_at: FUT, renew_count: 1 };
      return j({ rows: [{ draft_id: exp.draft_id, renewed: true, sent: false, expires_at: FUT, payload_hash: 'h-exp' }], source: 'חודש · לא נשלח דבר' });
    }
    if (body.action === 'cap' && body.name === 'outbound_decide') return j({ rows: [{ draft_id: body.args.draft_id, sent: true }], source: 'נשלח' });
    return j({ ok: true, rows: [] });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('#drillBtn', { timeout: 8000 });
  await page.click('#drillBtn');
  const E = '#dr' + exp.draft_id.slice(0, 8), R = '#dr' + rep.draft_id.slice(0, 8);
  await page.waitForSelector(E + ' .draftReview', { timeout: 8000 });

  // ── expired ──
  ok(`${tag}: an expired draft says "פג תוקף"`, (await page.locator(E + ' .tag.warn').allTextContents()).includes('פג תוקף'));
  ok(`${tag}: an expired draft has no send button`, await page.locator(E + ' .draftDec[data-d=approve]').count() === 0);
  ok(`${tag}: it offers פתח ובדוק מחדש · בטל`, (await page.locator(E + ' .btns button').allTextContents()).join('|') === 'פתח ובדוק מחדש|בטל');
  await page.click(E + ' .draftReview');
  await page.waitForSelector(E + ' .draftRenew');
  const rv = await page.locator(E + ' .dreview').textContent();
  ok(`${tag}: opening shows recipients, CC, subject and the whole body`, rv.includes('client@example.org') && rv.includes('arik@frescocolors.com') && rv.includes('Re: הצעת מחיר') && rv.includes('מצורפת ההצעה המעודכנת'));
  ok(`${tag}: after review: חדש אישור ל-24 שעות · ערוך · בטל — still no send`, (await page.locator(E + ' .btns button').allTextContents()).join('|') === 'חדש אישור ל-24 שעות|ערוך|בטל'
     && await page.locator(E + ' .draftDec[data-d=approve]').count() === 0);
  ok(`${tag}: the card says renewing sends nothing`, (await page.locator(E).textContent()).includes('חידוש האישור לא שולח את המכתב'));
  await page.screenshot({ path: `${OUT}draft-expired-${tag}-review.png`, fullPage: false });
  await page.click(E + ' .draftRenew');
  await page.waitForSelector(E + ' .draftDec[data-d=approve]');
  const rn = calls.find((c) => c.name === 'outbound_renew');
  ok(`${tag}: renew calls outbound_renew with the reviewed fingerprint`, rn && rn.args.draft_id === exp.draft_id && rn.args.expect_payload_hash === 'h-exp' && /חדש אישור/.test(rn.args.david_quote));
  ok(`${tag}: renewing sent nothing`, !calls.some((c) => c.name === 'outbound_decide'));
  ok(`${tag}: after renewal the card can send again and says nothing was sent`, (await page.locator(E + ' .draftRes').textContent()).includes('לא נשלח דבר'));

  // ── reply that could not go out inside its thread ──
  ok(`${tag}: a refused reply says it was not sent, and why`, (await page.locator(R).textContent()).includes('התשובה לא נשלחה') && (await page.locator(R).textContent()).includes('meital@'));
  ok(`${tag}: it offers Outlook and a new letter — no plain send button`, await page.locator(R + ' a.draftOutlook').count() === 1 && await page.locator(R + ' .draftAsNew').count() === 1
     && await page.locator(R + ' .draftDec[data-d=approve]').count() === 0);
  ok(`${tag}: the Outlook button opens the original reply`, (await page.getAttribute(R + ' a.draftOutlook', 'href')) === rep.outlook_link && (await page.getAttribute(R + ' a.draftOutlook', 'target')) === '_blank');
  await page.click(R + ' .draftAsNew');
  await page.waitForSelector(R + ' .draftSendNew');
  ok(`${tag}: choosing a new letter sends nothing yet`, !calls.some((c) => c.name === 'outbound_decide'));
  const im = await page.locator(R).textContent();
  ok(`${tag}: the panel names recipients, subject and the thread impact`, im.includes('supplier@example.org') && im.includes('Re: משלוח') && im.includes('מחוץ לשרשור המקורי'));
  await page.screenshot({ path: `${OUT}draft-expired-${tag}-asnew.png`, fullPage: false });
  await page.click(R + ' .draftSendNew');
  await page.waitForTimeout(400);
  const de = calls.filter((c) => c.name === 'outbound_decide');
  ok(`${tag}: only the panel's confirm sends — once, as a new letter, with the fingerprint`, de.length === 1 && de[0].args.draft_id === rep.draft_id && de[0].args.send_as_new === true
     && de[0].args.confirm_new_thread === true && de[0].args.expect_payload_hash === 'h-rep');

  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${tag}: no horizontal overflow`, over <= 1, String(over));
  ok(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`\n${total - bad}/${total} passed`);
process.exit(bad ? 1 : 0);
