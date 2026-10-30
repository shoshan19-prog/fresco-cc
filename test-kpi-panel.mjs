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
ok('backlog detail still carries quotes → orders (the folded line David approved 5.10)', bk.detail.some((l) => /הצעות מחיר → הזמנות/.test(l.b) && l.t === '16 מתוך 50 הצעות (32%)'));

// ── CEO COCKPIT B (David 27.10 — "תבנה את B"): the year leads; history folds into the month cards ──
const yr = card('year');
ok('the year leads the panel: YTD ₪8.47M of the ₪13.21M target (last year ₪12.35M × 1.07, David 27.10) · 64% · -10% vs last year', m.cards[0].key === 'year' && yr.lead === true && yr.value === '₪8.47M' && yr.target === '₪13.21M' && yr.pct === '64% מהיעד · -10% מאשתקד', text(yr) + ' ' + yr.target);
ok('year: the engine\'s own year-end projection (the chat\'s number) and the gap to the target', yr.sub === 'תחזית לסוף השנה ₪11.12M' && yr.gapText === 'פער ₪2.09M' && yr.detail.some((l) => l.b === 'תחזית לסוף השנה' && /תחזית המנוע/.test(l.t)), yr.sub + ' | ' + yr.gapText);
ok('year: red — measured against where last year\'s own seasonality says we should be today, not a straight line', yr.state === 'bad' && yr.detail.some((l) => /העונתיות של אשתקד/.test(l.t)) && yr.detail.some((l) => l.b === 'יעד שנתי' && /× 1\.07 · הוראת דוד 27\.10/.test(l.t)));
ok('year: the bar is to scale — actual 64%, forecast 84% of the target', Math.round(yr.bar.actual * 100) === 64 && Math.round(yr.bar.forecast * 100) === 84, JSON.stringify(yr.bar));
{ const noEng = M.kpiModel(Object.assign({}, k, { verdict: { score: 90, status: { word: 'טוב' } } })).cards[0];
  ok('year without the engine\'s projection: ytd ÷ elapsed days × days in the year, and the detail says it ignores seasonality', noEng.sub === 'תחזית לסוף השנה ₪11.12M' && noEng.detail.some((l) => /בלי עונתיות/.test(l.t)), noEng.sub); }
