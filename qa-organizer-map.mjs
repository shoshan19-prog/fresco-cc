// THE MANAGEMENT MAP — what David sees (5.10 night): the real lia.html in Chromium, the tower stubbed with the shape
// the new server returns (departments with computed states, read numbers, the registry row and the management card),
// the ORGANIZATION rail opened on מכירות, the form he fills, and the same card in the phone drawer.
//   node qa-organizer-map.mjs          → qa/org-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url)); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = []; let total = 0, bad = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

/* the live numbers of 5.10 20:10Z (measured in the DB) and the registry seeds of migration 034 */
const M = (label, value, source) => ({ label, value, source });
const AW = (n, items) => ({ count: n, ids: items.map((x) => x[0]), top: items.map(([id8, status, head]) => ({ id8, status, head })) });
const card = (o) => ({ status: o.state, goal: o.goal ?? null, owner: o.owner ?? null, kpi: o.metrics, active_work: o.aw || AW(0, []),
  blocker: o.blocker ?? null, next_action: o.next ?? null, needs_david: o.ceo ?? null, goal_source: o.goal ? (o.src || 'registry') : null });
const SEED = 'department-specs.md · הכרעה 96 · מוצע';
const D = [
  { key: 'branding', name: 'מיתוג', state: 'LIVE', metrics: [M('נכסים שנוצרו', 34, 'artifact'), M('נכסי תוכן בפנקס', 9, 'content_asset')], cmds: ['council', 'brand_pack'], ceo: null, registry: { source: 'seed' } },
  { key: 'marketing', name: 'שיווק', state: 'LIVE', metrics: [M('פרויקטים', 284, 'project'), M('הזדמנויות', 9, 'opportunity'), M('סיגנלים', 9, 'signal'), M('נכסי ידע', 1809, 'knowledge_asset')], cmds: ['opps', 'pulse', 'scan'], ceo: 'איזה שוק פעיל',
    registry: { goal: 'לייצר ולהפעיל כל ערוץ חוקי שמחבר את פרסקו לעולם — כדי שהזדמנויות יגיעו אלינו ושפרסקו תשפיע מוקדם במחזור-החיים (מפרט לפני רכש).', source: SEED } },
  { key: 'advertising', name: 'פרסום', state: 'HIDDEN', metrics: [M('קמפיינים', 'לא-מדיד', 'אין מקור — מנוע פרסום לא קיים')], cmds: ['wp'], ceo: 'גישה לחשבונות', registry: { source: 'seed' } },
  { key: 'sales', name: 'מכירות', state: 'LIVE', metrics: [M('הזמנות החודש', 25, 'ORDERS · קריאה חיה'), M('מיילים באינדקס', 73377, 'mail_index'), M('אנשים בגרף', 602, 'actor')], cmds: ['dormant', 'retention', 'priority'], ceo: 'האצלה לסוכן',
    registry: { goal: 'להפוך קשרים קיימים ונכנסים לעסקאות: רדומים, מעקבים, המרות — הכסף הקרוב ביותר.', owner: 'אריק', kpi_label: '₪ מיוחס החודש', next_action: 'לסגור את שלוש הצעות המחיר הפתוחות מעל ₪50K', source: 'david' },
    aw: AW(2, [['2f325a31', 'WAITING_APPROVAL', 'תאחדי את ההמייל למילטוניה ותהקשי את שני הפריסות למניפה ולכרטיס'], ['264acac9', 'WAITING_APPROVAL', 'תבדקי במייל שלי בגרנונאת הבקשה למניפות בצורה ברורה']]) },
  { key: 'purchasing', name: 'רכש', state: 'LIVE', metrics: [M('ספקים בפנקס', 1508, 'supplier · SUPPLIERS מפריוריטי'), M('מחירונים', 17, 'supplier_pricelist · PRICELIST מפריוריטי')], cmds: ['import_independence'], ceo: null, registry: { source: 'seed' } },
  { key: 'operations', name: 'ייצור ותפעול', state: 'LIVE', metrics: [M('פריטים בקטלוג השרפוינט', 81371, 'sharepoint_catalog'), M('תעודות משלוח', 43580, 'delivery_note · DOCUMENTS_D'), M('ריצות סנכרון', 4, 'sync_run')], cmds: ['sync'], ceo: null,
    registry: { goal: 'לענות בזמן-אמת: מה המלאי, מה העומס, איפה הצוואר, כמה עולה — ולהזין את "איך מוזילים".', source: SEED } },
  { key: 'rnd', name: 'מו"פ', state: 'LIVE', metrics: [M('נכסי ידע', 1809, 'knowledge_asset'), M('מוצרים', 2675, 'product'), M('ראיות מוצר', 2, 'artifact · product-evidence')], cmds: ['lab', 'completeness'], ceo: 'תעודת תקן חתומה',
    registry: { goal: 'לסגור פערי-ידע בשאלות ממוקדות, לנהל השערות וניסויים, ולהפוך כל מבצע ללקח.', source: SEED }, aw: AW(1, [['a1a1ce0d', 'QUEUED', 'תחזוקה מבוקרת (הוראת דוד 15.9) — סריקה → תיקון → אימות חי → הבעיה הבאה']]) },
  { key: 'capital', name: 'כספים והון', state: 'EMPTY', metrics: [M('הזדמנויות מימון', 0, 'funding_opportunity'), M('הכנסה מיוחסת', 'לא-מדיד', 'attribution — חסום F1')], cmds: ['attribution'], ceo: 'חוזה המדדים — markup מול מרווח גולמי', registry: { source: 'seed' } },
];
let TOWER = { departments: D.map((d) => ({ ...d, note: '', stuck: d.state === 'EMPTY' ? 'הטבלאות קיימות וריקות — כל המדדים אפס' : '', next: d.registry.next_action || '',
  management: card({ state: d.state, goal: d.registry.goal, owner: d.registry.owner, metrics: d.metrics, aw: d.aw, blocker: d.state === 'EMPTY' ? 'הטבלאות קיימות וריקות — כל המדדים אפס' : null, next: d.registry.next_action, ceo: d.ceo, src: d.registry.source }) })) };
