// LONG MOBILE TURN MUST SURVIVE A CONNECTION DROP — the panel half (David, 10.9 #2).
//
// The phone showed "server unreachable" on a long cellular turn while the
// server may have finished after the socket died. The browser's HTTP request
// was the ownership boundary. Now the request names its turn (turn_id) and
// its conversation; the server owns it, persists the reply under a message id
// derived from the turn_id, and the panel — this socket, or chat_sync after a
// reconnect — shows exactly that one row, once. This drives the REAL lia.html
// in Chromium against an in-memory server that implements the same contract
// command-center ships (chat_sync ignore-duplicates + the durable kernel
// action: reply persisted before the response, 202 pending, replay).
//
//   A. a durable ask carries turn_id + conversation_id + device_id; the bubble
//      adopts the server's reply id; a re-sync never shows the answer twice
//   B. the connection drops mid-turn (both attempts) → the bubble waits, is
//      never "לא הצלחתי להגיע", the request is never re-sent; the server
//      finishes; chat_sync lands the reply in THAT bubble — once
//   C. a reload while waiting keeps the bubble waiting; the boot sync lands it
//   D. 202 pending (a re-send met a RUNNING turn) → wait, then land once
//   E. a read-only order on the execution road (intake READ_ONLY) is answered
//      through the kernel, never "לא הצלחתי לפתוח חבילת עבודה"
//
//   node test-durable-turn.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');

let bad = 0, total = 0;
const ok = (label, cond, extra) => {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; }
};
const replyIdFor = (turnId) => 'lia-' + createHash('sha256').update('reply:' + turnId).digest('hex').slice(0, 32);

// ── the speech stubs test-turn.mjs uses — no voices in headless ─────────────
const STUBS = () => {
  const put = (k, v) => Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
  class FakeSR { constructor() { this._on = false; } start() { this._on = true; } stop() { this._on = false; if (this.onend) this.onend(); } abort() { this._on = false; if (this.onend) this.onend(); } }
  put('SpeechRecognition', FakeSR);
  window.__tts = { spoke: [] };
  const pending = [];
  put('speechSynthesis', {
    getVoices: () => [{ name: 'Carmit', lang: 'he-IL' }],
    cancel() { const q = pending.splice(0); q.forEach((u) => u.onend && u.onend()); },
    speak(u) { window.__tts.spoke.push(u.text); pending.push(u);
      setTimeout(() => { const i = pending.indexOf(u); if (i < 0) return; pending.splice(i, 1); u.onend && u.onend(); }, 30); },
  });
  put('SpeechSynthesisUtterance', function (t) { this.text = t; });
};

// ── the canonical server, in memory — the contract command-center ships ─────
const SERVER = { conv: 'c0ffee1234abcdef' + 'c0ffee1234abcdef', rows: new Map(), tick: 0, kernel: 'ok', kernelCalls: [], intakeCalls: [] };
const stamp = () => new Date(1757000000000 + (++SERVER.tick) * 1000).toISOString();
function serverSync(body) {
  const inbound = Array.isArray(body.messages) ? body.messages.slice(0, 50) : [];
  for (const m of inbound) {
    if (!m || !m.message_id || SERVER.rows.has(m.message_id)) continue;   // idempotent — first write wins
    SERVER.rows.set(m.message_id, { ...m, conversation_id: SERVER.conv, server_at: stamp(), device_id: body.device_id || null });
  }
  const sw = !!body.conversation_id && body.conversation_id !== SERVER.conv;
  const after = sw ? '' : String(body.after || '');
  const all = [...SERVER.rows.values()].filter((m) => m.conversation_id === SERVER.conv).sort((a, b) => (a.server_at < b.server_at ? -1 : 1));
  const out = after ? all.filter((m) => m.server_at > after) : all;
  return { conversation_id: SERVER.conv, canon_switched: sw, messages: out, cursor: all.length ? all[all.length - 1].server_at : after };
}
/* what the durable kernel action does before it answers: the reply row */
function persistReply(turnId, content) {
  const id = replyIdFor(turnId);
  if (!SERVER.rows.has(id)) SERVER.rows.set(id, { message_id: id, role: 'lia', content, turn_id: turnId, created_at: new Date().toISOString(),
    conversation_id: SERVER.conv, server_at: stamp(), device_id: 'server' });
  return id;
}

