// ONE PROJECT, FOUR LAYERS in a real browser (David, 5.10). Network stubbed with the shapes the five reads returned on 5.10,
// anonymised. Checks phone and desktop: the header carries the key and its certainty; the four Priority counts; the
// materials off the order lines (a zero-value line never shown); the office block with its basis; mail bound by number
// (ודאי) and by name (לא מאומת), never the same subject twice; SharePoint hits with links; "מה חסר" says what is missing
// and that the outside world is not connected; RTL, no overflow, no machinery; a failed Priority read is said, never an
// empty list; no key → one sentence; no code → the login card, nothing fetched.
// Screenshots: qa/project-*.png
//   node qa-project.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./project.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const FIX = JSON.parse(readFileSync(new URL('./qa-project.fixture.json', import.meta.url), 'utf8'));

async function stub(page, opt = {}) {
  const calls = [];
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const a = body.args || {};
    const tag = body.action === 'cap' ? `${body.name}${a.entity ? ':' + a.entity : ''}` : body.action;
    calls.push(tag);
    const j = (o, ms = 0) => setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }), ms);
    if (body.name === 'project_identity') return j(FIX.identity, 80);
    if (body.name === 'priority_query') {
      const e = a.entity;
      if (opt.failNotes && e === 'DOCUMENTS_D') return j({ rows: [], source: 'Priority DOCUMENTS_D · שגיאה: HTTP 500: timeout' }, 100);
      if (opt.cutOrders && e === 'ORDERS') return j(Object.assign({}, FIX.priority.orders, { row_count_total: 257, truncated: true, source: 'Priority ORDERS · קריאה חיה · 2 מתוך 257' }), 120);
      const k = e === 'CPROF' ? 'quotes' : e === 'ORDERS' ? 'orders' : e === 'DOCUMENTS_D' ? 'notes' : 'invoices';
      return j(FIX.priority[k], 120);
    }
    if (body.name === 'mail_search') return j(FIX.mail, 60);
    if (body.name === 'sharepoint_catalog') return j(FIX.sharepoint, 60);
    return j({ rows: [], source: 'stub' });
  });
  return calls;
}
const look = (page) => page.evaluate(() => {
  const txt = document.body.innerText;
  const nums = [...document.querySelectorAll('.nums b')].map((b) => b.textContent);
  const cards = document.querySelectorAll('.card').length;
  return {
    txt, nums, cards, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, dir: getComputedStyle(document.body).direction,
    title: document.getElementById('ttl').textContent, when: document.getElementById('when').textContent,
    certs: [...new Set([...document.querySelectorAll('.cert')].map((e) => e.textContent))],
    spLinks: [...document.querySelectorAll('.src a')].map((a) => a.getAttribute('href')),
    miss: [...document.querySelectorAll('.miss li')].map((li) => li.textContent),
    subjects: (txt.match(/הדפסת הצעת מחיר - PQ26000161/g) || []).length,
  };
});