ok('the month vs last year (+380%, 25 vs 4 invoices) moved into the sales detail — once, not a card', sales.detail.some((l) => /אוקטובר 2025/.test(l.b) && /^\+380%/.test(l.t) && /25 מול 4 חשבוניות/.test(l.t)) && !card('vs_ly'));
ok('the monthly averages moved into the Forecast detail (-7% vs the 2025 average)', fc.detail.some((l) => /ממוצע חודשי 2025/.test(l.b) && /^-7%/.test(l.t)) && !card('vs_avg'));
const cash = card('cash');
ok('cash: not read yet — no number, said so, and the source is read-only Priority books', cash.value === null && cash.nv === 'נטען מפריוריטי…' && cash.state === 'na' && cash.detail.some((l) => /קריאה בלבד/.test(l.t)));
{ // 30.10 — Priority's book balances (cash_position): the number, PARTIAL, banks first, pledged apart
  const pos = { available_now: 994345.22, available_with_deposits: 5065930.84, net_after_written_checks: 769742.3,
    totals: { banks: 994345.22, deposits: 4071585.62, pledged: 50000, incoming: 1105539.06, outgoing: 184448.39, cards: 40154.53 },
    banks: [{ name: 'בנק לאומי שקלי', amount: 788773.47 }], deposits: [{ name: 'פקדון מזרחי 231', amount: 3969864.62 }], pledged: [{ name: 'פקדון משועבד', amount: 50000 }],
    incoming: [{ name: 'קופת כרטיסי אשראי', amount: 535189.17 }], definition: 'יתרות ספרים מפריוריטי — לא דף בנק', caveats: ['לא דף בנק'] };
  const mc = M.kpiModel(Object.assign({}, k, { cash: { position: pos, at: '2026-10-30T07:45:00Z', cached: false } }));
  const cc = mc.cards.find((c) => c.key === 'cash');
  ok('cash read: the banks\' book balance is the number, marked partial, with deposits and the net after written checks', cc.value === M.kfmtRaw(994345.22) && /חלקי/.test(cc.pct) && /עם פיקדונות/.test(cc.sub) && /נטו אחרי שיקים/.test(cc.dot), JSON.stringify(cc));
  ok('cash read: the detail lists each bank, says pledged is not available, and the definition', cc.detail.some((l) => /בנק לאומי שקלי/.test(l.t || '')) && cc.detail.some((l) => /משועבד — לא זמין/.test(l.b || '')) && cc.detail.some((l) => /לא דף בנק/.test(l.t || '')));
  const err = M.kpiModel(Object.assign({}, k, { cash: { error: 'ACCOUNTS: HTTP 500' } })).cards.find((c) => c.key === 'cash');
  ok('cash refused: "לא נקרא" with the reason, never a number', err.value === null && err.nv === 'לא נקרא' && /HTTP 500/.test(err.sub));
}
const rec = card('receivables');
ok('receivables: no verified KPI → "לא מאומת" with the reason, never 0', rec.value === null && /אין KPI מאומת/.test(rec.pct));
{ const withOrg = M.kpiModel(Object.assign({}, k, { org: { receivables_open: { key: 'receivables_open', value: 1713251, display: '₪1,713,251', verification: 'STALE', as_of: '2026-09-25T20:43:34Z', source: 'kpi_cache:receivables' }, receivables_over_90: { value: 212000, display: '₪212,000', verification: 'STALE' } } })).cards.find((c) => c.key === 'receivables');
  ok('receivables from the organizer\'s KPI: the value with its age said in the open (קריאה ישנה · date)', withOrg.value === '₪1.71M' && withOrg.pct === 'קריאה ישנה · 2026-09-25' && withOrg.sub === 'מעל 90 יום: ₪212K', text(withOrg));
  const nc = M.kpiModel(Object.assign({}, k, { org: { receivables_open: { value: null, display: 'לא מחובר', verification: 'NOT_CONNECTED' } } })).cards.find((c) => c.key === 'receivables');
  ok('a NOT_CONNECTED organizer KPI never becomes a number', nc.value === null); }
const q = card('quotes');
ok('quotes → orders is a card in the sales→orders→billing row: 32% · 16 of 50 · 60 days; SharePoint estimates stay outside the forecast', q.value === '32%' && q.pct === 'המרה תוך 60 יום' && q.sub === '16 מתוך 50 הצעות' && q.detail.some((l) => /שרפוינט/.test(l.b) && /מחוץ לתחזית/.test(l.t)), text(q));

// ── colour expresses state, not the kind of number ──
ok('only the year, pace, forecast and coverage carry a state colour; the rest are neutral (cash grey: not connected)', m.cards.filter((c) => c.state !== 'none' && c.state !== 'na').map((c) => c.key).join(',') === 'year,sales,forecast,cover' && cash.state === 'na', m.cards.map((c) => c.key + ':' + c.state).join(' '));
ok('the page has no per-KPI tints any more', !/c-salesToday|c-salesMonth|c-openOrders|c-grossProfit|c-receivables|c-unbilled/.test(html));

// ── removed from the main screen, kept in "נתונים נוספים" ──
ok('the 90/100 score is on no card', !m.cards.some((c) => /\/100/.test(text(c))));
ok('"נתונים נוספים" (wide, neutral) holds the score and gross profit — receivables and quotes have their own cards now, so they are not repeated', m.more && m.more.wide && m.more.state === 'none' && /ציון כולל 90\/100/.test(m.more.sub) && !/חייבים/.test(m.more.sub) && /רווח גולמי: לא מאומת/.test(m.more.sub) && !m.more.detail.some((l) => /הצעות מחיר|חייבים/.test(l.b)));

