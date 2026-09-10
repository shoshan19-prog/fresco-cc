// ORGANIZATION rows are navigation (David, 10.9). Drives the REAL lia.html in
// a browser against a mocked network — the same harness shape as
// test-chat-sync.mjs — and checks the ten rules David set:
//   1 whole row clickable  2 hover/pressed/cursor  3 correct existing target
//   4 stable route ids     5 same-page: expand+scroll  6 (no other page exists)
//   7 Back returns         8 44px touch target        9 Enter/Space
//  10 no duplicate screens — plus: ONE route table, no per-row nav logic.
//   node test-org-routes.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');

let bad = 0, total = 0;
const ok = (label, cond, extra) => {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; }
};

// The tower payload exactly as command-center shapes it (DEPTS ⊕ byKey).
const M = (label, value) => ({ label, value, source: 'test' });
const DEPARTMENTS = [
  { key: 'branding', name: 'מיתוג', state: 'HIDDEN', metrics: [M('נכסי מותג שנוצרו', 18)], stuck: '', next: 'לחשוף את council', ceo: null, cmds: ['council'], note: 'n' },
  { key: 'marketing', name: 'שיווק', state: 'HIDDEN', metrics: [M('פרויקטים', 3)], stuck: 'הזדמנות אחת בלבד', next: 'להריץ opps', ceo: 'איזה שוק פעיל', cmds: ['opps'], note: 'n' },
  { key: 'advertising', name: 'פרסום', state: 'MISSING', metrics: [M('קמפיינים', 'MISSING')], stuck: 'אין מנוע פרסום', next: 'מחוץ ל-V1', ceo: 'גישה לחשבונות', cmds: ['wp'], note: 'n' },
  /* sales carries the server's `management` block (10.9); the others do not —
     the panel must build the same eight fields from what they carry. */
  { key: 'sales', name: 'מכירות', state: 'LIVE', metrics: [M('הזמנות החודש', 81)], stuck: 'כרטיסי-שיחה', next: 'dormant', ceo: 'האצלה לסוכן', cmds: ['dormant'], note: 'n',
    management: { status: 'LIVE', goal: null, owner: null, kpi: [M('הזמנות החודש', 81)],
      active_work: { count: 2, top: [{ id8: 'ac70431b', status: 'RUNNING', head: '31 תעודות המשלוח שלא חויבו' }] },
      blocker: 'כרטיסי-שיחה', next_action: 'dormant', needs_david: 'האצלה לסוכן' } },
  { key: 'purchasing', name: 'רכש', state: 'MISSING', metrics: [M('ספקים בפנקס', 'MISSING')], stuck: 'יכולת אחת', next: 'מחוץ ל-V1 במפורש', ceo: null, cmds: ['import_independence'], note: 'n' },
  { key: 'operations', name: 'ייצור ותפעול', state: 'LIVE', metrics: [M('תעודות משלוח', 43580)], stuck: null, next: 'סנכרון אינקרמנטלי', ceo: null, cmds: ['sync'], note: 'n' },
  { key: 'rnd', name: 'מו"פ', state: 'HIDDEN', metrics: [M('נכסי ידע', 12)], stuck: 'דרגת "מוכח" חסומה', next: 'להריץ completeness', ceo: 'תעודת תקן חתומה', cmds: ['lab'], note: 'n' },
  { key: 'capital', name: 'כספים והון', state: 'MISSING', metrics: [M('הזדמנויות מימון', 0)], stuck: 'הטבלה ריקה', next: 'לזרוע גופים מממנים', ceo: 'חוזה המדדים', cmds: ['attribution'], note: 'n' },
];
const KEYS = DEPARTMENTS.map((d) => d.key);

