// THE CONVERSATION CATALOG (David, 11.11) — lia.html, ⋯ → שיחות קודמות — לפי נושא.
//   A. the list shows each conversation's name and department, with topic chips;
//   B. a chip shows one topic at a time, and the choice survives a reload of the list;
//   C. ✎ on a row names and files the conversation through chat_label (his word);
//   D. "קטלגי" files the unfiled ones through chat_catalog, in batches, until none remain;
//   E. opening a conversation from a filtered list still works (chat_open).
// The server is in memory; nothing here reaches the network.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const SRC = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
let bad = 0, total = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

const CATS = [['management', 'הנהלה'], ['sales', 'מכירות'], ['purchasing', 'רכש'], ['operations', 'ייצור ותפעול'], ['marketing', 'שיווק'], ['general', 'כללי']].map(([key, name]) => ({ key, name }));
const HE = Object.fromEntries(CATS.map((c) => [c.key, c.name]));
const id = (n) => String(n).repeat(32).slice(0, 32);
const SERVER = {
  canon: id('a'),
  convs: [
    { conversation_id: id('a'), title: 'פולס פרסקו', count: 2, last_at: '2026-11-10T10:00:00Z', category: 'management', title_source: 'lia', category_source: 'lia' },
    { conversation_id: id('b'), title: 'ספקי סיד חלופיים', count: 9, last_at: '2026-11-09T10:00:00Z', category: 'purchasing', title_source: 'lia', category_source: 'lia' },
    { conversation_id: id('c'), title: 'מה אנחנו קונים מהם', count: 4, last_at: '2026-11-08T10:00:00Z', category: null },
    { conversation_id: id('d'), title: 'תכיני לי הצעת מחיר', count: 3, last_at: '2026-11-07T10:00:00Z', category: null },
  ],
  labels: [], catalogCalls: 0, openCalls: [], listAll: 0,
};
const list = () => ({ canonical_id: SERVER.canon, categories: CATS,
  conversations: SERVER.convs.map((c) => ({ ...c, canonical: c.conversation_id === SERVER.canon, category_he: c.category ? HE[c.category] : null })) });

const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'he-IL', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/functions/v1/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  let json = { ok: true }, status = 200;
  if (body.action === 'state') json = { ok: true, items: [], objects: [], queue: [], model: true, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } };
  else if (body.action === 'tower') json = { departments: [] };
  else if (body.action === 'chat_sync') json = { conversation_id: SERVER.canon, canon_switched: false, messages: [], cursor: '' };
  else if (body.action === 'chat_list') { if (body.all === true) SERVER.listAll++; json = list(); }
  else if (body.action === 'chat_label') {
    SERVER.labels.push(body);
    const c = SERVER.convs.find((x) => x.conversation_id === body.conversation_id);
    if (!c) { status = 404; json = { error: 'no such conversation for this user' }; }
    else { if (body.title) { c.title = body.title; c.title_source = 'user'; } if (body.category) { c.category = body.category; c.category_source = 'user'; } json = { ok: true, changed: true }; }
  }
  else if (body.action === 'chat_catalog') {
    SERVER.catalogCalls++;
    const todo = SERVER.convs.filter((c) => !c.category);
    const one = todo[0];
    if (one) { one.category = 'sales'; one.category_source = 'lia'; one.title = 'קוטלג: ' + one.title; }
    json = { ok: true, filed_now: one ? 1 : 0, remaining: Math.max(0, todo.length - 1) };
  }
  else if (body.action === 'chat_open') { SERVER.openCalls.push(body.conversation_id); SERVER.canon = body.conversation_id; json = { conversation_id: body.conversation_id, canon_switched: true, messages: [], cursor: '' }; }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
});
await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
await page.goto(PAGE);
await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
await page.waitForTimeout(700);
const rows = () => page.evaluate(() => [...document.querySelectorAll('#sessions .obj')].map((o) => o.textContent.replace(/\s+/g, ' ').trim()));
const chips = () => page.evaluate(() => [...document.querySelectorAll('#sessions .catchip')].map((o) => ({ t: o.textContent.trim(), on: o.classList.contains('on'), cat: o.getAttribute('data-cat') })));