const browser = await chromium.launch();
const errors = [];
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', deviceScaleFactor: 2, isMobile: tag !== 'desktop', hasTouch: tag !== 'desktop' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  const calls = await stub(page);
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE + '?key=' + FIX.key);
  await page.waitForSelector('.head', { timeout: 8000 });
  const L = await look(page);
  await page.screenshot({ path: `${OUT}project-${tag}-1-top.png` });
  await page.screenshot({ path: `${OUT}project-${tag}-2-full.png`, fullPage: true });
  ok(`${tag}: seven reads, each on its own — identity, four Priority screens by key, mail, SharePoint`,
    calls.includes('project_identity') && ['CPROF', 'ORDERS', 'DOCUMENTS_D', 'CINVOICES'].every((e) => calls.includes('priority_query:' + e)) && calls.includes('mail_search') && calls.includes('sharepoint_catalog') && calls.length === 7, calls.join(' '));
  ok(`${tag}: the title is the project's name, the header carries Priority's key as ודאי and the dates`, L.title === 'הדקל 7' && /מפתח בפריוריטי PR24000104/.test(L.txt) && /במסמכים מ-2\.3\.25 עד 30\.9\.26/.test(L.txt), L.title);
  ok(`${tag}: the four Priority counts`, JSON.stringify(L.nums) === JSON.stringify(['1', '2', '3', '3']), JSON.stringify(L.nums));
  ok(`${tag}: invoices are netted of credits and said so`, /₪45,000 נטו/.test(L.txt), (L.txt.match(/.{20}נטו.{5}/) || [''])[0]);
  ok(`${tag}: the materials come off the order lines, the biggest first, a line with no amount said so (never "₪0"), the balance named`,
    /פרסקו רזנטה 25 ק"ג/.test(L.txt) && /נשאר לספק 40/.test(L.txt) && /גוון\s+בלי סכום/.test(L.txt) && !/₪0(?![\d,])/.test(L.txt) && L.txt.indexOf('רזנטה') < L.txt.indexOf('הידראולי'), (L.txt.match(/.{30}₪0(?![\d,]).{10}/) || [''])[0]);
  ok(`${tag}: the office block says its basis and its tab`, /הפרויקטים הפעילים/.test(L.txt) && /הותאם לפי שם הלקוח והכתובת/.test(L.txt) && /רשימת הצילום/.test(L.txt) && /אומדן לסיום ₪122,000/.test(L.txt), '');
  ok(`${tag}: mail bound by a document number is ודאי, mail by name is לא מאומת, and a subject is never shown twice`,
    /מספר מסמך של הפרויקט/.test(L.txt) && /לוח זמנים לאספקה/.test(L.txt) && L.subjects === 1, `${L.subjects}`);
  ok(`${tag}: SharePoint hits are links`, L.spLinks.length === 2 && L.spLinks.every((h) => /^https:\/\//.test(h)), JSON.stringify(L.spLinks));
  ok(`${tag}: "מה חסר" names what is missing and that the outside world is not connected`,
    L.miss.some((s) => /אין לו רשומת מבנה/.test(s) && /העולם החיצוני/.test(s)) && !L.miss.some((s) => /אין הזמנה/.test(s)), JSON.stringify(L.miss));
  ok(`${tag}: the three certainties are the only labels, in words`, L.certs.every((c) => ['ודאי', 'צפוי', 'לא מאומת'].includes(c)) && L.certs.includes('ודאי') && L.certs.includes('לא מאומת'), JSON.stringify(L.certs));
  ok(`${tag}: no machinery on screen`, !/undefined|null|NaN|\[object|priority_|workbook_|ORDERS|CPROF|DOCUMENTS_D/.test(L.txt), (L.txt.match(/.{20}(undefined|null|NaN|priority_|workbook_|ORDERS|CPROF).{20}/) || [''])[0]);
  ok(`${tag}: RTL, no horizontal overflow, the moment shown`, L.dir === 'rtl' && L.over <= 0 && /^נכון ל-/.test(L.when), `dir=${L.dir} over=${L.over} when=${L.when}`);
  await page.click('details.more summary');
  await page.screenshot({ path: `${OUT}project-${tag}-3-open.png` });
  const det = await page.evaluate(() => document.querySelector('details.more').open && /PQ26000161/.test(document.querySelector('details.more').innerText));
  ok(`${tag}: a document list opens to its documents`, det, '');
  await ctx.close();
}
// a failed Priority read is said, never an empty list
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  await stub(page, { failNotes: true });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE + '?key=' + FIX.key);
  await page.waitForSelector('.head', { timeout: 8000 });
  const L = await look(page);
  ok('a failed read is said in words and its count is "?", not 0', L.nums[2] === '?' && /לא נקרא הפעם: תעודות משלוח/.test(L.txt) && !/לא יצאה תעודת משלוח/.test(L.txt), JSON.stringify(L.nums));
  await ctx.close();
}
// Priority hands back at most 100 rows: the count card says the real count, the sum says how many rows it covers,
// the materials say which orders they came from, and the list says it is cut — never "100" as if that were the total
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  await stub(page, { cutOrders: true });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE + '?key=' + FIX.key);
  await page.waitForSelector('.head', { timeout: 8000 });
  const L = await look(page);
  ok('a cut list: the count card carries the real count, not the rows that arrived', L.nums[1] === '257', JSON.stringify(L.nums));
  ok('a cut list: the sum says how many rows it was summed over', /מ-2 הראשונות: ₪140,000/.test(L.txt), (L.txt.match(/.{12}₪140,000.{4}/) || [''])[0]);
  ok('a cut list: the materials say which orders they came from, and the date range says it is over what was read',
    /לפי 2 ההזמנות שנקראו מתוך 257/.test(L.txt) && /במסמכים שנקראו: מהמסמך הראשון/.test(L.txt), '');
  const notes = await page.evaluate(() => [...document.querySelectorAll('details.more .note')].map((n) => n.textContent));
  ok('a cut list: the list itself says it is cut, and uncut lists do not', notes.length === 1 && /^מוצגים 2 מתוך 257/.test(notes[0]), JSON.stringify(notes));
  await ctx.close();
}
// no key in the address → one sentence, nothing fetched
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const calls = await stub(page);
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForTimeout(400);
  const t = await page.evaluate(() => document.getElementById('m').innerText);
  ok('no key: one sentence, nothing fetched', /חסר מפתח פרויקט/.test(t) && calls.length === 0, t.slice(0, 100) + ' ' + calls.join(' '));
  await ctx.close();
}
// no code → the login card, nothing fetched
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const calls = await stub(page);
  await page.goto(PAGE + '?key=' + FIX.key);
  await page.waitForTimeout(400);
  const vis = await page.evaluate(() => getComputedStyle(document.getElementById('login')).display !== 'none' && document.getElementById('app').hidden);
  ok('no code: the login card, nothing fetched', vis && calls.length === 0, calls.join(' '));
  await ctx.close();
}
await browser.close();
ok('no page errors', errors.length === 0, errors.join(' | '));
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} checks passed`);
process.exit(bad ? 1 : 0);
