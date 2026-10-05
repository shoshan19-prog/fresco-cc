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
  JSON.stringify(R.decs) === JSON.stringify(['ACCEPT', 'RETURN', 'REJECT']) && /זה מה שביקשתי/.test(R.txt) && /תחזירי לתיקון/.test(R.txt) && /סגרי בלי לאשר/.test(R.txt), JSON.stringify(R.decs));
ok('no link left by the worker → the card says so and points at reading the product before approving', /לא השאיר קישור לתוצר/.test(R.noRefs), R.noRefs.slice(0, 120));
ok('the list note names the state in words', R.disp === 'התוצר מוכן לאישורך', R.disp);
ok('the other parks keep their card', /ההכרעה שלך/.test(R.other), R.other);
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} checks passed`);
process.exit(bad ? 1 : 0);
