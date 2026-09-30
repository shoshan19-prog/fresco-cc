// Visual QA for the redesigned panel: drives the SHIPPED file in a real
// browser with the network stubbed, captures every state David listed, and
// fails on horizontal overflow, console errors, or an unreadable contrast
// ratio on body text. Screenshots land in ./qa/.
//   node --experimental-strip-types qa-visual.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const PAGE = process.env.QA_PAGE || 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
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

async function open(viewport, tag, hold, extra = {}, pageUrl = PAGE) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL', deviceScaleFactor: 2, ...extra });
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
    /* A waiting notification, in the shape the server sends it: a Hebrew title
       ending in a Latin/number run, which is exactly what the bidi algorithm
       reorders on a narrow screen. */
    if (body.action === 'cap' && body.name === 'notifications')
      return j({ rows: [{ id: 'n1', work_id: 'w1', unread: true,
        title: 'LIA · סיימתי: בדיקת חשבוניות אוגוסט', line: '205 חשבוניות, 744,042 ₪' }] });
    j({ ok: true, items: [], objects: [], model: true,
        queue: [{ id: 'a1b2c3d4-0000', object_type: 'COMMITMENT', verification_state: 'CANONICAL',
                  payload: { quote: 'הבטחנו דוגמאות', speaker: 'דוד', fields: { what: 'לשלוח דוגמאות לאשרף', deadline: '2026-08-20' } } },
                { id: 'b2c3d4e5-0000', object_type: 'TASK', verification_state: 'CANONICAL',
                  payload: { quote: 'לבדוק מלאי', speaker: 'דוד', fields: { what: 'לבדוק מלאי אלוטקס', deadline: '2026-08-28' } } }],
        counts: { active: 2, canonical: 2, pending_notes: 0, expired: 0 } });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); localStorage.setItem('lia_privacy', '1'); });
  await page.goto(pageUrl);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  return { page, ctx, set: (p) => { payload = p; } };
}
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png', fullPage: false });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const { page, ctx } = await open(vp, tag);
  await page.waitForTimeout(400);
  await shot(page, `${tag}-1-idle`);
  // The greeting is time-of-day aware (בוקר טוב / צהריים טובים / ערב טוב),
  // so pinning one wording made this red at every hour but the morning.
  ok(`${tag}: home screen greets and asks`, /(טוב|טובים), דוד/.test(await page.textContent('#thread')));
  // David, 25.8: a control that looks live but does nothing is worse than none.
  ok(`${tag}: no dead expert-system controls`, (await page.$$('#chips, .chip')).length === 0);
  // David, 30.9: the phone bar is the mark, the name and two small controls — the LIVE pill is a desktop mark.
  ok(`${tag}: LIVE indicator ${tag === 'desktop' ? 'present' : 'is not on the phone bar'}`,
    tag === 'desktop' ? await page.isVisible('.live') : !(await page.isVisible('.live')));
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

  /* David, 28.8: "ישר את תיבת הצאט מול התשובות". The composer used to span the
     whole shell — centred over the rail as well — so the box he types into sat
     off to one side of the answers and was wider than them. */
  const geo = await page.evaluate(() => {
    const c = document.querySelector('#thread .msg.lia').getBoundingClientRect();
    const b = document.querySelector('#composer .line').getBoundingClientRect();
    return { dl: Math.round(b.left - c.left), dr: Math.round(b.right - c.right),
             cw: Math.round(c.width), bw: Math.round(b.width) };
  });
  ok(`${tag}: the composer lines up with the answers`, Math.abs(geo.dl) <= 2 && Math.abs(geo.dr) <= 2,
    JSON.stringify(geo));

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

  /* And it shrinks back. The height it took while a long message was being
     typed is inline, so it outranks the rows reset every send already did —
     one long question left the empty box at 34vh for the rest of the day. */
  const box = await page.evaluate(() => Math.round(document.querySelector('#composer .line').getBoundingClientRect().height));
  await page.fill('#note', 'שאלה ארוכה מאוד. '.repeat(60));
  await page.waitForTimeout(150);
  const grown = await page.evaluate(() => Math.round(document.querySelector('#composer .line').getBoundingClientRect().height));
  await page.click('#sendBtn');
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => Math.round(document.querySelector('#composer .line').getBoundingClientRect().height));
  ok(`${tag}: the composer grows with a long message`, grown > box + 40, `${box} → ${grown}`);
  ok(`${tag}: and shrinks back once it is sent`, back === box, `${grown} → ${back}, resting ${box}`);
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

