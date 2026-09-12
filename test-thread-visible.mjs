// THE THREAD IS THE PAGE (David, 11.9 18:04 — "לא רואה את הצאט").
//
// Measured on his phone (device 6a659178, build 2026-09-11.2): three faults,
// each with a law here.
//   A. LAYOUT — the eight ORGANIZATION rows filled the viewport and #thread
//      (flex:1; min-height:0) collapsed to a sliver under the composer. The
//      list now scrolls inside a bounded box, the head collapses it (remembered),
//      and the thread keeps at least 42vh — the newest bubble is on screen.
//   B. ✎ — chat_new moved the canonical pointer three times in one day; every
//      device then showed an empty thread. It is now a deliberate act: a
//      confirmation; dismissing it sends nothing.
//   C. WAITING — the bubble judged its 10-minute deadline BEFORE pulling once
//      more; the pulse answer had been on the server for 31 minutes and the
//      phone said "השרת לא החזיר תשובה". Sync first, judge after.
//   D. REOPEN — ⋯ → שיחות קודמות lists the SERVER's conversations; one tap
//      (chat_open) brings a conversation back on every device — nothing lost.
//
//   node test-thread-visible.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
let bad = 0, total = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };
const replyIdFor = (turnId) => 'lia-' + createHash('sha256').update('reply:' + turnId).digest('hex').slice(0, 32);

const STUBS = () => {
  const put = (k, v) => Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
  class FakeSR { start() {} stop() { if (this.onend) this.onend(); } abort() { if (this.onend) this.onend(); } }
  put('SpeechRecognition', FakeSR);
  const pending = [];
  put('speechSynthesis', { getVoices: () => [{ name: 'Carmit', lang: 'he-IL' }], cancel() { pending.splice(0).forEach((u) => u.onend && u.onend()); },
    speak(u) { pending.push(u); setTimeout(() => { const i = pending.indexOf(u); if (i < 0) return; pending.splice(i, 1); u.onend && u.onend(); }, 30); } });
  put('SpeechSynthesisUtterance', function (t) { this.text = t; });
};

// ── the server, in memory: several conversations, one canonical pointer ─────
const OLD = '38af366f37814f73b66b9e907117b288', CUR = 'e741587c0c0046739e8d2df5f27c90bb';
const SERVER = { conv: CUR, rows: new Map(), tick: 0, newCalls: 0, openCalls: [], listCalls: 0 };
const stamp = () => new Date(1757600000000 + (++SERVER.tick) * 1000).toISOString();
const seed = (conv, role, content) => { const id = 'seed-' + (++SERVER.tick) + '-' + conv.slice(0, 4); SERVER.rows.set(id, { message_id: id, conversation_id: conv, role, content, created_at: stamp(), server_at: stamp(), device_id: 'seed', user_id: 'david' }); };
seed(OLD, 'me', 'לי חשוב שבעצם כל הזמנות הפתוחות'); seed(OLD, 'lia', 'נכון — זה צריך להיות המדד המרכזי'); seed(OLD, 'me', 'ליה, אני רוצה שתמונת המצב הקבועה'); seed(OLD, 'lia', 'הדוח הטכני המלא הועבר');
seed(CUR, 'me', 'פולס פרסקו'); seed(CUR, 'lia', 'פרסקו · מצב נכון ל-11 בספטמבר 2026');
const allOf = (conv) => [...SERVER.rows.values()].filter((m) => m.conversation_id === conv).sort((a, b) => (a.server_at < b.server_at ? -1 : 1));
function serverSync(body) {
  for (const m of (Array.isArray(body.messages) ? body.messages : [])) {
    if (!m || !m.message_id || SERVER.rows.has(m.message_id)) continue;
    SERVER.rows.set(m.message_id, { ...m, conversation_id: SERVER.conv, server_at: stamp(), device_id: body.device_id || null, user_id: 'david' });
  }
  const sw = !!body.conversation_id && body.conversation_id !== SERVER.conv;
  const after = sw ? '' : String(body.after || '');
  const all = allOf(SERVER.conv);
  const out = after ? all.filter((m) => m.server_at > after) : all;
  return { conversation_id: SERVER.conv, canon_switched: sw, messages: out, cursor: all.length ? all[all.length - 1].server_at : after };
}
function serverList() {
  const by = new Map();
  for (const m of [...SERVER.rows.values()].sort((a, b) => (a.server_at < b.server_at ? 1 : -1))) {
    const c = by.get(m.conversation_id) || { conversation_id: m.conversation_id, count: 0, first_at: m.server_at, last_at: m.server_at, title: '', last_head: '', canonical: m.conversation_id === SERVER.conv };
    c.count++; if (m.server_at < c.first_at) c.first_at = m.server_at; if (m.role === 'me') c.title = m.content.slice(0, 60); by.set(m.conversation_id, c);
  }
  return { canonical_id: SERVER.conv, conversations: [...by.values()].sort((a, b) => (a.last_at < b.last_at ? 1 : -1)) };
}
const DEPTS = ['sales', 'marketing', 'branding', 'advertising', 'purchasing', 'operations', 'rnd', 'capital'].map((k, i) => ({ key: k, name: k, state: i % 2 ? 'ok' : 'warn', metrics: [{ value: i + 1, label: 'מדד' }], commands: [] }));
function persistReply(turnId, content) {
  const id = replyIdFor(turnId);
  if (!SERVER.rows.has(id)) SERVER.rows.set(id, { message_id: id, role: 'lia', content, turn_id: turnId, created_at: new Date().toISOString(), conversation_id: SERVER.conv, server_at: stamp(), device_id: 'server', user_id: 'david' });
  return id;
}

