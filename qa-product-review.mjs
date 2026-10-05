// THE PRODUCT IS APPROVED BY DAVID (5.10): the Command Center's card for a submitted product — rendered from the row the
// server projects (disposition PRODUCT_REVIEW + product_review), in words: his line, what works, what remains, the links,
// and his three decisions. Renders the real page's own function on a real row shape; no network.
//   node qa-product-review.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"rows":[]}' }));
await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
await page.goto(PAGE);
await page.waitForTimeout(300);
const row = { work_id: 'e804e572e2536955a16062d84ab9fb00', status: 'WAITING_INTERNAL', disposition: 'PRODUCT_REVIEW', parked_for_david: true,
  objective: 'בני מחדש את Dashboard המכירות של Fresco', current_step: 'התוצר מוכן לאישורך',
  product_review: { submitted_at: '2026-10-05T09:16:21Z', by: 'engineering-lane/ee122cab', outcome: 'שורת המדדים הראשית מוצגת עם שישה מדדים',
    result: 'שונה lia.html', what_works: 'הכרטיסים נטענים מהמדדים המאומתים', what_remains: 'גשר התחזית עוד לא מוצג', refs: ['https://github.com/shoshan19-prog/fresco-cc/pull/100'] } };
const R = await page.evaluate((r) => {
  const d = document.createElement('div'); d.innerHTML = decisionCard(r); document.body.appendChild(d);
  const txt = d.innerText;
  return { txt, link: (d.querySelector('a.ref') || {}).href || null, decs: [...d.querySelectorAll('button[data-dec]')].map((b) => b.getAttribute('data-dec')),
    disp: DISP_HE.PRODUCT_REVIEW, noRefs: (() => { const e = document.createElement('div'); e.innerHTML = decisionCard({ ...r, product_review: { ...r.product_review, refs: [] } }); return e.innerText; })(),
    other: decisionCard({ ...r, disposition: 'NEEDS_DAVID_DECISION' }).slice(0, 60) };
}, row);
ok('the card says the product is ready for his approval, and shows his line, what works and what remains',
  /התוצר מוכן לאישורך/.test(R.txt) && /שורת המדדים הראשית מוצגת/.test(R.txt) && /מה עובד עכשיו: הכרטיסים נטענים/.test(R.txt) && /מה עוד פתוח: גשר התחזית/.test(R.txt), R.txt.slice(0, 240));
ok('the product link is there, opening in a new tab', R.link === 'https://github.com/shoshan19-prog/fresco-cc/pull/100', String(R.link));
ok('his three decisions, in words: this is what I asked · return for correction · close without approving',
  JSON.stringify(R.decs) === JSON.stringify(['ACCEPT', 'RETURN', 'REJECT']) && /זה מה שביקשתי/.test(R.txt) && /תקני לפי ההערות ותגישי שוב/.test(R.txt) && /סגרי בלי לאשר/.test(R.txt), JSON.stringify(R.decs));
ok('no link left by the worker → the card says so and points at reading the product before approving', /לא השאיר קישור לתוצר/.test(R.noRefs), R.noRefs.slice(0, 120));
ok('the list note names the state in words', R.disp === 'התוצר מוכן לאישורך', R.disp);
ok('the other parks keep their card', /ההכרעה שלך/.test(R.other), R.other);
/* 5.10 evening — THE ENGINEERING END: a PR the lane stopped before merging. The card names the change, offers the page
   from the branch as a preview and the diff, and its approve button says what it does: go live. */
const ship = { repo: 'fresco-cc', pr: 100, branch: 'lia/exec/ee122cab', paths: ['lia.html'], child_work_id: 'ee122cabbb9590d2c3dca8251ba1597d',
  pr_url: 'https://github.com/shoshan19-prog/fresco-cc/pull/100', files_url: 'https://github.com/shoshan19-prog/fresco-cc/pull/100/files',
  preview_url: 'https://raw.githubusercontent.com/shoshan19-prog/fresco-cc/lia/exec/ee122cab/lia.html' };
const shipRow = { ...row, product_review: { ...row.product_review, outcome: 'ניהול מכירות — PR #100 ב-fresco-cc, מוכן להעלאה', what_remains: 'ההעלאה לאוויר — אחרי אישורך', ship,
  refs: [ship.preview_url, ship.files_url, ship.pr_url] } };
await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><title>t</title></head><body><div id="kpiCard">ניהול מכירות · PREVIEW-OK</div></body></html>' }));
const S = await page.evaluate(async (r) => {
  document.querySelectorAll('#dec').forEach((e) => e.remove());   // the earlier card: wireDecision binds the first #dec on the page
  const d = document.createElement('div'); d.innerHTML = decisionCard(r); document.body.appendChild(d);
  wireDecision(r);
  const txt = d.innerText;
  const files = (d.querySelector('a[href$="/files"]') || {}).href || null;
  const pb = d.querySelector('button[data-preview]');
  let frame = null, base = null;
  if (pb) { pb.click(); for (let i = 0; i < 40 && !document.querySelector('#shipFrame'); i++) await new Promise((r) => setTimeout(r, 50));
    const f = document.querySelector('#shipFrame'); if (f) { frame = f.getAttribute('srcdoc'); base = /<base href="([^"]+)">/.exec(frame || '')?.[1] || null; } }
  const code = decisionCard({ ...r, product_review: { ...r.product_review, ship: { ...r.product_review.ship, repo: 'fresco-marketing-os', paths: ['supabase/functions/_shared/x.ts'], preview_url: null } } });
  return { txt, files, hasPreviewBtn: !!pb, frame: !!frame, base, previewText: frame ? /PREVIEW-OK/.test(frame) : false, code };
}, shipRow);
ok('a page change: the card names it, says it is not live yet, and offers the page from the branch and the diff',
  /שינוי בעמוד/.test(S.txt) && /עוד לא עלה לאוויר/.test(S.txt) && S.hasPreviewBtn && S.files === ship.files_url, S.txt.slice(0, 200) + ' · ' + S.files);