// ── the screen test (David): without opening a card ──
ok('screen test: ₪136K | 18% | 4 above the working-day pace — Forecast ₪953K | 124% — missing ₪633K | 137% covered', sales.value === '₪136K' && sales.pct.startsWith('18%') && sales.dot.startsWith('4 ') && fc.value === '₪953K' && fc.pct.startsWith('124%') && gap.value === '₪633K' && cover.value.startsWith('137%'));
ok('CEO Cockpit B order (David 27.10): the year, then the month · profitability · cash · sales→orders→billing — each card in its named row', m.cards.map((c) => c.key).join(',') === 'year,sales,forecast,gap,cover,pbt,cash,receivables,quotes,backlog,unbilled_due,value' && m.rows.join('|') === 'החודש|רווחיות|מזומנים|מכירות, הזמנות וחיובים|מצפן השווי' && m.cards.filter((c) => !c.lead).every((c) => m.rows.some((r) => c.row.startsWith(r))) && card('sales').row === 'החודש · אוקטובר', m.cards.map((c) => c.key + '@' + c.row).join(','));
{ // PROFIT BEFORE TAX (David 11.10): the engine's pbt_kpi row or the exact blocker — never operating profit, never a number from this screen
  const none = card('pbt');
  ok('pbt: no row in the engine → "לא מאומת" with the reason, and the definition says it is not operating profit', none.value === null && /להריץ pbt_kpi/.test(none.detail[0].t) && /לא רווח תפעולי/.test(none.detail[1].t), JSON.stringify(none));
  const withPbt = M.kpiModel(Object.assign({}, k, { pbt: { ytd: 1234567, month: 98765, ly_ytd: 1100000, ly_month: 90000, pct_ytd: 14.3, pct_month: 12.1, ytd_vs_ly_pct: 12.2, month_vs_ly_pct: 9.7,
    net_sales_ytd: 8632000, verification: 'PARTIAL', caveats: ['לפני התאמת מלאי'], blockers: [], last_entry: '2026-10-11', as_of: '2026-10-11T08:00:00Z', gap_pbt: 1500, year: 2026, month_key: '2026-10' } }));
  const c = withPbt.cards.find((x) => x.key === 'pbt');
  ok('pbt: value = YTD in David\'s notation, % of net sales, the month, last year, verification and the last entry date', c.value === '₪1.23M' && /14\.3% מהמכירות נטו · מתחילת 2026/.test(c.pct) && /החודש ₪98\.8K \(12\.1%\)/.test(c.sub) && /מול אשתקד \+12\.2% · חלקי · נכון ל-2026-10-11/.test(c.dot) && c.state === 'ok', JSON.stringify(c));
  ok('pbt: the detail carries the definition (tax out, not operating profit), the reconciliation gap and the caveat', c.detail.some((d) => /מס מוחרג/.test(d.t) && /לא רווח תפעולי/.test(d.t)) && c.detail.some((d) => /פער ₪1\.5K/.test(d.t)) && c.detail.some((d) => /הסתייגות: לפני התאמת מלאי/.test(d.t)), JSON.stringify(c.detail));
  const blocked = M.kpiModel(Object.assign({}, k, { pbt: { ytd: null, blockers: ['חודשים שלא נקראו בזמן: 2026-03'], caveats: [], verification: 'UNKNOWN' } })).cards.find((x) => x.key === 'pbt');
  ok('pbt: a blocker is shown as the reason, no number', blocked.value === null && /2026-03/.test(blocked.detail[0].t), JSON.stringify(blocked));
}