let writes = [];

async function open(viewport, tag) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL', deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'tower') return j(TOWER);
    if (body.action === 'department_set') {
      writes.push(body);
      const d = TOWER.departments.find((x) => x.key === body.key);
      if (d) { d.registry = { ...d.registry, goal: body.goal, owner: body.owner, kpi_label: body.kpi_label, next_action: body.next_action, blocker: body.blocker, source: 'david' };
        d.management = { ...d.management, goal: body.goal || null, owner: body.owner || null, next_action: body.next_action || null, goal_source: body.goal ? 'david' : null }; }
      return j({ ok: true, department: d ? d.registry : null });
    }
    if (body.action === 'cap') return j({ rows: [], source: '' });
    if (body.action === 'sales') return j({ today_orders: 0, today_amount: 0, top_customers: [], source: 'ORDERS' });
    if (body.action === 'chat_sync' || body.action === 'chat_new') return j({ conversation_id: 'c1', messages: [], cursor: '' });
    j({ ok: true, items: [], objects: [], queue: [], model: true, counts: { active: 0, canonical: 0, pending_notes: 0, expired: 0 } });
  });
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); localStorage.setItem('rail:kpiCard', '1'); localStorage.setItem('rail:orgMobile', '0'); });
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  await page.addStyleTag({ content: '#clock{visibility:hidden!important}*{animation:none!important;transition:none!important}' });
  return { page, ctx };
}

