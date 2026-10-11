// THE ORGANIZER (David, 11.10 — "מערכת הניהול הארגונית של LIA, לא לוח משימות"): the real lia.html in Chromium against
// a stubbed tower that carries the server's `organizer` block and per-department kpis / health / exceptions / next /
// history. Rules checked: the overview (exceptions · decisions · census) comes first; a KPI the server marks
// NOT_CONNECTED reads לא מחובר and never 0; the KPI table carries value · verification · as_of · window and opens its
// definition; the next action travels with its executor and success test; the form carries the nine fields and posts
// them; the eleven departments route; the state words are the server's.
//   node test-organizer-v2.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
let bad = 0, total = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

const K = (key, label, display, verification, as_of, window, source, formula, note) => ({ key, dept: 'sales', label, display, value: verification === 'NOT_CONNECTED' ? null : 1, verification, as_of, window, source, formula, note, unit: 'nis', verify_every_h: 24 });
const SALES_KPIS = [
  K('sales_mtd_net', 'מכירות נטו מתחילת החודש', '₪435,205', 'VERIFIED', '2026-10-11T16:08:49Z', 'MTD', 'kpi_cache:fresco_snapshot · priority:CINVOICES', 'Σ QPRICE של חשבוניות סופיות', null),
  K('quote_to_order_60d', 'המרת הצעות מחיר להזמנות · 60 יום', '40.4%', 'VERIFIED', '2026-10-11T09:24:19Z', '60 יום', 'kpi_cache:fresco_forecast', 'הומרו ÷ הוכרעו', '19 מתוך 47 שהוכרעו (54 הוצאו)'),
  K('receivables_open', 'חייבים פתוחים', '₪1,713,251', 'STALE', '2026-09-25T20:43:34Z', '365 יום', 'kpi_cache:receivables', 'Σ TOTPRICE', null),
  K('inventory_value', 'מלאי', 'לא מחובר', 'NOT_CONNECTED', null, 'עכשיו', 'לא מחובר — PARTBAL סגור', 'יתרות מלאי', 'לא מחובר — PARTBAL סגור'),
];
const M = (label, value) => ({ label, value, source: 'test' });
const dept = (key, name, extra) => Object.assign({ key, name, state: 'LIVE', metrics: [M('x', 1)], stuck: '', next: '', ceo: null, cmds: [], note: '', registry: { source: 'david', goal: 'g' },
  management: { status: 'LIVE', goal: 'g', owner: 'o', kpi: [M('x', 1)], active_work: { count: 0, top: [] }, blocker: null, next_action: null, needs_david: null, goal_source: 'david' },
  kpis: [], health: 'OK', health_he: 'תקין', exceptions: [], proposed_next: null, history: [], scope: 'fresco', next: { action: null, executor: null, success_test: null, dependencies: null, exec_owner: null } }, extra || {});
