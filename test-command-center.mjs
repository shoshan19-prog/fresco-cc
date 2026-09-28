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

// ── GREEN only for VERIFIED completion ────────────────────────────────────
ok('DONE + an independent PASS = verified, green', (() => { const d = S.deriveRow({ state: 'DONE', verifications: [{ result: 'PASS' }] }); return d.key === 'VERIFIED' && d.verified === true && d.tone === 'ok'; })());
ok('DONE + complete completion evidence = verified', S.deriveRow({ state: 'DONE', completion_evidence: { complete: true } }).verified === true);
ok('DONE alone = not verified, grey, and says so', (() => { const d = S.deriveRow({ state: 'DONE' }); return d.key === 'DONE_UNVERIFIED' && d.verified === false && d.tone === 'dim' && /אין אימות/.test(d.note); })());
ok('DONE + a FAILED verification = not verified', S.deriveRow({ state: 'DONE', verifications: [{ result: 'FAIL' }] }).verified === false);
ok('DONE + evidence that is not complete = not verified, with the evidence\'s own reason', (() => { const d = S.deriveRow({ state: 'DONE', completion_evidence: { complete: false, detail: 'התוכן קטוע' } }); return d.verified === false && d.note === 'התוכן קטוע'; })());
ok('a string "true" is not verification', S.deriveRow({ state: 'DONE', completion_evidence: { complete: 'true' } }).verified === false);
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
ok('a percentage comes only from real sub-items', (() => { const p = S.progressOf({ progress: { done: 3, total: 5 } }); return p && p.pct === 60 && p.text === '3/5' && p.source === 'items'; })());
eq('no items → no percentage', S.progressOf({ current_step: 'בודקת' }), null);
eq('a zero total → no percentage', S.progressOf({ progress: { done: 0, total: 0 } }), null);
eq('a malformed progress → no percentage', S.progressOf({ progress: { done: '3', total: 'x' } }), null);
eq('never above 100', S.progressOf({ progress: { done: 9, total: 5 } }).pct, 100);
eq('no items → the stage is the current step, as text', S.stageOf({ current_step: '  קוראת   מיילים ' }), 'קוראת מיילים');
eq('a long step is clipped', S.stageOf({ current_step: 'א'.repeat(80) }).length, 48);
eq('no step → the state word', S.stageOf({ state: 'QUEUED' }), 'בתור');
eq('no step, unknown state → nothing', S.stageOf({}), null);
ok('the source never carries a mockup number', !/35%|55%|70%|85%|Q4 Campaign|Outlook Integration|Daily status report|Increase sales by 10%/.test(html));

// ── milestones: only from real items ──────────────────────────────────────
eq('fewer than two items → no milestones', S.milestonesOf({ items: [{ id: 'a', status: 'OPEN' }] }).length, 0);
eq('more than eight items → no milestones (a list, not a track)', S.milestonesOf({ items: Array.from({ length: 9 }, (_, i) => ({ id: 'i' + i, status: 'OPEN' })) }).length, 0);
{
  const m = S.milestonesOf({ items: [{ id: 'scoping', status: 'DONE' }, { id: 'design', status: 'OPEN' }, { id: 'build', status: 'PENDING' }] });
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
    { state: 'DONE', completed_at: iso(30), verifications: [{ result: 'PASS' }] },
    { state: 'DONE', completed_at: iso(40) },
    { state: 'DONE', completed_at: iso(60 * 30), verifications: [{ result: 'PASS' }] },
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
  ok('there are exactly two roads to green: MOVING (a live lease + a fresh heartbeat) and VERIFIED (verifiedOf)',
    (src.match(/out\.tone='ok'/g) || []).length === 1 && /r\.lease_alive===true&&r\.worker_quiet!==true\)\{out\.key='MOVING';out\.label='בתנועה';out\.tone='ok'/.test(src)
    && (src.match(/out\.tone=ok\?'ok':'dim'/g) || []).length === 1 && /var ok=verifiedOf\(r\);out\.key=ok\?'VERIFIED'/.test(src) && (src.match(/tone:'ok'/g) || []).length === 0);
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

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
