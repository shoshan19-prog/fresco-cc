// THE MANAGEMENT MAP (David, 5.10 night — "אורגנייזר מפת ניהול"), pinned at the source of lia.html.
//
// Measured before: the ORGANIZATION rail drew eight departments whose goal/owner were null in all eight, states typed
// by hand on 10.9, three constants, and a card that showed three packages as a teaser. Now the tower computes the
// state, reads the numbers, and carries the registry row David fills once — and the card is where he fills it.
//   node test-organizer-map.mjs
import { readFileSync } from 'node:fs';
const lia = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
let passed = 0, failed = 0;
const check = (n, f) => { try { f(); passed++; console.log('PASS ', n); } catch (e) { failed++; console.log('FAIL ', n, '—', e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };

check('STATE: the computed EMPTY state has a Hebrew label and a warning dot, like HIDDEN/MISSING', () => {
  assert(/EMPTY:'ריק'/.test(lia), 'label');
  assert(/\.orgItem\.s-EMPTY \.dot\{background:var\(--warn/.test(lia), 'dot');
});
check('GOAL: a seeded goal is shown as proposed from the specs until David saves it; his word stands alone', () => {
  assert(/m\.goal_source!=='david'&&m\.goal_source!=='tower'\)html\+=' <span class="src">\(מוצע מהמפרט — טרם אושר\)<\/span>'/.test(lia), 'seed marker');
});
check('KPI: the measure in David\'s words leads the KPI line when the registry holds one', () => {
  assert(/d\.registry&&d\.registry\.kpi_label\)html='<span class="kv"><b>'\+esc\(d\.registry\.kpi_label\)/.test(lia), 'kpi label first');
});
check('QUEUE: the card lists every package the tower matched (not a teaser), with a Hebrew status and the remainder', () => {
  assert(/<ul class="wq">/.test(lia) && /ועוד '\+rest\+'/.test(lia), 'full list + remainder');
  assert(/const WORK_STATUS_HE=\{QUEUED:'בתור',RUNNING:'בביצוע'/.test(lia), 'status words');
});
check('FORM: one form per department with the five fields, prefilled from the registry, in both homes of the card', () => {
  assert(/const ORG_EDIT_FIELDS=\[\['goal','מטרה','textarea'\],\['owner','אחראי','input'\],\['kpi_label','המדד, במילים שלך','input'\],\['next_action','הפעולה הבאה','input'\],\['blocker','חסם שאתה יודע עליו','input'\]\]/.test(lia), 'fields');
  assert(/lines\.push\(orgEditHtml\(key,d\)\);/.test(lia), 'rendered inside orgDetailLines — the one builder both the rail and the drawer use');
  assert(/esc\(String\(r\[f\]\|\|''\)\)/.test(lia), 'prefilled from d.registry');
  assert(/r\.source==='david'\?'עדכון המחלקה':'מלא את המחלקה'/.test(lia), 'the button says whether he has filled it');
});
check('WRITE: the form posts department_set through ccApi (David\'s principal), re-reads the tower, and says נשמר only after the read-back', () => {
  const fn = lia.slice(lia.indexOf('async function saveOrgEdit('), lia.indexOf('/* delegated: the form lives in both homes'));
  assert(/const body=\{action:'department_set',key\};/.test(fn), 'action');
  assert(/await ccApi\(\{action:'tower'\}\)/.test(fn) && /RAILS\.org=tw\.departments;renderOrg\(\);renderOrgMobile\(\);/.test(fn), 're-read + re-render');
  assert(fn.indexOf("await ccApi({action:'tower'})") < fn.indexOf("'נשמר · המפה עודכנה'"), 'saved is said after the re-read');
  assert(/if\(!x\|\|!x\.ok\)\{if\(res\)res\.textContent='לא נשמר: '/.test(fn), 'a refusal is shown, never swallowed');
});
check('WIRING: edit / cancel / submit are delegated on the document, so the drawer on the phone gets them too', () => {
  assert(/const b=t\.closest\('\[data-orgedit\]'\);if\(b\)\{e\.preventDefault\(\);toggleOrgEdit\(b\.getAttribute\('data-orgedit'\)\);return;\}/.test(lia), 'edit');
  assert(/const c=t\.closest\('\[data-orgcancel\]'\)/.test(lia), 'cancel');
  assert(/e\.target\.closest\('form\.orgEdit'\):null;if\(!f\)return;\s*e\.preventDefault\(\);saveOrgEdit\(f\);/.test(lia), 'submit');
});
check('ROW CLICKS: the detail (and its form) is a sibling of the row — a click inside it never toggles the department', () => {
  assert(/\+\(inline\?'<div class="orgDetail" id="orgDetail_'\+esc\(d\.key\)\+'"><\/div>':''\);/.test(lia), 'sibling');
  assert(/const keyOf=e=>\{const row=e\.target&&e\.target\.closest\?e\.target\.closest\('\.orgItem\[data-org\]'\):null;/.test(lia), 'row-only delegation');
});
check('BUILD: bumped', () => { assert(/const LIA_BUILD='2026-10-05\.6';/.test(lia)); });

console.log(`\norganizer map · ${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
