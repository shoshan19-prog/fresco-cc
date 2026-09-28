// The Command Center, driven in a real browser (David, 28.9): a phone viewport
// and the desktop, RTL Hebrew, long titles, zero and many packages, a package
// that needs David, verified and unverified completion, a stale RUNNING, a
// package with no progress. Network stubbed like qa-visual.mjs — the fixture
// is shaped exactly like `tower` and `cap work_status` answer in production.
// Screenshots: qa/cc-*.png (Overview, one domain drill-down, the detail).
//   node --experimental-strip-types qa-command-center.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const PAGE = 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));
const OUT = fileURLToPath(new URL('./qa/', import.meta.url));
mkdirSync(OUT, { recursive: true });
let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } else console.log(`ok    ${l}`); };

const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString();
const ID = (n) => `${n.toString(16).padStart(8, '0')}0000000000000000000000000`;
const base = (id, over) => Object.assign({
  work_id: ID(id), kind: 'build', objective: 'חבילה', status: 'QUEUED', state: 'QUEUED', state_label: 'בתור', status_line: '',
  lease: null, lease_alive: false, worker_quiet: false, current_step: null, next_step: null, blocker: null, result: null, outcome: null,
  items: [], progress: null, created_at: iso(3000), updated_at: iso(200), started_at: null, completed_at: null, owner: 'lia', worker: null,
  approval_required: false, waiting_on: null, liveness: { state: 'RUNNABLE', why: '', fake_wait: false, missing: [] }, verifications: [],
  verification_required: false, scope: { original_goal: '', required: [], completed: [], remaining: [], blocked: [], next: '', source: 'none' },
  object_state: 'ACTIVE', disposition: null, parked_for_david: false, goal: null, success_condition: null, heartbeat_at: null,
  steps: [], steps_total: 0, completion_evidence: null, requested_by: 'david', project_id: null, closure: null,
}, over);
// the canonical closure as workClosureProjection emits it — the page renders it, never rebuilds it
const closure = (key, label, over) => Object.assign({ key, label, presence: 'UNCHECKED', presence_detail: 'החבילה לא נסגרה — התוצר עוד לא נבדק', progress: null, stage: 'QUEUED',
  verified_by: 'NONE', verification_required: false, evidence_ref: null, product: { kind: 'self_result', ref: null, declared: false },
  delivery: { result: '', ref: null, ref_kind: null, notice: 'NONE', interface_complete: false } }, over);