const browser = await chromium.launch();
const errors = [];
async function device(tag, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 420, height: 800 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  await page.route('**/functions/v1/**', async (route) => {
    const url = route.request().url();
    const body = JSON.parse(route.request().postData() || '{}');
    if (['chat_sync', 'chat_new', 'chat_diag'].includes(body.action) && !url.includes('/command-center')) {
      await route.fulfill({ status: 400, contentType: 'text/plain', body: 'unknown action' }); return;
    }
    let json = { ok: true }, status = 200;
    if (body.action === 'state') json = { ok: true, items: [], objects: [], queue: [], model: true, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } };
    else if (body.action === 'chat_sync' || body.action === 'chat_new') json = serverSync(body);
    else if (body.action === 'chat_diag') json = { ok: true };
    else if (body.action === 'kernel') {
      SERVER.kernelCalls.push(body);
      if (SERVER.kernel === 'drop') { await route.abort('connectionreset'); return; }          // the cellular drop
      if (SERVER.kernel === 'pending') { status = 202; json = { pending: true, turn_id: body.turn_id, reply_message_id: replyIdFor(body.turn_id), started_at: new Date().toISOString() }; }
      else {
        const content = 'תשובה מלאה: מכרנו היום 42,180 ש"ח.';
        const id = persistReply(body.turn_id, content);                                       // persisted BEFORE the response
        json = { answer: content, reply_message_id: id, turn_id: body.turn_id, confidence: 'HIGH', capabilities_used: [], sources: [], meta: { route_taken: 'model_loop' } };
      }
    }
    else if (body.action === 'cap' && body.name === 'work_intake') {
      SERVER.intakeCalls.push(body);
      json = { capability: 'work_intake', row_count: 1, source: 'תור verify — לא נפתחה חבילה',
        rows: [{ action: 'READ_ONLY', read_only: true, read_only_kind: 'verify', reply_text: 'זה תור אימות — לא נפתחה חבילת עבודה.', contract: 'read_only' }] };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
  await page.addInitScript(STUBS);
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(700);        // initChatContinuity settles — CHAT.conv is now the canonical id
  return { page, ctx };
}
const view = (page) => page.evaluate(() => SESSION.turns.map((t) => ({ role: t.role, text: t.text, mid: t.mid || null, pending: !!t.pending, turn_id: t.turn_id || null })));
const wait = (page, ms) => page.waitForTimeout(ms);

// ── A: a durable ask, the happy path ────────────────────────────────────────
{
  const d = await device('A');
  ok('A0. the device adopted the canonical conversation before asking', (await d.page.evaluate(() => CHAT.conv)) === SERVER.conv);
  await d.page.evaluate(() => doAsk('מה המכירות היום?'));
  await wait(d.page, 900);
  const call = SERVER.kernelCalls[0];
  ok('A1. the kernel request names its turn (= request_id), its conversation and its device',
    !!call && call.turn_id === call.request_id && /:ask$/.test(call.turn_id) && call.conversation_id === SERVER.conv && !!call.device_id, JSON.stringify(call && { turn_id: call.turn_id, request_id: call.request_id, conversation_id: call.conversation_id, device_id: call.device_id }));
  const v = await view(d.page);
  const lia = v.filter((t) => t.role === 'lia');
  ok('A2. the bubble resolved with the answer', lia.length === 1 && !lia[0].pending && /תשובה מלאה/.test(lia[0].text), JSON.stringify(v));
  ok('A3. the bubble adopted the SERVER\'s reply id', lia[0] && lia[0].mid === replyIdFor(call.turn_id), JSON.stringify(lia[0]));
  const rowsBefore = SERVER.rows.size;
  await d.page.evaluate(() => chatSync()); await wait(d.page, 300);
  ok('A4. the client push of the same id was a no-op on the server (one row, the server copy)', SERVER.rows.size === rowsBefore && SERVER.rows.get(replyIdFor(call.turn_id)).device_id === 'server');
  ok('A5. a re-sync shows the answer once', (await view(d.page)).filter((t) => t.role === 'lia' && /תשובה מלאה/.test(t.text)).length === 1);
  await d.ctx.close();
}

// ── B: the connection drops mid-turn; the server finishes; chat_sync lands it
{
  SERVER.kernel = 'drop'; SERVER.kernelCalls = [];
  const d = await device('B');
  await d.page.evaluate(() => doAsk('שאלה ארוכה בסלולר על המכירות של השבוע'));
  await wait(d.page, 1800);   // attempt · 600ms · attempt → "server unreachable"
  let v = await view(d.page);
  const pend = v.filter((t) => t.pending);
  ok('B1. the bubble is still WAITING after both attempts died — not "לא הצלחתי להגיע"',
    pend.length === 1 && /החיבור נפל/.test(pend[0].text) && !v.some((t) => /לא הצלחתי להגיע/.test(t.text)), JSON.stringify(v));
  const turnId = SERVER.kernelCalls[0] && SERVER.kernelCalls[0].turn_id;
  ok('B2. the request went out exactly twice (post\'s own retry) and never again', SERVER.kernelCalls.length === 2 && SERVER.kernelCalls.every((c) => c.turn_id === turnId), `${SERVER.kernelCalls.length} calls`);
  ok('B3. the waiting bubble knows its turn and its derived reply id', pend[0] && pend[0].turn_id === turnId && (await d.page.evaluate(() => SESSION.turns.find((t) => t.pending).reply_mid)) === replyIdFor(turnId));
  // C. the server finishes on its own → D. reconnect → E. chat_sync restores the answer
  persistReply(turnId, 'התשובה הארוכה הגיעה מהשרת: 7 תעודות משלוח, 42,180 ש"ח.');
  await d.page.evaluate(() => chatSync()); await wait(d.page, 400);
  v = await view(d.page);
  const landed = v.filter((t) => t.role === 'lia' && /התשובה הארוכה הגיעה/.test(t.text));
  ok('B4. the reply landed in THAT bubble', landed.length === 1 && !landed[0].pending && landed[0].turn_id === turnId, JSON.stringify(v));
  ok('B5. exactly one answer — no second bubble', landed.length === 1 && v.filter((t) => t.pending).length === 0);
  ok('B6. the bubble carries the server\'s message id — the same anchor on both paths', landed[0] && landed[0].mid === replyIdFor(turnId));
  ok('B7. nothing was pushed back for it (fromServer) and the request was not re-sent', SERVER.kernelCalls.length === 2 && !(await d.page.evaluate(() => CHAT.outbox.some((m) => m.role === 'lia' && /התשובה הארוכה/.test(m.content)))));
  ok('B8. the turn machine was released (no in-flight ask left)', (await d.page.evaluate(() => INFLIGHT)) === 0);
  await d.page.evaluate(() => chatSync()); await wait(d.page, 300);
  ok('B9. a further sync shows it once', (await view(d.page)).filter((t) => /התשובה הארוכה הגיעה/.test(t.text)).length === 1);
  ok('B10. no "ask again" text anywhere', !(await view(d.page)).some((t) => /שאל אותי שוב|שאל שוב/.test(t.text)));
  await d.ctx.close();
}

// ── C: a reload while waiting keeps the bubble waiting; the boot sync lands it
{
  SERVER.kernel = 'drop'; SERVER.kernelCalls = [];
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, locale: 'he-IL' });
  const d = await device('C', ctx);
  await d.page.evaluate(() => doAsk('עוד שאלה ארוכה שהחיבור שלה נופל'));
  await wait(d.page, 1800);
  const turnId = SERVER.kernelCalls[0] && SERVER.kernelCalls[0].turn_id;
  ok('C1. waiting before the reload', (await view(d.page)).some((t) => t.pending && t.turn_id === turnId));
  persistReply(turnId, 'הגיע אחרי הרענון: התשובה נשמרה בשרת.');   // the server finished while the page was away
  await d.page.close();
  const d2 = await device('C2', ctx);                                  // same browser profile → same localStorage
  await wait(d2.page, 600);
  const v = await view(d2.page);
  ok('C2. the reloaded page did NOT close the bubble as "נשארה בלי תשובה"', !v.some((t) => /נשארה בלי תשובה/.test(t.text)), JSON.stringify(v));
  const landed = v.filter((t) => t.role === 'lia' && /הגיע אחרי הרענון/.test(t.text));
  ok('C3. the boot sync landed the reply in the waiting bubble — once', landed.length === 1 && !landed[0].pending && landed[0].turn_id === turnId && landed[0].mid === replyIdFor(turnId), JSON.stringify(v));
  ok('C4. no bubble is left waiting', !v.some((t) => t.pending));
  await ctx.close();
}

