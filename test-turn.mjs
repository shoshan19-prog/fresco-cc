// The conversation loop, driven in a REAL browser.
//
// David's report: the microphone reopened on its own after LIA answered, a
// request he never sent appeared, and "תסבירי פשוט" re-ran the conversation.
// None of that is visible to a source-string test — the mic reopened from a
// TTS callback, so the only honest test is one that owns the clock, the
// recognizer and the speaker and then counts what actually happened.
//
//   node test-turn.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');

let bad = 0, total = 0;
const ok = (label, cond, extra) => {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; }
};

const browser = await chromium.launch();
const errors = [];

// The recognizer and the speaker, faked exactly as the browser behaves — down
// to speechSynthesis.cancel() firing onend on the utterance it replaced, which
// is how one answer used to open two listening windows.
const STUBS = () => {
  window.__rec = { made: 0, started: 0, live: null, all: [] };
  class FakeSR {
    constructor() { window.__rec.made++; this.lang = ''; this.continuous = false;
      this.interimResults = false; this.maxAlternatives = 1; this._on = false;
      window.__rec.all.push(this); }
    start() { if (this._on) throw new Error('already started');
      this._on = true; window.__rec.started++; window.__rec.live = this; }
    stop() { if (!this._on) return; this._on = false;
      if (window.__rec.live === this) window.__rec.live = null;
      if (this.onend) this.onend(); }
    abort() { if (!this._on) return; this._on = false;
      if (window.__rec.live === this) window.__rec.live = null;
      if (this.onerror) this.onerror({ error: 'aborted' });
      if (this.onend) this.onend(); }
  }
  // Assignment silently fails on Window's accessor properties, and then the
  // test drives the REAL engine (no voices in headless, so onend never fires).
  const put = (k, v) => Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
  put('SpeechRecognition', FakeSR);
  window.__tts = { spoke: [], speaking: false };
  const pending = [];
  put('speechSynthesis', {
    getVoices: () => [{ name: 'Carmit', lang: 'he-IL' }],
    cancel() { const q = pending.splice(0); q.forEach(u => u.onend && u.onend()); },
    speak(u) {
      window.__tts.spoke.push(u.text); window.__tts.speaking = true; pending.push(u);
      setTimeout(() => {
        const i = pending.indexOf(u); if (i < 0) return;   // already cancelled
        pending.splice(i, 1); window.__tts.speaking = pending.length > 0;
        u.onend && u.onend();
      }, 30);
    },
  });
  put('SpeechSynthesisUtterance', function (t) { this.text = t; });
};

let hold = false;                       // when true, the kernel route never answers
async function session(tag) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });

  const calls = [];
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    if (body.action === 'kernel' && hold) return;          // left hanging: the turn stays in PROCESSING
    let json = {};
    if (body.action === 'state') json = { ok: true, items: [], objects: [], model: true };
    else if (body.action === 'kernel') json = {
      answer: 'מכרנו היום 42,180 ש"ח בשבע תעודות משלוח.',
      facts: ['7 תעודות משלוח'], inferences: ['הקצב דומה לשבוע שעבר'], sources: ['priority'],
      risks_opportunities: [], missing_information: [], recommended_next_action: 'לבדוק את מרינה',
      confidence: 'HIGH', capabilities_used: ['priority_sales'],
    };
    else json = { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
  await page.addInitScript(STUBS);
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  return { page, calls, ctx };
}

const state = (page) => page.evaluate(() => window.turnState());
const kernelCalls = (calls) => calls.filter(c => c.action === 'kernel');
// Drive the real recognizer the panel built, the way the browser drives it.
async function speakInto(page, text, { finals = 1 } = {}) {
  await page.click('#mic');
  await page.evaluate(({ text, finals }) => {
    const r = window.__rec.live; if (!r) throw new Error('no live recognizer');
    const results = [];
    for (let i = 0; i < finals; i++) results.push({ 0: { transcript: text, confidence: 0.9 }, isFinal: true });
    results.length = finals;
    r.onresult({ results: Object.assign(results, { length: finals }) });
  }, { text, finals });
}