const browser = await chromium.launch();
const errors = [];
async function device(opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' }, opts.ctx || {}));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${opts.tag} pageerror: ${e.message}`));
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    let json = { ok: true, rows: [] };
    if (body.action === 'state') json = { ok: true, queue: [], model: { connected: true, provider: 'openai' },
      counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 }, panel_build_latest: '2026-09-10.2' };
    else if (body.action === 'tower') json = { departments: DEPARTMENTS };
    else if (body.action === 'sales') json = { today_orders: 0, today_amount: 0 };
    else if (body.action === 'chat_sync' || body.action === 'chat_new') json = { conversation_id: 'c1', messages: [], cursor: '' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
  await page.goto(PAGE + (opts.hash || ''));
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  /* the ORGANIZATION card is a collapsed <details> by default — a user expands
     it first; a route opens it itself (showOrgInline sets wrap.open). */
  await page.waitForSelector('.orgItem[data-org], .railEmpty', { state: 'attached', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { const w = document.getElementById('orgWrap'); if (w && !w.open) w.open = true; });
  return { page, ctx };
}
const openRow = (page, key) => page.$eval(`.orgItem[data-org="${key}"]`, (r) => r.getAttribute('data-open') === 'true');
const hash = (page) => page.evaluate(() => location.hash);
const openDetails = (page) => page.$$eval('.orgDetail.on', (xs) => xs.length);

// ── desktop: the rail renders, rows are buttons ─────────────────────────────
const d = await device({ tag: 'desktop' });
await d.page.waitForSelector('.orgItem[data-org]', { timeout: 5000 });
const rows = await d.page.$$eval('.orgItem', (xs) => xs.map((x) => ({
  key: x.getAttribute('data-org'), role: x.getAttribute('role'), tab: x.getAttribute('tabindex'),
  cursor: getComputedStyle(x).cursor, onclick: x.getAttribute('onclick'), text: x.querySelector('.nm').textContent })));
ok('all eight rows render with a stable route id', rows.map((r) => r.key).join(',') === KEYS.join(','), JSON.stringify(rows.map((r) => r.key)));
ok('every row is a keyboard-reachable button', rows.every((r) => r.role === 'button' && r.tab === '0'));
ok('every row shows a pointer cursor', rows.every((r) => r.cursor === 'pointer'), rows.map((r) => r.cursor).join(','));
ok('no row carries its own navigation handler (delegated only)', rows.every((r) => r.onclick === null));
ok('the labels are the eight David listed', rows.map((r) => r.text).join('|') === 'שיווק תוכן|שיווק|פרסום|מכירות|רכש|תפעול|מו"פ|כספים', rows.map((r) => r.text).join('|'));
const table = await d.page.evaluate(() => Object.keys(ORGANIZATION_ROUTES));
ok('ORGANIZATION_ROUTES is one table with exactly the eight keys', table.join(',') === KEYS.join(','), table.join(','));

// ── 1 + 5: click the TEXT (not the dot) → same-page expand + scroll + hash ──
await d.page.click('.orgItem[data-org="rnd"] .nm');
await d.page.waitForTimeout(150);
ok('clicking the row text opens the department', await openRow(d.page, 'rnd'));
const rndTxt = await d.page.$eval('#orgDetail_rnd', (x) => x.textContent);
ok('the detail is real content from the tower payload, on the management fields',
  /חסם: דרגת "מוכח" חסומה/.test(rndTxt) && /הפעולה הבאה: להריץ completeness/.test(rndTxt) && /דורש דוד: תעודת תקן חתומה/.test(rndTxt), rndTxt.slice(0, 220));
ok('the eight management fields render in David\'s order, even without a server `management` block',
  /מצב:[\s\S]*מטרה:[\s\S]*אחראי:[\s\S]*KPI:[\s\S]*עבודה פעילה:[\s\S]*חסם:[\s\S]*הפעולה הבאה:[\s\S]*דורש דוד:/.test(rndTxt), rndTxt.slice(0, 220));
ok('fields the system does not hold say לא מוגדר (goal, owner, active work here)', (rndTxt.match(/לא מוגדר/g) || []).length >= 3, rndTxt);
ok('the route id is a stable deep-link', await hash(d.page) === '#org/rnd', await hash(d.page));
ok('the ORGANIZATION card is open so the row is visible', await d.page.$eval('#orgWrap', (x) => x.open));
const inView = await d.page.$eval('.orgItem[data-org="rnd"]', (x) => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
ok('the opened row is scrolled into view', inView);
ok('exactly one detail is open (no duplicate screens)', await openDetails(d.page) === 1);
ok('the metric bullet is still clickable as part of the row (whole row, not only the dot)',
  await d.page.$eval('.orgItem[data-org="rnd"] .met', (x) => !!x.closest('.orgItem[data-org]')));

// ── 7: Back returns ─────────────────────────────────────────────────────────
await d.page.goBack();
await d.page.waitForTimeout(150);
ok('Back closes the department and clears the route', !(await openRow(d.page, 'rnd')) && (await hash(d.page)) === '', await hash(d.page));
await d.page.goForward();
await d.page.waitForTimeout(150);
ok('Forward reopens it', await openRow(d.page, 'rnd') && (await hash(d.page)) === '#org/rnd');
await d.page.goBack(); await d.page.waitForTimeout(100);

// ── 9: keyboard ─────────────────────────────────────────────────────────────
await d.page.focus('.orgItem[data-org="marketing"]');
await d.page.keyboard.press('Enter');
await d.page.waitForTimeout(150);
ok('Enter opens the focused row', await openRow(d.page, 'marketing') && (await hash(d.page)) === '#org/marketing');
await d.page.focus('.orgItem[data-org="operations"]');
await d.page.keyboard.press('Space');
await d.page.waitForTimeout(150);
ok('Space opens the focused row', await openRow(d.page, 'operations'));
ok('opening another row closes the previous one (single open detail)', !(await openRow(d.page, 'marketing')) && (await openDetails(d.page)) === 1);
ok('a focus ring is defined for keyboard users', /\.orgItem:focus-visible\{outline/.test(SRC));

// ── 3 + 5 (10.9): מכירות opens the SAME management card as every department ──
await d.page.click('.orgItem[data-org="sales"]');
await d.page.waitForTimeout(200);
const salesTxt = await d.page.$eval('#orgDetail_sales', (x) => x.textContent);
ok('מכירות opens inline like every other department, as a deep-link', await openRow(d.page, 'sales') && (await hash(d.page)) === '#org/sales', await hash(d.page));
ok('the management card carries the server block: status, KPI, blocker, next action, needs David',
  /מצב: חי/.test(salesTxt) && /הזמנות החודש: 81/.test(salesTxt) && /חסם: כרטיסי-שיחה/.test(salesTxt) && /הפעולה הבאה: dormant/.test(salesTxt) && /דורש דוד: האצלה לסוכן/.test(salesTxt), salesTxt.slice(0, 260));
ok('goal and owner — which no system holds — say לא מוגדר, not a guess', (salesTxt.match(/לא מוגדר/g) || []).length === 2, salesTxt);
ok('active work is real package data, never project-map prose', /2 חבילות/.test(salesTxt) && /ac70431b · RUNNING/.test(salesTxt) && !/פרויקטים תקועים|מפת הפרויקטים/.test(salesTxt), salesTxt);
ok('no second sales screen was created', (await openDetails(d.page)) === 1);

// ── the rail re-renders every minute — the open detail must survive ─────────
await d.page.click('.orgItem[data-org="capital"]');
await d.page.waitForTimeout(150);
await d.page.evaluate(() => renderOrg());
await d.page.waitForTimeout(50);
ok('a rail refresh keeps the open department open', await openRow(d.page, 'capital') && (await openDetails(d.page)) === 1);
// clicking the open row again closes it (toggle) and steps history back
await d.page.click('.orgItem[data-org="capital"]');
await d.page.waitForTimeout(150);
ok('clicking the open row closes it', !(await openRow(d.page, 'capital')));

// ── 2: hover / pressed states exist in the stylesheet ───────────────────────
ok('hover, pressed and open states are styled', /\.orgItem:hover\{/.test(SRC) && /\.orgItem:active\{transform/.test(SRC) && /\.orgItem\[data-open="true"\]\{/.test(SRC));
await d.ctx.close();

// ── 4: deep-link boot on the desktop lands open + visible ───────────────────
const dl = await device({ tag: 'deeplink', hash: '#org/capital' });
await dl.page.waitForSelector('.orgItem[data-org="capital"][data-open="true"]', { timeout: 5000 }).catch(() => {});
ok('opening the page on #org/capital lands with כספים open', await openRow(dl.page, 'capital'));
await dl.ctx.close();

// ── 6 / phone: no rail there — the deep-link opens the shared drawer ────────
/* Realistic phone flow: the page is open, THEN the route is entered (a tapped
   link / bookmark in the same tab) — so there is a page for Back to return to.
   A deep-link as the tab's very first entry has nothing before it; Back there
   leaves the page, which is the browser's own correct behavior. */
const m = await device({ tag: 'phone', ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
/* 10.9: ORGANIZATION renders on the phone DIRECTLY — no deep-link needed. */
await m.page.waitForSelector('#orgListMobile .orgItem[data-org]', { timeout: 5000 }).catch(() => {});
const mobileRows = await m.page.$$eval('#orgListMobile .orgItem', (xs) => xs.map((x) => x.getAttribute('data-org'))).catch(() => []);
ok('ORGANIZATION is visible on the phone without any deep-link, with the eight rows',
  (await m.page.$eval('#orgMobile', (x) => getComputedStyle(x).display !== 'none')) && mobileRows.join(',') === KEYS.join(','), mobileRows.join(','));
ok('the desktop rail is NOT rendered on the phone (one card, two homes, no duplicate screens)', (await m.page.$$eval('#orgList .orgItem', (xs) => xs.length)) === 0);
await m.page.tap('#orgListMobile .orgItem[data-org="sales"]');
await m.page.waitForSelector('#evDrawer.on', { timeout: 5000 }).catch(() => {});
const mBody = await m.page.$eval('#evBody', (x) => x.textContent);
ok('tapping a department opens the drawer titled with it', (await m.page.$eval('#evHead b', (x) => x.textContent)) === 'מכירות');
ok('the drawer shows the management fields', /מצב:[\s\S]*מטרה:[\s\S]*אחראי:[\s\S]*KPI:[\s\S]*עבודה פעילה:[\s\S]*חסם:[\s\S]*הפעולה הבאה:[\s\S]*דורש דוד:/.test(mBody) && /ac70431b/.test(mBody), mBody.slice(0, 200));
ok('the tap is a deep-link too', (await hash(m.page)) === '#org/sales');
await m.page.goBack(); await m.page.waitForTimeout(150);
ok('Back closes the drawer after a tap', !(await m.page.$eval('#evDrawer', (x) => x.classList.contains('on'))) && (await hash(m.page)) === '');
// the deep-link still works on the phone
await m.page.evaluate(() => { location.hash = '#org/rnd'; });
await m.page.waitForSelector('#evDrawer.on', { timeout: 5000 }).catch(() => {});
ok('on the phone a deep-link opens the existing drawer (no rail, no new screen)', await m.page.$eval('#evDrawer', (x) => x.classList.contains('on')));
ok('the drawer is titled with the department', (await m.page.$eval('#evHead b', (x) => x.textContent)) === 'מו"פ');
ok('the drawer carries the same detail lines', /הפעולה הבאה: להריץ completeness/.test(await m.page.$eval('#evBody', (x) => x.textContent)));
await m.page.goBack(); await m.page.waitForTimeout(150);
ok('Back closes the drawer on the phone', !(await m.page.$eval('#evDrawer', (x) => x.classList.contains('on'))));
await m.ctx.close();

// ── 8: touch target ─────────────────────────────────────────────────────────
const t = await device({ tag: 'touch', ctx: { viewport: { width: 1280, height: 900 }, hasTouch: true } });
await t.page.waitForSelector('.orgItem[data-org]', { timeout: 5000 });
const coarse = await t.page.evaluate(() => matchMedia('(pointer:coarse)').matches);
const h = await t.page.$eval('.orgItem[data-org="rnd"]', (x) => x.getBoundingClientRect().height);
if (coarse) ok('touch rows are at least 44px tall', h >= 44, `height ${h}`);
else ok('the 44px touch rule is present for coarse pointers (browser reported fine pointer here)', /@media\(pointer:coarse\)\{\.orgItem\{min-height:44px\}\}/.test(SRC));
await t.ctx.close();

ok('no page errors across all contexts', errors.length === 0, errors.join(' · '));
await browser.close();
console.log(`${total - bad}/${total} org-route asserts passed`);
process.exit(bad ? 1 : 0);