const ALIVE = [
  base(1, { kind: 'mail_reply', objective: 'תשובה למורן על הצעת המחיר לפרויקט הגג', goal: 'לענות למורן עם הצעה מעודכנת', status: 'WAITING_APPROVAL', state: 'WAITING_APPROVAL',
    approval_required: true, waiting_on: 'david', blocker: 'הכרעת דוד: אישור או דחייה של טיוטת המייל', current_step: 'הטיוטה מוכנה',
    items: [{ id: 'acc:1', status: 'VERIFIED' }, { id: 'acc:2', status: 'VERIFIED' }, { id: 'acc:3', status: 'VERIFIED' }, { id: 'acc:4', status: 'OPEN' }, { id: 'acc:5', status: 'OPEN' }],
    closure: closure('OPEN', 'בעבודה', { progress: { done: 3, total: 5, source: 'ACCEPTANCE' }, stage: 'הטיוטה מוכנה', verification_required: true }), updated_at: iso(120), steps: [{ step: 'draft', at: iso(130), note: 'טיוטה נכתבה', ok: true }], steps_total: 1 }),
  base(2, { kind: 'research', objective: 'מחקר שוק: צבעי הגנה לגגות תעשייתיים בצפון', goal: 'להגדיל את ההזדמנויות במגזר התעשייתי', status: 'RUNNING', state: 'RUNNING', state_label: 'רץ',
    lease: { worker: 'lia-worker', principal: 'lia', acquired_at: iso(9), expires_at: new Date(NOW + 6 * 60_000).toISOString() }, lease_alive: true, worker_quiet: false,
    heartbeat_at: iso(2), current_step: 'קוראת את 40 המיילים האחרונים מלקוחות תעשייה', updated_at: iso(2), started_at: iso(30) }),
  base(3, { kind: 'build', objective: 'לבנות גישה ליומן Outlook — פגישות קרובות בשיחה', status: 'RUNNING', state: 'RUNNING', state_label: 'רץ',
    lease: { worker: 'engineering_lane', principal: 'lia', acquired_at: iso(3000), expires_at: iso(2900) }, lease_alive: false, updated_at: iso(2900), started_at: iso(3000),
    current_step: 'engineering_task_opened' }),
  base(4, { kind: 'engineering', objective: 'תיקון: ההודעה "התור נקטע" אחרי 546 בתחזית', status: 'QUEUED', state: 'QUEUED',
    blocker: 'מוקפא — LIA STABILIZATION 15.9: אין פתיחת עבודה חדשה עד סיום הייצוב', updated_at: iso(20000) }),
  base(5, { kind: 'other', objective: 'הזמנת דוגמאות מהספק באיטליה — ממתין לאישור המחיר', status: 'WAITING_EXTERNAL', state: 'WAITING_EXTERNAL', state_label: 'ממתין לגורם חיצוני',
    waiting_on: 'הספק באיטליה — אישור מחיר', updated_at: iso(1500) }),
  base(6, { kind: 'build', objective: 'מסך ניסויים חדש למטריאה — הכרעה על מבנה הנתונים', status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', state_label: 'ממתין — פנימי',
    disposition: 'NEEDS_DAVID_DECISION', parked_for_david: true, blocker: 'שתי חלופות למבנה — הכרעת דוד', updated_at: iso(400) }),
  base(7, { kind: 'audit', objective: 'ביקורת מלאה של כל תהליכי המכירה, השיווק והתפעול ברבעון האחרון כולל ניתוח של כל ההזמנות שנכנסו מלקוחות חוזרים ומלקוחות חדשים ומה נלמד מהן לרבעון הבא',
    status: 'QUEUED', state: 'QUEUED', updated_at: iso(90) }),
  base(8, { kind: 'maintenance', objective: 'לולאת התחזוקה של LIA', status: 'RUNNING', state: 'RUNNING', state_label: 'רץ',
    lease: { worker: 'maintenance', principal: 'lia', acquired_at: iso(50), expires_at: new Date(NOW + 10 * 60_000).toISOString() }, lease_alive: true, worker_quiet: true, heartbeat_at: iso(50), updated_at: iso(50) }),
];
const CLOSED = [
  base(11, { kind: 'research', objective: 'דוח מצב יומי: מכירות, שיווק ותפעול', status: 'DONE', state: 'DONE', state_label: 'הושלם', completed_at: iso(30), object_state: 'EXPIRED',
    verifications: [{ verifier: 'ci', kind: 'independent', evidence_ref: 'run 1', result: 'PASS', at: iso(28) }],
    completion_evidence: { complete: true, detail: 'שלם: 5120 תווים, 2/2 חלקים', checked_at: iso(29), deliverable_kind: 'lia_object', deliverable_ref: 'REPORT:x', sections_missing: [], truncated: false },
    result: 'הדוח נשמר', steps: [{ step: 'done', at: iso(30), note: null, ok: true }], steps_total: 1,
    closure: closure('DONE_VERIFIED', 'הושלם · אומת', { presence: 'PRESENT', presence_detail: 'שלם: 5120 תווים, 2/2 חלקים', stage: 'DONE', verified_by: 'INDEPENDENT', verification_required: true, evidence_ref: 'run 1',
      product: { kind: 'lia_object', ref: 'REPORT:x', declared: true }, delivery: { result: 'הדוח נשמר', ref: 'REPORT:x', ref_kind: 'lia_object', notice: 'SENT', interface_complete: true } }) }),
  base(12, { kind: 'build', objective: 'עדכון כרטיסי המחלקות', status: 'DONE', state: 'DONE', state_label: 'הושלם', completed_at: iso(90), object_state: 'EXPIRED', result: 'הכרטיסים עודכנו',
    closure: closure('DONE_COMPLETE', 'הושלם · לא אומת', { presence: 'PRESENT', presence_detail: 'התוצר הוא תוצאת החבילה עצמה (self_result משתמע) — קיימת', stage: 'DONE',
      delivery: { result: 'הכרטיסים עודכנו', ref: null, ref_kind: null, notice: 'SENT', interface_complete: true } }) }),
  base(14, { kind: 'build', objective: 'סגירה ריקה מהעבר', status: 'DONE', state: 'DONE', state_label: 'הושלם', completed_at: iso(60 * 40), object_state: 'EXPIRED',
    completion_evidence: { complete: false, detail: 'התוצר לא נקרא חזרה מהאחסון', checked_at: iso(60 * 40), deliverable_kind: 'self_result', deliverable_ref: '', sections_missing: ['סיכום'], truncated: false },
    closure: closure('DONE_HOLLOW', 'הושלם · אין תוצר', { presence: 'MISSING', presence_detail: 'התוצר לא נקרא חזרה מהאחסון', stage: 'DONE' }) }),
  base(13, { kind: 'engineering', objective: 'ניסיון תיקון שנכשל', status: 'FAILED', state: 'FAILED', state_label: 'נכשל', completed_at: iso(60 * 30), object_state: 'EXPIRED', outcome: 'הבדיקה לא עברה' }),
];
const DEPT = (key, name, ids) => ({ key, name, state: 'LIVE', metrics: [{ label: 'מדד', value: 3, source: 'x' }], stuck: '', next: 'הבא', ceo: null,
  management: { status: 'LIVE', goal: null, owner: null, kpi: [], active_work: { count: ids.length, ids, top: ids.slice(0, 3).map((id8) => ({ id8, status: 'x', head: '' })) }, blocker: null, next_action: 'הבא', needs_david: null } });
