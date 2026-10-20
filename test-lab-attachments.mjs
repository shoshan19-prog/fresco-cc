// LAB: A PHOTO OR A FILE REACHES LIA (Rachel + Meital, 20.10).
//
// Meital, 12:53: "על מנת להמשיך להזין לך נתונים אני חייבת שיהיה ניתן לשלוח לך תמונה או קבצים". Rachel asked the same at 08:21.
// lab.html had no way to attach anything — the server already reads `sources` on the kernel turn for any code (the
// lia.html pipeline). This drives the REAL lab.html in Chromium against an in-memory server and pins:
//   A. a photo picked with the 📎 button travels with the turn: named, with bytes, shrunk to a JPEG
//   B. the bytes ride the FIRST request only — the re-asks while the turn runs (202) never resend them
//   C. the stored conversation keeps the file's NAME, never its bytes; the bubble shows the name
//   D. a file off the whitelist (.exe) is refused on the page and never sent
//   E. a file with no text still goes (the server answers it as "the attached file")
//
//   node test-lab-attachments.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const check = (n, c, m) => { if (c) { passed++; console.log('PASS ', n); } else { failed++; console.log('FAIL ', n, '—', m || ''); } };
/* a real 2×2 PNG */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

async function scenario(browser, run) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('lab_code', 'test-code');
    const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms >= 1000 ? 5 : ms, ...a);
  });
  const S = { kernel: [], sync: [] };
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, body: '' });
    if (req.url().includes('/lia?')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const body = JSON.parse(req.postData() || '{}');
    if (body.action === 'chat_sync') {
      S.sync.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversation_id: 'c'.repeat(32), accepted: true, messages: [] }) });
    }
    if (body.action === 'kernel') {
      S.kernel.push(body);
      if (S.kernel.length === 1) return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ pending: true, turn_id: body.turn_id }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'ראיתי את המסך: L 38.14', turn_id: body.turn_id }) });
    }
    return route.fulfill({ status: 400, body: 'unknown' });
  });
  await page.goto('file://' + fileURLToPath(new URL('./lab.html', import.meta.url)));
  await page.waitForSelector('#app', { state: 'visible' });
  const pre = await run(page);
  await page.waitForFunction(() => !/חושבת…/.test(document.querySelector('#thread .msg.her:last-child .bubble')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const me = await page.evaluate(() => { const m = document.querySelectorAll('#thread .msg.me .bubble'); return m.length ? m[m.length - 1].textContent : ''; });
  const her = await page.textContent('#thread .msg.her:last-child .bubble').catch(() => '');
  const bar = await page.textContent('#attachBar').catch(() => '');
  await ctx.close();
  return { S, me, her, bar, pre };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
try {
  const a = await scenario(browser, async (page) => {
    await page.setInputFiles('#filePick', { name: 'DAF018 ספקטרו.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => /DAF018/.test(document.getElementById('attachBar').textContent) && !/קוראת/.test(document.getElementById('attachBar').textContent));
    await page.fill('#note', 'זה המסך של DAF018');
    await page.click('#send');
  });
  const k0 = a.S.kernel[0] || {};
  const s0 = (k0.sources || [])[0] || {};
  check('A: the photo travels with the turn — named, with bytes, as JPEG', s0.filename === 'DAF018 ספקטרו.png' && s0.data_b64?.length > 20 && s0.mime === 'image/jpeg' && s0.source_type === 'CHAT_IMAGE', JSON.stringify({ ...s0, data_b64: (s0.data_b64 || '').length }));
  check('A: the text goes with it', k0.body === 'זה המסך של DAF018', k0.body);
  check('B: the re-ask while it runs never resends the bytes', a.S.kernel.length === 2 && !a.S.kernel[1].sources && a.S.kernel[1].turn_id === k0.turn_id, JSON.stringify(a.S.kernel.map((k) => !!k.sources)));
  const stored = JSON.stringify(a.S.sync.map((x) => x.messages));
  check('C: the stored conversation keeps the name, never the bytes', /DAF018 ספקטרו\.png/.test(stored) && !stored.includes(s0.data_b64 || '@@'), stored.slice(0, 200));
  check('C: the bubble shows the name; the answer lands', /📎 DAF018/.test(a.me) && /ראיתי את המסך/.test(a.her), `${a.me} | ${a.her}`);
  check('C: the attach bar is empty after sending', !/DAF018/.test(a.bar), a.bar);

  const d = await scenario(browser, async (page) => {
    await page.setInputFiles('#filePick', { name: 'tool.exe', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => /tool\.exe/.test(document.getElementById('attachBar').textContent));
    const shown = await page.textContent('#attachBar');
    await page.fill('#note', 'בדיקה');
    await page.click('#send');
    return shown;
  });
  check('D: a file off the whitelist is refused on the page and never sent', /לא נתמך/.test(d.pre || '') && !(d.S.kernel[0] || {}).sources, `${d.pre} · ${JSON.stringify((d.S.kernel[0] || {}).sources || null)}`);

  const e = await scenario(browser, async (page) => {
    await page.setInputFiles('#filePick', { name: 'מדידות.csv', mimeType: 'text/csv', buffer: Buffer.from('shade,L,a,b\nDAF018,38.14,15.77,15.60\n') });
    await page.waitForFunction(() => /מדידות/.test(document.getElementById('attachBar').textContent) && !/קוראת/.test(document.getElementById('attachBar').textContent));
    await page.click('#send');
  });
  const e0 = e.S.kernel[0] || {};
  check('E: a file with no text still goes', e0.body === '' && (e0.sources || [])[0]?.filename === 'מדידות.csv' && (e0.sources || [])[0]?.kind === 'sheet', JSON.stringify({ body: e0.body, n: (e0.sources || []).length }));
} finally { await browser.close(); }
console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
