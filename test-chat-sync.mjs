// Cross-device conversation continuity, driven in TWO real browser contexts.
//
// David's report (7.9): "אני מדבר עם שתי ליהות שונות" — the phone and the
// desktop each held their own conversation in localStorage, with no canonical
// copy anywhere. This test runs the REAL lia.html twice ("desktop" and
// "phone"), against one in-memory canonical server implementing the same
// chat_sync contract as command-center: one conversation per user, idempotent
// appends by message_id, server-arrival ordering, cursor-incremental pulls.
//
// The acceptance David dictated:
//   A. a message sent on desktop is visible on the phone
//   B. a phone reply is visible back on the desktop
//   C. both devices render the SAME ordered history
//   D. re-sync duplicates nothing
//   E. "שיחה חדשה" moves both devices to one new canonical conversation
//   F. a local pre-feature history migrates chronologically, losing nothing
//
//   node test-chat-sync.mjs
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

// ── the canonical server, in memory — the same contract command-center ships ─
const SERVER = { conv: 'conv-one', rows: new Map(), tick: 0 };
function serverSync(body) {
  if (body.action === 'chat_new') {
    SERVER.conv = 'conv-new-' + (++SERVER.tick);
    return { conversation_id: SERVER.conv, messages: [], cursor: '', canon_switched: true };
  }
  const inbound = Array.isArray(body.messages) ? body.messages.slice(0, 50) : [];
  const batch = body.migrate === true
    ? [...inbound].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    : inbound;
  for (const m of batch) {
    if (!m || !m.message_id || SERVER.rows.has(m.message_id)) continue;   // idempotent
    SERVER.rows.set(m.message_id, { ...m, conversation_id: SERVER.conv,
      server_at: new Date(1757000000000 + (++SERVER.tick) * 1000).toISOString(), device_id: body.device_id || null });
  }
  const sw = !!body.conversation_id && body.conversation_id !== SERVER.conv;
  const after = sw ? '' : String(body.after || '');
  const all = [...SERVER.rows.values()].filter((m) => m.conversation_id === SERVER.conv)
    .sort((a, b) => (a.server_at < b.server_at ? -1 : 1));
  const out = after ? all.filter((m) => m.server_at > after) : all;
  return { conversation_id: SERVER.conv, canon_switched: sw, messages: out,
    cursor: all.length ? all[all.length - 1].server_at : after };
}

const browser = await chromium.launch();
const errors = [];

