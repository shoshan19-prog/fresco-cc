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

async function session(viewport, tag, initScript) {
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
  if (initScript) await page.addInitScript(initScript);
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
  // The opening line became the home screen of David's 25.8 mockup: a greeting
  // and the one question LIA is there to answer. Same property as before — an
  // empty thread must never be a blank panel — asserted against what now fills it.
  ok('   and shows the home screen, not a blank panel',
    // Time-of-day aware: בוקר טוב / צהריים טובים / ערב טוב — pinning one
    // wording made this red at every hour but the morning.
    /(טוב|טובים), דוד/.test(shown || '') && /מה דורש תשומת לב עכשיו/.test(shown || ''),
    `got: ${JSON.stringify((shown || '').slice(0, 80))}`);

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
/* ── the false-REMEMBER trap ────────────────────────────────────────────────
   Mid-conversation David got "קלטתי, אבל לא זיהיתי פריט עסקי חדש בפתק הזה."
   Two separate roads led there and both are exercised here: a cold-start
   sentence that was not question-shaped, and — the one that actually bit —
   anything typed while she was waiting for "לשמור?", which the send button
   filed as a note without ever consulting the classifier. */
{
  /* Review is a VOICE-road state: sendPrimary() is the typed road and
     afterTranscript() is the spoken one, and only the second puts her into
     "רשמתי. לשמור?". So this session gets a speech engine — otherwise the trap
     David fell into is unreachable and the test would prove nothing. */
  const { page } = await session({ width: 1280, height: 900 }, 'remember-trap', () => {
    class FakeSR {
      start() {} stop() { if (this.onend) this.onend(); }
    }
    // defineProperty, not assignment: speechSynthesis is an accessor on
    // Window, so `window.speechSynthesis = {...}` silently does nothing and the
    // test ends up driving the real (voice-less) engine.
    const put = (k, v) => Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
    put('SpeechRecognition', FakeSR);
    put('speechSynthesis', {
      cancel() {}, getVoices() { return [{ name: 'Carmit', lang: 'he-IL' }]; },
      speak(u) { setTimeout(() => u.onend && u.onend(), 0); },
    });
    put('SpeechSynthesisUtterance', function (t) { this.text = t; });
  });
  let noteCalls = 0;
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'note') noteCalls++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      body.action === 'kernel'
        ? { answer: 'שני פרויקטים: Fresco OS ו-MATRIYA.', facts: [], inferences: [], sources: [],
            risks_opportunities: [], missing_information: [], recommended_next_action: '', confidence: 'HIGH' }
        : { ok: true, items: [], objects: [] }) });
  });

  // The very first thing said in a fresh session, not question-shaped.
  await seen(page);
  await ask(page, 'של דוד — מטריאה ופרסקו OS');
  ok('a cold-start sentence is answered, not filed as a note', noteCalls === 0, `note calls: ${noteCalls}`);
  const b1 = await page.textContent('#thread .msg.lia .bubble');
  ok('   and it never says it caught nothing',
    !/לא זיהיתי פריט עסקי חדש/.test(b1 || ''), `got: ${JSON.stringify(b1)}`);

  // Now put her into review the way the voice road does, with a real dictated
  // note, and then change the subject on her.
  await page.fill('#note', 'דיברתי עם יוסי והבטחתי לשלוח לו מפרט מחר');
  await page.evaluate(() => { SUBMITTED = false; afterTranscript(); });
  await page.waitForTimeout(200);
  ok('a dictated note does go to review, not to the kernel',
    await page.evaluate(() => MODE === 'review'), `MODE: ${await page.evaluate(() => MODE)}`);
  ok('   and nothing was filed yet — it is waiting for him', noteCalls === 0, `note calls: ${noteCalls}`);

  const beforeQ = noteCalls;
  await seen(page);
  await ask(page, 'רגע, את מכירה את הפרויקטים שאני עובד עליהם?');
  ok('a question asked while she waits for "לשמור?" is ANSWERED, not filed',
    noteCalls === beforeQ, `note calls went ${beforeQ} → ${noteCalls}`);
  const b2 = await page.$$eval('#thread .msg.lia .bubble', n => n[n.length - 1].textContent);
  ok('   and the answer is about his projects', /MATRIYA/.test(b2), `got: ${JSON.stringify(b2)}`);
  ok('   review mode was released', await page.evaluate(() => MODE !== 'review'));

  // The note road still has to work, or the fix traded one bug for another.
  await page.fill('#note', 'סיכמתי עם אריק על פגישה בשבוע הבא');
  await page.evaluate(() => { SUBMITTED = false; afterTranscript(); });
  await page.waitForTimeout(200);
  ok('   a dictated note is held for review, not sent behind his back', noteCalls === 0);
  await page.click('#sendBtn');                       // he confirms the note under review
  await page.waitForTimeout(400);
  ok('a note under review still sends when he confirms it', noteCalls === 1, `note calls: ${noteCalls}`);
}

