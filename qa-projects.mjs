// THE PROJECTS SCREEN in a real browser (David, 4.10 — WORK 27d03f59). Network stubbed with the shape
// project_snapshot returned on 5.10 — anonymised: every name, address and document number replaced,
// every amount scaled (this repository is public). Checks phone and desktop: the three groups and their
// counts, certainty on every judged line, the workbook marked לא מאומת, RTL, no horizontal overflow,
// no "undefined"; a stale picture is replaced; a failed read is said in words; refresh asks Priority anew.
// Screenshots: qa/projects-*.png
//   node qa-projects.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./projects.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };

const FIX = JSON.parse(readFileSync(new URL('./qa-projects.fixture.json', import.meta.url), 'utf8'));
// one stuck project, so the middle group is exercised too
{
  const p = FIX.snapshot.projects.find((x) => x.status === 'OK' && x.unbilled.count);
  p.status = 'STUCK';
  p.flags = [{ rule: 'UNBILLED', rule_he: 'תעודת משלוח שלא חויבה מעל 30 יום', level: 'STUCK', certainty: 'ודאי', refs: p.unbilled.docs.slice(0, 1),
    text: `תעודת משלוח מ-1.9.26 (34 ימים) עוד לא חויבה — ₪4,060 כולל מע״מ` }];
  const rank = { DECISION: 0, STUCK: 1, OK: 2 };
  FIX.snapshot.projects.sort((a, b) => rank[a.status] - rank[b.status]);
  FIX.snapshot.summary.stuck = 1; FIX.snapshot.summary.ok -= 1;
}
const NOW = Date.now();
const fresh = () => Object.assign({}, FIX, { at: new Date(NOW - 2 * 60e3).toISOString(), cached: true });

async function stub(page, opt = {}) {
  const calls = [];
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const a = body.args || {};
    calls.push(`${body.action}:${body.name || ''}${a.stale_ok ? ':stale_ok' : ''}${a.refresh ? ':refresh' : ''}${a.full ? ':full' : ''}`);
    const j = (o, ms = 0) => setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }), ms);
    if (body.action === 'cap' && body.name === 'project_snapshot') {
      if (opt.fail) return j({ rows: [{ answer: 'לא הצלחתי לקרוא עכשיו את ההזמנות הפתוחות מפריוריטי (timeout) — אין לי תמונת פרויקטים מאומתת להציג.' }] }, 200);
      if (a.stale_ok && opt.stale) return j({ rows: [Object.assign({}, FIX, { at: new Date(NOW - 5 * 3600e3).toISOString(), cached: true })] }, 200);
      return j({ rows: [fresh()] }, opt.ms || 600);
    }
    return j({ ok: true, rows: [] });
  });
  return calls;
}
const look = (page) => page.evaluate(() => {
  const txt = document.body.innerText;
  const count = (sel) => document.querySelectorAll(sel).length;
  const tile = (cls) => Number((document.querySelector(`.sum .${cls} b`) || {}).textContent);
  return {
    txt, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, dir: getComputedStyle(document.body).direction,
    dec: count('#dec ~ article.pj.d'), decCards: [...document.querySelectorAll('article.pj.d')].length, stuckCards: count('article.pj.s'),
    okRows: count('#ok + .okl .r'), tiles: { d: tile('d'), s: tile('s'), o: tile('o') },
    certs: [...new Set([...document.querySelectorAll('.cert')].map((e) => e.textContent))],
    flagsWithoutCert: [...document.querySelectorAll('.pj .fl')].filter((f) => !f.querySelector('.cert')).length,
    wbChips: [...document.querySelectorAll('.pj .wb')].filter((w) => /לא מאומת/.test(w.textContent)).length,
    wbBlocks: count('.pj .wb'), showAll: !!document.getElementById('showOk'), when: document.getElementById('when').textContent,
  };
});