// ── D: 202 pending — a re-send met the RUNNING turn ─────────────────────────
{
  SERVER.kernel = 'pending'; SERVER.kernelCalls = [];
  const d = await device('D');
  await d.page.evaluate(() => doAsk('שאלה שהשרת עדיין מריץ'));
  await wait(d.page, 700);
  let v = await view(d.page);
  const turnId = SERVER.kernelCalls[0] && SERVER.kernelCalls[0].turn_id;
  ok('D1. on 202 the bubble waits ("השרת עדיין עובד") — no error, no re-send', v.some((t) => t.pending && /השרת עדיין עובד/.test(t.text)) && SERVER.kernelCalls.length === 1, JSON.stringify(v));
  persistReply(turnId, 'הרצה שהסתיימה בשרת: הנה התשובה.');
  await d.page.evaluate(() => chatSync()); await wait(d.page, 400);
  v = await view(d.page);
  ok('D2. the reply landed once, in the waiting bubble', v.filter((t) => /הרצה שהסתיימה/.test(t.text)).length === 1 && !v.some((t) => t.pending), JSON.stringify(v));
  await d.ctx.close();
}

// ── E: READ-ONLY on the execution road is answered as a read ────────────────
{
  SERVER.kernel = 'ok'; SERVER.kernelCalls = []; SERVER.intakeCalls = [];
  const d = await device('E');
  await d.page.evaluate(() => doExecute('ליה, בצעי רק את NEXT_ACTION הקנוני: 1. אמתי שהטלפון של דוד מדווח build 2026-09-10.3'));
  await wait(d.page, 1200);
  const v = await view(d.page);
  ok('E1. intake was asked first (the execution road) and refused READ_ONLY', SERVER.intakeCalls.length === 1);
  ok('E2. the order then went to the kernel as a read — one kernel call with the text', SERVER.kernelCalls.length === 1 && /אמתי/.test(SERVER.kernelCalls[0].body), JSON.stringify(SERVER.kernelCalls.map((c) => c.body)));
  ok('E3. never "לא הצלחתי לפתוח חבילת עבודה", never "התחלתי · חבילה"', !v.some((t) => /לא הצלחתי לפתוח חבילת עבודה|התחלתי · חבילה/.test(t.text)), JSON.stringify(v));
  ok('E4. the read was answered', v.some((t) => t.role === 'lia' && /תשובה מלאה/.test(t.text)));
  await d.ctx.close();
}