/* ── the retraction that came back ──────────────────────────────────────────
   David's regression, run as a conversation rather than described:
     1. מה הדבר הכי חשוב שקורה היום בפרסקו?   → the server returns an unfounded
                                                current-state claim
     2. למה בחרת דווקא בזה?                    → LIA retracts it
     3. יש משהו חשוב שלא שאלתי?                → it must NOT come back
   PASS is: the retracted claim is carried to the server on turn 3, so it cannot
   be restated as fact without new evidence. */
{
  const { page } = await session({ width: 1280, height: 900 }, 'retraction');
  const sent = [];
  let turn = 0;
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action !== 'kernel')
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    sent.push(body);
    turn++;
    const base = { facts: [], inferences: [], sources: [], risks_opportunities: [],
                   missing_information: [], recommended_next_action: '', confidence: 'HIGH' };
    let r;
    if (turn === 1) {            // the kernel's gate fires: unfounded, and withdrawn
      r = { ...base, answer: 'אני לא יכולה לבדוק מצב פרודקשן, פריסות או קוד — אין לי חיבור לזה.',
            confidence: 'INSUFFICIENT_EVIDENCE',
            retracted_claims: ['גרסת הייצור v34 שונה מהותית מהקוד שבמאגר, והקוד החי לא מקומט.'] };
    } else if (turn === 2) {
      r = { ...base, answer: 'לא בדקתי שום מידע מחובר לפני שקבעתי את זה.',
            confidence: 'INSUFFICIENT_EVIDENCE' };
    } else {
      r = { ...base, answer: 'בדקתי את ההתחייבויות ואת ההחלטות. שתי החלטות מחכות לך.',
            capabilities_used: ['open_commitments', 'next_decision'] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });

  await seen(page); await ask(page, 'מה הדבר הכי חשוב שקורה היום בפרסקו?');
  ok('turn 1 carries no retractions yet', (sent[0].retracted || []).length === 0);
  // innerText, not textContent: פרטים is display:none inside the bubble, and it
  // SHOULD hold the withdrawn claim — David is entitled to see what she pulled
  // back. What must never happen is it being read as an answer.
  const shown = await page.$$eval('#thread .msg.lia', n => n[n.length - 1].innerText);
  ok('the unfounded claim never reaches the screen as an answer',
    !/שונה מהותית|לא מקומט/.test(shown || ''), `got: ${JSON.stringify(shown)}`);
  // Evidence moved out of the conversation (David, 25.8): it is a drawer now,
  // not thirty lines folded into the reply. Same guarantee, new surface —
  // nothing is shown until he opens it.
  ok('...and the evidence drawer is closed until he opens it',
    !(await page.isVisible('#evDrawer.on')) && !(await page.textContent('#evBody')).trim());

  await seen(page); await ask(page, 'למה בחרת דווקא בזה?');
  await seen(page); await ask(page, 'יש משהו חשוב שלא שאלתי?');
  const last = sent[sent.length - 1];
  ok('the withdrawn claim is carried to the server on the later turn',
    (last.retracted || []).some((r) => /גרסת הייצור/.test(r)),
    `retracted sent: ${JSON.stringify(last.retracted)}`);
  ok('it is carried once, not once per turn',
    (last.retracted || []).filter((r) => /גרסת הייצור/.test(r)).length === 1);
  ok('the conversation itself is still sent alongside it', Array.isArray(last.history));
  ok('it survives a reload, because it lives in the session',
    await page.evaluate(() => (JSON.parse(localStorage.getItem('lia_s_' + localStorage.getItem('lia_session_cur')))
      .retracted || []).length === 1));

  // A new conversation is a clean slate — a retraction is scoped to its session.
  await page.click('button[title="שיחה חדשה"]');
  await page.waitForTimeout(200);
  ok('a new conversation starts with nothing withdrawn',
    await page.evaluate(() => (SESSION.retracted || []).length === 0));
}

