// A LIMITED CODE IN THE COMMAND CENTER (David, 12.11): every read answers 403 "הקוד הזה פתוח לפעולות kernel/state בלבד".
// The page must say so in words and offer the way out — never a raw server error under cards stuck on "טוען…".
//   node qa-cc-scoped.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url)); mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
await page.route('**/functions/v1/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  if (body.action === 'status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ setup: false }) });
  return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'הקוד הזה פתוח לפעולות kernel/state בלבד' }) });
});
await page.addInitScript(() => { if (!sessionStorage.getItem('qa-once')) { sessionStorage.setItem('qa-once', '1'); localStorage.setItem('lia_code', 'FR-QAQA-QAQA-QAQA'); } });
await page.goto(PAGE);
await page.waitForSelector('.note.scoped', { timeout: 15000 }).catch(() => {});
const txt = await page.$eval('.note.scoped', (x) => x.innerText).catch(() => '');
ok('a limited code is named in words, with the way out', /נכנסת עם קוד אישי מוגבל/.test(txt) && /הקוד הראשי/.test(txt), txt);
const raw = await page.evaluate(() => document.body.innerText.includes('kernel/state'));
ok('no raw server error on the page', !raw);
await page.screenshot({ path: OUT + 'cc-scoped.png', fullPage: true });
await page.click('#scopedOut').catch(() => {});
await page.waitForTimeout(800);
const left = await page.evaluate(() => localStorage.getItem('lia_code'));
ok('התנתק clears the limited code', left === null, String(left));
await browser.close();
console.log(`\n${total - bad}/${total} scoped-code checks passed`); process.exit(bad ? 1 : 0);
