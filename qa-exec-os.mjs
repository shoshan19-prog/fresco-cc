// THE DAILY SCREEN in a real browser (David, 2.10 — FRESCO EXECUTIVE OS). Network stubbed with the shapes
// production returned on 2.10 (fresco_snapshot · work_status · state · alerts · tower). Checks the first view
// at phone and desktop width: the five answers, nothing else, no horizontal overflow, RTL; the drill-down
// keeps what the screen showed before. Screenshots: qa/exec-*.png
//   node --experimental-strip-types qa-exec-os.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };

const NOW = Date.now();
const today = new Date(NOW).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const SNAP = { today, windows: { year: 2026 }, invoices: { today: { count: 0, net: 0 }, mtd: { count: 2, net: 21870 } },
  orders: { today: { count: 3, net: 41200 }, mtd: { count: 7, net: 60925 } }, unbilled: { count: 13, net: 70020, gross: 82623.6, age: { max_days: 8, avg_days: 2, over_30: 0, over_60: 0 } },
  open_orders: { count: 24, open_value: 788997.92, original_value: 1089916.92 }, ytd: { count: 1559, net: 8355709.96 }, ly_ytd: { count: 1852, net: 9351560.86 },
  failures: ['חייבים: אין KPI מאומת ≤24 שעות'], verified: [] };
const W = (id, o) => Object.assign({ work_id: id.padEnd(32, '0'), kind: 'build', status: 'QUEUED', state: 'QUEUED', objective: 'חבילה', items: [], closure: null,
  lease: null, lease_alive: false, updated_at: new Date(NOW - 3600e3).toISOString(), created_at: new Date(NOW - 86400e3).toISOString() }, o);
