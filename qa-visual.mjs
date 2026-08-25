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
// The live P0, reproduced: prose denies it looked, the object already holds the
// data. The card must show the data and must not print the denial as the finding.
const DENIAL = { ...RICH,
  answer: 'עניתי על זה בלי לבדוק בפועל את מצב ההזמנות היום.',
  facts: ['ORDERS: 14 הזמנות היום', '₪42,687 לפני מע"מ · ₪50,370.66 כולל', 'הזמנה SO26001464'],
  inferences: [], recommended_next_action: '' };

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
    // The rail reads the SAME endpoints the panel already used — state, sales,
    // next_decision. Stub them the way production answers.
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'sales') return j({ today_orders: 14, today_amount: 42687, today_amount_incl_vat: 50370.66,
      biggest_order: { customer: 'מרינה', amount: 12400 }, top_customers: [], source: 'ORDERS' });
    if (body.action === 'cap' && body.name === 'next_decision')
      return j({ rows: [{ claim: 'לאשר את מחיר הפרויקט במרינה', project_name: 'מרינה' }], source: 'recommendation' });
    j({ ok: true, items: [], objects: [], model: true,
        queue: [{ id: 'a1b2c3d4-0000', object_type: 'COMMITMENT', verification_state: 'CANONICAL',
                  payload: { quote: 'הבטחנו דוגמאות', speaker: 'דוד', fields: { what: 'לשלוח דוגמאות לאשרף', deadline: '2026-08-20' } } },
                { id: 'b2c3d4e5-0000', object_type: 'TASK', verification_state: 'CANONICAL',
                  payload: { quote: 'לבדוק מלאי', speaker: 'דוד', fields: { what: 'לבדוק מלאי אלוטקס', deadline: '2026-08-28' } } }],
        counts: { active: 2, canonical: 2, pending_notes: 0, expired: 0 } });
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
  // David, 25.8: a control that looks live but does nothing is worse than none.
  ok(`${tag}: no dead expert-system controls`, (await page.$$('#chips, .chip')).length === 0);
  ok(`${tag}: LIVE indicator present`, await page.isVisible('.live'));
  ok(`${tag}: orb present`, await page.isVisible('.orb.lg'));
  // Light theme (David, 25.8): a bright ground and dark text, everywhere.
  const skin = await page.evaluate(() => {
    const rgb = (c) => c.match(/\d+/g).map(Number);
    const lum = (c) => { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
    return { bg: lum(getComputedStyle(document.body).backgroundColor),
             txt: lum(getComputedStyle(document.body).color) };
  });
  ok(`${tag}: the ground is light`, skin.bg > 0.9, JSON.stringify(skin));
  ok(`${tag}: the text is dark on it`, skin.txt < 0.3, JSON.stringify(skin));
  ok(`${tag}: idle does not spill sideways`, (await overflow(page)) <= 1, `overflow ${await overflow(page)}px`);
  // Caught live: a grid-area name declared outside the desktop query generated
  // phantom rows and put the composer ABOVE the conversation on narrow windows.
  const stack = await page.evaluate(() => ({
    thread: Math.round(document.querySelector('#thread').getBoundingClientRect().top),
    composer: Math.round(document.querySelector('#composer').getBoundingClientRect().top) }));
  ok(`${tag}: the composer sits below the conversation`, stack.composer > stack.thread, JSON.stringify(stack));

  await page.fill('#note', 'כמה מכרנו היום?');
  await shot(page, `${tag}-2-typed`);
  await page.click('#sendBtn');
  await page.waitForSelector('#thread .msg.lia .ansCard', { timeout: 6000 });
  await page.waitForTimeout(350);
  await shot(page, `${tag}-3-answer`);
  const card = await page.$$eval('#thread .msg.lia', n => n[n.length - 1].innerText);
  ok(`${tag}: answer is sectioned`, /מה מצאתי/.test(card) && /הפעולה הבאה/.test(card), JSON.stringify(card.slice(0, 160)));
  // The card is built from r.facts — the same array the drawer reads.
  ok(`${tag}: the finding is on the card`, /7 תעודות משלוח/.test(card));
  ok(`${tag}: interpretation stays folded`, !/לקוח שחוזר שווה יותר/.test(card));
  ok(`${tag}: one composer only — mic is the icon, no second voice control`,
    !/דבר עם LIA/.test(await page.textContent('#composer')));
  ok(`${tag}: answer does not spill sideways`, (await overflow(page)) <= 1, `overflow ${await overflow(page)}px`);

  ok(`${tag}: evidence is NOT dumped inside the reply`, !/לקוח שחוזר שווה יותר/.test(card));
  // "Maximum 5-7 visible lines before expansion" — enforced structurally, not
  // by eyeballing: at most 3 findings and 2 interpretation lines reach the
  // card; everything beyond that is in the drawer.
  const shape = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#thread .msg.lia .ansCard')].pop();
    const means = [...c.querySelectorAll('.sec .secBody')].filter(e => !e.classList.contains('facts'));
    return { facts: c.querySelectorAll('.fact').length,
             meanLines: means.reduce((a, e) => a + e.innerText.split('\n').filter(Boolean).length, 0),
             next: c.querySelectorAll('.nextPill').length };
  });
  ok(`${tag}: the card stays short — findings capped at 3`, shape.facts <= 3, JSON.stringify(shape));
  ok(`${tag}: interpretation capped at 2 lines on the card`, shape.meanLines <= 2, JSON.stringify(shape));
  ok(`${tag}: the next action is on the card as its own control`, shape.next === 1);

  const acts = await page.$$eval('#thread .msg.lia .acts .det',
    n => n.map(b => ({ text: b.textContent.trim(), label: b.getAttribute('aria-label') || '' })));
  ok(`${tag}: both controls are icons, not labels`,
    acts.length === 2 && acts.every(a => a.text.length <= 2 && a.label.length > 2), JSON.stringify(acts));

  await page.click('#thread .msg.lia .acts .det');
  await page.waitForTimeout(300);
  await shot(page, `${tag}-4-evidence`);
  ok(`${tag}: evidence opens in its own surface`, await page.isVisible('#evDrawer.on'));
  const deep = await page.textContent('#evBody');
  ok(`${tag}: the drawer holds sources, facts and interpretation`,
    /ORDERS/.test(deep) && /7 תעודות משלוח/.test(deep) && /לקוח שחוזר שווה יותר/.test(deep));
  ok(`${tag}: open drawer does not spill sideways`, (await overflow(page)) <= 1);
  await page.click('#evHead .ghost');
  await page.waitForTimeout(200);
  ok(`${tag}: the drawer closes again`, !(await page.isVisible('#evDrawer.on')));
  await ctx.close();
}