const browser = await chromium.launch();
const errors = [];
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 375, height: 667 }, 'mobile-small'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', deviceScaleFactor: 2, isMobile: tag !== 'desktop', hasTouch: tag !== 'desktop' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  const calls = await stub(page);
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('.sum', { timeout: 8000 });
  const L = await look(page);
  await page.screenshot({ path: `${OUT}projects-${tag}-1-top.png` });
  await page.screenshot({ path: `${OUT}projects-${tag}-2-full.png`, fullPage: true });
  const S = FIX.snapshot.summary;
  ok(`${tag}: one read, the picture asked for in full and allowed to be stale`, calls[0] === 'cap:project_snapshot:stale_ok:full' && calls.length === 1, calls.join(' '));
  ok(`${tag}: the three tiles match the three groups`, L.tiles.d === S.decision + 1 && L.tiles.s === 1 && L.tiles.o === S.ok, JSON.stringify(L.tiles));
  ok(`${tag}: every decision project is a card, plus the old-orders card`, L.decCards === S.decision + 1, `${L.decCards}`);
  ok(`${tag}: the stuck project is a card`, L.stuckCards === 1, `${L.stuckCards}`);
  ok(`${tag}: every judged line carries its certainty`, L.flagsWithoutCert === 0, `${L.flagsWithoutCert} without`);
  ok(`${tag}: the three certainties are named on screen`, ['ודאי', 'צפוי', 'לא מאומת'].every((c) => L.certs.includes(c)), JSON.stringify(L.certs));
  ok(`${tag}: every workbook line on a project says לא מאומת`, L.wbBlocks > 0 && L.wbChips === L.wbBlocks, `${L.wbChips}/${L.wbBlocks}`);
  ok(`${tag}: the healthy list is short until asked`, L.okRows === 8 && L.showAll, `${L.okRows} rows`);
  ok(`${tag}: the rules are written out`, /איך זה נקבע/.test(L.txt) && /שלא חויבה מעל 30 יום/.test(L.txt), '');
  ok(`${tag}: the old open orders are a decision, with their years`, /הזמנות משנים 2006 עד 2009 עדיין רשומות כפתוחות/.test(L.txt), '');
  ok(`${tag}: the moment of the picture is shown`, /^נכון ל-/.test(L.when), L.when);
  ok(`${tag}: no machinery on screen`, !/undefined|null|NaN|DECISION|STUCK|PROJDES|\[object/.test(L.txt), (L.txt.match(/.{20}(undefined|null|NaN|DECISION|STUCK|PROJDES).{20}/) || [''])[0]);
  ok(`${tag}: RTL, no horizontal overflow`, L.dir === 'rtl' && L.over <= 0, `dir=${L.dir} over=${L.over}`);
  await page.click('#showOk');
  const L2 = await look(page);
  ok(`${tag}: "הצג את כל" opens every healthy project`, L2.okRows === S.ok && !L2.showAll, `${L2.okRows}`);
  await page.click('article.pj.d details.more summary');
  await page.screenshot({ path: `${OUT}projects-${tag}-3-open.png` });
  const det = await page.evaluate(() => document.querySelector('article.pj.d details.more').open && /יתרה/.test(document.querySelector('article.pj.d details.more').innerText));
  ok(`${tag}: a card opens to its orders and documents`, det, '');
  await page.click('#re');
  await page.waitForTimeout(900);
  ok(`${tag}: refresh asks Priority anew`, calls.includes('cap:project_snapshot:refresh:full'), calls.join(' '));
  await ctx.close();
}
// a stale picture is shown at once, then replaced
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const calls = await stub(page, { stale: true, ms: 800 });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('.sum', { timeout: 8000 });
  await page.waitForTimeout(1600);
  ok('stale: shown at once and recomputed right after (two reads)', calls.filter((c) => c.startsWith('cap:project_snapshot')).length === 2, calls.join(' '));
  await ctx.close();
}
// a failed core read is said in words — no empty screen, no invented picture
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  await stub(page, { fail: true });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForTimeout(1200);
  const t = await page.evaluate(() => document.getElementById('m').innerText);
  const cards = await page.evaluate(() => document.querySelectorAll('.pj, .sum').length);
  ok('fail: the reason is said, nothing is invented', /לא הצלחתי לקרוא עכשיו את ההזמנות הפתוחות/.test(t) && cards === 0, t.slice(0, 200));
  await ctx.close();
}
// no code → the login card, nothing fetched
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const calls = await stub(page);
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  const vis = await page.evaluate(() => getComputedStyle(document.getElementById('login')).display !== 'none' && document.getElementById('app').hidden);
  ok('no code: the login card, nothing fetched', vis && calls.length === 0, calls.join(' '));
  await ctx.close();
}
await browser.close();
ok('no page errors', errors.length === 0, errors.join(' | '));
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} checks passed`);
process.exit(bad ? 1 : 0);
