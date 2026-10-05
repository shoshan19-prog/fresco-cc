// FRESCO KPIs — the panel David approved (5.10 08:42 → 08:55 "ככה זה צריך להראות, מינימליסטי וברור").
// The same right panel, the same 2-per-row grid; eight cards that answer the five questions
// of the screen test; one engine row (fresco_snapshot); colour = state; a card opens DOWN
// inside the panel and the others fold; nothing the engine does not carry is invented.
//   node test-kpi-panel.mjs        (pure + source pins, no browser)
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
let total = 0, bad = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); bad++; } };

// ── the pure block, evaluated exactly as shipped ──────────────────────────────
const pure = src.slice(src.indexOf('/* KPI_MODEL_BEGIN'), src.indexOf('/* KPI_MODEL_END */'));
ok('the model is a marked pure block with no DOM, no clock, no globals', pure.length > 2000 && !/document\.|window\.|localStorage|Date\.now|RAILS|esc\(/.test(pure));
const M = new Function(pure + '\nreturn {kfmtRaw,workingDays,kpiState,monthFactsFromSnapshot,kpiModel,KPI_CARD_KEYS};')();
const F = JSON.parse(readFileSync(new URL('./fixtures/fresco-snapshot-2026-10-05.json', import.meta.url), 'utf8'));
const k = { month: M.monthFactsFromSnapshot(F.row, F.at, true), verdict: F.verdict, kpi_quotes_to_orders_60d: F.quotes_to_orders_60d,
  open_orders: { framework: F.row.open_orders.framework }, unbilled: { definition: F.row.unbilled.rule } };
const m = M.kpiModel(k);
const card = (key) => m.cards.find((c) => c.key === key);
const text = (c) => [c.value, c.pct, c.sub, c.dot].join(' | ');

// ── David's notation and the working week ──
ok('money reads like David writes it: ₪90.5K · ₪136K · ₪770K · ₪1.03M', [90493, 136174, 769651.68, 1029015].map(M.kfmtRaw).join(' ') === '₪90.5K ₪136K ₪770K ₪1.03M', [90493, 136174, 769651.68, 1029015].map(M.kfmtRaw).join(' '));
ok('a missing number is "לא מאומת", never 0', M.kfmtRaw(null) === 'לא מאומת' && M.kfmtRaw(undefined) === 'לא מאומת');
ok('working days are Sunday–Thursday: 5.10.2026 is day 3 of 21, 18 left', JSON.stringify(M.workingDays('2026-10-05')) === '{"done":3,"total":21,"left":18}', JSON.stringify(M.workingDays('2026-10-05')));
ok('state: on pace → green, up to 10% under → amber, more → red, unknown → grey', M.kpiState(1.0) === 'ok' && M.kpiState(1.2) === 'ok' && M.kpiState(0.95) === 'warn' && M.kpiState(0.9) === 'warn' && M.kpiState(0.89) === 'bad' && M.kpiState(null) === 'na');

// ── the header is the reference point, not a count of tiles ──
ok('header: month · Baseline (same month last year), named Baseline — never a management target', m.header === 'אוקטובר · Baseline ₪770K', m.header);
ok('the head\'s second line: working day X of Y (David\'s spec); the engine\'s own calendar count opens the body', m.header2 === 'יום עבודה 3 מתוך 21' && m.ref === 'ימי עבודה 3/21 · קלנדרי 5/31', m.header2 + ' | ' + m.ref);
ok('the old summary wording is gone from the page', !/ממתינים · מנוע אחד/.test(src));

// ── row 1: the month ──
const sales = card('sales'), fc = card('forecast');
ok('מכירות (David 5.10 evening): ₪136K · "18% מה-Baseline" · under it "היינו צריכים להיות ב־14%" (OFFICIAL PACE = working days 3/21, decision 164) and "4 נק׳ מעל הקצב" · green', sales.value === '₪136K' && sales.pct === '18% מה-Baseline' && sales.sub === 'היינו צריכים להיות ב־14%' && sales.dot === '4 נק׳ מעל הקצב' && sales.state === 'ok', text(sales) + ' ' + sales.state);
ok('OFFICIAL PACE (decision 164): the model reads the engine\'s working_days, never the calendar, for expected and pace — and says which is which', k.month.working_days.done === 3 && k.month.working_days.total === 21 && sales.detail.some((l) => l.b === 'קצב' && /^הקצב הרשמי — ימי עבודה א׳–ה׳ 3\/21 \(14%\)/.test(l.t) && /קלנדריים 5\/31 \(16%\) — לייחוס בלבד/.test(l.t)), sales.detail.find((l) => l.b === 'קצב')?.t);
{ // an engine row from before the switch carries no working_days and a calendar-basis rate: the model computes the same Sunday–Thursday count itself and the formula text follows the row's basis
  const old = JSON.parse(JSON.stringify(F.row)); delete old.windows.working_days; old.rate = { daily: 27235, projected_month: 844279, confidence: 'MEDIUM', basis: 'ימים קלנדריים (5/31)' };
  const mo = M.kpiModel({ month: M.monthFactsFromSnapshot(old, F.at, true) });
  const so = mo.cards.find((c) => c.key === 'sales'), fo = mo.cards.find((c) => c.key === 'forecast');
  ok('a pre-switch engine row (no working_days) still gets the official pace from the same count computed here — 14%, not 16%', so.sub === 'היינו צריכים להיות ב־14%' && so.dot === '4 נק׳ מעל הקצב' && mo.ref === 'ימי עבודה 3/21 · קלנדרי 5/31', text(so) + ' | ' + mo.ref);
  ok('…and its Forecast formula stays honest to THAT row: calendar daily × 31 with the row\'s own basis', fo.value === '₪844K' && fo.detail.some((l) => l.b === 'Forecast' && /קצב יומי ₪27\.2K × 31 ימים \(ימים קלנדריים \(5\/31\)\)/.test(l.t)), fo.detail.find((l) => l.b === 'Forecast')?.t);
}
ok('מכירות detail: the Baseline is for comparison only; a management target, once set, replaces it as the main measure', sales.detail.some((l) => l.b === 'Baseline' && /להשוואה בלבד/.test(l.t) && /יחליף את ה-Baseline במדד הראשי/.test(l.t)));
ok('מכירות detail names the Baseline as such and shows both pace counts — working days 3/21 as the official one, calendar 5/31 as reference', sales.detail.some((l) => /לא יעד הנהלה/.test(l.t)) && sales.detail.some((l) => /5\/31 \(16%\)/.test(l.t) && /3\/21 \(14%\)/.test(l.t)));
ok('Forecast (David 5.10 evening + decision 164): the engine\'s working-day run rate ₪953K · 124% of the Baseline · marked in the open "תחזית קצב בלבד · ביטחון נמוך" (three working days of twenty-one) · green', fc.value === '₪953K' && fc.pct === '124% מה-Baseline' && fc.sub === 'תחזית קצב בלבד · ביטחון נמוך' && fc.state === 'ok', text(fc));
ok('Forecast detail says the real Forecast engine (actual + expected deliveries + backlog conversion + new business, no double counting) is not built yet', fc.detail.some((l) => l.b === 'מנוע Forecast אמיתי' && /טרם נבנה/.test(l.t) && /ספירה כפולה/.test(l.t)));
ok('Forecast detail is the bridge, honestly: actual + unbilled known; backlog-this-month and new orders "לא מאומת"; the formula is stated', fc.detail.some((l) => l.b === 'חויב בפועל' && l.t === '₪136K') && fc.detail.some((l) => /תעודות/.test(l.b) && /₪55\.7K/.test(l.t)) && fc.detail.filter((l) => /לא מאומת/.test(l.t)).length >= 3 && fc.detail.some((l) => /נוסחה: קצב ליום עבודה ₪45\.4K × 21 ימי עבודה \(ימי עבודה א׳–ה׳ \(3\/21\)\)/.test(l.t)), fc.detail.find((l) => l.b === 'Forecast')?.t);

// ── row 2: what is missing, what already covers it ──
const gap = card('gap'), cover = card('cover');
ok('פער: ₪633K · 82% missing · ₪35.2K needed per working day (18 left)', gap.value === '₪633K' && gap.pct === '82% חסר' && gap.sub === 'נדרש ₪35.2K ליום עבודה (18 נותרו)', text(gap));
ok('כיסוי (David 5.10 evening): the meaning leads — "137% כיסוי" — then the raw number "₪870K זמינים מול פער ₪633K" · green; the detail says delivery dates are not verified', cover.value === '137% כיסוי' && cover.pct === '' && cover.sub === '₪870K זמינים מול פער ₪633K' && cover.state === 'ok' && cover.detail.some((l) => /מועד האספקה לא מאומת/.test(l.t)) && cover.detail.some((l) => /פיצול הצבר/.test(l.b) && /לא מאומת/.test(l.t)), text(cover));

// ── row 3: where the money is ──
const ub = card('unbilled_due'), bk = card('backlog');
ok('תעודות לחיוב: ₪55.7K net · 9% of the gap · 12 notes, oldest 11 days', ub.value === '₪55.7K' && ub.pct === 'נטו · 9% מהפער' && ub.sub === '12 תעודות · הוותיקה 11 יום', text(ub));
ok('הזמנות פתוחות: ₪814K remaining · "expected this month" is NOT verified, said so · 31 orders', bk.value === '₪814K' && bk.pct === 'יתרה לספק' && /^צפוי החודש: לא מאומת · 31 הזמנות/.test(bk.sub), text(bk));
ok('quotes → orders left the main screen and lives in the folded detail', !m.cards.some((c) => /הצעות/.test(text(c))) && bk.detail.some((l) => /הצעות מחיר → הזמנות/.test(l.b) && l.t === '16 מתוך 50 הצעות (32%)'));

// ── row 4: history ──
const ly = card('vs_ly'), avg = card('vs_avg');
ok('מול אשתקד: the same days (+380%, 25 vs 4 invoices — the thin base is on the card)', ly.value === '+380%' && ly.pct === 'אותם ימים אשתקד' && ly.sub === '25 מול 4 חשבוניות', text(ly));
ok('מול אשתקד detail: Forecast vs the full month last year (+24% on the working-day rate) and YTD vs YTD (-10%)', ly.detail.some((l) => /Forecast מול/.test(l.b) && l.t.startsWith('+24%')) && ly.detail.some((l) => /מתחילת השנה/.test(l.b) && l.t.startsWith('-10%')));
ok('מול ממוצע: Forecast vs the 2025 monthly average (-7% on the working-day rate), named exactly — no "12 months" the engine does not hold', avg.value === '-7%' && avg.pct === 'ממוצע חודשי 2025' && /Forecast ₪953K מול ₪1\.03M/.test(avg.sub) && avg.detail.some((l) => /12 חודשים אחרונים/.test(l.b) && /לא מאומת/.test(l.t)), text(avg));

// ── colour expresses state, not the kind of number ──
ok('only pace/forecast/coverage carry a state colour; the rest are neutral', m.cards.filter((c) => c.state !== 'none').map((c) => c.key).join(',') === 'sales,forecast,cover', m.cards.map((c) => c.key + ':' + c.state).join(' '));
ok('the page has no per-KPI tints any more', !/c-salesToday|c-salesMonth|c-openOrders|c-grossProfit|c-receivables|c-unbilled/.test(html));

// ── removed from the main screen, kept in "נתונים נוספים" ──
ok('the 90/100 score is on no card', !m.cards.some((c) => /\/100/.test(text(c))));
ok('"נתונים נוספים" (wide, neutral) holds the score, receivables and gross profit — unverified said so', m.more && m.more.wide && m.more.state === 'none' && /ציון כולל 90\/100/.test(m.more.sub) && /חייבים: לא מאומת/.test(m.more.sub) && /רווח גולמי: לא מאומת/.test(m.more.sub) && m.more.detail.some((l) => /רווח גולמי/.test(l.b) && /לא מאומת/.test(l.t)));

// ── the screen test (David): without opening a card ──
ok('screen test: ₪136K | 18% | 4 above the working-day pace — Forecast ₪953K | 124% — missing ₪633K | 137% covered', sales.value === '₪136K' && sales.pct.startsWith('18%') && sales.dot.startsWith('4 ') && fc.value === '₪953K' && fc.pct.startsWith('124%') && gap.value === '₪633K' && cover.value.startsWith('137%'));
ok('eight cards, four rows, in the approved order', m.cards.map((c) => c.key).join(',') === 'sales,forecast,gap,cover,unbilled_due,backlog,vs_ly,vs_avg' && m.rows.length === 4);

// ── when the engine does not answer ──
const e = M.kpiModel({});
ok('no engine row → the header says so and every card is grey "לא מאומת" — no number invented', e.header === 'אין תמונת מצב' && e.header2 === 'מנוע תמונת המצב לא ענה' && e.cards.length === 8 && e.cards.every((c) => c.value === null && c.state === 'na'));
const partial = M.kpiModel({ month: Object.assign({}, k.month, { ly_month: null, unbilled: null, backlog: null }) });
ok('no Baseline → percentages are "לא מאומת", the ₪ facts stay; no pipeline → coverage grey', partial.cards.find((c) => c.key === 'sales').pct === 'לא מאומת' && partial.cards.find((c) => c.key === 'sales').value === '₪136K' && partial.cards.find((c) => c.key === 'cover').state === 'na' && partial.cards.find((c) => c.key === 'cover').value === null && partial.header === 'אוקטובר · Baseline לא מאומת', partial.header);

// ── source pins: the panel, not another dashboard ──
ok('the section is the SAME panel (id, class, change mark) and the same grid element', /<section class="railCard collapsible" id="kpiCard" data-collapsed="true" data-lia-change="d6ed8626">/.test(html) && /<div class="kpiGrid railBody" id="kpis"><\/div>/.test(html) && /\.kpiGrid\{display:grid;grid-template-columns:1fr 1fr;gap:10px\}/.test(html));
ok('no second dashboard: one #kpis grid, one renderKpis, one model call', (html.match(/id="kpis"/g) || []).length === 1 && (src.match(/function renderKpis\(\)/g) || []).length === 1 && /const m=kpiModel\(k,kfmt\);RAILS\.kpiModel=m;/.test(src));
ok('the two-line head is set from the model, and keeps the height the desktop lock measured (two 19.2px lines)', /setKpiHeader\(m\.header,m\.header2\)/.test(src) && /#kpiCard \.railHeadMeta\{[^}]*line-height:19\.2px/.test(html));
ok('accordion: opening a card folds every other open card in the grid, and remembers one', /if\(!open\)document\.querySelectorAll\('#kpis \.kpiTile\[data-open="true"\]'\)\.forEach/.test(src));
ok('a chat answer still lands on its card: every CARD_ROUTES kpi key maps to one of the eight (or to נתונים נוספים)', (() => { const keys = [...src.matchAll(/kind:'kpi',key:'([a-z_0-9]+)'/g)].map((x) => x[1]); const alias = src.match(/const KPI_ROUTE_ALIAS=\{([^}]*)\}/)[1]; return keys.length >= 6 && keys.every((key) => M.KPI_CARD_KEYS.includes(key) || new RegExp('\\b' + key + ":'").test(alias)); })());
ok('opening a routed card also un-collapses the panel it lives in', /function openKpiDetail\(key\)\{\s*key=KPI_ROUTE_ALIAS\[key\]\|\|key;[\s\S]*?toggleRailSection\('kpiCard'\)/.test(src));
ok('the phone drawer answers the new keys from the same model', /if\(KPI_CARD_KEYS\.indexOf\(key\)>=0\)\{\s*const m=RAILS\.kpiModel\|\|kpiModel\(RAILS\.kpis\|\|\{\},kfmt\);/.test(src));
ok('the month facts ride the one engine row (kpisFromSnapshot), copied not recomputed', /month:monthFactsFromSnapshot\(d,asOf,!!cachedAt\),/.test(src));
ok('a signed value keeps its sign in front — the big number is bidi-isolated (dir=auto)', /<div class="v" dir="auto">/.test(src));
ok('privacy mode still hides money on the cards', /function kfmt\(n\)\{return privacyOn\(\)\?'—':kfmtRaw\(n\);\}/.test(src));
ok('the build stamp moved to 5.10', /const LIA_BUILD='2026-10-05\.\d+';/.test(src));
ok('the fixture is the engine\'s real row of 5.10 14:28Z', F.at === '2026-10-05T14:28:09.797Z' && F.row.invoices.mtd.net === 136174 && F.row.rate.projected_month === 953218 && F.row.rate.day_kind === 'working' && F.row.windows.working_days.total === 21 && /decision 164/.test(F.note_164));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} KPI panel asserts passed`);
process.exit(bad ? 1 : 0);