// ── 1, 3, 11, 12 — one utterance, one request, and the mic stays shut ───────
{
  const { page, calls } = await session('voice');
  await speakInto(page, 'כמה מכרנו היום?');
  ok('12. the mic opened only because the tap opened it', await page.evaluate(() => window.__rec.started) === 1);
  const before = await page.evaluate(() => window.__rec.started);
  await page.evaluate(() => window.__rec.live && window.__rec.live.stop());   // David stops speaking
  await page.waitForFunction(() => document.querySelectorAll('#thread .msg.lia').length > 0, null, { timeout: 8000 });
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 }).catch(() => {});

  ok('3. one speech-final event → exactly one model request', kernelCalls(calls).length === 1,
     `got ${kernelCalls(calls).length}`);
  ok('1. after the answer the microphone is OFF', await page.evaluate(() => window.__rec.started) === before,
     `starts before=${before} after=${await page.evaluate(() => window.__rec.started)}`);
  ok('1b. no recognizer is live', await page.evaluate(() => window.__rec.live) === null);
  ok('11. the machine is back to IDLE, not LISTENING', await state(page) === 'IDLE', `got ${await state(page)}`);
  ok('   the question David spoke is in the thread', await page.evaluate(
     () => [...document.querySelectorAll('#thread .msg.me .bubble')].some(b => /כמה מכרנו/.test(b.textContent))));
}

// ── 2, 10 — she cannot hear herself ────────────────────────────────────────
{
  const { page, calls } = await session('tts');
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  // Catch her mid-sentence: TTS is on the speaker, nothing may be listening.
  await page.waitForFunction(() => window.__tts.spoke.length > 0, null, { timeout: 8000 });
  const during = await page.evaluate(() => ({
    live: window.__rec.live, started: window.__rec.started, st: window.turnState() }));
  ok('2. nothing is listening while LIA speaks', during.live === null && during.started === 0,
     JSON.stringify(during));
  await page.click('#mic');                                  // David taps mid-sentence
  ok('10. a tap during SPEAKING does not open the mic', await page.evaluate(() => window.__rec.started) === 0);
  ok('10b. and it says so', /עוד מדברת|עוד בודקת/.test(await page.textContent('#noteStat') || ''));
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 });
  ok('2b. her own voice never became a request', kernelCalls(calls).length === 1,
     `got ${kernelCalls(calls).length}: ${JSON.stringify(kernelCalls(calls).map(c => c.body))}`);
}

// ── 4 — a duplicate final event ────────────────────────────────────────────
{
  const { page, calls } = await session('dupfinal');
  await speakInto(page, 'כמה מכרנו היום?');
  await page.evaluate(() => {
    const r = window.__rec.live;
    r.onend();                       // the service finalises…
    if (r.onend) r.onend();          // …and reports it again
  });
  await page.waitForFunction(() => document.querySelectorAll('#thread .msg.lia').length > 0, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  ok('4. duplicate final events → still one request', kernelCalls(calls).length === 1,
     `got ${kernelCalls(calls).length}`);
  ok('4b. and one question bubble', await page.$$eval('#thread .msg.me', n => n.length) === 1);
}

// ── 5 — double click on שלח ────────────────────────────────────────────────
{
  const { page, calls } = await session('doubleclick');
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.evaluate(() => { sendPrimary(); sendPrimary(); sendPrimary(); });
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 });
  ok('5. three clicks → one request', kernelCalls(calls).length === 1, `got ${kernelCalls(calls).length}`);
  ok('5b. → one question bubble', await page.$$eval('#thread .msg.me', n => n.length) === 1);
  const ids = kernelCalls(calls).map(c => c.request_id);
  ok('5c. the request carries an id', !!ids[0] && /:(ask|act)$/.test(ids[0]), JSON.stringify(ids));
}

// ── 9 — while she is thinking, the mic is shut ─────────────────────────────
{
  hold = true;
  const { page, calls } = await session('processing');
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForFunction(() => window.turnState() === 'PROCESSING', null, { timeout: 8000 });
  await page.click('#mic');
  ok('9. a tap during PROCESSING does not open the mic', await page.evaluate(() => window.__rec.started) === 0);
  ok('9b. still exactly one request in flight', kernelCalls(calls).length === 1);
  await page.evaluate(() => { sendPrimary(); });              // and no second question can be sent
  ok('9c. no second request while PROCESSING', kernelCalls(calls).length === 1);
  hold = false;
}