{ // THE VALUE COMPASS (David 30.10): decision 128 live — a range from the books, the strongest lever, what moved; nothing invented
  const none = M.kpiModel(k).cards.find((c) => c.key === 'value');
  ok('value: not read yet → no number, the model named', none.value === null && none.row === 'מצפן השווי' && /EBITDA × מכפיל/.test(none.sub), JSON.stringify(none));
  const err = M.kpiModel(Object.assign({}, k, { value: { reading: { value: null }, errors: ['אין רווח לפני מס במטמון — להריץ pbt_kpi'] } })).cards.find((c) => c.key === 'value');
  ok('value: no books → "לא חושב" and the reason', err.value === null && /להריץ pbt_kpi/.test(err.sub), JSON.stringify(err));
  const reading = { value: { low: 16141567, mid: 17554620, high: 20380726 }, annual: { revenue: 11142392, ebitda: 2826106, margin: 25.36 }, growth: { revenue: -9.89, pbt: 10.07 },
    multiple: { base: 5, value: 4.5, low: 4, high: 5.5, adjustments: [{ he: 'ירידה במכירות', delta: -0.5, evidence: '-9.89% מול אשתקד' }] }, net_cash: 4837143, concentration: null,
    levers: [{ he: 'הסמכה (EN 1504 · אישורי אש)', delta_value: 1413053, step: 'הסמכה אחת', state: 'לא הותחלה', domain: 'מטריה', grade: 'assumption' }],
    since_last: null, definition: 'שווי = EBITDA × מכפיל + מזומן נטו', caveats: ['הספרים חלקיים'] };
  const v = M.kpiModel(Object.assign({}, k, { value: { reading, sources: ['pbt_kpi'], errors: [] } })).cards.find((c) => c.key === 'value');
  ok('value: the mid in David\'s notation, the range, PARTIAL, the strongest lever with its ₪ per step', v.value === '₪17.55M' && /טווח ₪16\.14M – ₪20\.38M · חלקי/.test(v.pct) && /המנוף החזק: הסמכה.*\+₪1\.41M להסמכה אחת/.test(v.sub) && /קריאה ראשונה/.test(v.dot), JSON.stringify(v));
  ok('value: the detail shows EBITDA, the multiple and its evidence, net cash, the levers marked (הנחה), and the caveats', v.detail.some((d) => /EBITDA.*₪2\.83M/.test(d.b)) && v.detail.some((d) => /ירידה במכירות \(-0\.5\)/.test(d.t)) && v.detail.some((d) => /מזומן נטו · ₪4\.84M/.test(d.b)) && v.detail.some((d) => /מטריה · הסמכה.*\(הנחה\)/.test(d.t)) && v.detail.some((d) => /הסתייגות: הספרים חלקיים/.test(d.t)), JSON.stringify(v.detail));
  ok('value: its own read-only capability, fetched after the panel is drawn', /cap\('value_compass',\{\}\)\.then\(r=>\{RAILS\.value=/.test(src) && /value:RAILS\.value\|\|null/.test(src));
}

// ── when the engine does not answer ──
const e = M.kpiModel({});
ok('no engine row → the header says so and every card is "לא מאומת" or "לא מחובר" — no number invented, no state colour', e.header === 'אין תמונת מצב' && e.header2 === 'מנוע תמונת המצב לא ענה' && e.cards.length === 12 && e.cards.every((c) => c.value === null && (c.state === 'na' || c.state === 'none')) && e.cards.map((c) => c.key).join(',') === m.cards.map((c) => c.key).join(','), e.cards.map((c) => c.key + ':' + c.value + ':' + c.state).join(' '));
const partial = M.kpiModel({ month: Object.assign({}, k.month, { ly_month: null, unbilled: null, backlog: null }) });
ok('no Baseline → percentages are "לא מאומת", the ₪ facts stay; no pipeline → coverage grey', partial.cards.find((c) => c.key === 'sales').pct === 'לא מאומת' && partial.cards.find((c) => c.key === 'sales').value === '₪136K' && partial.cards.find((c) => c.key === 'cover').state === 'na' && partial.cards.find((c) => c.key === 'cover').value === null && partial.header === 'אוקטובר · Baseline לא מאומת', partial.header);

// ── source pins: the panel, not another dashboard ──
ok('the section is the SAME panel (id, class) and the same grid element, two per row', /<section class="railCard collapsible" id="kpiCard" data-collapsed="false" data-lia-change="524a206c">/.test(html) && /<div class="kpiGrid railBody" id="kpis" data-lia-change="9d0d79f9"><\/div>/.test(html) && /\.kpiGrid\{display:grid;grid-template-columns:1fr 1fr;gap:12px\}/.test(html));
ok('production · lab · risks is a quiet list right under the KPIs, before TODAY — and the organizer is still in the rail', html.indexOf('id="kpiCard"') < html.indexOf('id="opsCard"') && html.indexOf('id="opsCard"') < html.indexOf('<span>TODAY</span>') && /<div class="miniList railBody" id="ops"><\/div>/.test(html) && /<details class="railCard orgWrap" id="orgWrap">/.test(html));
ok('the ops list reads only the organizer\'s KPIs and exceptions; supply chain and a missing read say "לא מחובר"', /function renderOps\(\)\{/.test(src) && /html\+=supplyItemHtml\(RAILS\.supply,item\);/.test(src) && /cap\('supply_chain',\{\}\)\.then/.test(src) && /function supplyMoneyText\(agg\)/.test(src) && /x\.verification!=='NOT_CONNECTED'/.test(src) && /כמות פעילות אינה הצלחה/.test(src));
ok('WORK 819cffba\'s forward estimate now lives as the sales→orders→billing row (marker kept); the annual target is the year lead — no duplicate line or tile', /data-lia-change="819cffba"/.test(src) && !/key:'annual_target'/.test(src) && !/הערכת צבר קדימה/.test(src));
ok('no second dashboard: one #kpis grid, one renderKpis, one model call', (html.match(/id="kpis"/g) || []).length === 1 && (src.match(/function renderKpis\(\)/g) || []).length === 1 && /const m=kpiModel\(k,kfmt\);RAILS\.kpiModel=m;/.test(src));
ok('the two-line head is set from the model, and keeps the height the desktop lock measured (two 19.2px lines)', /setKpiHeader\(m\.header,m\.header2\)/.test(src) && /#kpiCard \.railHeadMeta\{[^}]*line-height:19\.2px/.test(html));
ok('accordion: opening a card folds every other open card in the grid, and remembers one', /if\(!open\)document\.querySelectorAll\('#kpis \.kpiTile\[data-open="true"\]'\)\.forEach/.test(src));
ok('a chat answer still lands on its card: every CARD_ROUTES kpi key maps to one of the nine (or to נתונים נוספים)', (() => { const keys = [...src.matchAll(/kind:'kpi',key:'([a-z_0-9]+)'/g)].map((x) => x[1]); const alias = src.match(/const KPI_ROUTE_ALIAS=\{([^}]*)\}/)[1]; return keys.length >= 6 && keys.every((key) => M.KPI_CARD_KEYS.includes(key) || new RegExp('\\b' + key + ":'").test(alias)); })());
ok('opening a routed card also un-collapses the panel it lives in', /function openKpiDetail\(key\)\{\s*key=KPI_ROUTE_ALIAS\[key\]\|\|key;[\s\S]*?toggleRailSection\('kpiCard'\)/.test(src));
ok('the phone drawer answers the new keys from the same model', /if\(KPI_CARD_KEYS\.indexOf\(key\)>=0\)\{\s*const m=RAILS\.kpiModel\|\|kpiModel\(RAILS\.kpis\|\|\{\},kfmt\);/.test(src));
ok('the month facts ride the one engine row (kpisFromSnapshot), copied not recomputed', /month:monthFactsFromSnapshot\(d,asOf,!!cachedAt\),/.test(src));
ok('a signed value keeps its sign in front — the big number is bidi-isolated (dir=auto)', /<div class="v" dir="auto">/.test(src));
ok('privacy mode still hides money on the cards', /function kfmt\(n\)\{return privacyOn\(\)\?'—':kfmtRaw\(n\);\}/.test(src));
ok('the build stamp moved to 28.10 (supply chain line)', /const LIA_BUILD='2026-10-28\.\d+';/.test(src));
ok('the fixture is the engine\'s real row of 5.10 14:28Z', F.at === '2026-10-05T14:28:09.797Z' && F.row.invoices.mtd.net === 136174 && F.row.rate.projected_month === 953218 && F.row.rate.day_kind === 'working' && F.row.windows.working_days.total === 21 && /decision 164/.test(F.note_164));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} KPI panel asserts passed`);
process.exit(bad ? 1 : 0);