// ── the wiring, pinned in the source ────────────────────────────────────────
ok('SRC: the ask sends turn_id + conversation_id + device_id', /turn_id:reqId,conversation_id:CHAT\.conv,device_id:DEVICE_ID/.test(SRC));
ok('SRC: a 202 pending waits instead of asking again', /res\.pending===true&&res\.turn_id/.test(SRC));
ok('SRC: the bubble adopts the server\'s reply id', /ph\.mid=res\.reply_message_id;ph\.turn_id=reqId;/.test(SRC));
ok('SRC: a dropped socket / gateway 5xx on a durable turn waits through chat_sync', /\/unreachable\/\.test\(msg\)\|\|st>=500/.test(SRC));
ok('SRC: the server reply lands in the awaiting bubble inside applyServerMessages', /const w=awaitingTurnFor\(m\);if\(w\)landServerReply\(w,m\);/.test(SRC));
ok('SRC: the derived reply id is computed the same way (sha256 "reply:"+turn_id, 32 hex)', /'reply:'\+turnId/.test(SRC) && /slice\(0,32\)/.test(SRC));
ok('SRC: a reload keeps a durable bubble waiting and re-arms its wait', /if\(t\.turn_id\)\{delete t\.__wd;delete t\.__await;continue;\}/.test(SRC) && /if\(t&&t\.pending&&t\.turn_id\)turnAwait\(/.test(SRC));
ok('SRC: the wait is bounded (10 minutes) and polls chat_sync', /TURN_AWAIT_MAX_MS=10\*60\*1000/.test(SRC) && /TURN_AWAIT_POLL_MS=5000/.test(SRC));
ok('SRC: intake READ_ONLY falls back to the kernel ask', /if\(w&&w\.action==='READ_ONLY'\)\{[\s\S]{0,400}return doAsk\(text,id\);\}/.test(SRC));
ok('SRC: build 2026-09-11.1', /const LIA_BUILD='2026-09-11\.1';/.test(SRC));
ok('no page errors', errors.length === 0, errors.join('\n'));

await browser.close();
console.log(bad ? `FAIL ${bad}/${total}` : `PASS ${total}/${total} — the server owns the turn; the panel shows it once, on this socket or the next sync`);
process.exit(bad ? 1 : 0);
