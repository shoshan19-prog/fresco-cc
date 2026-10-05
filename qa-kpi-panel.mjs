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
const tileText = (page) => page.$$eval('#kpis .kpiTile', (xs) => xs.map((x) => ({ key: x.getAttribute('data-kpi'), open: x.getAttribute('data-open'), cls: x.className, text: x.innerText.replace(/\s+/g, ' ').trim() })));

for (const [w, h] of [[1440, 900], [1600, 900]]) {
  const tag = `kpi-${w}x${h}`;
  const { page, ctx } = await open({ width: w, height: h }, tag);
  await page.screenshot({ path: OUT + tag + '-1-page.png' });
  const card = page.locator('#kpiCard');
  await card.screenshot({ path: OUT + tag + '-2-panel.png' });
  const head = await page.$eval('#kpiCard .railHead', (x) => x.innerText.replace(/\s+/g, ' ').trim());
  ok(`${tag}: the header is the reference point`, /FRESCO KPIs אוקטובר · Baseline ₪770K/.test(head), head);
  let tiles = await tileText(page);
  ok(`${tag}: nine cards drawn (eight + נתונים נוספים), all folded`, tiles.length === 9 && tiles.every((t) => t.open === 'false'), JSON.stringify(tiles.map((t) => t.key + ':' + t.open)));
  ok(`${tag}: screen test — the five numbers without opening a card`, /₪136K 18% מ-Baseline/.test(tiles[0].text) && /2 נק׳ מעל הקצב/.test(tiles[0].text) && /₪844K 110% מ-Baseline/.test(tiles[1].text) && /₪633K 82% חסר/.test(tiles[2].text) && /137% מכוסה/.test(tiles[3].text), tiles.slice(0, 4).map((t) => t.text).join(' || '));
  ok(`${tag}: colour = state — sales/forecast/cover green, the rest neutral`, tiles[0].cls.includes('s-ok') && tiles[1].cls.includes('s-ok') && tiles[3].cls.includes('s-ok') && !/s-ok|s-warn|s-bad/.test(tiles[2].cls) && !/s-ok|s-warn|s-bad/.test(tiles[4].cls));
  ok(`${tag}: the 90/100 score is not on the main cards`, !tiles.slice(0, 8).some((t) => /\/100/.test(t.text)) && /90\/100/.test(tiles[8].text));
  // open Forecast → it opens DOWN inside the panel, the bridge shows, the others stay folded
  await page.click('#kpis .kpiTile[data-kpi="forecast"]'); await page.waitForTimeout(150);
  tiles = await tileText(page);
  ok(`${tag}: Forecast opened in place, with the bridge`, tiles[1].open === 'true' && /חויב בפועל ₪136K/.test(tiles[1].text) && /לא מאומת/.test(tiles[1].text) && /נוסחה/.test(tiles[1].text), tiles[1].text.slice(0, 200));
  await card.screenshot({ path: OUT + tag + '-3-forecast-open.png' });
  // open Sales → Forecast folds (accordion), one open at a time, remembered
  await page.click('#kpis .kpiTile[data-kpi="sales"]'); await page.waitForTimeout(150);
  tiles = await tileText(page);
  ok(`${tag}: opening מכירות folds Forecast — one card open at a time`, tiles[0].open === 'true' && tiles.filter((t) => t.open === 'true').length === 1, JSON.stringify(tiles.map((t) => t.key + ':' + t.open)));
  await card.screenshot({ path: OUT + tag + '-4-sales-open.png' });
  const remembered = await page.evaluate(() => ({ sales: localStorage.getItem('rail:kpi_sales'), forecast: localStorage.getItem('rail:kpi_forecast') }));
  ok(`${tag}: the open card is remembered, the folded one is not`, remembered.sales === '0' && remembered.forecast === '1', JSON.stringify(remembered));
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#kpis .kpiTile').length >= 8, null, { timeout: 8000 }); await page.waitForTimeout(300);
  tiles = await tileText(page);
  ok(`${tag}: after a reload the same one card is open`, tiles.filter((t) => t.open === 'true').map((t) => t.key).join(',') === 'sales', JSON.stringify(tiles.map((t) => t.key + ':' + t.open)));
  // the panel did not grow sideways; the grid is still two per row
  const geo = await page.evaluate(() => { const g = document.getElementById('kpis').getBoundingClientRect(); const t = [...document.querySelectorAll('#kpis .kpiTile:not(.wide)')].map((x) => x.getBoundingClientRect()); return { gridW: Math.round(g.width), cols: new Set(t.map((r) => Math.round(r.left))).size, spill: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
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
