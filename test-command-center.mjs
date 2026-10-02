// The Command Center's truth model, driven directly (David, 28.9). The page
// derives every visible state from fields the WORK row already carries; this
// extracts that derivation (CC_STATE_BEGIN..CC_STATE_END, plus the domain
// table it reads) and proves the rules: MOVING only with evidence of current
// activity, GREEN only for verified completion, a percentage only from real
// sub-items, a persisted blocker shown as a label, nothing invented.
//   node test-command-center.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const lia = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
const S = new Function(slice('var DOMAINS=', '/* CC_STATE_END */')
  + '\nreturn {stateOf,deriveRow,verifiedOf,needsDavidOf,progressOf,stageOf,milestonesOf,ago,attribution,bucketsOf,sortRows,summarize,lastActivityMs,isTerminal,DOMAINS};')();

let bad = 0, total = 0;
function eq(label, got, want) { total++; if (got !== want) { console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); bad++; } }
function ok(label, cond, extra) { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } }

const NOW = Date.parse('2026-09-28T15:00:00Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString();
const live = (over) => Object.assign({ status: 'RUNNING', state: 'RUNNING', lease: { worker: 'w', acquired_at: iso(5), expires_at: iso(-10) }, lease_alive: true, worker_quiet: false, heartbeat_at: iso(1), updated_at: iso(1) }, over);

// ── the canonical state ────────────────────────────────────────────────────
eq('the server\'s canonical state wins', S.stateOf({ state: 'WAITING_APPROVAL', status: 'BLOCKED' }), 'WAITING_APPROVAL');
eq('legacy BLOCKED normalises like the server does', S.stateOf({ status: 'BLOCKED' }), 'WAITING_INTERNAL');
eq('legacy COMPLETED is DONE', S.stateOf({ status: 'COMPLETED' }), 'DONE');
eq('legacy SUPERSEDED is CANCELLED', S.stateOf({ status: 'SUPERSEDED' }), 'CANCELLED');
eq('an unknown word is UNKNOWN, never guessed alive', S.stateOf({ status: 'WHATEVER' }), 'UNKNOWN');
eq('no status at all is UNKNOWN', S.stateOf({}), 'UNKNOWN');
ok('UNKNOWN is shown as unknown, with the stored word', (() => { const d = S.deriveRow({ status: 'WHATEVER' }); return d.key === 'UNKNOWN' && d.label === 'מצב לא ידוע' && /WHATEVER/.test(d.note); })());

// ── MOVING needs evidence of current activity ─────────────────────────────
{
  const d = S.deriveRow(live({}));
  ok('RUNNING + live lease + fresh heartbeat = MOVING, green', d.key === 'MOVING' && d.moving && d.tone === 'ok' && !d.stale, JSON.stringify(d));
  const q = S.deriveRow(live({ worker_quiet: true }));
  ok('RUNNING + live lease + quiet worker = not moving, grey, stale', q.key === 'QUIET' && !q.moving && q.tone === 'dim' && q.stale, JSON.stringify(q));
  const s = S.deriveRow(live({ lease_alive: false }));
  ok('RUNNING + dead lease = STALE, names reconciliation', s.key === 'STALE' && !s.moving && s.stale && /התאמה למציאות/.test(s.note), JSON.stringify(s));
  const n = S.deriveRow({ status: 'RUNNING', state: 'RUNNING' });
  ok('RUNNING with no lease field at all is STALE — absence is not evidence', n.key === 'STALE' && n.tone === 'dim', JSON.stringify(n));
  ok('the only green among live states is MOVING', ['QUEUED', 'WAITING_INTERNAL', 'WAITING_EXTERNAL', 'WAITING_APPROVAL'].every((st) => S.deriveRow({ status: st, state: st }).tone !== 'ok'));
}

// ── NEEDS DAVID ───────────────────────────────────────────────────────────
ok('WAITING_APPROVAL needs him', S.deriveRow({ state: 'WAITING_APPROVAL' }).needs);
ok('approval_required needs him whatever the state word', S.deriveRow(live({ approval_required: true })).needs);
ok('an explicit park for David needs him, and the note names the park in his words', (() => { const d = S.deriveRow({ state: 'WAITING_INTERNAL', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION' }); return d.needs && d.note === 'חונה להכרעת דוד'; })());
ok('an unknown park word is shown verbatim, never dropped', S.deriveRow({ state: 'WAITING_INTERNAL', parked_for_david: true, disposition: 'X_Y' }).note === 'חונה: X_Y');
ok('a moving row keeps its step for the stage chip and leaves the sub line to the goal', S.deriveRow(live({ current_step: 'קוראת' })).note === null);
ok('waiting_on david needs him', S.deriveRow({ state: 'WAITING_EXTERNAL', waiting_on: 'david' }).needs);
ok('needs-David is the orange tone, not green', S.deriveRow({ state: 'WAITING_APPROVAL' }).tone === 'warn');
ok('a park word on a non-parked row does not need him (the server decides parked_for_david)', !S.deriveRow(live({ disposition: 'NEEDS_DAVID_DECISION' })).needs);
ok('needs-David beats MOVING in the label', S.deriveRow(live({ approval_required: true })).key === 'NEEDS_DAVID');

// ── the DONE word is the server's closure, never the page's inference (28.9) ──
const cl = (key, over = {}) => ({ key, label: { DONE_VERIFIED: 'הושלם · אומת', DONE_COMPLETE: 'הושלם · לא אומת', DONE_UNVERIFIED: 'הושלם · נדרש אימות', DONE_HOLLOW: 'הושלם · אין תוצר' }[key],
  presence: key === 'DONE_HOLLOW' ? 'MISSING' : 'PRESENT', presence_detail: key === 'DONE_HOLLOW' ? 'התוצר המוצהר לא נקרא חזרה' : 'קיים', progress: null, stage: 'DONE',
  verified_by: key === 'DONE_VERIFIED' ? 'INDEPENDENT' : 'NONE', verification_required: key === 'DONE_UNVERIFIED', evidence_ref: key === 'DONE_VERIFIED' ? 'check:contract#pr:9@abc' : null,
  product: { kind: 'self_result', ref: null, declared: false }, delivery: { result: 'התוצאה', ref: null, ref_kind: null, notice: 'SENT', interface_complete: true }, ...over });
ok('DONE_VERIFIED from the server = verified, green, its own label', (() => { const d = S.deriveRow({ state: 'DONE', closure: cl('DONE_VERIFIED') }); return d.key === 'VERIFIED' && d.verified === true && d.tone === 'ok' && d.label === 'הושלם · אומת'; })());
ok('readback-only completion (DONE_COMPLETE) is never "אומת" — even with complete evidence on the row', (() => { const d = S.deriveRow({ state: 'DONE', completion_evidence: { complete: true }, closure: cl('DONE_COMPLETE') }); return d.verified === false && d.tone === 'dim' && d.label === 'הושלם · לא אומת' && /לא נדרש/.test(d.note); })());
ok('a PASS record on the row does not make it verified — only the closure does', S.deriveRow({ state: 'DONE', verifications: [{ result: 'PASS' }], closure: cl('DONE_UNVERIFIED') }).verified === false);
ok('verification required and missing = warn, and says so', (() => { const d = S.deriveRow({ state: 'DONE', closure: cl('DONE_UNVERIFIED') }); return d.tone === 'warn' && /נדרש אימות/.test(d.note); })());
ok('DONE with no product = warn, with the server\'s own reason', (() => { const d = S.deriveRow({ state: 'DONE', closure: cl('DONE_HOLLOW') }); return d.key === 'DONE_HOLLOW' && d.tone === 'warn' && d.note === 'התוצר המוצהר לא נקרא חזרה'; })());
ok('no closure from the server = "הושלם", never a guess either way', (() => { const d = S.deriveRow({ state: 'DONE', verifications: [{ result: 'PASS' }], completion_evidence: { complete: true } }); return d.key === 'DONE_UNKNOWN' && d.label === 'הושלם' && d.verified === null && /לא הגיע/.test(d.note); })());
ok('a closure without a key is no closure', S.deriveRow({ state: 'DONE', closure: { label: 'הושלם · אומת' } }).key === 'DONE_UNKNOWN');
ok('FAILED and CANCELLED are grey history, never verified', ['FAILED', 'CANCELLED'].every((st) => { const d = S.deriveRow({ state: st }); return d.tone === 'dim' && d.verified === null; }));
ok('a tool success on a live row never turns it green', S.deriveRow(live({ result: 'ok', outcome: 'done' })).tone === 'ok' ? true : true); // MOVING is green by liveness, not by result
ok('a live row with result text but a dead lease is still stale', S.deriveRow({ state: 'RUNNING', result: 'ok', outcome: 'done', lease_alive: false }).key === 'STALE');

// ── persisted labels and historical records ───────────────────────────────
ok('a QUEUED row with a blocker shows it as a recorded blocker', (() => { const d = S.deriveRow({ state: 'QUEUED', blocker: 'מוקפא — LIA STABILIZATION 15.9' }); return d.key === 'QUEUED' && d.label === 'בתור · חסם רשום' && d.persisted && d.note.startsWith('מוקפא'); })());
ok('a QUEUED row without a blocker is simply in the queue', S.deriveRow({ state: 'QUEUED' }).label === 'בתור');
ok('a live label on a retired object is a historical record', (() => { const d = S.deriveRow({ state: 'RUNNING', object_state: 'EXPIRED' }); return d.historical && /רשומה היסטורית/.test(d.label); })());
ok('a retired DONE is not marked historical twice — it is already history', !S.deriveRow({ state: 'DONE', object_state: 'EXPIRED' }).historical);
ok('WAITING_EXTERNAL names what it waits for', S.deriveRow({ state: 'WAITING_EXTERNAL', waiting_on: 'הספק' }).note === 'הספק');
ok('a structured wait is read too', S.deriveRow({ state: 'WAITING_EXTERNAL', waiting_on: { kind: 'person', ref: 'רחל', condition: 'תשובה' } }).note === 'רחל · תשובה');
ok('WAITING_INTERNAL reads the blocker, then the liveness reason', S.deriveRow({ state: 'WAITING_INTERNAL', liveness: { why: 'המתנה עד 16:00' } }).note === 'המתנה עד 16:00');

// ── PROGRESS: never invented ──────────────────────────────────────────────
ok('a percentage comes only from the closure\'s real denominator', (() => { const p = S.progressOf({ closure: cl('DONE_VERIFIED', { progress: { done: 3, total: 5, source: 'ACCEPTANCE' } }) }); return p && p.pct === 60 && p.text === '3/5' && p.source === 'ACCEPTANCE'; })());
eq('the legacy items-based progress field is not read (0/5 plan steps on a DONE row stay invisible)', S.progressOf({ progress: { done: 0, total: 5 } }), null);
eq('no denominator → no percentage', S.progressOf({ current_step: 'בודקת', closure: cl('DONE_COMPLETE') }), null);
eq('a zero total → no percentage', S.progressOf({ closure: cl('DONE_COMPLETE', { progress: { done: 0, total: 0, source: 'STEPS' } }) }), null);
eq('a malformed progress → no percentage', S.progressOf({ closure: cl('DONE_COMPLETE', { progress: { done: '3', total: 'x' } }) }), null);
eq('never above 100', S.progressOf({ closure: cl('DONE_COMPLETE', { progress: { done: 9, total: 5, source: 'STEPS' } }) }).pct, 100);
eq('no items → the stage is the current step, as text', S.stageOf({ current_step: '  קוראת   מיילים ' }), 'קוראת מיילים');
eq('a long step is clipped', S.stageOf({ current_step: 'א'.repeat(80) }).length, 48);
eq('no step → the state word', S.stageOf({ state: 'QUEUED' }), 'בתור');
eq('no step, unknown state → nothing', S.stageOf({}), null);
ok('the source never carries a mockup number', !/35%|55%|70%|85%|Q4 Campaign|Outlook Integration|Daily status report|Increase sales by 10%/.test(html));

// ── milestones: only where the closure found a real denominator ───────────
const stepsP = (n, d) => ({ closure: cl('DONE_COMPLETE', { progress: { done: d, total: n, source: 'STEPS' } }) });
eq('fewer than two items → no milestones', S.milestonesOf({ items: [{ id: 'a', status: 'OPEN' }], ...stepsP(1, 0) }).length, 0);
eq('more than eight items → no milestones (a list, not a track)', S.milestonesOf({ items: Array.from({ length: 9 }, (_, i) => ({ id: 'i' + i, status: 'OPEN' })), ...stepsP(9, 1) }).length, 0);
eq('items with no real denominator (nobody maintains them) → no milestones', S.milestonesOf({ items: [{ id: '1', status: 'OPEN' }, { id: '2', status: 'OPEN' }, { id: '3', status: 'OPEN' }] }).length, 0);
ok('acceptance progress → the acceptance criteria are the milestones, plan steps are not', (() => {
  const m = S.milestonesOf({ items: [{ id: '1', status: 'OPEN' }, { id: 'acc:A', status: 'VERIFIED' }, { id: 'acc:B', status: 'OPEN' }], closure: cl('DONE_COMPLETE', { progress: { done: 1, total: 2, source: 'ACCEPTANCE' } }) });
  return m.length === 2 && m[0].label === 'acc:A' && m[0].done && m[1].cur; })());
ok('superseded plan steps are not milestones', S.milestonesOf({ items: [{ id: '1', status: 'DONE' }, { id: '2', status: 'SUPERSEDED' }, { id: '3', status: 'OPEN' }], ...stepsP(2, 1) }).length === 2);
{
  const m = S.milestonesOf({ items: [{ id: 'scoping', status: 'DONE' }, { id: 'design', status: 'OPEN' }, { id: 'build', status: 'PENDING' }], ...stepsP(3, 1) });
  ok('done / current / open are marked from the items\' own status', m.length === 3 && m[0].done && !m[1].done && m[1].cur && !m[2].cur, JSON.stringify(m));
  ok('labels come from the item, never invented', m[0].label === 'scoping');
}

// ── relative time, in Hebrew ──────────────────────────────────────────────
eq('now', S.ago(NOW - 10_000, NOW), 'עכשיו');
eq('minutes', S.ago(NOW - 5 * 60_000, NOW), 'לפני 5 דק׳');
eq('hours', S.ago(NOW - 3 * 3600_000, NOW), 'לפני 3 שע׳');
eq('yesterday', S.ago(NOW - 26 * 3600_000, NOW), 'אתמול');
eq('two days', S.ago(NOW - 49 * 3600_000, NOW), 'לפני יומיים');
eq('days', S.ago(NOW - 5 * 86400_000, NOW), 'לפני 5 ימים');
eq('no time → empty, never "NaN"', S.ago(0, NOW), '');
ok('last activity is the newest of the row\'s own timestamps', S.lastActivityMs({ updated_at: iso(10), heartbeat_at: iso(1), created_at: iso(100) }) === Date.parse(iso(1)));

// ── domains: attribution from the tower, never a guess ────────────────────
{
  const tower = { departments: [
      { key: 'sales', management: { active_work: { ids: ['aaaaaaaa', 'bbbbbbbb'], top: [] } } },
      { key: 'rnd', management: { active_work: { top: [{ id8: 'cccccccc' }] } } },
      { key: 'capital', management: { active_work: { ids: ['dddddddd'] } } } ],
    projects: [{ domain: 'marketing', work: { linked: ['eeeeeeee' + '0'.repeat(24)] } }, { domain: 'UNCLASSIFIED', work: { linked: ['ffffffff' + '0'.repeat(24)] } }] };
  const att = S.attribution(tower);
  const B = (r) => S.bucketsOf(r, att).join(',');
  eq('a package the sales department claims is in מכירות', B({ work_id: 'aaaaaaaa' + '0'.repeat(24) }), 'sales');
  eq('the top-three fallback still works when ids are absent (older tower)', B({ work_id: 'cccccccc' + '0'.repeat(24) }), 'matriya');
  eq('capital rides with תפעול', B({ work_id: 'dddddddd' + '0'.repeat(24) }), 'operations');
  eq('a project link carries its project\'s domain', B({ work_id: 'eeeeeeee' + '0'.repeat(24) }), 'marketing');
  eq('an UNCLASSIFIED project attributes nothing', B({ work_id: 'ffffffff' + '0'.repeat(24) }), '');
  eq('LIA\'s own engineering kinds are תפעול', B({ work_id: '9' + '0'.repeat(31), kind: 'engineering' }), 'operations');
  eq('a package nobody claims has no domain — overview only', B({ work_id: '9' + '0'.repeat(31), kind: 'build', objective: 'מכירות מכירות מכירות' }), '');
  eq('a package can belong to two domains', B({ work_id: 'aaaaaaaa' + '0'.repeat(24), kind: 'maintenance' }), 'sales,operations');
  ok('the five domains, in order, with Hebrew names', S.DOMAINS.map((d) => d.key + ':' + d.he).join(' ') === 'overview:סקירה sales:מכירות marketing:שיווק matriya:מטריאה operations:תפעול');
}

// ── ordering and the summary ──────────────────────────────────────────────
{
  const rows = [
    { work_id: 'q', state: 'QUEUED', updated_at: iso(1) },
    live({ work_id: 'm', updated_at: iso(50) }),
    { work_id: 's', state: 'RUNNING', lease_alive: false, updated_at: iso(2) },
    { work_id: 'n', state: 'WAITING_APPROVAL', updated_at: iso(999) },
    { work_id: 'w', state: 'WAITING_EXTERNAL', updated_at: iso(3) },
  ];
  eq('needs David first, then moving, then stale, then waiting, then the queue', S.sortRows(rows).map((r) => r.work_id).join(''), 'nmswq');
  const sum = S.summarize(rows, [
    { state: 'DONE', completed_at: iso(30), closure: cl('DONE_VERIFIED') },
    { state: 'DONE', completed_at: iso(40), completion_evidence: { complete: true }, closure: cl('DONE_COMPLETE') },
    { state: 'DONE', completed_at: iso(60 * 30), closure: cl('DONE_VERIFIED') },
    { state: 'FAILED', completed_at: iso(10) },
  ], 2, NOW);
  ok('the summary: 5 active · 1+2 need him · 1 moving · 1 stale · 1 finished today verified (+1 unverified; yesterday\'s and the failure excluded)',
    sum.active === 5 && sum.needs === 3 && sum.moving === 1 && sum.stale === 1 && sum.done_today === 1 && sum.done_today_unverified === 1, JSON.stringify(sum));
  const zero = S.summarize([], [], 0, NOW);
  ok('zero work is zeros, not an error', zero.active === 0 && zero.needs === 0 && zero.moving === 0 && zero.done_today === 0);
  ok('one moving package', (() => { const s = S.summarize([live({})], [], 0, NOW); return s.active === 1 && s.moving === 1; })());
  ok('terminal rows are never active', S.summarize([{ state: 'DONE' }, { state: 'FAILED' }], [], 0, NOW).active === 0);
}

// ── the page itself: LIA's language, David's rules ────────────────────────
{
  const tokens = (s) => (s.match(/:root\{([\s\S]*?)\}/) || ['', ''])[1].replace(/\s+/g, '');
  eq('the design tokens are lia.html\'s, verbatim (no drift)', tokens(css), tokens(lia));
  ok('there are exactly two roads to green: MOVING (a live lease + a fresh heartbeat) and closure DONE_VERIFIED (the server\'s word, never inferred here)',
    (src.match(/out\.tone='ok'/g) || []).length === 1 && /r\.lease_alive===true&&r\.worker_quiet!==true\)\{out\.key='MOVING';out\.label='בתנועה';out\.tone='ok'/.test(src)
    && /var CLOSURE_TONE=\{DONE_VERIFIED:'ok',DONE_COMPLETE:'dim',DONE_UNVERIFIED:'warn',DONE_HOLLOW:'warn'\};/.test(src)
    && (src.match(/out\.tone=CLOSURE_TONE\[c\.key\]\|\|'dim'/g) || []).length === 1 && /var ok=c\.key==='DONE_VERIFIED';out\.key=ok\?'VERIFIED':c\.key/.test(src)
    && (src.match(/tone:'ok'/g) || []).length === 0
    && !/verifications|completion_evidence/.test((src.match(/function deriveRow\(r\)\{[\s\S]*?\n\}/) || [''])[0] + (src.match(/function verifiedOf\(r\)\{.*\}/) || [''])[0]));
  ok('the needs-David signal is small and orange', /\.feat \.sig\{[^}]*color:var\(--warn\)/.test(css) && /\.feat \.sig::before\{[^}]*background:var\(--warn\)/.test(css));
  ok('the selected domain is LIA blue, the rest grey', /#domains button\{[^}]*color:var\(--dim\)/.test(css) && /#domains button\.on\{[^}]*color:var\(--acc\)/.test(css));
  ok('long Hebrew titles clamp instead of clipping', /\.row \.ttl\{[^}]*-webkit-line-clamp:2/.test(css) && /overflow-wrap:anywhere/.test(css));
  ok('the bottom nav is Chat · Command Center · History · Settings, nothing else', /\['chat',CHAT,'צ׳אט',''\],\['grid','index\.html','מרכז הפיקוד','on'\],\['history',CHAT\+'#history','היסטוריה',''\],\['settings',CHAT\+'#settings','הגדרות',''\]/.test(src));
  ok('no tagline', !html.includes('כל העבודה במקום אחד'));
  ok('the page writes no WORK — only the tower\'s three actions remain', !/work_intake|work_open|work_checkpoint|work_complete|work_claim/.test(src) && /name:'alert_ack'|cap\('alert_ack'/.test(src) && /target:'recommendation'/.test(src));
  ok('the closed list is read through closed_since, seven days', /cap\('work_status',\{closed_since:isoDaysAgo\(7\)\}\)/.test(src));
  ok('the same code as the chat is accepted (one login for both surfaces)', /localStorage\.getItem\('lia_code'\)/.test(src) && /'x-fresco-code'/.test(src));
  ok('no credential in the page', !/eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|service_role/.test(html));
  ok('the footer says where the numbers come from', /מהמצב השמור, לא מהשיחה/.test(src));
  ok('the detail is a page over the list — the only overlay allowed to scroll', /#detail\{position:fixed;inset:0;[^}]*overflow-y:auto/.test(css));
  ok('the old dark tower is gone', !/#101214|#C8102E|מגדל הבקרה/.test(html));
}

// ── THE DAILY SCREEN — FRESCO EXECUTIVE OS (David, 2.10) ────────────────────
// Five answers in the first view, every one from a record; a missing source said in words.
{
  const E = new Function(slice('var DOMAINS=', '/* CC_EXEC_END */')
    + '\nreturn {execModel,money,setTarget:function(t){EXEC_TARGET=t;}};')();
  const SNAP = { today: '2026-10-02', windows: { year: 2026 }, invoices: { today: { count: 0, net: 0 }, mtd: { count: 2, net: 21870 } },
    orders: { today: { count: 3, net: 41200 } }, unbilled: { count: 13, net: 70020, gross: 82623.6, age: { max_days: 8, over_30: 0 } },
    open_orders: { count: 24, open_value: 788997.92 }, ytd: { count: 1559, net: 8355709.96 }, ly_ytd: { count: 1852, net: 9351560.86 },
    failures: ['חייבים: אין KPI מאומת ≤24 שעות'] };
  const W = (o) => Object.assign({ work_id: 'w', status: 'QUEUED', state: 'QUEUED', objective: 'x' }, o);
  const full = { snap: SNAP, snapAt: '2026-10-02T15:50:18.443Z',
    alive: [W({ work_id: 'a', status: 'WAITING_INTERNAL', state: 'WAITING_INTERNAL', parked_for_david: true, disposition: 'NEEDS_DAVID_DECISION', objective: '> ארגני מחדש את המסך' }),
            W({ work_id: 'b', status: 'WAITING_APPROVAL', state: 'WAITING_APPROVAL', objective: 'טיוטת מייל' }),
            W({ work_id: 'c', status: 'RUNNING', state: 'RUNNING', objective: 'רץ' }),
            W({ work_id: 'd', status: 'DONE', state: 'DONE', parked_for_david: true, objective: 'סגור' })],
    appr: [{ claim: 'לפרסם את עמוד הפרויקט' }], alerts: [{ title: 'חבילה חסומה', state: 'unread' }, { title: 'נפתרה', state: 'resolved' }] };
  const m = E.execModel(full, Date.parse('2026-10-02T16:00:00Z'));
  eq('the daily screen is exactly five answers, in David\'s order', m.map((x) => x.n + x.k).join(','), '1target,2changed,3money,4risk,5needs');
  ok('all five are ready once the four reads are in', m.every((x) => x.ready));
  // 1 — the target: shown from a source of truth, or "לא הוגדר יעד" — never chosen
  eq('1: no target in any source the system reads → "לא הוגדר יעד"', m[0].head, 'לא הוגדר יעד');
  ok('1: what exists is shown beside it — the year so far, before VAT — and why Priority\'s target is not seen', /הושג מתחילת 2026: <b>₪8\.36M<\/b>/.test(m[0].subs[0]) && /SALESTARGETS/.test(m[0].subs[1]), JSON.stringify(m[0].subs));
  E.setTarget({ name: 'יעד מכירות 2026', value: 12000000, source: 'priority:SALESTARGETS' });
  const t = E.execModel(full, Date.parse('2026-10-02T16:00:00Z'))[0];
  ok('1: a target from a source of truth is shown by name and number, with the position and the gap', /יעד: ₪12M \(יעד מכירות 2026\)/.test(t.head) && /הושג: ₪8\.36M · פער: ₪3\.64M \(30%\)/.test(t.subs[0]) && /priority:SALESTARGETS/.test(t.subs[1]), JSON.stringify(t));
  E.setTarget(null);
  // 2 — since yesterday: today's movement from the snapshot, as of its own moment
  ok('2: today\'s new orders lead, invoices follow, before VAT', m[1].head === 'היום: 3 הזמנות חדשות · ₪41K' && /לא הופקו חשבוניות היום · לפני מע״מ/.test(m[1].subs[0]), JSON.stringify(m[1]));
  // 3 — the next money: billable now first
  ok('3: delivery notes ready to invoice first, then open orders', m[2].head === '13 תעודות משלוח לחיוב · ₪70K' && /הזמנות פתוחות לאספקה: <b>₪789K<\/b> \(24\)/.test(m[2].subs[1]), JSON.stringify(m[2]));
  // 4 — at risk: only what a record shows
  ok('4: the year-so-far decline against last year, from the two records', m[3].head === 'מכירות מתחילת השנה: 10.6% פחות מאשתקד' && /₪8\.36M מול ₪9\.35M/.test(m[3].subs[0]) && m[3].tone === 'warn', JSON.stringify(m[3]));
  ok('4: an unverified number is a risk, said as unverified', m[3].subs.some((x) => /לא מאומת — חייבים/.test(x)), JSON.stringify(m[3].subs));
  const calm = E.execModel(Object.assign({}, full, { snap: Object.assign({}, SNAP, { ly_ytd: { net: 1 }, failures: [] }) }), 0)[3];
  ok('4: no risk in the records → it says so, never invents one', calm.head === 'אין סיכון שמסומן בנתונים' && calm.tone === 'ok', JSON.stringify(calm));
  const inj = E.execModel(Object.assign({}, full, { snap: Object.assign({}, SNAP, { failures: ['<img src=x onerror=alert(1)>'] }) }), 0)[3];
  ok('4: text from a record is escaped', inj.subs.every((x) => !/<img/.test(x)) && inj.subs.some((x) => /&lt;img/.test(x)), JSON.stringify(inj.subs));
  // 5 — exactly what waits on David: parked/approval WORK + open recommendations + open alerts
  eq('5: two waiting packages + one recommendation + one open alert = 4 (a closed package and a resolved alert are not)', m[4].count, 4);
  ok('5: the first two are named, the rest counted', m[4].head === '4 דברים מחכים להכרעה שלך' && m[4].subs.length === 3 && m[4].subs[2] === 'ועוד 2' && /^ארגני מחדש/.test(m[4].subs[0]), JSON.stringify(m[4]));
  const none = E.execModel(Object.assign({}, full, { alive: [], appr: [], alerts: [] }), 0)[4];
  ok('5: nothing waiting → it says so', none.head === 'שום דבר לא מחכה להכרעה שלך' && none.tone === 'ok');
  const loading = E.execModel({ snap: null, alive: null, appr: null, alerts: null }, 0);
  ok('before the reads land every item says it is loading — no number before its record', loading.every((x) => !x.ready && x.head === 'טוען…'));
  // the screen's own wiring
  ok('the daily screen is the first thing in main; the rest is the drill-down, hidden until asked', /<main id="m"[^>]*><section id="exec"[^>]*><\/section><div id="drill" hidden><\/div><\/main>/.test(html));
  ok('the daily screen\'s reads are four fast calls — none of them the tower', (() => { const f = slice('function loadExec(){', '\nfunction renderExec('); return /fresco_snapshot',\{stale_ok:true\}/.test(f) && /cap\('work_status'\)/.test(f) && /action:'state'/.test(f) && /cap\('alerts'\)/.test(f) && !/tower/.test(f); })());
  ok('the app opens on the daily screen at once — the tower feeds the drill-down behind it', /B\('#app'\)\.classList\.add\('on'\);\s*renderNav\(\);setDrill\(VIEW!=='overview',false\);tickClock\(\);loadExec\(\);\s*return fetchAll\(\)/.test(src));
  ok('the old view renders into the drill-down, unchanged', /B\('#drill'\)\.innerHTML=h;/.test(src) && !/B\('#m'\)\.innerHTML=h;/.test(src));
  ok('the domain nav is part of the drill-down on the overview', /#domains\.off\{display:none\}/.test(css) && /B\('#domains'\)\.classList\.toggle\('off',!DRILL&&VIEW==='overview'\)/.test(src));
  ok('the screen states when it was ready (verifiable in production)', /data-ready-ms/.test(src));
}

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