/* ── she talks, she does not file ───────────────────────────────────────────
   "הזדמנות:" / "סיכון:" / "לאשר:" under every reply is a form being filled in.
   The answer is the conversation; the split lives under פרטים. */
{
  const { page } = await session({ width: 1280, height: 900 }, 'tone');
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action !== 'kernel')
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      answer: 'מצאתי משהו מעניין: משאב שיקום היה קונה בערך כל עשרה ימים, ונעצר לפני שנה כמעט בבת אחת. '
        + 'זה נראה לי יותר כמו שבירת קשר מאשר דעיכה טבעית. אם הייתי במקומך, הייתי מתקשר אליהם קודם.',
      facts: ['31 הזמנות ב-2024'], inferences: ['הפסקה חדה, לא דעיכה'],
      risks_opportunities: ['לקוח שחוזר שווה יותר מלקוח חדש'],
      recommended_next_action: 'להתקשר למשאב שיקום השבוע',
      sources: ['ORDERS'], missing_information: [], confidence: 'HIGH',
      capabilities_used: ['priority_sales'] })});
  });
  await seen(page);
  await ask(page, 'תסתכלי על הלקוחות ותמצאי לי משהו חריג שלא הייתי רואה לבד.');
  const bubble = await page.$$eval('#thread .msg.lia', n => n[n.length - 1].innerText);
  ok('the analysis reads as one person talking', /משאב שיקום/.test(bubble));
  // David's 25.8 UI directive and mockup reverse exactly one half of this: the
  // next action IS on the card now, under its own "הפעולה הבאה" heading. What
  // the assert still guards is the thing he actually objected to — a form being
  // filled in under every reply. Risks, facts and sources stay folded away, and
  // the recommendation is a labelled section, never a line stapled to the prose.
  ok('the next action is its own section, not stapled prose',
    /הפעולה הבאה/.test(bubble) && /להתקשר למשאב שיקום השבוע/.test(bubble),
    `got: ${JSON.stringify(bubble.slice(0, 220))}`);
  // Second reversal, 25.8 (P0): the FACT is on the card too, because the card
  // and the drawer must be rendered from one object — a summary that disagrees
  // with its own evidence is the bug this replaced. What the assert still
  // guards is the original objection: interpretation and risk are not stapled
  // under every reply.
  ok('the finding is on the card, read from the same object',
    /31 הזמנות/.test(bubble), `got: ${JSON.stringify(bubble.slice(0, 220))}`);
  ok('interpretation is still not stapled underneath',
    !/לקוח שחוזר שווה/.test(bubble), `got: ${JSON.stringify(bubble.slice(0, 220))}`);
  await page.click('#thread .msg.lia .acts .det');       // פרטים
  await page.waitForTimeout(120);
  const deep = await page.textContent('#evBody');   // the drawer, not the reply
  ok('the recommendation is there when he asks for it', /להתקשר למשאב שיקום השבוע/.test(deep));
  ok('so is the opportunity', /לקוח שחוזר שווה/.test(deep));
  ok('and the sources behind it', /לקוחות|ORDERS|orders/.test(deep));
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