async function device(tag, preSeed) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  await page.route('**/functions/v1/**', async (route) => {
    const url = route.request().url();
    const body = JSON.parse(route.request().postData() || '{}');
    // MIRROR PRODUCTION (10.9): chat_sync/chat_new/chat_diag exist ONLY on
    // command-center. The real `lia` function answers them "unknown action",
    // 400, plain text — this is the exact shape that let the wrong-endpoint
    // bug (api() instead of ccApi()) ship silently: a route that answered
    // every /functions/v1/** URL identically, by action alone, could never
    // catch a client that knocked on the wrong door.
    if (['chat_sync', 'chat_new', 'chat_diag'].includes(body.action) && !url.includes('/command-center')) {
      await route.fulfill({ status: 400, contentType: 'text/plain', body: 'unknown action' });
      return;
    }
    let json = { ok: true };
    if (body.action === 'state') json = { ok: true, items: [], objects: [], queue: [], model: true,
      counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } };
    else if (body.action === 'chat_sync' || body.action === 'chat_new') json = serverSync(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
  if (preSeed) await page.addInitScript(preSeed);
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(700);        // initChatContinuity settles
  return { page, ctx };
}
const turns = (page) => page.evaluate(() =>
  SESSION.turns.filter((t) => t && !t.pending).map((t) => ({ role: t.role, text: t.text, mid: t.mid || null })));
const syncNow = (page) => page.evaluate(() => chatSync());

// ── A: desktop speaks, the phone sees it ────────────────────────────────────
const desktop = await device('desktop');
await desktop.page.evaluate(() => { addTurn('me', 'מה המכירות היום?'); addTurn('lia', 'מכרנו 42,180 ש"ח.'); });
await desktop.page.waitForTimeout(700);  // debounce (400ms) + push
const phone = await device('phone');     // boots AFTER — adopts the canonical thread
const phoneView = await turns(phone.page);
ok('A. the desktop conversation reaches the phone',
  phoneView.some((t) => t.text === 'מה המכירות היום?') && phoneView.some((t) => t.text === 'מכרנו 42,180 ש"ח.'),
  JSON.stringify(phoneView));

// ── B: the phone replies, the desktop sees it on its next beat ──────────────
await phone.page.evaluate(() => { addTurn('me', 'ומה עם יעלי?'); });
await phone.page.waitForTimeout(700);
await syncNow(desktop.page);
await desktop.page.waitForTimeout(300);
const desktopView = await turns(desktop.page);
ok('B. the phone reply reaches the desktop', desktopView.some((t) => t.text === 'ומה עם יעלי?'),
  JSON.stringify(desktopView));

// ── C: both devices hold the SAME ordered history ───────────────────────────
await syncNow(phone.page); await phone.page.waitForTimeout(300);
const dv = await turns(desktop.page), pv = await turns(phone.page);
ok('C. identical ordered history on both devices',
  JSON.stringify(dv.map((t) => t.role + ':' + t.text)) === JSON.stringify(pv.map((t) => t.role + ':' + t.text)),
  `desktop=${JSON.stringify(dv.map((t) => t.text))} phone=${JSON.stringify(pv.map((t) => t.text))}`);
ok('C2. the shared history is the full three turns', dv.length === 3, `got ${dv.length}`);

// ── D: re-syncing duplicates nothing ────────────────────────────────────────
const before = SERVER.rows.size;
await syncNow(desktop.page); await syncNow(phone.page);
await desktop.page.waitForTimeout(300);
ok('D. re-sync adds no rows on the server', SERVER.rows.size === before, `rows ${before} → ${SERVER.rows.size}`);
ok('D2. re-sync adds no turns on the device', (await turns(desktop.page)).length === 3);

// ── E: "שיחה חדשה" is the ONE way a second thread is born — on both ─────────
desktop.page.once('dialog', (d) => d.accept());   // ✎ asks first (11.9) — the user confirms
await desktop.page.evaluate(() => newSession());
await desktop.page.waitForTimeout(300);
await syncNow(phone.page); await phone.page.waitForTimeout(300);
const phoneConv = await phone.page.evaluate(() => CHAT.conv);
const desktopConv = await desktop.page.evaluate(() => CHAT.conv);
ok('E. both devices land on the same new conversation', phoneConv === desktopConv && phoneConv.startsWith('conv-new-'),
  `desktop=${desktopConv} phone=${phoneConv}`);
ok('E2. the new conversation starts empty on the server',
  [...SERVER.rows.values()].every((m) => m.conversation_id !== desktopConv));

// ── F: a pre-feature local history migrates chronologically, losing nothing ─
SERVER.conv = 'conv-migrate'; SERVER.rows.clear();
const legacy = await device('legacy', () => {
  const id = 'legacy-session';
  localStorage.setItem('lia_session_cur', id);
  localStorage.setItem('lia_sessions', JSON.stringify([{ id, title: 'ישן', at: 3, ctx: 'פרסקו' }]));
  localStorage.setItem('lia_s_' + id, JSON.stringify({ id, title: 'ישן', ctx: 'פרסקו', at: 3, retracted: [], turns: [
    { role: 'lia', text: 'תשובה ישנה', at: 2000, res: null },
    { role: 'me', text: 'שאלה ישנה', at: 1000, res: null },
  ] }));
});
await legacy.page.waitForTimeout(900);   // init → migrate push
const migrated = [...SERVER.rows.values()].filter((m) => m.conversation_id === 'conv-migrate');
ok('F. every legacy turn reached the server', migrated.length === 2, `got ${migrated.length}`);
ok('F2. the migrated batch landed chronological',
  migrated.sort((a, b) => (a.server_at < b.server_at ? -1 : 1)).map((m) => m.content).join('|') === 'שאלה ישנה|תשובה ישנה');

// ── the page never went red ─────────────────────────────────────────────────
ok('no page errors across three devices', errors.length === 0, errors.join(' · '));

// ── source contracts (offline, string-level) ────────────────────────────────
ok('localStorage is a cache — the canonical copy is the server (stated in code)',
  /is demoted to a UI cache/.test(SRC));
ok('every shown turn rides ONE funnel to the server', /queueChatTurn\(turn\)/.test(SRC) && /queueChatTurn\(ph\)/.test(SRC));
ok('server turns are never re-queued (no echo loop)', /t\.fromServer\)return/.test(SRC.replace(/\s+/g, '')) || /\.fromServer\)return;/.test(SRC));
ok('sync runs after send, on focus, and on a beat',
  /visibilitychange/.test(SRC) && /_liaChat=setInterval/.test(SRC) && /CHAT\.timer=setTimeout/.test(SRC));
ok('an empty server never erases a local view', /an empty server never erases a local view/.test(SRC));
ok('chat_sync/chat_new/chat_diag are sent via ccApi (command-center) — the lia function has no such action',
  /ccApi\(\{action:'chat_sync'/.test(SRC) && /ccApi\(\{action:'chat_new'/.test(SRC) && /ccApi\(\{action:'chat_diag'/.test(SRC)
  && !/[^c]api\(\{action:'chat_(sync|new|diag)'/.test(SRC));

await browser.close();
console.log(`${total - bad}/${total} chat-sync asserts passed`);
process.exit(bad ? 1 : 0);
