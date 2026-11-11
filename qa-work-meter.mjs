// THE WORK METER IN ORDER, in a real browser (David, 12.11 — "מאוד קשה לניהול, לא יודע איך לאשר או לדחות").
// Network stubbed with rows shaped like his screen of that day. Phone and desktop: the groups, the ask line,
// the button that opens the decision card, no horizontal overflow, RTL. Screenshots: qa/meter-*.png
//   node qa-work-meter.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };
const NOW = Date.now();
const W = (id, o) => Object.assign({ work_id: id.padEnd(32, '0'), kind: 'research', status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', objective: 'חבילה', items: [], closure: null,
  lease: null, lease_alive: false, updated_at: new Date(NOW - 3600e3).toISOString(), created_at: new Date(NOW - 86400e3).toISOString() }, o);
const PART = (id, objective, missing) => W(id, { objective, disposition: 'PRODUCT_REVIEW', track: { state: 'DAVID', why: 'התוצר מוכן לאישורך' },
  product_review: { submitted_at: new Date(NOW - 7200e3).toISOString(), result: `התוצר, חלקי — דוח ביניים, לא תוצר: ${missing}` } });
const ALIVE = [
  W('8eef286f', { kind: 'build', objective: 'מחוץ לתחזית עד שיקושרו , תתקני את זה לשעורי המרה של 120 יום', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION',
    david_decision: { question: 'ההנדסה הסתיימה — האם זה מה שביקשת?', options: ['אשרי', 'תחזירי לתיקון', 'סגרי'] }, track: { state: 'DAVID', why: 'ממתינה להכרעתך (NEEDS_DAVID_DECISION)' } }),
  W('ab592664', { kind: 'engineering', objective: 'בדקי בפועל:', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION',
    david_decision: { question: 'משימת הנדסה שאף מבצע לא יכול להריץ — לסגור אותה או לנסות שוב?', options: ['סגרי', 'נסי שוב'] }, track: { state: 'DAVID', why: 'ממתינה להכרעתך (NEEDS_DAVID_DECISION)' } }),
  PART('3d37c412', 'תלמי כץ רו״ח / ענבר חייפץ — הנהלת חשבונות, שכר ודוחות שנתיים: למפות ולאמת חלופות לגורם מקצועי שיטפל בהנהלת חשבונות', 'לכן גם מחיר, זמינות, זמן תחילת טיפול ודוגמאות עבודה לא ניתנים לאימות ללא פנייה מאושרת.'),
  PART('0ee5fc1f', 'אז בסוף התוכנית היא שבעצם את מכינה דף נחיתה מכתב מעוצב שבו אנחנו מבקשים להיפגש עם הנציגים הרלוונטים ולמעשה גם בסבו וגם בצ\'אנג מאי תודיעי לי', 'המכתב באנגלית וחמש המועמדות הראשונות מוכנים, אך עדיין לא נשלחה פנייה ולא נקבעה פגישה — בהתאם להנחיה לעצור לפני שליחה.'),
  PART('e27fc8a2', 'נסי שוב', '**טיוטת העברה לאורנה — לא נשלחה**'),
  W('9993f950', { status: 'RUNNING', state: 'RUNNING', objective: 'In Situ Zafiropoulou & Co GP — ספטולות: למפות ולאמת חלופות לספטולות הנרכשות', track: { state: 'OFF', why: 'מסומנת RUNNING בלי lease חי — אין מבצע שמחזיק אותה' } }),
  W('762eb305', { objective: 'שקללי את זה בשווי חברה, בהמשך ל: אני מצהיר את זה', next_wake_at: new Date(NOW + 3600e3).toISOString(), waiting_on: { kind: 'timer', ref: 'background_retry', condition: '' }, track: { state: 'ON', why: '' } }),
  W('1be96d56', { objective: 'אני לא מבין את אמורה לטפל בזה לא לדווח לי מה לא מטופל', next_wake_at: new Date(NOW + 7200e3).toISOString(), waiting_on: { kind: 'timer', ref: 'study_cycle', condition: 'ממתינה למיזוג של דוד' }, track: { state: 'ON', why: '' } }),
  W('a1a1ce0d', { kind: 'maintenance', status: 'QUEUED', state: 'QUEUED', objective: 'תחזוקה מבוקרת' }),
];
const TOWER = { generated_at: new Date(NOW).toISOString(), departments: [], projects: [], approvals: [], alerts: [], work_running: [], next_action: {}, changed: [], money: {}, manifest: [], totals: {} };
async function stub(page) {
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'status') return j({ setup: false });
    if (body.action === 'tower') return j(TOWER);
    if (body.action === 'state') return j({ approvals: [] });
    if (body.action === 'cap' && body.name === 'work_status') return j({ rows: body.args && body.args.closed_since ? [] : ALIVE });
    return j({ ok: true, rows: [] });
  });
}
const browser = await chromium.launch();
const errors = [];
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', deviceScaleFactor: 2, isMobile: tag === 'mobile', hasTouch: tag === 'mobile' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await stub(page);
  await page.goto(PAGE);
  await page.waitForSelector('.workMeter .wg', { timeout: 15000 }).catch(() => null);
  const v = await page.evaluate(() => {
    const txt = (el) => el.innerText.replace(/\s+/g, ' ').trim();
    const groups = [...document.querySelectorAll('.workMeter .wg')].map((g) => ({ key: g.dataset.group, open: g.open, head: txt(g.querySelector('summary')), rows: g.querySelectorAll('.wm').length }));
    const asks = [...document.querySelectorAll('.workMeter .wm.ask')].map((r) => ({ id: r.dataset.work, kind: r.dataset.ask, text: txt(r), btn: !!r.querySelector('button[data-open]') }));
    const meter = document.querySelector('.workMeter');
    return { groups, asks, all: meter ? txt(meter) : '', over: document.documentElement.scrollWidth - document.documentElement.clientWidth, dir: getComputedStyle(document.body).direction };
  });
  ok(`${tag}: four groups, in order of who moves next`, v.groups.map((g) => `${g.key}:${g.rows}`).join() === 'david:2,partial:3,stuck:1,self:2', JSON.stringify(v.groups));
  ok(`${tag}: what needs him is open; what runs by itself is folded`, v.groups.filter((g) => g.open).map((g) => g.key).join() === 'david,partial,stuck');
  ok(`${tag}: each group says how many`, /מחכה להכרעה שלך\s*2/.test(v.groups[0].head) && /ליה עצרה עם תוצר חלקי\s*3/.test(v.groups[1].head), v.groups.map((g) => g.head).join(' | '));
  const q = v.asks.find((a) => a.id === '8eef286f');
  ok(`${tag}: a decision shows the question and its options, and a button`, q && q.kind === 'question' && /האם זה מה שביקשת\?/.test(q.text) && /אשרי/.test(q.text) && /תחזירי לתיקון/.test(q.text) && q.btn, JSON.stringify(q));
  const p = v.asks.find((a) => a.id === '3d37c412');
  ok(`${tag}: a partial product says what is missing`, p && p.kind === 'partial' && /מה חסר: לכן גם מחיר/.test(p.text) && /^תלמי כץ רו״ח \/ ענבר חייפץ/.test(p.text), JSON.stringify(p));
  ok(`${tag}: no row says "ready for your approval" about a product that calls itself partial`, !/חלקי — דוח ביניים/.test(v.all) && !/NEEDS_DAVID_DECISION/.test(v.all), v.all.slice(0, 300));
  ok(`${tag}: a row nobody holds says "stuck" and why — not "running", and promises no next step`, (() => { const m = /תקוע — אף אחד לא מחזיק.*?(?=ליה ממשיכה לבד)/.exec(v.all); return !!m && /In Situ/.test(m[0]) && /תקוע/.test(m[0].replace('תקוע — אף אחד לא מחזיק', '')) && !/השלב הבא/.test(m[0]) && /אין מבצע שמחזיק אותה/.test(m[0]); })(), v.all.slice(-400));
  ok(`${tag}: no markdown marks reach the screen`, !/\*\*/.test(v.all));
  ok(`${tag}: the machine's own housekeeping is still not on his meter`, !/תחזוקה מבוקרת/.test(v.all));
  ok(`${tag}: no horizontal overflow, RTL`, v.over <= 0 && v.dir === 'rtl', `over ${v.over} dir ${v.dir}`);
  await page.screenshot({ path: `${OUT}meter-${tag}.png`, fullPage: true });
  await page.click('.workMeter .wm.ask[data-work="8eef286f"] button[data-open]');
  const card = await page.waitForSelector('#dec', { timeout: 5000 }).then(() => page.evaluate(() => document.getElementById('dec').innerText.replace(/\s+/g, ' ').trim())).catch(() => '');
  ok(`${tag}: the button opens the decision card with its buttons`, /אשר/.test(card) && /סגרי/.test(card), card.slice(0, 200));
  await page.screenshot({ path: `${OUT}meter-${tag}-card.png`, fullPage: false });
  await ctx.close();
}
await browser.close();
ok('no page errors', errors.length === 0, errors.join(' | '));
console.log(`\n${total - bad}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