const DEPARTMENTS = [
  dept('management', 'הנהלה', { scope: 'all', health: 'NO_DATA', kpis: [K('mgmt_pbt_ytd', 'רווח לפני מס', 'לא מחובר', 'NOT_CONNECTED', null, 'YTD', 'kpi_cache:pbt', 'f', 'kpi_cache:pbt')], exceptions: [{ dept: 'management', code: 'KPI_NOT_CONNECTED', severity: 'HIGH', text: 'אף KPI לא מחובר למקור (3 מוגדרים)', action: 'לחבר מקור' }] }),
  dept('sales', 'מכירות', { health: 'ATTENTION', kpis: SALES_KPIS, registry: { source: 'david', goal: 'g', owner: 'אריק', next_action: 'לסגור שלוש הצעות', next_executor: 'אריק', success_test: 'שלוש הזמנות בפריוריטי', exec_owner: 'אורנה', dependencies: 'אישור אשראי' },
    exceptions: [{ dept: 'sales', code: 'KPI_STALE', severity: 'MED', text: 'חייבים פתוחים: הקריאה ישנה', action: 'לרענן kpi_cache:receivables' }, { dept: 'sales', code: 'NO_ACTIVE_WORK', severity: 'MED', text: 'יש פעולה הבאה ואין חבילת עבודה חיה מאחוריה', action: 'לפתוח עבודה: לסגור שלוש הצעות' }],
    proposed_next: 'לרענן kpi_cache:receivables', history: [{ at: '2026-10-11T18:00:00Z', kind: 'department_updated', text: 'דוד עדכן: goal, owner', work_id: null }],
    next: { action: 'לסגור שלוש הצעות', executor: 'אריק', success_test: 'שלוש הזמנות בפריוריטי', dependencies: 'אישור אשראי', exec_owner: 'אורנה' } }),
  dept('customers', 'לקוחות'), dept('marketing', 'שיווק'), dept('capital', 'כספים והון'), dept('purchasing', 'רכש'), dept('operations', 'ייצור ותפעול'),
  dept('rnd', 'מו"פ', { scope: 'matriya', health: 'BLOCKED', state: 'BLOCKED' }), dept('branding', 'מיתוג'), dept('advertising', 'פרסום'), dept('growth', 'פרויקטים ויוזמות צמיחה', { scope: 'ventures' }),
];
const ORGANIZER = { as_of: '2026-10-11T19:30:00Z', overview: {
  health: { OK: 8, ATTENTION: 1, BLOCKED: 1, NO_DATA: 1 }, kpis: { total: 32, verified: 10, stale: 3, unverified: 2, not_connected: 17 },
  exceptions: [{ dept: 'sales', dept_name: 'מכירות', code: 'KPI_STALE', severity: 'MED', text: 'חייבים פתוחים: הקריאה ישנה', action: 'לרענן' }, { dept: 'management', dept_name: 'הנהלה', code: 'KPI_NOT_CONNECTED', severity: 'HIGH', text: 'אף KPI לא מחובר', action: 'לחבר מקור' }],
  decisions: [{ dept: 'sales', dept_name: 'מכירות', decision: 'האצלה לסוכן' }], scopes: { fresco: 8, matriya: 1, ventures: 1 } } };

const browser = await chromium.launch();
const errors = []; const posted = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/functions/v1/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  let json = { ok: true, rows: [] };
  if (body.action === 'state') json = { ok: true, queue: [], model: { connected: true, provider: 'openai' }, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 }, panel_build_latest: '2026-09-10.2' };
  else if (body.action === 'tower') json = { departments: DEPARTMENTS, organizer: ORGANIZER };
  else if (body.action === 'department_set') { posted.push(body); json = { ok: true, department: body }; }
  else if (body.action === 'sales') json = { today_orders: 0, today_amount: 0 };
  else if (body.action === 'chat_sync' || body.action === 'chat_new') json = { conversation_id: 'c1', messages: [], cursor: '' };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
});
await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
await page.goto(PAGE);
await page.waitForSelector('.orgItem[data-org]', { state: 'attached', timeout: 5000 });
await page.evaluate(() => { const w = document.getElementById('orgWrap'); if (w && !w.open) w.open = true; });

const overview = await page.$eval('#orgOverview', (x) => x.textContent).catch(() => '');
ok('the overview strip renders FIRST in the ORGANIZATION card', await page.$eval('#orgList', (x) => x.firstElementChild && x.firstElementChild.id === 'orgOverview'));
ok('the overview leads with the health census and the KPI connection census', /חסום 1/.test(overview) && /דורש תשומת לב 1/.test(overview) && /KPI מחוברים 15 מתוך 32/.test(overview) && /לא מחוברים 17/.test(overview), overview.slice(0, 300));
ok('exceptions are listed with severity and department, the HIGH first as the server ordered', overview.indexOf('גבוה') >= 0 && overview.indexOf('בינוני') >= 0 && /הנהלה — אף KPI לא מחובר/.test(overview), overview.slice(0, 300));
ok('decisions only David can make are a separate list', /החלטות שרק דוד מכריע:[\s\S]*מכירות — האצלה לסוכן/.test(overview));
ok('the scopes are told apart (Fresco · MATRIYA · ventures)', /פרסקו 8 · מטריה 1 · יוזמות 1/.test(overview));

