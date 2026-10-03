import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
// THE COMPOSER STAYS ABOVE THE PHONE'S BUTTON BAR (David, 3.10 — Galaxy S26 Ultra, installed app: the three-button
// bar sat on the box with the mic, the headphones and the clip). Android drops viewport-fit=cover so Chrome keeps the
// page between the system bars; iPhone and desktop keep it. Each phone open leaves one layout row (read-only).
//   node qa-composer.mjs
import { fileURLToPath } from 'node:url';
const PAGE = process.env.QA_PAGE || 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const AND = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch();
let bad = 0; const ok = (l, c, x) => { console.log((c ? 'ok    ' : 'FAIL  ') + l + (c ? '' : '  ' + (x || ''))); if (!c) bad++; };
for (const [tag, vp, ua, mob] of [['android', { width: 412, height: 839 }, AND, true], ['iphone', { width: 390, height: 664 }, IOS, true], ['desktop', { width: 1366, height: 800 }, undefined, false]]) {
  const ctx = await browser.newContext({ viewport: vp, userAgent: ua, isMobile: mob, hasTouch: mob, locale: 'he-IL' });
  const page = await ctx.newPage(); const errs = []; const logs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/functions/v1/**', async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'cap' && b.name === 'push_register_log') logs.push(b.args);
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (b.action === 'status') return j({ setup: false });
    return j({ ok: true, rows: [] });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); localStorage.setItem('lia_privacy', '1'); });
  await page.goto(PAGE); await page.waitForTimeout(3500);
  const m = await page.evaluate(() => { const l = document.querySelector('#composer .line').getBoundingClientRect();
    return { vp: document.querySelector('meta[name=viewport]').content, top: Math.round(l.top), bottom: Math.round(l.bottom), H: innerHeight,
      pad: getComputedStyle(document.getElementById('composer')).paddingBottom }; });
  const lay = logs.filter((x) => x.stage === 'layout');
  console.log(tag, JSON.stringify(m), lay.length ? lay[0].detail : '(no layout log)');
  if (tag === 'android') ok('android: viewport-fit=cover dropped', m.vp === 'width=device-width,initial-scale=1', m.vp);
  else ok(tag + ': viewport keeps cover', /viewport-fit=cover/.test(m.vp), m.vp);
  ok(tag + ': input row inside the viewport', m.bottom <= m.H && m.top > m.H / 2, JSON.stringify(m));
  if (tag !== 'desktop') ok(tag + ': one layout row, in-view, ≤200 chars', lay.length === 1 && lay[0].ok === true && lay[0].detail.length <= 200, JSON.stringify(lay));
  else ok('desktop: no layout row', lay.length === 0, JSON.stringify(lay));
  ok(tag + ': no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await browser.close(); console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