// ── desktop: the rail ──
{
  const tag = 'org-1440x900';
  const { page, ctx } = await open({ width: 1440, height: 900 }, tag);
  await page.waitForFunction(() => document.querySelectorAll('#orgList .orgItem').length === 8, null, { timeout: 8000 });
  await page.click('#orgWrap summary');
  await page.waitForSelector('#orgWrap[open]', { timeout: 3000 });
  await page.waitForTimeout(200);
  const rows = await page.$$eval('#orgList .orgItem', (xs) => xs.map((x) => ({ key: x.getAttribute('data-org'), cls: x.className, text: x.innerText.replace(/\s+/g, ' ').trim() })));
  ok(`${tag}: eight rows, the computed states on the dots (capital EMPTY)`, rows.length === 8 && rows.find((r) => r.key === 'capital').cls.includes('s-EMPTY'), JSON.stringify(rows.map((r) => r.key + ':' + r.cls)));
  ok(`${tag}: purchasing shows the Priority register, not MISSING`, /1508 ספקים בפנקס/.test(rows.find((r) => r.key === 'purchasing').text), rows.find((r) => r.key === 'purchasing').text);
  await page.click('#orgList .orgItem[data-org="sales"]');
  await page.waitForSelector('#orgDetail_sales.on', { timeout: 4000 });
  const det = await page.$eval('#orgDetail_sales', (x) => x.innerText.replace(/\s+/g, ' '));
  ok(`${tag}: the sales card carries David's row — goal, owner, KPI in his words, next action`, /מטרה: להפוך קשרים/.test(det) && /אחראי: אריק/.test(det) && /KPI: ₪ מיוחס החודש/.test(det) && /הפעולה הבאה: לסגור את שלוש/.test(det), det.slice(0, 400));
  ok(`${tag}: the department's queue lists its packages in Hebrew`, /2 חבילות/.test(det) && /ממתינה לאישורך · 2f325a31/.test(det), det.slice(0, 600));
  ok(`${tag}: a row David filled offers "עדכון המחלקה"`, /עדכון המחלקה ✎/.test(det));
  await page.screenshot({ path: OUT + tag + '-1-sales-card.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  const rail = await page.$('#railL') || await page.$('#orgWrap');
  if (rail) await rail.screenshot({ path: OUT + tag + '-2-rail.png' });
  // a seeded department: the goal is marked as proposed, the button says "מלא"
  await page.click('#orgList .orgItem[data-org="marketing"]');
  await page.waitForSelector('#orgDetail_marketing.on', { timeout: 4000 });
  const mk = await page.$eval('#orgDetail_marketing', (x) => x.innerText.replace(/\s+/g, ' '));
  ok(`${tag}: a seeded goal says it is proposed, not his word`, /מוצע מהמפרט — טרם אושר/.test(mk) && /מלא את המחלקה ✎/.test(mk), mk.slice(0, 300));
  // open the form, fill it, save → the card re-reads the tower
  await page.click('[data-orgedit="marketing"]');
  await page.waitForSelector('#orgEdit_marketing.on', { timeout: 3000 });
  const prefilled = await page.$eval('#orgEdit_marketing textarea[name=goal]', (x) => x.value);
  ok(`${tag}: the form is prefilled with the seed so he edits instead of retyping`, /לייצר ולהפעיל/.test(prefilled), prefilled);
  await page.fill('#orgEdit_marketing input[name=owner]', 'דוד');
  await page.fill('#orgEdit_marketing input[name=kpi_label]', 'פניות נכנסות בחודש');
  await page.fill('#orgEdit_marketing input[name=next_action]', 'לפרסם את עמוד הפרויקט של תל אביב');
  await (await page.$('#orgWrap')).screenshot({ path: OUT + tag + '-3-form.png' });
  await page.click('#orgEdit_marketing button[type=submit]');
  await page.waitForFunction(() => /נשמר/.test((document.querySelector('#orgEdit_marketing .res') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => null);
  const after = await page.$eval('#orgDetail_marketing', (x) => x.innerText.replace(/\s+/g, ' '));
  ok(`${tag}: one write went through department_set with his words`, writes.length === 1 && writes[0].key === 'marketing' && writes[0].owner === 'דוד', JSON.stringify(writes));
  ok(`${tag}: after the save the card shows the tower's re-read — owner, next action, no "מוצע" marker, button now "עדכון"`, /אחראי: דוד/.test(after) && /הפעולה הבאה: לפרסם/.test(after) && !/מוצע מהמפרט/.test(after) && /עדכון המחלקה/.test(after), after.slice(0, 500));
  await (await page.$('#orgWrap')).screenshot({ path: OUT + tag + '-4-saved.png' });
  await ctx.close();
}

// ── phone: the drawer ──
{
  /* the phone is conversation-first (David 30.9): the ORGANIZATION card is hidden there; a department opens by its
     route — #org/<key> — in the shared drawer, which is how a notification or a link lands on it */
  const tag = 'org-390x844';
  const { page, ctx } = await open({ width: 390, height: 844 }, tag);
  await page.evaluate(() => { location.hash = '#org/sales'; });
  await page.waitForSelector('#evDrawer.on', { timeout: 6000 });
  await page.screenshot({ path: OUT + tag + '-1-drawer.png' });
  const body = await page.$eval('#evBody', (x) => x.innerText.replace(/\s+/g, ' '));
  ok(`${tag}: the drawer carries the same card and the same form`, /אחראי: אריק/.test(body) && /עדכון המחלקה ✎/.test(body), body.slice(0, 300));
  await page.click('#evBody [data-orgedit="sales"]');
  await page.waitForSelector('#evBody #orgEdit_sales.on', { timeout: 3000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(`${tag}: no horizontal overflow with the form open`, !overflow);
  await page.screenshot({ path: OUT + tag + '-2-drawer-form.png' });
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); bad++; }
console.log(`\n${total - bad}/${total} organizer-map screen asserts passed${bad ? ' · ' + bad + ' FAILED' : ''}`);
process.exit(bad ? 1 : 0);