const rows = await page.$$eval('.orgItem[data-org]', (xs) => xs.map((x) => ({ key: x.getAttribute('data-org'), met: x.querySelector('.met').textContent, cls: x.className })));
ok('the eleven departments render in the server\'s order', rows.map((r) => r.key).join(',') === DEPARTMENTS.map((d) => d.key).join(','), rows.map((r) => r.key).join(','));
ok('each row leads with its COMPUTED health and its exception count — not the first metric', rows.find((r) => r.key === 'sales').met === 'דורש תשומת לב · 2 חריגים' && rows.find((r) => r.key === 'management').met === 'אין נתון · 1 חריגים', JSON.stringify(rows.slice(0, 2)));
ok('the row dot follows the health class', /h-ATTENTION/.test(rows.find((r) => r.key === 'sales').cls) && /h-BLOCKED/.test(rows.find((r) => r.key === 'rnd').cls));
ok('the three organizer departments have labels', (await page.$$eval('.orgItem .nm', (xs) => xs.map((x) => x.textContent))).join('|').includes('הנהלה|') && SRC.includes("customers:'לקוחות'") && SRC.includes("growth:'יוזמות צמיחה'"));

await page.click('.orgItem[data-org="sales"] .nm');
await page.waitForTimeout(150);
const det = await page.$eval('#orgDetail_sales', (x) => x.textContent);
ok('the department opens with its computed health and scope', /בריאות מחושבת: דורש תשומת לב · תחום: פרסקו/.test(det), det.slice(0, 200));
const kpiRows = await page.$$eval('#orgDetail_sales table.orgKpi tbody tr:not(.kdef)', (xs) => xs.map((r) => Array.from(r.querySelectorAll('td')).map((t) => t.textContent)));
ok('the KPI table carries label · value · verification · as_of · window per KPI', kpiRows.length === 4 && kpiRows[0][0] === 'מכירות נטו מתחילת החודש' && kpiRows[0][1] === '₪435,205' && kpiRows[0][2] === 'מאומת' && /11\.10/.test(kpiRows[0][3]) && kpiRows[0][4] === 'MTD', JSON.stringify(kpiRows));
ok('a STALE read says ישן with its own date, never a fresh one', kpiRows[2][2] === 'ישן' && /25\.9/.test(kpiRows[2][3]), JSON.stringify(kpiRows[2]));
ok('a NOT_CONNECTED KPI reads לא מחובר — and no 0 appears for it', kpiRows[3][1] === 'לא מחובר' && kpiRows[3][2] === 'לא מחובר' && kpiRows[3][3] === '—', JSON.stringify(kpiRows[3]));
ok('the conversion KPI shows the re-verified census in its note (definition row)', (await page.$eval('#orgDetail_sales table.orgKpi tbody tr.kdef:nth-of-type(4)', (x) => x.textContent)).includes('19 מתוך 47 שהוכרעו'));
const defHidden = await page.$eval('#orgDetail_sales table.orgKpi tr.kdef', (x) => getComputedStyle(x).display === 'none');
await page.click('#orgDetail_sales table.orgKpi tbody tr:not(.kdef)');
const defShown = await page.$eval('#orgDetail_sales table.orgKpi tr.kdef', (x) => getComputedStyle(x).display !== 'none');
ok('clicking a KPI row opens its definition (formula · source); it is folded by default', defHidden && defShown);
ok('the row click on a KPI does not toggle the department', await page.$eval('.orgItem[data-org="sales"]', (x) => x.getAttribute('data-open') === 'true'));
ok('exceptions, blockers and dependencies are listed with their severity and the action they call for', /חריגים, חסמים ותלויות:/.test(det) && /חייבים פתוחים: הקריאה ישנה/.test(det) && /← לרענן kpi_cache:receivables/.test(det));
ok('the next action travels with its executor, success test, executing owner and dependencies', /הפעולה הבאה: לסגור שלוש הצעות · מבצע: אריק · מבחן הצלחה: שלוש הזמנות בפריוריטי/.test(det) && /אחראי ביצועי: אורנה · תלויות: אישור אשראי/.test(det), det.slice(0, 600));
ok('LIA\'s proposed next step is shown as a proposal, never written', /ליה מציעה: לרענן kpi_cache:receivables/.test(det) && /הצעה, לא נכתב לרישום/.test(det));
ok('the decision / action history renders from the ledger', /היסטוריה:/.test(det) && /דוד עדכן: goal, owner/.test(det));
const mgmt = await (async () => { await page.click('.orgItem[data-org="management"] .nm'); await page.waitForTimeout(120); return page.$eval('#orgDetail_management', (x) => x.textContent); })();
ok('a department with nothing connected says אין נתון and לא מחובר — nowhere a 0 for the missing read', /בריאות מחושבת: אין נתון/.test(mgmt) && /רווח לפני מס.*לא מחובר/.test(mgmt) && !/רווח לפני מס[^א-ת]*0[^,\d]/.test(mgmt), mgmt.slice(0, 300));