const id8 = (n) => ID(n).slice(0, 8);
const TOWER = {
  generated_at: new Date(NOW).toISOString(),
  departments: [
    DEPT('branding', 'מיתוג', []), DEPT('marketing', 'שיווק', [id8(2)]), DEPT('advertising', 'פרסום', []),
    DEPT('sales', 'מכירות', [id8(1), id8(2)]), DEPT('purchasing', 'רכש', [id8(5)]), DEPT('operations', 'ייצור ותפעול', []),
    DEPT('rnd', 'מו"פ', [id8(6)]), DEPT('capital', 'כספים והון', []),
  ],
  projects: [{ project_id: 'matriya', name: 'מטריאה', domain: 'rnd', goal: 'מערכת מומחה למעבדה', state: 'RUNNING', next_action: '—', waiting_on: '—', work: { linked: [ID(6)], wip: 0, waiting: 1, live: 1, states: {} } }],
  approvals: [{ id: 'r1', project_name: 'גג תעשייתי', claim: 'לפרסם את עמוד הפרויקט של גג המפעל בעכו', why_now: 'הלקוח אישר את הצילומים', confidence_label: 'גבוה' }],
  alerts: [], work_running: [], next_action: { what: '', why: '' }, changed: [], opportunities: { count: 0, signals: 0 }, deliverables: { count: 0, recent: [] }, money: {}, manifest: [], totals: {},
};
const EMPTY_TOWER = Object.assign({}, TOWER, { approvals: [], alerts: [], projects: [], departments: TOWER.departments.map((d) => Object.assign({}, d, { management: Object.assign({}, d.management, { active_work: { count: 0, ids: [], top: [] } }) })) });

