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
const PR = (missing, outcome) => ({ submitted_at: new Date(NOW - 7200e3).toISOString(), outcome: outcome || '', what_works: '', result: `התוצר, חלקי — דוח ביניים, לא תוצר: ${missing}` });
const HIS = (id, objective, missing, outcome) => W(id, { objective, disposition: 'PRODUCT_REVIEW', parked_for_david: true, product_review: PR(missing, outcome),
  partial: { kind: 'AUTHORIZE', davids: true, missing },
  david_decision: { question: 'העבודה מוכנה ונעצרה לפני פנייה החוצה. לאשר לליה להמשיך?', options: ['אשרי להמשיך', 'תחזירי לתיקון', 'סגרי'], because: missing, source: 'product_review' },
  track: { state: 'DAVID', why: 'העבודה מוכנה ונעצרה לפני פנייה החוצה. לאשר לליה להמשיך?' } });
const LIAS = (id, objective, missing, kind, outcome) => W(id, { objective, product_review: PR(missing, outcome), partial: { kind, davids: false, missing }, david_decision: null,
  ...(kind === 'TECHNICAL' ? { disposition: 'PRODUCT_REVIEW', track: { state: 'OFF', why: 'x' } }
    : { next_wake_at: new Date(NOW + 5400e3).toISOString(), waiting_on: { kind: 'internal', ref: 'technical_continuation', condition: 'תוצר חלקי שאינו הכרעה של דוד — חוזר לליה להמשך' }, track: { state: 'ON', why: '' } }) });
