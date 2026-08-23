// The eyes, driven in a REAL browser: a pasted screenshot must become a chip,
// travel with the request as a typed source, render in David's bubble — and,
// against today's kernel (no sources_seen in the reply), the HONESTY GATE must
// answer "I cannot see yet", never let a text-only answer pose as sight.
//
// The network is stubbed at the route level; everything else is the shipped
// file, unmodified.
//   node test-attach-e2e.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
let bad = 0, total = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 420, height: 820 }, locale: 'he-IL' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const kernelBodies = [];           // every kernel request the panel actually sent
let seeing = false;                // flip to simulate a kernel that HAS eyes
await page.route('**/functions/v1/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  let json = {};
  if (body.action === 'state') json = { ok: true, items: [], objects: [], model: true };
  else if (body.action === 'kernel') {
    kernelBodies.push(body);
    json = { answer: 'בצילום רואים שדה קלט חסום.', facts: [], inferences: [], sources: ['vision'],
      risks_opportunities: [], missing_information: [], recommended_next_action: '', confidence: 'HIGH' };
    if (seeing) json.sources_seen = (body.sources || []).map(s => s.source_id);
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
});
await page.addInitScript(() => {
  localStorage.setItem('lia_code', 'test-code');
  delete window.speechSynthesis;
});
await page.goto(PAGE);
await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });

// ── paste a real PNG from the clipboard (as David pastes a screenshot) ──
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8DwnwEPYMInOWQUAADVbQMBZa1MEAAAAABJRU5ErkJggg==';
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const f = new File([bytes], 'blob', { type: 'image/png' });
  const dt = new DataTransfer(); dt.items.add(f);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
}, PNG_B64);
await page.waitForSelector('#attachBar .att img', { timeout: 5000 }).catch(() => {});
ok('a pasted screenshot becomes a removable chip with a thumbnail',
  await page.locator('#attachBar .att img').count() === 1);

// ── an unsupported file is refused with a reason, on screen ─────────────
await page.evaluate(() => addFiles([new File(['x'], 'setup.exe', { type: 'application/x-msdownload' })]));
ok('an exe is refused with a visible reason',
  await page.locator('#attachBar .att.err').count() === 1
  && /לא נתמך/.test(await page.locator('#attachBar .att.err').innerText()));
await page.evaluate(() => { ATTACH.filter(a => a.status === 'ERROR').forEach(a => removeAtt(a.source_id)); });

// ── send with no words: the file itself is the question ─────────────────
await page.click('#sendBtn');
await page.waitForFunction(() => document.querySelectorAll('#thread .msg.lia').length >= 1, null, { timeout: 8000 });
ok('the empty send became "תסתכלי על זה"',
  (await page.locator('#thread .msg.me .bubble').first().innerText()).includes('תסתכלי על זה'));
ok('the evidence renders inside David\'s bubble',
  await page.locator('#thread .msg.me .bubble .shots img').count() === 1);
ok('the request carried the source with bytes', (() => {
  const k = kernelBodies[0];
  return k && Array.isArray(k.sources) && k.sources.length === 1
    && k.sources[0].source_type === 'CHAT_IMAGE' && !!k.sources[0].data_b64; })());
ok('HONESTY GATE: a sighted-sounding answer without sources_seen is refused',
  (await page.locator('#thread .msg.lia .bubble').last().innerText()).includes('לא יכולה לראות'));
ok('the refusal is spoken-safe prose, not the stub answer',
  !(await page.locator('#thread .msg.lia .bubble').last().innerText()).includes('שדה קלט חסום'));

// ── the registry survives the turn: "התמונה ששלחתי" resolves ────────────
seeing = true;                      // now the kernel "grows eyes"
await page.fill('#note', 'מה רואים בתמונה ששלחתי קודם?');
await page.click('#sendBtn');
await page.waitForFunction(() => document.querySelectorAll('#thread .msg.lia').length >= 2, null, { timeout: 8000 });
ok('a later turn re-sends the referenced image from the byte store', (() => {
  const k = kernelBodies[1];
  return k && Array.isArray(k.sources) && k.sources.length === 1
    && k.sources[0].resolved_from === 'conversation' && !!k.sources[0].data_b64; })());
ok('with sources_seen the kernel answer stands',
  (await page.locator('#thread .msg.lia .bubble').last().innerText()).includes('שדה קלט חסום'));

// ── nothing binary ever reaches localStorage ────────────────────────────
ok('localStorage holds descriptors, never bytes', await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i)) || '';
    if (v.indexOf('data_b64') >= 0 || v.length > 200000) return false;
  } return true; }));
ok('no page errors during the whole flow', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
