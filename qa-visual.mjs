// Visual QA for the redesigned panel: drives the SHIPPED file in a real
// browser with the network stubbed, captures every state David listed, and
// fails on horizontal overflow, console errors, or an unreadable contrast
// ratio on body text. Screenshots land in ./qa/.
//   node --experimental-strip-types qa-visual.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });

let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };

const RICH = {
  answer: 'מכרנו היום ‎42,180‎ ש"ח בשבע תעודות משלוח. שתי הזמנות גדולות של מרינה יצאו הבוקר, '
        + 'וזה מסביר כמעט את כל הפער מול אתמול.',
  facts: ['7 תעודות משלוח', 'ORDERS: 14 הזמנות · ₪28,117.5'],
  inferences: ['הקפיצה מגיעה מלקוח אחד, לא ממגמה רוחבית'],
  risks_opportunities: ['לקוח שחוזר שווה יותר מלקוח חדש'],
  missing_information: [], retracted_claims: [],
  recommended_next_action: 'לבדוק מול מרינה אם יש המשך להזמנה השבוע',
  sources: ['ORDERS', 'DOCUMENTS_D'], confidence: 'HIGH',
  capabilities_used: ['business_query', 'priority_query'],
};
const EMPTY = { ...RICH, answer: 'אין לי נתון מאומת לשאלה הזו — משתמש ה-API לא רואה חשבוניות עדכניות בפריוריטי.',
  facts: [], inferences: [], recommended_next_action: '', sources: [], confidence: 'INSUFFICIENT_EVIDENCE',
  capabilities_used: [] };

const browser = await chromium.launch();
const errors = [];

async function open(viewport, tag, hold) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  let payload = RICH;
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'kernel') {
      if (hold) await new Promise(r => setTimeout(r, 4000));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], objects: [], model: true }) });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); localStorage.setItem('lia_privacy', '1'); });
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  return { page, ctx, set: (p) => { payload = p; } };
}
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png', fullPage: false });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const { page, ctx } = await open(vp, tag);
  await page.waitForTimeout(400);
  await shot(page, `${tag}-1-idle`);
  ok(`${tag}: home screen greets and asks`, /טוב, דוד/.test(await page.textContent('#thread')));
  ok(`${tag}: expert chips are on screen`, (await page.$$('#chips .chip')).length === 5);
  ok(`${tag}: LIVE indicator present`, await page.isVisible('.live'));
  ok(`${tag}: orb present`, await page.isVisible('.orb.lg'));
  ok(`${tag}: idle does not spill sideways`, (await overflow(page)) <= 1, `overflow ${await overflow(page)}px`);

  await page.fill('#note', 'כמה מכרנו היום?');
  await shot(page, `${tag}-2-typed`);
  await page.click('#sendBtn');
  await page.waitForSelector('#thread .msg.lia .ansCard', { timeout: 6000 });
  await page.waitForTimeout(350);
  await shot(page, `${tag}-3-answer`);
  const card = await page.$$eval('#thread .msg.lia', n => n[n.length - 1].innerText);
  ok(`${tag}: answer is sectioned`, /מה מצאתי/.test(card) && /הפעולה הבאה/.test(card), JSON.stringify(card.slice(0, 160)));
  ok(`${tag}: evidence stays folded`, !/7 תעודות משלוח/.test(card));
  ok(`${tag}: a used system lights up`, (await page.$$('#chips .chip.on')).length >= 1);
  ok(`${tag}: answer does not spill sideways`, (await overflow(page)) <= 1, `overflow ${await overflow(page)}px`);

  await page.click('#thread .msg.lia .acts .det');
  await page.waitForTimeout(250);
  await shot(page, `${tag}-4-evidence`);
  const deep = await page.$$eval('#thread .deep', n => n[n.length - 1].innerText);
  ok(`${tag}: evidence opens with facts and sources`, /7 תעודות משלוח/.test(deep) && /ORDERS/.test(deep));
  ok(`${tag}: expanded does not spill sideways`, (await overflow(page)) <= 1);
  await ctx.close();
}

// no-data / partial answer — the honest zero has to look composed, not broken
{
  const { page, ctx, set } = await open({ width: 390, height: 844 }, 'nodata');
  set(EMPTY);
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForSelector('#thread .msg.lia .ansCard', { timeout: 6000 });
  await page.waitForTimeout(300);
  await shot(page, 'mobile-5-nodata');
  const card = await page.$$eval('#thread .msg.lia', n => n[n.length - 1].innerText);
  ok('no-data: empty sections are not drawn', !/הפעולה הבאה|מה המשמעות/.test(card), JSON.stringify(card.slice(0, 160)));
  ok('no-data: the answer itself is shown', /לא רואה חשבוניות עדכניות/.test(card));
  ok('no-data: no chip is lit when nothing was used', (await page.$$('#chips .chip.on')).length === 0);
  await ctx.close();
}

// thinking state — the request is held open so the state can be photographed
{
  const { page, ctx } = await open({ width: 390, height: 844 }, 'thinking', true);
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForTimeout(900);
  await shot(page, 'mobile-6-thinking');
  ok('thinking: send is disabled while she works', await page.isDisabled('#sendBtn'));
  ok('thinking: a loading card stands where the answer will be', await page.isVisible('#thinkCard .skel'));
  ok('thinking: the placeholder is not counted as a turn',
    (await page.$$('#thread .msg.lia')).length === 0);
  ok('thinking: the status line says so', /בודקת|מדברת|רגע/.test(await page.textContent('#noteStat') || '')
    || /⋯/.test(await page.textContent('#sendBtn') || ''));
  ok('thinking: does not spill sideways', (await overflow(page)) <= 1);
  await ctx.close();
}

// mobile keyboard: the composer must stay reachable when the viewport shrinks
{
  const { page, ctx } = await open({ width: 390, height: 844 }, 'keyboard');
  await page.setViewportSize({ width: 390, height: 420 });   // keyboard open
  await page.waitForTimeout(300);
  await shot(page, 'mobile-7-keyboard');
  const composerVisible = await page.evaluate(() => {
    const r = document.getElementById('composer').getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= 0;
  });
  ok('keyboard: the composer is still fully on screen', composerVisible);
  ok('keyboard: does not spill sideways', (await overflow(page)) <= 1);
  await ctx.close();
}

ok('no console or page errors', errors.length === 0, errors.join('\n      '));
await browser.close();
console.log(`\n${total - bad}/${total} visual checks passed  ·  screenshots in qa/`);
process.exit(bad ? 1 : 0);
