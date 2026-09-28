// The copy control, driven in a real browser (David, 28.9): both sides of the
// conversation show who said it, one tap copies the full original text with its
// line breaks, and a small ✓ confirms it — on a phone-sized viewport and on the
// desktop. Network stubbed like qa-visual.mjs; the clipboard call is recorded so
// the test reads exactly what would have landed on the clipboard.
//   node --experimental-strip-types qa-copy.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const ANSWER = { answer: 'מצב פרסקו חיובי.\nהחודש חויבו 769 אלף ₪ נטו.\n\nאין משהו דחוף במייל.', facts: [], inferences: [], risks_opportunities: [],
  missing_information: [], retracted_claims: [], recommended_next_action: '', sources: [], confidence: 'HIGH', capabilities_used: ['fresco_snapshot'] };
const browser = await chromium.launch();
const errors = [];
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'kernel') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANSWER) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [], items: [], objects: [], queue: [], counts: {} }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('lia_code', 'qa'); localStorage.setItem('lia_privacy', '1');
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (s) => { window.__copied.push(s); return Promise.resolve(); } }, configurable: true });
  });
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  // a real ask through the composer, answered by the stub
  await page.fill('#note', 'מה מצב פרסקו היום?');
  await page.click('#sendBtn');
  await page.waitForFunction(() => document.querySelectorAll('.msg.lia .cp').length >= 1, null, { timeout: 8000 });
  // David's multi-line message and an execution prompt whose bubble shows only its summary
  const DAVID = 'ליה, תבני את המסך.\n1. פתיחה נקייה למעלה\n2. פרטי מערכת בהמשך המסך';
  await page.evaluate((txt) => { SESSION.turns.push({ role: 'me', text: txt, at: Date.now(), mid: 'qa-me-2' }); renderThread(); }, DAVID);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}copy-${tag}-1-thread.png`, fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${tag}: no horizontal overflow with the controls in place`, overflow <= 0, `overflow=${overflow}`);
  const who = await page.evaluate(() => [...document.querySelectorAll('.msg .who .tag')].map((e) => e.textContent.trim()));
  ok(`${tag}: every message names its side (אתה / LIA)`, who.length >= 3 && who.every((w) => w === 'אתה' || w === 'LIA'), JSON.stringify(who));
  const marks = await page.evaluate(() => ({
    me: getComputedStyle(document.querySelector('.msg.me .who .tag'), '::before').backgroundColor,
    lia: getComputedStyle(document.querySelector('.msg.lia .who .tag'), '::before').backgroundImage,
    edge: getComputedStyle(document.querySelector('.msg.me .bubble')).borderRightWidth + '/' + getComputedStyle(document.querySelector('.msg.me .bubble')).borderLeftWidth }));
  ok(`${tag}: David's mark is the accent blue, LIA's is her orb, David's bubble has the 3px edge`, /rgb\(47, 107, 255\)/.test(marks.me) && /radial-gradient/.test(marks.lia) && /3px/.test(marks.edge), JSON.stringify(marks));
  const size = await page.evaluate(() => { const b = document.querySelector('.msg.me .cp').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
  ok(`${tag}: the copy control is a real tap target`, size[0] >= (tag === 'mobile' ? 32 : 26) && size[1] >= (tag === 'mobile' ? 32 : 26), JSON.stringify(size));
  // tap David's message → the whole original, line breaks kept
  const meBtns = await page.$$('.msg.me .cp');
  await meBtns[meBtns.length - 1].click();
  await page.waitForTimeout(150);
  let copied = await page.evaluate(() => window.__copied);
  ok(`${tag}: one tap copies David's message verbatim with its line breaks`, copied[copied.length - 1] === DAVID, JSON.stringify(copied[copied.length - 1]));
  const ack = await page.evaluate(() => { const b = [...document.querySelectorAll('.msg.me .cp')].pop(); return { glyph: b.textContent, done: b.classList.contains('done'), live: document.getElementById('copyLive').textContent }; });
  ok(`${tag}: the control confirms with ✓ and the live region says הועתק`, ack.glyph === '✓' && ack.done && ack.live === 'הועתק', JSON.stringify(ack));
  await page.screenshot({ path: `${OUT}copy-${tag}-2-copied.png`, fullPage: false });
  // tap LIA's answer → exactly what David reads, line breaks kept, no metadata
  await page.click('.msg.lia .cp');
  await page.waitForTimeout(150);
  copied = await page.evaluate(() => window.__copied);
  ok(`${tag}: one tap copies LIA's answer as read, line breaks kept`, copied[copied.length - 1] === ANSWER.answer, JSON.stringify(copied[copied.length - 1]));
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => [...document.querySelectorAll('.cp')].every((b) => b.textContent === '⧉' && !b.classList.contains('done')));
  ok(`${tag}: the confirmation is small and passes — the control returns to ⧉`, back);
  await ctx.close();
}
await browser.close();
ok('no page errors, no console errors', errors.length === 0, errors.join(' | '));
console.log(`\n${total - bad}/${total} checks passed · screenshots in qa/copy-*.png`);
process.exit(bad ? 1 : 0);
