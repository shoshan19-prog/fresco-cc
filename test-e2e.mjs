// The panel driven in a REAL browser, because the bug that took LIA down in
// production — `Assignment to constant variable.` — is a runtime error no
// amount of source-string matching can see. test-render.mjs asserted that the
// line `res=unwrapPayload(res)` was PRESENT and went green while that exact
// line was throwing on every question David asked.
//
// The network is stubbed at the route level; everything else is the shipped
// file, unmodified.
//   node test-e2e.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const ANSWERS = ['מכרנו היום 42,180 ש"ח בשבע תעודות משלוח.',
                 'כי שתי הזמנות גדולות של מרינה יצאו הבוקר.'];

let bad = 0, total = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

const browser = await chromium.launch();
const errors = [];

async function session(viewport, tag) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });

  let asked = 0;
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    let json = {};
    if (body.action === 'state') json = { ok: true, items: [], objects: [], model: true };
    else if (body.action === 'kernel') json = {
      answer: ANSWERS[Math.min(asked++, ANSWERS.length - 1)],
      facts: ['7 תעודות משלוח'], inferences: [], sources: ['priority'],
      risks_opportunities: [], missing_information: [],
      recommended_next_action: '', confidence: 'HIGH', capabilities_used: ['sales_today'],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  // A code in storage is what makes the page auto-boot, exactly as it does for
  // David. Speech is removed: headless Chromium has no voices, and speak()
  // already has that path — this keeps the test about the panel, not the TTS.
  await page.addInitScript(() => {
    localStorage.setItem('lia_code', 'test-code');
    delete window.speechSynthesis;
  });
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  return { page, ctx };
}

async function ask(page, text) {
  await page.fill('#note', text);
  await page.click('#sendBtn');
  await page.waitForFunction(() => document.querySelectorAll('#thread .msg.lia').length > window.__seen,
    null, { timeout: 8000 }).catch(() => {});
}
const seen = (page) => page.evaluate(() => {
  window.__seen = document.querySelectorAll('#thread .msg.lia').length; return window.__seen; });

// ── David's six steps, on the desktop panel ─────────────────────────────────
{
  const { page } = await session({ width: 1280, height: 900 }, 'desktop');
  ok('1. LIA opens', await page.isVisible('#app'));

  await seen(page);
  await ask(page, 'כמה מכרנו היום?');
  const first = await page.textContent('#thread .msg.lia .bubble').catch(() => '');
  ok('2-3. a question gets an answer', (first || '').includes('42,180'), `got: ${JSON.stringify(first)}`);
  const stat1 = await page.textContent('#noteStat');
  ok('   no failure line under the box', !/לא הצלחתי/.test(stat1 || ''), `got: ${JSON.stringify(stat1)}`);

  await seen(page);
  await ask(page, 'למה?');
  const bubbles = await page.$$eval('#thread .msg.lia .bubble', n => n.map(x => x.textContent));
  ok('4. the follow-up is answered', bubbles.some(b => b.includes('מרינה')), `got: ${JSON.stringify(bubbles)}`);

  const turns = await page.$$eval('#thread .msg', n => n.map(x => x.className));
  ok('5. the whole conversation is still on screen — 2 asked, 2 answered',
    turns.filter(c => /\bme\b/.test(c)).length === 2 && turns.filter(c => /\blia\b/.test(c)).length === 2,
    `got: ${JSON.stringify(turns)}`);

  // The kernel must receive the conversation, not just the last line.
  const sentHistory = await page.evaluate(() => historyForKernel().length);
  ok('   the follow-up carried history to the kernel', sentHistory >= 1, `history pairs: ${sentHistory}`);

  await page.click('button[title="שיחה חדשה"]');
  await page.waitForTimeout(200);
  const left = await page.evaluate(() => SESSION.turns.length);
  const shown = await page.textContent('#thread');
  ok('6. a new conversation starts empty', left === 0, `turns left: ${left}`);
  ok('   and shows the opening line, not a blank panel',
    /שאל אותי משהו על פרסקו/.test(shown || ''), `got: ${JSON.stringify((shown || '').slice(0, 80))}`);

  // The property the old regex assert in test-render.mjs claimed to cover and
  // did not: what lands in memory must be prose. Drive it with the failure that
  // caused it — a model printing its payload instead of calling final_answer.
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action !== 'kernel') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      answer: JSON.stringify({ answer: 'שתי הזמנות של מרינה יצאו הבוקר.', facts: [], inferences: ['נגזר מתעודות המשלוח'], confidence: 'HIGH' }),
      capabilities_used: ['sales_today'] }) });
  });
  await seen(page);
  await ask(page, 'ולמה זה קרה?');
  const bubble = await page.$$eval('#thread .msg.lia .bubble', n => n[n.length - 1].textContent);
  ok('   a printed payload never reaches the bubble', !/[{}]/.test(bubble), `got: ${JSON.stringify(bubble)}`);
  const mem = await page.evaluate(() => LAST && LAST.res && LAST.res.answer);
  ok('   and memory holds the sentence, not the payload',
    mem === 'שתי הזמנות של מרינה יצאו הבוקר.', `got: ${JSON.stringify(mem)}`);
}
// ── the same flow on a phone, which is where David actually uses it ─────────
{
  const { page } = await session({ width: 390, height: 844 }, 'mobile');
  await seen(page);
  await ask(page, 'כמה מכרנו היום?');
  const b = await page.textContent('#thread .msg.lia .bubble').catch(() => '');
  ok('mobile: the same question is answered', (b || '').includes('42,180'), `got: ${JSON.stringify(b)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('mobile: nothing spills sideways', overflow <= 1, `overflow: ${overflow}px`);
}

// ── 7. and the console has to be clean ──────────────────────────────────────
ok('7. no "Assignment to constant variable" anywhere',
  !errors.some(e => /Assignment to constant variable/.test(e)),
  errors.filter(e => /Assignment to constant/.test(e))[0]);
ok('   console clean overall', errors.length === 0, errors.slice(0, 4).join('\n      '));

await browser.close();
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