const browser = await chromium.launch();
const errors = [];
async function device(tag, ctx, viewport) {
  ctx = ctx || await browser.newContext({ viewport: viewport || { width: 412, height: 915 }, locale: 'he-IL', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    let json = { ok: true }, status = 200;
    if (body.action === 'state') json = { ok: true, items: [], objects: [], queue: [], model: true, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } };
    else if (body.action === 'tower') json = { departments: DEPTS };
    else if (body.action === 'chat_sync') json = serverSync(body);
    else if (body.action === 'chat_new') { SERVER.newCalls++; SERVER.conv = 'new' + String(SERVER.newCalls).padStart(29, '0'); json = { conversation_id: SERVER.conv, messages: [], cursor: '', canon_switched: true }; }
    else if (body.action === 'chat_list') { SERVER.listCalls++; json = serverList(); }
    else if (body.action === 'chat_open') {
      SERVER.openCalls.push(body.conversation_id);
      const rows = allOf(body.conversation_id);
      if (!rows.length) { status = 404; json = { error: 'no such conversation for this user' }; }
      else { const sw = body.conversation_id !== SERVER.conv; SERVER.conv = body.conversation_id; json = { conversation_id: SERVER.conv, canon_switched: sw, messages: rows, cursor: rows[rows.length - 1].server_at }; }
    }
    else if (body.action === 'chat_diag') json = { ok: true };
    else if (body.action === 'kernel') { const id = persistReply(body.turn_id, 'תשובה: 42,180 ש"ח.'); json = { answer: 'תשובה: 42,180 ש"ח.', reply_message_id: id, turn_id: body.turn_id, confidence: 'HIGH', sources: [], meta: { route_taken: 'model_loop' } }; }
    else if (body.action === 'cap') json = { rows: [], source: '' };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
  await page.addInitScript(STUBS);
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(900);
  return { page, ctx };
}
const box = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, display: getComputedStyle(el).display }; }, sel);
const view = (page) => page.evaluate(() => SESSION.turns.map((t) => ({ role: t.role, text: t.text, pending: !!t.pending })));