// ── A. names, departments, chips ────────────────────────────────────────────
await page.evaluate(() => openPanel()); await page.waitForTimeout(500);
{
  const r = await rows(), c = await chips();
  ok('A1. the list reads every conversation (all:true)', SERVER.listAll >= 1);
  ok('A2. four rows, each with its name', r.length === 4 && r.some((t) => /ספקי סיד חלופיים/.test(t)), JSON.stringify(r));
  ok('A3. a filed conversation shows its department', r.some((t) => /ספקי סיד חלופיים/.test(t) && /רכש/.test(t)) && r.some((t) => /פולס פרסקו/.test(t) && /הנהלה/.test(t)), JSON.stringify(r));
  ok('A4. chips: all · the departments in use · unfiled — with counts', c.some((x) => /הכול · 4/.test(x.t) && x.on) && c.some((x) => /רכש · 1/.test(x.t)) && c.some((x) => /לא מקוטלג · 2/.test(x.t)) && !c.some((x) => /שיווק/.test(x.t)), JSON.stringify(c));
  ok('A5. every row has ✎, and the open conversation is not a button to press', (await page.evaluate(() => document.querySelectorAll('#sessions .obj button[title="שם וקטגוריה"]').length)) === 4
    && (await page.evaluate(() => !!document.querySelector('#sessions button.det[disabled]'))));
}
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
// ── B. one topic at a time ──────────────────────────────────────────────────
await page.click('#sessions .catchip[data-cat="purchasing"]'); await page.waitForTimeout(150);
{
  const r = await rows();
  ok('B1. the purchasing chip shows only purchasing', r.length === 1 && /ספקי סיד חלופיים/.test(r[0]), JSON.stringify(r));
  ok('B2. the choice is remembered', (await page.evaluate(() => localStorage.getItem('lia_cat_filter'))) === 'purchasing' && (await chips()).some((x) => x.cat === 'purchasing' && x.on));
}
await page.click('#sessions .catchip[data-cat="_none"]'); await page.waitForTimeout(150);
ok('B3. "לא מקוטלג" shows the two unfiled', (await rows()).length === 2);

// ── C. he names and files a conversation ────────────────────────────────────
{
  const answers = ['השוואת ספקי VWS', '3'];   // 3 = רכש in the menu
  page.on('dialog', async (d) => { if (d.type() === 'prompt') await d.accept(answers.shift() ?? ''); else await d.accept(); });
  await page.click(`#sessions .obj button[title="שם וקטגוריה"][data-conv="${id('c')}"]`); await page.waitForTimeout(500);
  const sent = SERVER.labels[0] || {};
  ok('C1. chat_label carries his name and his department', sent.action === 'chat_label' && sent.conversation_id === id('c') && sent.title === 'השוואת ספקי VWS' && sent.category === 'purchasing', JSON.stringify(sent));
  await page.click('#sessions .catchip[data-cat="purchasing"]'); await page.waitForTimeout(150);
  const r = await rows();
  ok('C2. the list is re-read and the conversation sits under רכש with his name', r.length === 2 && r.some((t) => /השוואת ספקי VWS/.test(t)), JSON.stringify(r));
}
// ── D. LIA files the rest ───────────────────────────────────────────────────
await page.click('#sessions .catchip[data-cat="_none"]'); await page.waitForTimeout(150);
ok('D1. the button names how many are unfiled', /קטלגי 1 שיחות/.test(await page.evaluate(() => (document.getElementById('catalogRun') || {}).textContent || '')));
await page.click('#catalogRun'); await page.waitForTimeout(700);
{
  const c = await chips();
  ok('D2. chat_catalog ran and stopped when nothing remained', SERVER.catalogCalls === 1, String(SERVER.catalogCalls));
  ok('D3. nothing is unfiled any more, and the button is gone', !c.some((x) => x.cat === '_none') && !(await page.evaluate(() => !!document.getElementById('catalogRun'))), JSON.stringify(c));
  await page.click('#sessions .catchip[data-cat="sales"]'); await page.waitForTimeout(150);
  ok('D4. the conversation LIA filed shows under מכירות', (await rows()).some((t) => /קוטלג: תכיני לי הצעת מחיר/.test(t)));
}
// ── E. reopen from a filtered list ──────────────────────────────────────────
await page.click(`#sessions button.det[data-conv="${id('d')}"]`); await page.waitForTimeout(400);
ok('E1. chat_open was asked for that conversation', SERVER.openCalls[0] === id('d'), JSON.stringify(SERVER.openCalls));

ok('SRC: label and catalog go through ccApi (command-center)', /ccApi\(body\)/.test(SRC) && /action:'chat_label'/.test(SRC) && /ccApi\(\{action:'chat_catalog'/.test(SRC));
ok('SRC: nothing of the catalog is stored on the device but the chosen chip', (SRC.match(/localStorage\.setItem\('lia_cat_[a-z_]+'/g) || []).join() === "localStorage.setItem('lia_cat_filter'");
ok('no page errors', errors.length === 0, errors.join('\n'));
await browser.close();
console.log(bad ? `FAIL ${bad}/${total}` : `PASS ${total}/${total} — every conversation has a name and a department; his word files it, LIA files the rest`);
process.exit(bad ? 1 : 0);