const ALIVE = [
  W('7bb9ecf0', { status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION', objective: '> ארגני מחדש את המסך היומי כך שבתוך 5 שניות דוד רואה רק:' }),
  W('c95722c2', { status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION', objective: 'אוקיי, אז החבילה שאני מבקש ממך לשגר היא חבילת הניקוי של מרכז הבקרה' }),
  W('e7ca805a', { status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION', objective: 'אני מבקש שננסה לבנות תחזית שמסתמכת על כל ההצעות' }),
  W('a1a1ce0d', { status: 'QUEUED', state: 'QUEUED', objective: 'תחזוקה מבוקרת' }),
  W('47d7d786', { status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', objective: '> ארגני מחדש את המסך היומי כך שבתוך 5 שניות דוד רואה רק:' }),
];
const TOWER = { generated_at: new Date(NOW).toISOString(), departments: [], projects: [], approvals: [], alerts: [], work_running: [], next_action: {}, changed: [], money: {}, manifest: [], totals: {} };

async function stub(page, opt = {}) {
  const calls = [];
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body.action === 'cap' ? `cap:${body.name}${body.args && body.args.stale_ok ? ':stale_ok' : ''}${body.args && body.args.closed_since ? ':closed' : ''}` : body.action);
    const j = (o, ms = 0) => setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }), ms);
    if (body.action === 'status') return j({ setup: false });
    if (body.action === 'tower') return j(TOWER, opt.towerMs || 3500);           // measured 3.3–5.0 s in production
    if (body.action === 'state') return j({ approvals: opt.appr || [] }, 300);
    if (body.action === 'cap' && body.name === 'alerts') return j({ rows: opt.alerts || [] }, 300);
    if (body.action === 'cap' && body.name === 'fresco_snapshot') {
      const stale = opt.staleFirst && body.args && body.args.stale_ok;
      const snap = stale ? Object.assign({}, SNAP, { today: '2026-10-01' }) : SNAP;
      const at = stale ? new Date(NOW - 14 * 3600e3).toISOString() : new Date(NOW - 5 * 60e3).toISOString();
      return j({ rows: [{ snapshot: snap, evidence: [`מהמטמון — חושב ב-${at} (תוקף 10 דק')`] }] }, stale ? 300 : (opt.snapMs || 800));
    }
    if (body.action === 'cap' && body.name === 'work_status') return j({ rows: body.args && body.args.closed_since ? [] : ALIVE }, 1000);
    return j({ ok: true, rows: [] });
  });
  return calls;
}
const firstView = (page) => page.evaluate(() => {
  const H = window.innerHeight, Wd = document.documentElement.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const items = [...document.querySelectorAll('#exec .xi')].map((el) => { const r = el.getBoundingClientRect(); return { k: el.dataset.x, top: Math.round(r.top), bottom: Math.round(r.bottom), text: el.innerText.replace(/\s+/g, ' ').trim() }; });
  const bottomNav = document.getElementById('bottom').getBoundingClientRect().top;
  const drillVisible = vis(document.getElementById('drill'));
  const domainsVisible = vis(document.getElementById('domains'));
  const main = [...document.querySelectorAll('#m > *')].filter(vis).map((el) => el.id || el.tagName);
  return { H, bottomNav: Math.round(bottomNav), items, drillVisible, domainsVisible, main, over: document.documentElement.scrollWidth - Wd,
           ready: document.getElementById('exec').dataset.ready, readyMs: document.getElementById('exec').dataset.readyMs, dir: getComputedStyle(document.body).direction };
});

const browser = await chromium.launch();
const errors = [];
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 375, height: 667 }, 'mobile-small'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', deviceScaleFactor: 2, isMobile: tag !== 'desktop', hasTouch: tag !== 'desktop' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  const calls = await stub(page, { appr: [{ claim: 'לפרסם את עמוד הפרויקט של גג המפעל בעכו' }], alerts: [{ title: 'חבילה חסומה', state: 'unread', severity: 'high' }] });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  const t0 = Date.now();
  await page.goto(PAGE);
  await page.waitForSelector('#exec[data-ready="1"]', { timeout: 8000 });
  const readyAt = Date.now() - t0;
  const F = await firstView(page);
  await page.screenshot({ path: `${OUT}exec-${tag}-1-first-view.png` });
  ok(`${tag}: all five answers are on screen well inside 5 s with production-like latencies (the tower still loading)`, readyAt < 5000 && F.ready === '1', `ready after ${readyAt} ms`);
  ok(`${tag}: the five answers, in order`, F.items.map((i) => i.k).join(',') === 'target,changed,money,risk,needs', JSON.stringify(F.items.map((i) => i.k)));
  ok(`${tag}: all five in the first view — no scroll, above the bottom nav`, F.items.every((i) => i.top >= 0 && i.bottom <= F.bottomNav), JSON.stringify(F.items.map((i) => [i.k, i.top, i.bottom])) + ' nav@' + F.bottomNav);
  ok(`${tag}: nothing else in the first view — the drill-down and the domain nav are closed`, !F.drillVisible && !F.domainsVisible && F.main.join() === 'exec', JSON.stringify(F));
  ok(`${tag}: RTL, no horizontal overflow`, F.dir === 'rtl' && F.over <= 0, `dir=${F.dir} over=${F.over}`);
  ok(`${tag}: 1 says "לא הוגדר יעד" and shows what exists`, /לא הוגדר יעד/.test(F.items[0].text) && /₪8\.36M/.test(F.items[0].text), F.items[0].text);
  ok(`${tag}: 5 counts exactly what waits on David — 3 parked packages + 1 recommendation + 1 alert`, /5 דברים מחכים להכרעה שלך/.test(F.items[4].text), F.items[4].text);
  ok(`${tag}: the daily screen never waited for the tower`, calls.indexOf('tower') >= 0 && calls.includes('cap:fresco_snapshot:stale_ok') && calls.includes('state') && calls.includes('cap:alerts'), calls.join(' '));
  // the drill-down keeps what the screen showed before
  await page.click('#drillBtn');
  await page.waitForSelector('#drill .sum', { timeout: 8000 });
  const D = await page.evaluate(() => ({ drill: !document.getElementById('drill').hidden, domains: getComputedStyle(document.getElementById('domains')).display !== 'none',
    sum: [...document.querySelectorAll('#drill .sum b')].length, needs: !!document.getElementById('needs'), foot: !!document.querySelector('#drill .foot') }));
  await page.screenshot({ path: `${OUT}exec-${tag}-2-drill.png`, fullPage: true });
  ok(`${tag}: "כל השאר" opens everything the screen showed before — the summary, what needs him, the domain nav`, D.drill && D.domains && D.sum === 4 && D.needs && D.foot, JSON.stringify(D));
  await ctx.close();
}
// a stale snapshot is shown at once with its moment, then replaced by the fresh one
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const calls = await stub(page, { staleFirst: true, snapMs: 1200 });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('#exec[data-ready="1"]', { timeout: 8000 });
  await page.waitForTimeout(2000);
  const txt = await page.evaluate(() => document.getElementById('exec').innerText);
  ok('stale: the last snapshot is used at once and recomputed right after (two reads)', calls.filter((c) => c.startsWith('cap:fresco_snapshot')).length === 2, calls.join(' '));
  ok('stale: the fresh numbers replace it', /היום: 3 הזמנות חדשות/.test(txt), txt.slice(0, 300));
  await ctx.close();
}
await browser.close();
ok('no page errors', errors.length === 0, errors.join(' | '));
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} checks passed`);
process.exit(bad ? 1 : 0);