const ALIVE = [
  W('8eef286f', { kind: 'build', objective: 'מחוץ לתחזית עד שיקושרו , תתקני את זה לשעורי המרה של 120 יום', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION', current_step: 'השלב ההנדסי 910ca8f4 הסתיים: דוד אישר שהתוצר עונה',
    david_decision: { question: 'ההנדסה הסתיימה — האם זה מה שביקשת?', options: ['אשרי', 'תחזירי לתיקון', 'סגרי'], because: 'רק הבעלים אומר שהתוצר עונה על ההוראה שלו' }, track: { state: 'DAVID', why: 'ממתינה להכרעתך (NEEDS_DAVID_DECISION)' } }),
  HIS('0ee5fc1f', 'אז בסוף התוכנית היא שבעצם את מכינה דף נחיתה מכתב מעוצב שבו אנחנו מבקשים להיפגש עם הנציגים הרלוונטים ולמעשה גם בסבו וגם בצ\'אנג מאי תודיעי לי', 'המכתב באנגלית וחמש המועמדות הראשונות מוכנים, אך עדיין לא נשלחה פנייה ולא נקבעה פגישה — בהתאם להנחיה לעצור לפני שליחה.', 'סטטוס: דף הנחיתה המעוצב מוכן ונבדק לפתיחה בטלפון'),
  HIS('e27fc8a2', 'נסי שוב', 'טיוטת העברה לאורנה — לא נשלחה', 'חלק 1 — ברצלונה, אוגוסט 2024'),
  LIAS('21084205', 'הרשות להשקעות — מענקים להשקעות יצרניות בישראל: לאתר את הנוהל המלא ולבדוק את תנאי הסף', 'לא נמצאה רשימת מסמכים רשמית ומלאה של טפסים, דוחות והצעות מחיר.', 'CONTINUE', 'לאתר את הנוהל המלא ולבדוק את תנאי הסף'),
  LIAS('f41bc352', 'כנסי למייל ששלחתי לעירית טלמי', 'קריאות יתרת המלאי והזמנות הרכש הפתוחות נכשלו בשגיאת פריוריטי.', 'TECHNICAL', 'המייל לעירית נשלח ב־1.11'),
  W('9993f950', { status: 'RUNNING', state: 'RUNNING', objective: 'In Situ Zafiropoulou & Co GP — ספטולות: למפות ולאמת חלופות לספטולות הנרכשות', track: { state: 'OFF', why: 'מסומנת RUNNING בלי lease חי — אין מבצע שמחזיק אותה' } }),
  W('762eb305', { objective: 'שקללי את זה בשווי חברה, בהמשך ל: אני מצהיר את זה', next_wake_at: new Date(NOW + 3600e3).toISOString(), waiting_on: { kind: 'timer', ref: 'background_retry', condition: '' }, track: { state: 'ON', why: '' } }),
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
  ok(`${tag}: exactly three groups, in his words and his order`, v.groups.map((g) => `${g.key}:${g.rows}`).join() === 'david:3,lia:2,stuck:2', JSON.stringify(v.groups));
  ok(`${tag}: only what waits for his decision is open`, v.groups.filter((g) => g.open).map((g) => g.key).join() === 'david');
  ok(`${tag}: each group says how many`, /מחכה להחלטה שלי\s*3/.test(v.groups[0].head) && /ליה מטפלת\s*2/.test(v.groups[1].head) && /תקוע ודורש טיפול טכני\s*2/.test(v.groups[2].head), v.groups.map((g) => g.head).join(' | '));
  const q = v.asks.find((a) => a.id === '8eef286f');
  ok(`${tag}: a decision shows what was done, the one question, its options and a button`, q && q.kind === 'question' && /בוצע: השלב ההנדסי/.test(q.text) && /נדרש ממך: ההנדסה הסתיימה — האם זה מה שביקשת\?/.test(q.text) && /אשרי/.test(q.text) && /תחזירי לתיקון/.test(q.text) && q.btn, JSON.stringify(q));
  const p = v.asks.find((a) => a.id === '0ee5fc1f');
  ok(`${tag}: a partial product that is his is a question, with what was done`, p && p.kind === 'question' && /בוצע: דף הנחיתה המעוצב מוכן/.test(p.text) && /נדרש ממך: העבודה מוכנה ונעצרה לפני פנייה החוצה/.test(p.text) && /אשרי להמשיך/.test(p.text) && p.btn, JSON.stringify(p));
  await page.evaluate(() => { document.querySelectorAll('.workMeter details').forEach((d) => { d.open = true; }); });
  const opened = await page.evaluate(() => [...document.querySelectorAll('.workMeter .wm.ask')].map((r) => ({ id: r.dataset.work, text: r.innerText.replace(/\s+/g, ' ').trim(), btn: !!r.querySelector('button') })));
  const l = opened.find((a) => a.id === '21084205');
  ok(`${tag}: what LIA handles says what remains and that she continues — and offers him nothing to press`, l && /נשאר: לא נמצאה רשימת מסמכים/.test(l.text) && /ליה ממשיכה:/.test(l.text) && !l.btn && !/נדרש ממך/.test(l.text), JSON.stringify(l));
  const t = opened.find((a) => a.id === 'f41bc352'), ph = opened.find((a) => a.id === '9993f950');
  ok(`${tag}: what is stuck says why, and asks nothing of him`, t && /למה תקוע: קריאות יתרת המלאי והזמנות הרכש הפתוחות נכשלו בשגיאת פריוריטי/.test(t.text) && !t.btn && ph && /אין מבצע שמחזיק אותה/.test(ph.text) && !/נדרש ממך/.test(ph.text + t.text), JSON.stringify([t, ph]));
  ok(`${tag}: no row says a partial product is ready for his approval; no code, no markdown`, !/חלקי — דוח ביניים/.test(v.all) && !/מוכן לאישורך/.test(v.all) && !/NEEDS_DAVID_DECISION/.test(v.all) && !/\*\*/.test(v.all), v.all.slice(0, 300));
  ok(`${tag}: the machine's own housekeeping is still not on his meter`, !/תחזוקה מבוקרת/.test(v.all));
  ok(`${tag}: no horizontal overflow, RTL`, v.over <= 0 && v.dir === 'rtl', `over ${v.over} dir ${v.dir}`);
  await page.screenshot({ path: `${OUT}meter-${tag}.png`, fullPage: true });
  const sent = [];
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'work_decide') { sent.push(body); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, summary: 'אושר להמשיך לשלב הפנייה — חוזרת לליה' }) }); }
    return route.fallback();
  });
  page.on('dialog', (d) => d.accept());
  await page.click('.workMeter .wm.ask[data-work="0ee5fc1f"] button[data-open]');
  const card = await page.waitForSelector('#dec', { timeout: 5000 }).then(() => page.evaluate(() => document.getElementById('dec').innerText.replace(/\s+/g, ' ').trim())).catch(() => '');
  ok(`${tag}: the card is ONE QUESTION with what was done, why it is his, and his three options`, /^העבודה מוכנה ונעצרה לפני פנייה החוצה\. לאשר לליה להמשיך\?/.test(card) && /מה כבר בוצע:/.test(card) && /למה זה אצלך:/.test(card) && /אשרי להמשיך/.test(card) && /תחזירי לתיקון/.test(card) && /סגרי/.test(card) && !/מוכן לאישורך/.test(card), card.slice(0, 260));
  await page.screenshot({ path: `${OUT}meter-${tag}-card.png`, fullPage: false });
  await page.fill('#fixNote', 'רק לשלושת הראשונים');
  await page.click('#dec button[data-dec="ACCEPT"]');
  await page.waitForFunction(() => /חזר לליה/.test((document.getElementById('decRes') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => null);
  const res = await page.evaluate(() => (document.getElementById('decRes') || {}).textContent || '');
  ok(`${tag}: his "אשרי להמשיך" goes back to LIA — the decision, the package and his note are sent`, sent.length === 1 && sent[0].decision === 'ACCEPT' && /^0ee5fc1f/.test(sent[0].work_id) && sent[0].note === 'רק לשלושת הראשונים' && /חזר לליה/.test(res), JSON.stringify([sent, res]));
  await ctx.close();
}
await browser.close();
ok('no page errors', errors.length === 0, errors.join(' | '));
console.log(`\n${total - bad}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
