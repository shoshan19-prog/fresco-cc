// FRESCO KPIs — what David sees (5.10): the real lia.html in Chromium, the engine stubbed with
// its REAL row of 5.10 14:28Z (fixtures/fresco-snapshot-2026-10-05.json), the panel expanded.
//   node qa-kpi-panel.mjs          → qa/kpi-*.png  (desktop 1440×900 · 1600×900)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const F = JSON.parse(readFileSync(new URL('./fixtures/fresco-snapshot-2026-10-05.json', import.meta.url), 'utf8'));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url)); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
let total = 0, bad = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

async function open(viewport, tag) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'cap' && body.name === 'fresco_snapshot')
      return j({ rows: [{ answer: '', snapshot: F.row, verdict: F.verdict, engine: 'fresco_snapshot', evidence: ['מהמטמון — חושב ב-' + F.at] }], source: 'fresco_snapshot · מהמטמון' });
    if (body.action === 'cap' && body.name === 'kpi_read') return j({ rows: [{ text: F.quotes_to_orders_60d }] });
    if (body.action === 'cap' && body.name === 'cash_position') return j({ rows: [{ cached: false, at: '2026-10-30T07:45:00Z', error: null, position: {
      available_now: 994345.22, available_with_deposits: 5065930.84, net_after_written_checks: 769742.3,
      totals: { banks: 994345.22, deposits: 4071585.62, pledged: 0, incoming: 1105539.06, outgoing: 184448.39, cards: 40154.53 },
      banks: [{ name: 'בנק לאומי שקלי', amount: 788773.47 }, { name: 'בנק לאומי דולר', amount: 197851.75 }, { name: 'בנק מזרחי טפחות שקלי 120231', amount: 7720 }],
      deposits: [{ name: 'פקדון מזרחי 231', amount: 3969864.62 }, { name: 'פקדון ני"ע לאומי', amount: 101721 }], pledged: [],
      incoming: [{ name: 'קופת כרטיסי אשראי', amount: 535189.17 }, { name: 'קופת שיקים', amount: 385367 }, { name: 'המחאות לגביה בנק לאומי', amount: 186917.98 }],
      outgoing: [], cards: [], definition: 'יתרות ספרים מפריוריטי — לא דף בנק', caveats: ['יתרת ספרים — לא דף בנק'] } }] });
    if (body.action === 'cap' && body.name === 'supply_chain') return j({ rows: [{ cached: true, at: '2026-10-28T08:00:00Z', error: null, agg: SUPPLY }] });
    if (body.action === 'cap' && body.name === 'next_decision') return j({ rows: [{ claim: 'לאשר את מחיר הפרויקט במרינה', project_name: 'מרינה' }], source: 'recommendation' });
    if (body.action === 'cap') return j({ rows: [], source: '' });
    if (body.action === 'sales') return j({ today_orders: 15, today_amount: 85850, today_amount_incl_vat: 101303, biggest_order: { customer: 'רשות העתיקות', amount: 42373 }, top_customers: [], source: 'ORDERS' });
    if (body.action === 'tower') return j({ departments: [] });
    if (body.action === 'chat_sync' || body.action === 'chat_new') return j({ conversation_id: 'c1', messages: [], cursor: '' });
    j({ ok: true, items: [], objects: [], queue: [], model: true, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); localStorage.setItem('rail:kpiCard', '0'); });
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#kpis .kpiTile').length >= 8, null, { timeout: 8000 });
  await page.addStyleTag({ content: '#clock{visibility:hidden!important}*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(300);
  return { page, ctx };
}
const SUPPLY = { as_of: '2026-10-28', open: { count: 6, by_currency: [{ currency: 'ILS', value: 8785, count: 1 }, { currency: 'EUR', value: 17125, count: 5 }], overdue: 1, due_14d: 1, no_estimate: 0,
  oldest: [{ order: 'PO190', supplier: 'WEBER', date: '2026-09-20', expected: '2026-10-15' }], next: [{ order: 'PO204', supplier: 'מיקרוגיל', date: '2026-10-26', expected: '2026-10-29' }] },
  partial: 1, drafts: 1, lead: { import: { median_days: 25, n: 3 }, local: { median_days: 4, n: 3 } },
  concentration: { supplier: 'WEBER', count: 4, share: 67, expected_from: '2026-10-15', expected_to: '2026-11-16' } };
const tileText = (page) => page.$$eval('#kpis .kpiTile', (xs) => xs.map((x) => ({ key: x.getAttribute('data-kpi'), open: x.getAttribute('data-open'), cls: x.className, text: x.innerText.replace(/\s+/g, ' ').trim() })));

for (const [w, h] of [[1440, 900], [1600, 900]]) {
  const tag = `kpi-${w}x${h}`;
  const { page, ctx } = await open({ width: w, height: h }, tag);
  await page.screenshot({ path: OUT + tag + '-1-page.png' });
  const card = page.locator('#kpiCard');
  await card.screenshot({ path: OUT + tag + '-2-panel.png' });
  const head = await page.$eval('#kpiCard .railHead', (x) => x.innerText.replace(/\s+/g, ' ').trim());
  ok(`${tag}: the header is the reference point`, /FRESCO KPIs אוקטובר · Baseline ₪770K/.test(head), head);
  ok(`${tag}: the body opens on the official pace — working days first, calendar as reference (decision 164)`, await page.$eval('#kpiCard', (x) => /ימי עבודה 3\/21 · קלנדרי 5\/31/.test(x.innerText.replace(/\s+/g, ' '))));
  let tiles = await tileText(page);
  const T = (key) => tiles.find((t) => t.key === key) || { text: '', cls: '', open: '' };
  ok(`${tag}: CEO Cockpit B — the year leads, then eleven cards and נתונים נוספים, all folded`, tiles.map((t) => t.key).join(',') === 'year,sales,forecast,gap,cover,pbt,cash,receivables,quotes,backlog,unbilled_due,more' && tiles.every((t) => t.open === 'false'), JSON.stringify(tiles.map((t) => t.key + ':' + t.open)));
  ok(`${tag}: the year lead reads in one line — ₪8.47M of ₪13.21M · 64% · -10% · forecast ₪11.12M · gap ₪2.09M — drawn red, with the bar`, /₪8\.47M\s*מתוך ₪13\.21M 64% מהיעד · -10% מאשתקד תחזית לסוף השנה ₪11\.12M פער ₪2\.09M/.test(T('year').text) && /s-bad/.test(T('year').cls) && await page.$('#kpis .kpiLead .kpiBar .a') !== null, T('year').text);
  const rows = await page.$$eval('#kpis .kpiRow', (xs) => xs.map((x) => x.textContent.trim()));
  ok(`${tag}: the rows are David's order — החודש · רווחיות · מזומנים · מכירות, הזמנות וחיובים`, rows.join('|') === 'החודש · אוקטובר|רווחיות|מזומנים|מכירות, הזמנות וחיובים', rows.join('|'));
  ok(`${tag}: cash = Priority's book balance of the banks, marked partial (30.10)`, /מזומנים בבנק\s*₪994K/.test(T('cash').text) && /חלקי/.test(T('cash').text), T('cash').text);
  const ops = await page.$eval('#ops', (x) => x.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  ok(`${tag}: production · lab · risks sits under the KPIs as a quiet list; supply chain reads its own capability (money per currency, lead times, the WEBER dependency); the organizer is still in the rail`, /מעבדה \(MATRIYA\):/.test(ops) && /שרשרת אספקה: 6 הזמנות רכש פתוחות · ₪8\.8K \+ €17\.1K/.test(ops) && /יבוא ~25 יום · מקומי ~4 יום/.test(ops) && /WEBER: 4 מתוך 6 ההזמנות, צפויות 15\.10–16\.11/.test(ops) && /LIA: לחייב את 12 התעודות/.test(ops) && await page.$('#orgWrap') !== null, ops.slice(0, 200));
  ok(`${tag}: screen test (David 5.10 evening) — the five numbers without opening a card: 18% מה-Baseline + the pace line · Forecast marked pace-only · 137% כיסוי leads, the raw ₪870K follows`, /₪136K 18% מה-Baseline היינו צריכים להיות ב־14% 4 נק׳ מעל הקצב/.test(T('sales').text) && /₪953K 124% מה-Baseline תחזית קצב בלבד · ביטחון נמוך/.test(T('forecast').text) && /₪633K 82% חסר/.test(T('gap').text) && /137% כיסוי ₪870K זמינים מול פער ₪633K/.test(T('cover').text), ['sales', 'forecast', 'gap', 'cover'].map((k) => T(k).text).join(' || '));
  const over = await page.$$eval('#kpis .kpiTile .p, #kpis .kpiTile .v, #kpis .kpiTile .lbl', (xs) => xs.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent));
  ok(`${tag}: no single-line text overflows its card (the new wording fits the tile)`, over.length === 0, over.join(' | '));
  ok(`${tag}: colour = state — sales/forecast/cover green, the rest neutral`, T('sales').cls.includes('s-ok') && T('forecast').cls.includes('s-ok') && T('cover').cls.includes('s-ok') && !/s-ok|s-warn|s-bad/.test(T('gap').cls) && !/s-ok|s-warn|s-bad/.test(T('unbilled_due').cls));
  ok(`${tag}: the 90/100 score is not on the main cards`, !tiles.filter((t) => t.key !== 'more').some((t) => /\/100/.test(t.text)) && /90\/100/.test(T('more').text));
  // open Forecast → it opens DOWN inside the panel, the bridge shows, the others stay folded
  await page.click('#kpis .kpiTile[data-kpi="forecast"]'); await page.waitForTimeout(150);
  tiles = await tileText(page);
  ok(`${tag}: Forecast opened in place, with the bridge`, T('forecast').open === 'true' && /חויב בפועל ₪136K/.test(T('forecast').text) && /לא מאומת/.test(T('forecast').text) && /נוסחה/.test(T('forecast').text), T('forecast').text.slice(0, 200));
  await card.screenshot({ path: OUT + tag + '-3-forecast-open.png' });
  // open Sales → Forecast folds (accordion), one open at a time, remembered
  await page.click('#kpis .kpiTile[data-kpi="sales"]'); await page.waitForTimeout(150);
  tiles = await tileText(page);
  ok(`${tag}: opening מכירות folds Forecast — one card open at a time`, T('sales').open === 'true' && tiles.filter((t) => t.open === 'true').length === 1, JSON.stringify(tiles.map((t) => t.key + ':' + t.open)));
  await card.screenshot({ path: OUT + tag + '-4-sales-open.png' });
  const remembered = await page.evaluate(() => ({ sales: localStorage.getItem('rail:kpi_sales'), forecast: localStorage.getItem('rail:kpi_forecast') }));
  ok(`${tag}: the open card is remembered, the folded one is not`, remembered.sales === '0' && remembered.forecast === '1', JSON.stringify(remembered));
  await page.reload(); await page.waitForFunction(() => { const v = document.querySelector('#kpis .kpiLead .v'); return v && /₪/.test(v.textContent); }, null, { timeout: 8000 }); await page.waitForTimeout(300);
  tiles = await tileText(page);
  ok(`${tag}: after a reload the same one card is open`, tiles.filter((t) => t.open === 'true').map((t) => t.key).join(',') === 'sales', JSON.stringify(tiles.map((t) => t.key + ':' + t.open)));
  // the panel did not grow sideways; the grid is still two per row
  const geo = await page.evaluate(() => { const g = document.getElementById('kpis').getBoundingClientRect(); const t = [...document.querySelectorAll('#kpis .kpiTile:not(.wide):not(.kpiLead)')].map((x) => x.getBoundingClientRect()); return { gridW: Math.round(g.width), cols: new Set(t.map((r) => Math.round(r.left))).size, spill: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  ok(`${tag}: two cards per row, inside the same panel, no horizontal spill`, geo.cols === 2 && geo.spill <= 0, JSON.stringify(geo));
  await ctx.close();
}
// phone: the rail (and the panel) is not drawn — nothing of this reaches the phone (30.9 law)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await page.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [], items: [], objects: [], queue: [], model: true, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } }) }));
  await page.addInitScript(() => localStorage.setItem('lia_code', 'qa'));
  await page.goto(PAGE); await page.waitForSelector('#app', { state: 'visible', timeout: 5000 }); await page.waitForTimeout(400);
  ok('phone: the panel is not on the phone (the rail is desktop-only, as before)', await page.$eval('#kpiCard', (x) => { const r = x.getBoundingClientRect(); return r.width === 0 || getComputedStyle(x).display === 'none' || !x.offsetParent; }));
  await ctx.close();
}
ok('no page errors', errors.length === 0, errors.join(' · '));
await browser.close();
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} KPI panel browser checks passed  ·  screenshots in qa/kpi-*.png`);
process.exit(bad ? 1 : 0);