// ── A. layout: eight rows and the chat still has the page ───────────────────
{
  const d = await device('A');
  const rows = await d.page.evaluate(() => document.querySelectorAll('#orgListMobile .orgItem').length);
  ok('A0. the phone renders ORGANIZATION directly — eight rows', rows === 8, `rows=${rows}`);
  const org = await box(d.page, '#orgListMobile'), thread = await box(d.page, '#thread');
  ok('A1. the ORGANIZATION list is bounded (≤ 30vh + a little) and scrolls inside', org && org.height <= 915 * 0.31 && (await d.page.evaluate(() => { const el = document.getElementById('orgListMobile'); return el.scrollHeight > el.clientHeight; })), JSON.stringify(org));
  ok('A2. the thread keeps at least 42% of the viewport', thread && thread.height >= Math.floor(915 * 0.42), JSON.stringify(thread));
  // the canonical thread (2 messages) was adopted on boot — the newest bubble is on screen
  const last = await d.page.evaluate(() => { const els = document.querySelectorAll('#thread .msg'); const el = els[els.length - 1]; if (!el) return null; const r = el.getBoundingClientRect(); const t = document.getElementById('thread').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, tTop: t.top, tBottom: t.bottom, n: els.length }; });
  ok('A3. the newest message is visible inside the thread box', last && last.n === 2 && last.bottom <= last.tBottom + 2 && last.top >= last.tTop - 2, JSON.stringify(last));
  // collapse from the head, remembered across a reload
  await d.page.click('#orgMobile .orgMobileHead');
  ok('A4. the head collapses the list', (await d.page.evaluate(() => document.getElementById('orgMobile').getAttribute('data-collapsed'))) === 'true' && (await box(d.page, '#orgListMobile')).display === 'none');
  const thread2 = await box(d.page, '#thread');
  ok('A5. a collapsed card gives the thread even more', thread2.height > thread.height, `${thread.height} → ${thread2.height}`);
  await d.page.reload(); await d.page.waitForSelector('#app', { state: 'visible' });
  await d.page.waitForFunction(() => document.querySelectorAll('#orgListMobile .orgItem').length === 8, null, { timeout: 5000 });
  await d.page.waitForTimeout(300);
  const after = await d.page.evaluate(() => ({ ls: localStorage.getItem('rail:orgMobile'), dc: document.getElementById('orgMobile').getAttribute('data-collapsed') }));
  ok('A6. the choice is remembered after a reload', after.dc === 'true', JSON.stringify(after));
  await d.page.click('#orgMobile .orgMobileHead'); await d.page.waitForTimeout(150);
  ok('A7. and expands again on tap', (await d.page.evaluate(() => document.getElementById('orgMobile').getAttribute('data-collapsed'))) === 'false');
  await d.ctx.close();
}

// ── B. ✎ is deliberate ──────────────────────────────────────────────────────
{
  const d = await device('B');
  const before = await d.page.evaluate(() => CHAT.conv);
  let msg = '';
  d.page.once('dialog', (dl) => { msg = dl.message(); dl.dismiss(); });
  await d.page.click('button[title="שיחה חדשה"]'); await d.page.waitForTimeout(400);
  ok('B1. ✎ asks first, and names the way back', /שיחה חדשה/.test(msg) && /שיחות קודמות/.test(msg), msg);
  ok('B2. dismissed → nothing sent, the conversation stays', SERVER.newCalls === 0 && (await d.page.evaluate(() => CHAT.conv)) === before);
  d.page.once('dialog', (dl) => dl.accept());
  await d.page.click('button[title="שיחה חדשה"]'); await d.page.waitForTimeout(500);
  ok('B3. confirmed → exactly one chat_new, the device follows the new pointer', SERVER.newCalls === 1 && (await d.page.evaluate(() => CHAT.conv)) === SERVER.conv);
  SERVER.conv = CUR;   // restore for the next scenarios
  await d.ctx.close();
}

// ── C. the waiting bubble syncs BEFORE judging its deadline ─────────────────
{
  const d = await device('C');
  const turnId = 'c0ffee00-1111-4222-8333-444455556666:ask';
  persistReply(turnId, 'התשובה שחיכתה בשרת 31 דקות.');
  await d.page.evaluate((tid) => {
    const ph = { role: 'lia', text: '⏳', pending: true, at: Date.now(), res: null, turn_id: tid, awaiting_since: Date.now() - 31 * 60 * 1000 };
    SESSION.turns.push(ph); INFLIGHT = 1; saveSession(); renderThread();
    turnAwait(ph, tid, '', 'ממשיכה להמתין');
  }, turnId);
  await d.page.waitForTimeout(6500);   // one poll interval + the sync
  let v = await view(d.page);
  ok('C1. past the deadline, the pull ran first and the server\'s answer landed', v.some((t) => t.role === 'lia' && /התשובה שחיכתה/.test(t.text) && !t.pending), JSON.stringify(v));
  ok('C2. no "השרת לא החזיר תשובה" for a turn the server DID answer', !v.some((t) => /לא החזיר תשובה/.test(t.text)));
  ok('C3. the turn machine was released', (await d.page.evaluate(() => INFLIGHT)) === 0);
  // a turn the server never answered still times out honestly — after the pull
  const turn2 = 'dead0000-1111-4222-8333-444455556666:ask';
  await d.page.evaluate((tid) => {
    const ph = { role: 'lia', text: '⏳', pending: true, at: Date.now(), res: null, turn_id: tid, awaiting_since: Date.now() - 31 * 60 * 1000 };
    SESSION.turns.push(ph); INFLIGHT = 1; saveSession(); renderThread();
    turnAwait(ph, tid, '', 'ממשיכה להמתין');
  }, turn2);
  await d.page.waitForTimeout(6500);
  v = await view(d.page);
  ok('C4. a turn with no reply on the server times out after the pull, honestly', v.some((t) => /לא החזיר תשובה לתור הזה תוך 10 דקות/.test(t.text)) && !v.some((t) => t.pending), JSON.stringify(v));
  await d.ctx.close();
}