/* the form: nine fields, posted as department_set */
await page.click('[data-orgedit="management"]');
const names = await page.$$eval('#orgEdit_management input, #orgEdit_management textarea', (xs) => xs.map((x) => x.name));
ok('the form carries the five of 5.10 and the organizer\'s four', names.join(',') === 'goal,owner,kpi_label,next_action,blocker,exec_owner,next_executor,success_test,dependencies', names.join(','));
await page.fill('#orgEdit_management_next_executor', 'ליה');
await page.fill('#orgEdit_management_success_test', 'תמונת העל ללא חריג HIGH');
await page.click('#orgEdit_management button[type=submit]');
await page.waitForTimeout(300);
const p0 = posted[0] || {};
ok('department_set is posted with the four new fields', p0.action === 'department_set' && p0.key === 'management' && p0.next_executor === 'ליה' && p0.success_test === 'תמונת העל ללא חריג HIGH' && 'dependencies' in p0 && 'exec_owner' in p0, JSON.stringify(p0));

/* mobile: the same overview above the rows */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', isMobile: true, hasTouch: true });
const mp = await mctx.newPage(); mp.on('pageerror', (e) => errors.push('mobile ' + e.message));
await mp.route('**/functions/v1/**', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); let json = { ok: true, rows: [] };
  if (body.action === 'state') json = { ok: true, queue: [], model: { connected: true, provider: 'openai' }, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 }, panel_build_latest: '2026-09-10.2' };
  else if (body.action === 'tower') json = { departments: DEPARTMENTS, organizer: ORGANIZER };
  else if (body.action === 'chat_sync' || body.action === 'chat_new') json = { conversation_id: 'c1', messages: [], cursor: '' };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) }); });
await mp.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
await mp.goto(PAGE);
await mp.waitForSelector('#orgListMobile .orgItem[data-org]', { state: 'attached', timeout: 5000 }).catch(() => {});
ok('the phone section carries the same overview above its rows', await mp.$eval('#orgListMobile', (x) => !!x.querySelector('#orgOverview') && x.querySelectorAll('.orgItem[data-org]').length === 11).catch(() => false));

ok('build bumped to 2026-10-11.2 or later', ((SRC.match(/const LIA_BUILD='([^']+)';/) || [])[1] || '') >= '2026-10-11.2');
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\norganizer v2 · ${total - bad} passed · ${bad} failed`);
process.exit(bad ? 1 : 0);