// ── 6, 7, 8 — "תסבירי פשוט" and "פרטים" work on the last answer only ───────
{
  const { page, calls } = await session('explain');
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 });
  const afterAnswer = calls.length;

  await page.click('#thread .acts button:nth-child(2)');     // תסבירי פשוט
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 });
  const bubbles1 = await page.$$eval('#thread .msg.lia .bubble', n => n.map(x => x.textContent));
  ok('6. one simplified version appears', bubbles1.filter(b => /^במילים פשוטות/.test(b)).length === 1,
     JSON.stringify(bubbles1));
  ok('6b. the original answer is still above it', bubbles1.some(b => /42,180/.test(b)));
  ok('7. simplifying queried nothing', calls.length === afterAnswer,
     `${calls.length - afterAnswer} extra calls: ${JSON.stringify(calls.slice(afterAnswer))}`);

  const spokeBefore = await page.evaluate(() => window.__tts.spoke.length);
  await page.click('#thread .acts button:nth-child(2)');     // again, on the same answer
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 });
  const bubbles2 = await page.$$eval('#thread .msg.lia .bubble', n => n.map(x => x.textContent));
  ok('7b. pressing it again adds no second copy',
     bubbles2.filter(b => /^במילים פשוטות/.test(b)).length === 1, JSON.stringify(bubbles2));
  ok('7c. it still said it out loud', await page.evaluate(() => window.__tts.spoke.length) > spokeBefore);
  ok('7d. and still queried nothing', calls.length === afterAnswer);
  ok('7e. no new user turn was invented', await page.$$eval('#thread .msg.me', n => n.length) === 1);

  await page.click('#thread .acts button:nth-child(1)');     // פרטים
  ok('8. פרטים opens the detail of that answer',
     await page.evaluate(() => getComputedStyle(document.getElementById('deep_1')).display) !== 'none');
  ok('8b. פרטים queried nothing', calls.length === afterAnswer);
  ok('8c. פרטים started no turn', await state(page) === 'IDLE');
  ok('8d. and no extra bubble', await page.$$eval('#thread .msg.lia', n => n.length) === bubbles2.length);
}

// ── 13, 14 — David moving on mid-sentence is not a dropped click ───────────
{
  const { page, calls } = await session('interrupt');
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForFunction(() => window.turnState() === 'SPEAKING', null, { timeout: 8000 });
  await page.fill('#note', 'ומה עם מרינה?');
  await page.click('#sendBtn');                       // he types over her while she talks
  await page.waitForFunction(() => document.querySelectorAll('#thread .msg.me').length === 2,
    null, { timeout: 8000 });
  ok('13. a typed question during SPEAKING is taken, not swallowed',
     kernelCalls(calls).length === 2, `got ${kernelCalls(calls).length}`);
  ok('13b. the two requests have different ids',
     kernelCalls(calls)[0].request_id !== kernelCalls(calls)[1].request_id);
  // The interrupted utterance's onend is still coming. It must not end the turn
  // that replaced it — that would unlock the microphone mid-request.
  await page.waitForTimeout(500);
  ok('14. the stale callback did not open the microphone',
     await page.evaluate(() => window.__rec.started) === 0);
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 8000 });
  ok('14b. and the new turn still ends properly', await state(page) === 'IDLE');
  ok('14c. no third request appeared', kernelCalls(calls).length === 2);
}

// ── 15 — a speech engine that swallows the sentence must not freeze her ─────
{
  const { page, calls } = await session('deafengine');
  await page.evaluate(() => { window.speechSynthesis.speak = (u) => { window.__tts.spoke.push(u.text); }; });
  await page.fill('#note', 'כמה מכרנו היום?');
  await page.click('#sendBtn');
  await page.waitForFunction(() => window.turnState() === 'SPEAKING', null, { timeout: 8000 });
  ok('15. she is stuck in SPEAKING while the engine stays silent', await state(page) === 'SPEAKING');
  await page.waitForFunction(() => window.turnState() === 'IDLE', null, { timeout: 20000 });
  ok('15b. the watchdog returns her to IDLE anyway', await state(page) === 'IDLE');
  await page.click('#mic');
  ok('15c. and the microphone works again', await page.evaluate(() => window.__rec.started) === 1);
  ok('15d. without inventing a request', kernelCalls(calls).length === 1);
}

// ── the source itself: the edge that caused this cannot come back ───────────
{
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('S1. no listenFollowUp remains', !/listenFollowUp\s*\(/.test(body));
  ok('S2. no listening window remains', !/function\s+listenOnce/.test(body));
  ok('S3. no speak() callback re-opens the microphone',
     !/speak\([^)]*listen/i.test(body));
  ok('S4. the microphone is opened in exactly one place',
     (body.match(/startSR\(\)/g) || []).length === 2, // the declaration and the one call in micTap
     `got ${(body.match(/startSR\(\)/g) || []).length}`);
  ok('S5. micTap is gated', /function micTap\(\)\{[\s\S]{0,400}?micAllowed\(\)/.test(body));
  ok('S6. speak() kills the recognizer first',
     /function speak\(text,done\)\{[\s\S]{0,300}?killRecognizer/.test(body));
  ok('S7. every kernel call carries a request id',
     (body.match(/action:'kernel'/g) || []).length === (body.match(/request_id:reqId/g) || []).length,
     `${(body.match(/action:'kernel'/g) || []).length} kernel calls vs ${(body.match(/request_id:reqId/g) || []).length} ids`);
}

await browser.close();
for (const e of errors) { console.log(`FAIL  page error: ${e}`); bad++; total++; }
console.log(bad ? `\n${bad}/${total} FAILED` : `${total} checks passed`);
process.exit(bad ? 1 : 0);