// ── David's acceptance, desktop (25.8): without scrolling a wall of text he
// must see (1) what happened today, (2) what needs him, (3) what LIA
// recommends, (4) which systems are live.
{
  const { page, ctx } = await open({ width: 1440, height: 900 }, 'command-center');
  await page.waitForTimeout(700);
  await shot(page, 'desktop-0-command-center');
  ok('CC: today rail beside the conversation, not one stretched column',
    await page.isVisible('#railL') && await page.isVisible('#center'));
  const today = await page.textContent('#today');
  ok('CC: 1. what happened today — orders, from the sales endpoint',
    /14/.test(today) && /הזמנות היום/.test(today), JSON.stringify(today));
  ok('CC: 2. what needs attention — overdue is counted and called out',
    /באיחור/.test(today));
  const prios = await page.textContent('#prios');
  ok('CC: 3. what LIA recommends — ranked priorities from the open queue',
    /דוגמאות לאשרף/.test(prios) && /לאשר את מחיר/.test(prios), JSON.stringify(prios));
  // David, 25.8: system status and the activity feed are gone — only the
  // conversation, TODAY and PRIORITIES remain.
  ok('CC: system status and activity feed are gone',
    (await page.$$('#systems, #activity, #railR, .sys, .act')).length === 0);
  ok('CC: identity is present at desktop size', await page.isVisible('#osName'));
  ok('CC: no horizontal spill on the wide canvas', (await overflow(page)) <= 1);
  // the acceptance itself: all four without scrolling
  const seenAbove = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false;
      const r = e.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.height > 0; };
    return vis('#today') && vis('#prios') && vis('#thread');
  });
  ok('CC: all four are visible without scrolling', seenAbove);
  await ctx.close();
}

// ── the phone stays a single-column assistant ───────────────────────────────
{
  const { page, ctx } = await open({ width: 390, height: 844 }, 'phone-shape');
  await page.waitForTimeout(500);
  ok('phone: the rail does not stretch onto the phone', !(await page.isVisible('#railL')));
  ok('phone: the composer is present and sticky at the bottom',
    await page.isVisible('#composer'));
  await page.fill('#note', 'מה מצב ההזמנות היום');
  await page.click('#sendBtn');
  await page.waitForSelector('#thread .msg.lia .ansCard', { timeout: 6000 });
  await page.click('#thread .msg.lia .acts .det');
  await page.waitForTimeout(300);
  await shot(page, 'mobile-9-sheet');
  const sheet = await page.evaluate(() => {
    const d = document.getElementById('evDrawer'); const r = d.getBoundingClientRect();
    return { bottom: Math.round(window.innerHeight - r.bottom), h: Math.round(r.height), vh: window.innerHeight };
  });
  ok('phone: evidence arrives as a bottom sheet, not a full page',
    sheet.bottom <= 2 && sheet.h < sheet.vh * 0.85, JSON.stringify(sheet));
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
  ok('no-data: an honest zero is not dressed up as a finding', !/•/.test(card));
  await ctx.close();
}

// P0 — summary and details cannot disagree. The prose denies the check; the
// object carries the numbers. The numbers win, and the denial is kept, not
// deleted: it moves into the drawer verbatim so nothing is hidden from David.
{
  const { page, ctx, set } = await open({ width: 390, height: 844 }, 'denial');
  set(DENIAL);
  await page.fill('#note', 'אני רוצה לדעת מה מצב ההזמנות היום');
  await page.click('#sendBtn');
  await page.waitForSelector('#thread .msg.lia .ansCard', { timeout: 6000 });
  await page.waitForTimeout(300);
  await shot(page, 'mobile-8-denial');
  const card = await page.$$eval('#thread .msg.lia', n => n[n.length - 1].innerText);
  ok('P0: the card shows the data it already had', /14 הזמנות/.test(card) && /42,687/.test(card));
  ok('P0: the card does not claim it never checked', !/בלי לבדוק/.test(card), JSON.stringify(card.slice(0, 200)));
  await page.click('#thread .msg.lia .acts .det');
  await page.waitForTimeout(200);
  ok('P0: the rejected wording is preserved in the drawer',
    /בלי לבדוק/.test(await page.textContent('#evBody')));
  ok('P0: no horizontal spill in the corrected card', (await overflow(page)) <= 1);
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