// ── D. ⋯ → שיחות קודמות: the server's list, one-tap reopen ──────────────────
{
  SERVER.conv = CUR;
  const d = await device('D');
  await d.page.evaluate(() => openPanel()); await d.page.waitForTimeout(600);
  const items = await d.page.evaluate(() => [...document.querySelectorAll('#sessions .obj')].map((o) => o.textContent.replace(/\s+/g, ' ').trim()));
  ok('D1. the panel lists the SERVER\'s conversations with counts', SERVER.listCalls >= 1 && items.length === 2 && items.some((t) => /לי חשוב שבעצם/.test(t) && /4 הודעות/.test(t)) && items.some(/פולס פרסקו/.test.bind(/פולס פרסקו/)), JSON.stringify(items));
  ok('D2. the open one is marked and not a button to press', items.some((t) => /פתוחה עכשיו/.test(t)) && (await d.page.evaluate(() => !!document.querySelector('#sessions button[disabled]'))));
  await d.page.click('#sessions button[data-conv="' + OLD + '"]'); await d.page.waitForTimeout(600);
  const v = await view(d.page);
  ok('D3. chat_open was asked for the old conversation, once', SERVER.openCalls.length === 1 && SERVER.openCalls[0] === OLD, JSON.stringify(SERVER.openCalls));
  ok('D4. the thread now IS the old conversation — all four rows, nothing invented', v.length === 4 && /לי חשוב/.test(v[0].text) && /הדוח הטכני/.test(v[3].text), JSON.stringify(v));
  ok('D5. the device follows the pointer and the panel closed', (await d.page.evaluate(() => CHAT.conv)) === OLD && !(await d.page.evaluate(() => document.getElementById('panel').classList.contains('on'))));
  ok('D6. a later sync keeps the reopened thread (the server pointer moved with it)', (await d.page.evaluate(async () => { await chatSync(); return CHAT.conv; })) === OLD && (await view(d.page)).length === 4);
  await d.ctx.close();
}

// ── the wiring, pinned ──────────────────────────────────────────────────────
ok('SRC: ✎ confirms unless forced', /if\(force!==true&&!confirm\(/.test(SRC) && /onclick="newSession\(\)"/.test(SRC));
ok('SRC: the tick syncs first and judges the deadline after', /if\(CHAT\.syncing\)\{ph\.__await=setTimeout\(tick,500\);return;\}\s*try\{await chatSync\(\);\}catch\(e\)\{\}\s*if\(!ph\.pending\)return;[^\n]*\n\s*if\(Date\.now\(\)-ph\.awaiting_since>TURN_AWAIT_MAX_MS\)/.test(SRC));
ok('SRC: the ORGANIZATION list is bounded and the thread keeps 42vh on the phone', /\.orgMobile \.orgList\{max-height:min\(30vh,360px\);min-height:0;overflow-y:auto/.test(SRC) && /#center>#thread\{min-height:42vh\}/.test(SRC));
ok('SRC: chat_list and chat_open go through ccApi (command-center)', /ccApi\(\{action:'chat_list'/.test(SRC) && /ccApi\(\{action:'chat_open'/.test(SRC));
ok('SRC: build 2026-09-12.1', /const LIA_BUILD='2026-09-12\.1';/.test(SRC));
ok('no page errors', errors.length === 0, errors.join('\n'));

await browser.close();
console.log(bad ? `FAIL ${bad}/${total}` : `PASS ${total}/${total} — the thread is the page; ✎ is deliberate; the wait pulls before it judges; no conversation is ever lost`);
process.exit(bad ? 1 : 0);