async function stub(page, scenario) {
  await page.route('**/functions/v1/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.action === 'status') return j({ setup: false });
    if (body.action === 'tower') return j(scenario === 'empty' ? EMPTY_TOWER : TOWER);
    if (body.action === 'cap' && body.name === 'work_status') {
      const rows = scenario === 'empty' ? [] : (body.args && body.args.closed_since ? CLOSED : ALIVE);
      return j({ capability: 'work_status', source: 'WORK', row_count: rows.length, rows });
    }
    return j({ ok: true, rows: [] });
  });
}
const layout = (page) => page.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const over = document.documentElement.scrollWidth - W;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.left < -1 || r.right > W + 1) out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  const nested = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.id === 'detail') continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) nested.push(el.tagName + '#' + el.id + '.' + el.className);
  }
  return { over, out: out.slice(0, 5), nested };
});

const browser = await chromium.launch();
const errors = [];
for (const [vp, tag] of [[{ width: 390, height: 844 }, 'mobile'], [{ width: 1280, height: 900 }, 'desktop']]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', deviceScaleFactor: 2, isMobile: tag === 'mobile', hasTouch: tag === 'mobile' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  await stub(page, 'full');
  // the chat's own code is enough — one login for both surfaces
  await page.addInitScript(() => { localStorage.setItem('lia_code', 'qa'); });
  await page.goto(PAGE);
  await page.waitForSelector('#app.on', { state: 'visible', timeout: 8000 });
  await page.waitForSelector('.row', { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}cc-${tag}-1-overview.png`, fullPage: tag === 'mobile' });

  const L = await layout(page);
  ok(`${tag}: no horizontal overflow`, L.over <= 0, `overflow=${L.over}`);
  ok(`${tag}: nothing clipped outside the viewport (RTL)`, L.out.length === 0, L.out.join(' | '));
  ok(`${tag}: no internal scrollbars — the page itself scrolls`, L.nested.length === 0, L.nested.join(' | '));

  const sum = await page.evaluate(() => [...document.querySelectorAll('.sum b')].map((b) => b.textContent));
  ok(`${tag}: the four numbers — 8 active · 3 need David (2 packages + 1 recommendation) · 1 moving · 1 finished today verified`, sum.join(',') === '8,3,1,1', sum.join(','));
  const notes = await page.evaluate(() => [...document.querySelectorAll('.note')].map((n) => n.textContent));
  ok(`${tag}: stale RUNNING rows are named and not counted as moving`, notes.some((n) => /2 חבילות רשומות כרצות ללא סימן חיים/.test(n)), notes.join(' | '));
  ok(`${tag}: an unverified completion today is named and kept out of the green`, notes.some((n) => /\+1 הושלמו היום ללא אימות/.test(n)), notes.join(' | '));
  ok(`${tag}: unattributed packages are counted, in the overview only`, notes.some((n) => /2 חבילות ללא שיוך לתחום/.test(n)), notes.join(' | '));

  ok(`${tag}: NEEDS DAVID section present with its count`, await page.evaluate(() => { const s = document.getElementById('needs'); return !!s && s.textContent.includes('3'); }));
  const feat = await page.evaluate(() => [...document.querySelectorAll('.feat')].map((f) => ({ pct: (f.querySelector('.pct') || {}).textContent || '', ms: f.querySelectorAll('.ms .m').length, done: f.querySelectorAll('.ms .m.done').length, sig: f.querySelector('.sig').textContent, stage: (f.querySelector('.stage') || {}).textContent || '' })));
  ok(`${tag}: the mail package shows 60% and 5 milestones (3 done) — from its own items`, feat.some((f) => f.pct === '60%' && f.ms === 5 && f.done === 3), JSON.stringify(feat));
  ok(`${tag}: the parked package shows no percentage — its stage as text`, feat.some((f) => f.pct === '' && f.ms === 0), JSON.stringify(feat));
  const sigColor = await page.evaluate(() => getComputedStyle(document.querySelector('.feat .sig')).color);
  ok(`${tag}: the needs-David signal is the small orange, not red, not blue`, /rgb\(199, 119, 0\)/.test(sigColor), sigColor);

  const rows = await page.evaluate(() => [...document.querySelectorAll('.row:not(.done)')].map((r) => ({
    t: r.querySelector('.ttl').textContent.slice(0, 20), lbl: r.querySelector('.lbl').textContent, color: getComputedStyle(r.querySelector('.lbl')).color,
    pct: (r.querySelector('.pr b') || {}).textContent || '', stage: (r.querySelector('.pr .stage') || {}).textContent || '' })));
  const moving = rows.find((r) => r.t.startsWith('מחקר שוק'));
  ok(`${tag}: RUNNING with a live lease and a fresh heartbeat = בתנועה, green, stage text, no invented percentage`, moving && moving.lbl === 'בתנועה' && /rgb\(18, 161, 80\)/.test(moving.color) && moving.pct === '' && moving.stage.startsWith('קוראת את 40'), JSON.stringify(moving));
  const stale = rows.find((r) => r.t.startsWith('לבנות גישה'));
  ok(`${tag}: RUNNING with a dead lease = רשום כרץ · אין סימן חיים, grey`, stale && stale.lbl === 'רשום כרץ · אין סימן חיים' && !/rgb\(18, 161, 80\)/.test(stale.color), JSON.stringify(stale));
  const quiet = rows.find((r) => r.t.startsWith('לולאת התחזוקה'));
  ok(`${tag}: RUNNING with a live lease but a quiet worker is not moving`, quiet && quiet.lbl === 'רץ · אין פעימה מהעובד', JSON.stringify(quiet));
  const frozen = rows.find((r) => r.t.startsWith('תיקון:'));
  ok(`${tag}: a QUEUED row with an old blocker shows it as a recorded blocker, not as a live state`, frozen && frozen.lbl === 'בתור · חסם רשום', JSON.stringify(frozen));
  ok(`${tag}: the first active row is the moving one, the stale ones after it, the queue last`, rows.length >= 5 && rows[0].lbl === 'בתנועה' && rows[rows.length - 1].lbl.startsWith('בתור'), JSON.stringify(rows.map((r) => r.lbl)));
  const longRow = await page.evaluate(() => { const r = [...document.querySelectorAll('.row .ttl')].find((t) => t.textContent.startsWith('ביקורת מלאה')); const b = r.getBoundingClientRect(); return { h: b.height, w: b.width, right: b.right, W: document.documentElement.clientWidth }; });
  ok(`${tag}: a very long Hebrew title clamps to two lines inside the row`, longRow.h < 52 && longRow.right <= longRow.W + 1, JSON.stringify(longRow));

  const done = await page.evaluate(() => [...document.querySelectorAll('.row.done')].map((r) => ({ t: r.querySelector('.ttl').textContent.slice(0, 12), lbl: r.querySelector('.lbl').textContent, ok: r.classList.contains('ok'), icon: getComputedStyle(r.querySelector('.ic')).color })));
  ok(`${tag}: the verified completion is the only green check`, done.filter((d) => d.ok).length === 1 && done.find((d) => d.ok).lbl === 'הושלם · אומת' && /rgb\(18, 161, 80\)/.test(done.find((d) => d.ok).icon), JSON.stringify(done));
  ok(`${tag}: a DONE without evidence reads הושלם · לא אומת and is not green`, done.some((d) => d.lbl === 'הושלם · לא אומת' && !d.ok), JSON.stringify(done));
  ok(`${tag}: a FAILED close is listed, grey, as history — never deleted`, done.some((d) => d.lbl === 'נכשל' && !d.ok), JSON.stringify(done));
  ok(`${tag}: a DONE whose product is missing reads הושלם · אין תוצר — the server's closure word, not green`, done.some((d) => d.lbl === 'הושלם · אין תוצר' && !d.ok), JSON.stringify(done));

  const targets = await page.evaluate(() => ({
    dom: Math.min(...[...document.querySelectorAll('#domains button')].map((b) => b.getBoundingClientRect().height)),
    nav: Math.min(...[...document.querySelectorAll('#bottom a')].map((b) => b.getBoundingClientRect().height)),
    row: Math.min(...[...document.querySelectorAll('.row')].map((b) => b.getBoundingClientRect().height)),
    tools: Math.min(...[...document.querySelectorAll('.tools button, .tools a')].map((b) => b.getBoundingClientRect().height)) }));
  ok(`${tag}: comfortable touch targets (domain ≥48, nav ≥48, row ≥56, tools ≥40)`, targets.dom >= 48 && targets.nav >= 48 && targets.row >= 56 && targets.tools >= 40, JSON.stringify(targets));
  const nav = await page.evaluate(() => [...document.querySelectorAll('#bottom a')].map((a) => a.getAttribute('href') + (a.classList.contains('on') ? '*' : '')));
  ok(`${tag}: bottom nav is exactly Chat · Command Center · History · Settings`, nav.join(' ') === 'lia.html index.html* lia.html#history lia.html#settings', nav.join(' '));
  ok(`${tag}: the bell counts what needs him`, (await page.evaluate(() => document.querySelector('#bellBtn .badge').textContent)) === '3');
  ok(`${tag}: no tagline`, !(await page.evaluate(() => document.body.textContent.includes('כל העבודה במקום אחד'))));

  // ── the domain drill-down ────────────────────────────────────────────────
  await page.click('#domains button[data-v="matriya"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}cc-${tag}-2-matriya.png`, fullPage: tag === 'mobile' });
  const dom = await page.evaluate(() => ({
    hash: location.hash, on: document.querySelector('#domains button.on').getAttribute('data-v'),
    dept: [...document.querySelectorAll('.dept .nm')].map((n) => n.textContent),
    rows: [...document.querySelectorAll('.feat .ttl, .row .ttl')].map((t) => t.textContent.slice(0, 14)),
    sum: [...document.querySelectorAll('.sum b')].map((b) => b.textContent).join(','),
    needs: !!document.getElementById('needs') }));
  ok(`${tag}: מטריאה shows its department strip and its project, and only its own packages`, dom.on === 'matriya' && dom.hash === '#matriya' && dom.dept.includes('מו"פ') && dom.dept.includes('מטריאה') && dom.rows.length === 1 && dom.rows[0].startsWith('מסך ניסויים'), JSON.stringify(dom));
  ok(`${tag}: the domain's numbers are the domain's — 1 active, 1 needs him`, dom.sum === '1,1,0,0' && dom.needs, dom.sum);
  const L2 = await layout(page);
  ok(`${tag}: drill-down — no overflow, nothing clipped`, L2.over <= 0 && L2.out.length === 0, JSON.stringify(L2));
  const sel = await page.evaluate(() => ({ on: getComputedStyle(document.querySelector('#domains button.on')).color, off: getComputedStyle(document.querySelector('#domains button:not(.on)')).color }));
  ok(`${tag}: the selected domain is LIA blue, the others grey`, /rgb\(47, 107, 255\)/.test(sel.on) && /rgb\(102, 112, 133\)/.test(sel.off), JSON.stringify(sel));

  await page.click('#domains button[data-v="sales"]');
  await page.waitForTimeout(150);
  const sales = await page.evaluate(() => [...document.querySelectorAll('.feat .ttl, .row:not(.done) .ttl')].map((t) => t.textContent.slice(0, 10)));
  ok(`${tag}: מכירות gathers the two packages the tower attributes to it`, sales.length === 2 && sales.some((t) => t.startsWith('תשובה למו')) && sales.some((t) => t.startsWith('מחקר שוק')), JSON.stringify(sales));
  await page.click('#domains button[data-v="operations"]');
  await page.waitForTimeout(150);
  const opsRows = await page.evaluate(() => ({ live: [...document.querySelectorAll('.feat .ttl, .row:not(.done) .ttl')].map((t) => t.textContent.slice(0, 10)), closed: [...document.querySelectorAll('.row.done .ttl')].map((t) => t.textContent.slice(0, 10)) }));
  ok(`${tag}: תפעול gathers LIA's own engineering/maintenance kinds and the purchasing wait — and its own failed close as history`, opsRows.live.length === 3 && opsRows.closed.length === 1 && opsRows.closed[0].startsWith('ניסיון'), JSON.stringify(opsRows));

  // ── the detail ───────────────────────────────────────────────────────────
  await page.click('#domains button[data-v="overview"]');
  await page.waitForTimeout(150);
  await page.click('.feat');
  await page.waitForSelector('#detail.on', { timeout: 3000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}cc-${tag}-3-detail.png`, fullPage: false });
  const det = await page.evaluate(() => ({ h: [...document.querySelectorAll('#detail h3')].map((x) => x.textContent), txt: document.getElementById('db').textContent, ms: document.querySelectorAll('#detail .ms .m').length, W: document.documentElement.clientWidth, w: document.getElementById('detail').scrollWidth }));
  ok(`${tag}: the detail carries goal · where it stands · blockers · evidence · history · details`, ['המטרה', 'איפה זה עומד', 'חסמים', 'ראיות', 'היסטוריה', 'פרטים'].every((x) => det.h.includes(x)), JSON.stringify(det.h));
  ok(`${tag}: the detail shows the 5 milestones and the decision the row is waiting for`, det.ms === 5 && det.txt.includes('הכרעת דוד') && det.txt.includes('60%'), String(det.ms));
  ok(`${tag}: the detail does not overflow`, det.w <= det.W, `${det.w} > ${det.W}`);
  await page.click('#back');
  await page.waitForTimeout(100);
  ok(`${tag}: back closes the detail`, !(await page.evaluate(() => document.getElementById('detail').classList.contains('on'))));
  // a stale RUNNING's detail names the missing signal
  await page.evaluate(() => [...document.querySelectorAll('.row .ttl')].find((t) => t.textContent.startsWith('לבנות גישה')).closest('.row').click());
  await page.waitForSelector('#detail.on', { timeout: 3000 });
  const staleDet = await page.evaluate(() => document.getElementById('db').textContent);
  ok(`${tag}: a stale RUNNING's detail says the lease is dead and names reconciliation`, /חוזה על החבילה · פג/.test(staleDet) && /דורש התאמה למציאות/.test(staleDet));
  await page.click('#back');

  // ── search ───────────────────────────────────────────────────────────────
  await page.click('#searchBtn');
  await page.fill('#q', 'איטליה');
  await page.waitForTimeout(150);
  const found = await page.evaluate(() => [...document.querySelectorAll('.row:not(.done) .ttl')].map((t) => t.textContent.slice(0, 10)));
  ok(`${tag}: search narrows the active work`, found.length === 1 && found[0].startsWith('הזמנת דוגמ'), JSON.stringify(found));
  await page.click('#searchBtn');
  await page.waitForTimeout(100);
  ok(`${tag}: closing the search restores the list`, (await page.evaluate(() => document.querySelectorAll('.row:not(.done)').length)) === 6);

  // ── zero work ────────────────────────────────────────────────────────────
  await page.unroute('**/functions/v1/**');
  await stub(page, 'empty');
  await page.reload();
  await page.waitForSelector('#app.on', { state: 'visible', timeout: 8000 });
  await page.waitForSelector('.empty', { timeout: 8000 });
  const empty = await page.evaluate(() => ({ needs: !!document.getElementById('needs'), sum: [...document.querySelectorAll('.sum b')].map((b) => b.textContent).join(','), empties: document.querySelectorAll('.empty').length, bell: !!document.querySelector('#bellBtn .badge') }));
  ok(`${tag}: with nothing to decide the NEEDS DAVID section is gone, the bell is quiet, zeros are zeros`, !empty.needs && empty.sum === '0,0,0,0' && empty.empties === 2 && !empty.bell, JSON.stringify(empty));
  if (tag === 'mobile') await page.screenshot({ path: `${OUT}cc-${tag}-4-empty.png`, fullPage: false });
  await ctx.close();
}
await browser.close();
ok('no page errors, no console errors', errors.length === 0, errors.join(' | '));
console.log(`\n${total - bad}/${total} checks passed · screenshots in qa/cc-*.png`);
process.exit(bad ? 1 : 0);