// ── phone chrome: the things only a real handset shows ──────────────────────
// David reported LIA "משובשת בנייד". Headless layout was clean; the breakage was
// in the phone chrome — an iOS status bar left translucent over a now-LIGHT
// page (white text on white, content sliding under the notch), a dark PWA
// splash, an oversized orb and 30px tap targets left over from the dark design.
{
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(fileURLToPath(new URL('./lia.html', import.meta.url)), 'utf8');
  const mani = JSON.parse(readFileSync(fileURLToPath(new URL('./lia.webmanifest', import.meta.url)), 'utf8'));
  ok('phone: the iOS status bar is not translucent over a light page',
    /apple-mobile-web-app-status-bar-style" content="default"/.test(html));
  ok('phone: theme-color matches the light ground', /theme-color" content="#f7f8fa"/.test(html));
  ok('phone: the PWA splash is light, not a dark flash',
    mani.background_color === '#f7f8fa' && mani.theme_color === '#f7f8fa',
    JSON.stringify({ bg: mani.background_color, th: mani.theme_color }));

  const { page, ctx } = await open({ width: 390, height: 844 }, 'phone-chrome');
  await page.waitForTimeout(300);
  const orb = await page.evaluate(() => {
    const e = document.querySelector('.orb.lg'); const r = e.getBoundingClientRect();
    return Math.round(r.width); });
  ok('phone: the orb is a mark, not a mascot', orb <= 60, `orb ${orb}px`);
  const bar = await page.evaluate(() => getComputedStyle(document.querySelector('#topbar')).paddingTop);
  ok('phone: the top bar pays for the notch', /calc|px/.test(bar), bar);
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForSelector('#thread .msg.lia .acts .det', { timeout: 6000 });
  const tap = await page.$$eval('#thread .msg.lia .acts .det',
    n => n.map(b => Math.round(b.getBoundingClientRect().width)));
  ok('phone: the icon controls are thumb-sized', tap.every(w => w >= 36), JSON.stringify(tap));
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

/* ── what a waiting notification looks like, and where the switch is ─────────
   Both failures this covers were real on the phone: the notification line was
   reordered by bidi so the result read before the title, and the permission
   control — the one thing David has to press himself — sat inside a collapsed
   "פרטים" block he had no reason to open. */
{
  const { page, ctx } = await open({ width: 390, height: 844 }, 'phone-notify');
  await page.waitForTimeout(600);
  await shot(page, 'mobile-10-notification');
  const strip = await page.evaluate(() => {
    const box = document.getElementById('notifBox');
    if (!box || getComputedStyle(box).display === 'none') return null;
    const row = box.querySelector('.nRow'), t = box.querySelector('.nTitle'), l = box.querySelector('.nLine');
    if (!row || !t || !l) return { rowless: true };
    const rt = t.getBoundingClientRect(), rl = l.getBoundingClientRect();
    return { h: Math.round(row.getBoundingClientRect().height),
             titleBottom: Math.round(rt.bottom), lineTop: Math.round(rl.top),
             titleIsolated: getComputedStyle(t).unicodeBidi.includes('isolate'),
             lineIsolated: getComputedStyle(l).unicodeBidi.includes('isolate') };
  });
  ok('phone: a waiting notification is on screen even with no push', !!strip && !strip.rowless, JSON.stringify(strip));
  ok('phone: the result sits UNDER the title, not reordered into it',
    strip && strip.lineTop >= strip.titleBottom - 1 && strip.titleIsolated && strip.lineIsolated,
    JSON.stringify(strip));
  ok('phone: the whole notification is a thumb-sized target', strip && strip.h >= 44, JSON.stringify(strip));

  await page.click('#menuBtn').catch(() => {});
  await page.evaluate(() => { const p = document.getElementById('panel'); if (p) p.style.display = 'block'; });
  await page.waitForTimeout(200);
  await shot(page, 'mobile-11-settings');
  const btn = await page.evaluate(() => {
    const b = document.getElementById('notifBtn');
    if (!b) return null;
    const r = b.getBoundingClientRect(), adv = document.getElementById('advanced');
    return { visible: !!(r.width && r.height), width: Math.round(r.width), right: Math.round(r.right),
             insideCollapsed: !!(adv && adv.contains(b) && getComputedStyle(adv).display === 'none'),
             vw: window.innerWidth };
  });
  ok('phone: the notification switch is reachable without opening "פרטים"',
    btn && btn.visible && !btn.insideCollapsed, JSON.stringify(btn));
  ok('phone: and it fits on the screen', btn && btn.right <= btn.vw + 1, JSON.stringify(btn));
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

/* ── THE PHONE IS A CONVERSATION, THE DESKTOP IS UNTOUCHED (David, 29.9 → 30.9) ──
   Two claims, each proved against the real shipped file in a real browser:
   (1) DESKTOP — at every desktop and tablet width the layout is the one that ran
       before the regression (ca8cea0, the page served before WORK 5099131f): the
       same rectangles for every region and button, and the same pixels.
   (2) PHONE — a clean conversation screen: nothing above the thread but a slim bar
       with two small controls, a slim composer, no sideways spill, nothing clipped,
       at the widths real phones have, in portrait and on its side. */
{
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const BASE_SHA = 'ca8cea0';
  let basePath = null;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'lia-base-'));
    basePath = join(dir, 'lia.html');
    writeFileSync(basePath, execFileSync('git', ['show', `${BASE_SHA}:lia.html`], { cwd: fileURLToPath(new URL('./', import.meta.url)), maxBuffer: 64 << 20 }));
  } catch (e) { basePath = null; }
  ok(`the pre-regression page (${BASE_SHA}) is available to compare against`, !!basePath, 'git show failed — fetch the history');

  // The regions and every visible control, as rectangles — the layout, not a screenshot.
  const layout = (page) => page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const regions = {};
    for (const sel of ['#topbar', '.brand', '.live', '#osName', '#ctxLine', '#clock', '#railL', '#kpiCard', '#center', '#stateStrip', '#orgMobile', '#thread', '#composer', '#composer .line', '#seal'])
      { const el = document.querySelector(sel); regions[sel] = el && vis(el) ? r(el) : null; }
    const buttons = [...document.querySelectorAll('#app button')].filter(vis).map((b) => (b.id || b.getAttribute('title') || b.textContent.trim().slice(0, 12)) + '@' + r(b).join(','));
    return { regions, buttons };
  });
  const still = async (page) => {
    await page.addStyleTag({ content: '#clock{visibility:hidden!important}*{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(250);
    return page.screenshot({ animations: 'disabled' });
  };

  // ── (1) DESKTOP AND TABLET: identical to the page before the regression ──
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080], [1100, 800], [1099, 900], [768, 1024], [601, 900]]) {
    if (!basePath) break;
    const tag = `desktop ${w}x${h}`;
    const now = await open({ width: w, height: h }, tag);
    const was = await open({ width: w, height: h }, tag + ' (before)', false, {}, 'file://' + basePath);
    await now.page.waitForTimeout(500); await was.page.waitForTimeout(500);
    const a = await layout(now.page), b = await layout(was.page);
    const same = JSON.stringify(a) === JSON.stringify(b);
    ok(`${tag}: every region and every control sits where it sat before the regression`, same,
      same ? '' : 'now ' + JSON.stringify(a.regions) + '\n      was ' + JSON.stringify(b.regions));
    const pa = await still(now.page), pb = await still(was.page);
    ok(`${tag}: and the pixels are identical`, Buffer.compare(pa, pb) === 0, `${pa.length} vs ${pb.length} bytes`);
    if (w >= 1100) {
      ok(`${tag}: the sales/metrics rail is on screen`, !!a.regions['#railL'] && !!a.regions['#kpiCard']);
      ok(`${tag}: the top bar keeps LIVE, the name, the clock and both controls`,
        !!a.regions['#topbar'] && !!a.regions['.live'] && !!a.regions['#osName'] && !!a.regions['#clock'] && a.buttons.some((x) => x.startsWith('שיחה חדשה')) && a.buttons.some((x) => x.startsWith('עוד')));
      ok(`${tag}: the two-column grid is intact`, a.regions['#railL'][2] >= 280 && a.regions['#center'][2] > 600);
    }
    await now.ctx.close(); await was.ctx.close();
  }

  // ── (2) PHONE: a clean conversation ──
  const PHONES = [
    { w: 390, h: 844, name: 'phone 390x844' }, { w: 360, h: 740, name: 'phone 360x740' },
    { w: 320, h: 568, name: 'phone 320x568' }, { w: 430, h: 932, name: 'phone 430x932' },
    { w: 600, h: 900, name: 'phone 600x900 (the largest width)' },
    { w: 844, h: 390, name: 'phone on its side 844x390', touch: true },
  ];
  const HIDDEN = ['#orgMobile', '#stateStrip', '#notifCta', '#chatSyncLine', '#clock', '#seal', '#ctxLine', '#osName'];
  for (const P of PHONES) {
    const extra = { isMobile: true, hasTouch: true };
    const { page, ctx } = await open({ width: P.w, height: P.h }, P.name, false, extra);
    await page.waitForTimeout(500);
    // Show every clutter block the way the app would when it has something to say. The phone must keep them out.
    await page.evaluate((sels) => { for (const s of sels) { const e = document.querySelector(s); if (e) { e.style.display = 'block'; e.textContent = e.textContent || 'x'; } } }, HIDDEN);
    await page.waitForTimeout(150);
    const m = await page.evaluate((HIDDEN) => {
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { on: b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden', l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height), fs: parseFloat(cs.fontSize) }; };
      const btn = (title) => { const e = [...document.querySelectorAll('#topbar button')].find((x) => x.getAttribute('title') === title); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left), r: Math.round(b.right), fs: parseFloat(getComputedStyle(e).fontSize) }; };
      return { hidden: HIDDEN.map((s) => [s, !!(box(s) && box(s).on)]).filter(([, on]) => on).map(([s]) => s),
        topbar: box('#topbar'), thread: box('#thread'), composer: box('#composer'), line: box('#composer .line'), note: box('#note'),
        pen: btn('שיחה חדשה'), dots: btn('עוד'), vw: window.innerWidth, vh: window.innerHeight,
        spill: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }, HIDDEN);
    await shot(page, 'phone-clean-' + P.name.replace(/[^0-9a-z]+/gi, '-'));
    ok(`${P.name}: none of the dashboard clutter is on screen (organizer, running-tasks strip, notification banner, sync line, clock, footer)`,
      m.hidden.length === 0, JSON.stringify(m.hidden));
    ok(`${P.name}: ✎ and ⋯ stay — small, thumb-reachable, on screen`,
      !!m.pen && !!m.dots && m.pen.w >= 30 && m.pen.w <= 40 && m.dots.w >= 30 && m.dots.w <= 40 && m.pen.fs <= 16 && m.dots.fs <= 16
      && m.pen.l >= 0 && m.dots.l >= 0 && m.pen.r <= m.vw && m.dots.r <= m.vw, JSON.stringify({ pen: m.pen, dots: m.dots }));
    ok(`${P.name}: the bar is slim`, m.topbar.h <= (P.h < 500 ? 46 : 48), JSON.stringify(m.topbar));
    ok(`${P.name}: the composer is one slim line`, m.composer.h <= (P.h < 500 ? 60 : 64), JSON.stringify(m.composer));
    const share = m.thread.h / m.vh;
    ok(`${P.name}: the conversation is the middle of the screen (${Math.round(share * 100)}% of the height)`, share >= (P.h < 500 ? 0.4 : 0.66), JSON.stringify(m.thread));
    ok(`${P.name}: the conversation ends where the composer starts — nothing under it`, m.thread.b <= m.composer.t + 1 && m.composer.b <= m.vh + 1, JSON.stringify({ thread: m.thread, composer: m.composer }));
    ok(`${P.name}: no sideways spill`, m.spill <= 1, `overflow ${m.spill}px`);
    ok(`${P.name}: the input keeps a 16px font (no browser zoom on focus)`, m.note.fs >= 16, `font ${m.note.fs}px`);
    await ctx.close();
  }

  // The phone under load: a long conversation with an unbreakable line, then the keyboard.
  {
    const { page, ctx } = await open({ width: 390, height: 844 }, 'phone-load', false, { isMobile: true, hasTouch: true });
    for (let i = 0; i < 3; i++) {
      await page.fill('#note', i === 1 ? 'https://example.com/' + 'x'.repeat(160) : 'כמה מכרנו היום? ' + i);
      await page.click('#sendBtn');
      await page.waitForSelector(`#thread .msg.lia:nth-of-type(${i + 1}) .ansCard, #thread .msg.lia .ansCard`, { timeout: 6000 });
      await page.waitForTimeout(500);
    }
    const g = await page.evaluate(() => {
      const t = document.querySelector('#thread'), c = document.querySelector('#composer');
      const msgs = [...t.querySelectorAll('.msg')]; const last = msgs[msgs.length - 1].getBoundingClientRect();
      return { last: [Math.round(last.top), Math.round(last.bottom)], composerTop: Math.round(c.getBoundingClientRect().top), spill: document.documentElement.scrollWidth - document.documentElement.clientWidth, n: msgs.length };
    });
    await shot(page, 'phone-clean-conversation');
    ok('phone: with a real conversation the newest message is fully above the composer', g.last[1] <= g.composerTop + 1 && g.last[0] >= 0, JSON.stringify(g));
    ok('phone: an unbroken 160-character line does not push the page sideways', g.spill <= 1, `overflow ${g.spill}px`);
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForTimeout(300);
    const k = await page.evaluate(() => { const c = document.querySelector('#composer').getBoundingClientRect(), t = document.querySelector('#thread').getBoundingClientRect();
      return { composerBottom: Math.round(c.bottom), vh: innerHeight, threadH: Math.round(t.height) }; });
    await shot(page, 'phone-clean-keyboard');
    ok('phone: with the keyboard up the composer is on screen and the conversation still has room', k.composerBottom <= k.vh + 1 && k.threadH >= 150, JSON.stringify(k));
    await page.setViewportSize({ width: 390, height: 844 });
    // ⋯ and ✎ do what they did: the menu opens, and it still holds the history and the notification switch.
    await page.click('#topbar button[title="עוד"]');
    await page.waitForTimeout(250);
    ok('phone: ⋯ opens the panel — history and settings are one tap away', await page.isVisible('#panel.on') && await page.isVisible('#sessions'));
    ok('phone: and the notification switch is inside it', await page.isVisible('#notifBtn'));
    await ctx.close();
  }
}

ok('no console or page errors', errors.length === 0, errors.join('\n      '));
await browser.close();
console.log(`\n${total - bad}/${total} visual checks passed  ·  screenshots in qa/`);
process.exit(bad ? 1 : 0);