ok('the preview renders the branch page inside the card, anchored to the live site for its styles and scripts', S.frame && S.base === 'https://shoshan19-prog.github.io/fresco-cc/' && S.previewText, JSON.stringify({ frame: S.frame, base: S.base, txt: S.previewText }));
ok('his approve button says what it does — go live — and the close button says it does not', /זה מה שביקשתי — העלי לאוויר/.test(S.txt) && /סגרי בלי להעלות/.test(S.txt), S.txt.slice(-200));
ok('a code change has no page to preview: the diff is the product', /שינוי בקוד/.test(S.code) && !/data-preview/.test(S.code) && /\/pull\/100\/files/.test(S.code), S.code.slice(0, 160));
/* 5.10 (David): "אם יש לי תיקונים לתוצר או למוצר הסופי אני יכול לעשות אותם לפני שאני משגר" — a correction box on BOTH cards,
   wired to the doors that already exist: RETURN with his note on the product; work_intake revise_work_id on the held order. */
const sent = [];
await page.route('**/functions/v1/**', (route) => {
  const body = route.request().postDataJSON?.() || {}; sent.push(body);
  const isRevise = body.action === 'cap' && body.name === 'work_intake' && body.args && body.args.revise_work_id;
  const isDecide = body.action === 'work_decide';
  route.fulfill({ status: 200, contentType: 'application/json',
    body: isRevise ? JSON.stringify({ rows: [{ work_id: body.args.revise_work_id, action: 'AWAITING_LAUNCH', awaiting_launch: true, revised: true }], source: 'ההגדרה תוקנה' })
      : isDecide ? JSON.stringify({ ok: true, decision: body.decision, summary: 'הוחזרה לתיקון', status: 'QUEUED' }) : '{"rows":[]}' });
});
const C = await page.evaluate(async (r) => {
  document.querySelectorAll('#dec').forEach((e) => e.remove());
  const d = document.createElement('div'); d.innerHTML = decisionCard(r); document.body.appendChild(d); wireDecision(r);
  const box = document.querySelector('#fixNote'); const hasBox = !!box; const txt = d.innerText;
  if (box) box.value = 'הכותרת צריכה להיות בכחול, לא באפור';
  const ret = [...d.querySelectorAll('button[data-dec]')].find((b) => b.getAttribute('data-dec') === 'RETURN');
  const retLabel = ret ? ret.textContent : null;   // read before the click: the click turns the label into '…'
  window.prompt = () => { throw new Error('prompt opened although the box was filled'); };
  if (ret) ret.click();
  await new Promise((r2) => setTimeout(r2, 400));
  return { hasBox, txt, retLabel };
}, shipRow);
const dec = sent.find((b) => b.action === 'work_decide');
ok('the product card carries a correction box; his words go out as the return note, no popup', C.hasBox && /יש לך תיקונים לתוצר לפני ההעלאה/.test(C.txt) && /תקני לפי ההערות ותגישי שוב/.test(C.retLabel || '')
  && !!dec && dec.decision === 'RETRY' && dec.note === 'הכותרת צריכה להיות בכחול, לא באפור' && dec.work_id === shipRow.work_id, JSON.stringify({ hasBox: C.hasBox, dec }));
const held = { work_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', status: 'WAITING_INTERNAL', disposition: 'AWAITING_LAUNCH', parked_for_david: true,
  objective: 'תכיני סיכום של עשרת הלקוחות הגדולים', launch: { state: 'ASKED', understood: 'סיכום של עשרת הלקוחות עם הכי הרבה הזמנות פתוחות', deliverable: 'טבלה', done_when: ['יש סכום לכל לקוח'] } };
const H = await page.evaluate(async (r) => {
  document.querySelectorAll('#dec').forEach((e) => e.remove());
  const d = document.createElement('div'); d.innerHTML = decisionCard(r); document.body.appendChild(d); wireDecision(r);
  const txt = d.innerText; const box = document.querySelector('#reviseNote');
  const btn = d.querySelector('button[data-revise]');
  if (btn) btn.click(); await new Promise((r2) => setTimeout(r2, 200));
  const emptyMsg = (document.querySelector('#decRes') || {}).textContent || '';
  if (box) box.value = 'לא עשרה — חמישה, ורק מהשנה';
  if (btn) btn.click(); await new Promise((r2) => setTimeout(r2, 500));
  return { txt, hasBox: !!box, emptyMsg, res: (document.querySelector('#decRes') || {}).textContent || '' };
}, held);
const rev = sent.find((b) => b.action === 'cap' && b.name === 'work_intake');
ok('the launch card carries a correction box; an empty box is refused in words; his correction revises the held order through work_intake with the understanding he confirmed plus his note',
  H.hasBox && /מה לתקן בהגדרה לפני השיגור/.test(H.txt) && /כתוב קודם מה לתקן/.test(H.emptyMsg)
  && !!rev && rev.args.revise_work_id === held.work_id && rev.args.text === 'לא עשרה — חמישה, ורק מהשנה' && rev.args.source === 'david'
  && /^סיכום של עשרת הלקוחות עם הכי הרבה הזמנות פתוחות\nתיקון: לא עשרה — חמישה, ורק מהשנה$/.test(rev.args.understood) && rev.args.deliverable === 'טבלה' && JSON.stringify(rev.args.done_when) === JSON.stringify(['יש סכום לכל לקוח'])
  && /ההגדרה תוקנה/.test(H.res), JSON.stringify({ H, rev }));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} checks passed`);
process.exit(bad ? 1 : 0);
