// Voice input must become ONE clean utterance. These cases are taken from what
// David actually saw on his phone, not from what the API is documented to do —
// the Android speech service finalizes progressively, re-reporting the whole
// sentence each time, so appending results duplicated every word.
// Extracts mergeSpeech from lia.html itself, so this can never drift from the
// panel that ships.
//   node test-speech.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const block = src.slice(src.indexOf('function mergeSpeech'), src.indexOf('function startSR'));
const mergeSpeech = new Function(block + '\nreturn mergeSpeech;')();

let bad = 0, total = 0;
function eq(label, got, want) {
  total++;
  if (got !== want) { console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); bad++; }
}

// The exact production failure: "איךאיך אנחנואיך אנחנו מתקדמים..."
eq('progressive finalization collapses to one sentence',
  mergeSpeech(['איך', 'איך אנחנו', 'איך אנחנו מתקדמים']),
  'איך אנחנו מתקדמים');
// The earlier mobile failure, same shape.
eq('the greeting case from the first mobile report',
  mergeSpeech(['בוקר', 'בוקר טוב', 'בוקר טוב לאה']),
  'בוקר טוב לאה');
// A final plus the interim guess that extends it — what the note box shows mid-sentence.
eq('interim extending the final does not double the text',
  mergeSpeech(['איך אנחנו', 'איך אנחנו מתקדמים עם מורן']),
  'איך אנחנו מתקדמים עם מורן');

// Genuinely separate utterances must still be joined, with a space.
eq('two real sentences are joined',
  mergeSpeech(['דיברתי עם יוסי.', 'הבטחתי לשלוח לו מפרט מחר.']),
  'דיברתי עם יוסי. הבטחתי לשלוח לו מפרט מחר.');
eq('a service replaying the same result verbatim is ignored',
  mergeSpeech(['מה קורה עם מורן', 'מה קורה עם מורן']),
  'מה קורה עם מורן');
eq('an older shorter state arriving late is ignored',
  mergeSpeech(['איך אנחנו מתקדמים', 'איך אנחנו']),
  'איך אנחנו מתקדמים');
eq('a repeat of the tail is not appended again',
  mergeSpeech(['בוקר טוב', 'טוב']),
  'בוקר טוב');

// Shape safety — these come straight off a browser event.
eq('empty and whitespace segments vanish', mergeSpeech(['', '   ', 'שלום']), 'שלום');
eq('no segments at all is empty, not undefined', mergeSpeech([]), '');
eq('a missing list does not throw', mergeSpeech(undefined), '');
eq('surrounding whitespace is trimmed', mergeSpeech(['  שלום  ']), 'שלום');

// The whole point: the old append behaviour would have produced the corrupted
// string. Prove the new one cannot, for the literal phrase from production.
const corrupted = ['איך', 'איך אנחנו', 'איך אנחנו מתקדמים'].join('');
eq('the corrupted production string is not reachable any more',
  mergeSpeech(['איך', 'איך אנחנו', 'איך אנחנו מתקדמים']) === corrupted, false);

// One recording must never become two user turns, whatever events the browser
// fires (onend and onerror can both arrive for the same recognition).
{
  total++;
  const guarded = /function afterTranscript\(\)\{\s*if\(SUBMITTED\)return;SUBMITTED=true;/.test(src);
  const reset = /function uiStart\([^)]*\)\{[^\n]*SUBMITTED=false;/.test(src);
  if (!guarded || !reset) {
    console.log(`FAIL  submission is debounced per recording (guard:${guarded} reset:${reset})`); bad++;
  }
}
// And the recognition handler must merge, never accumulate.
{
  total++;
  const onresult = src.slice(src.indexOf('r.onresult='), src.indexOf('r.onerror='));
  if (/fin\s*\+=|interim\s*\+=/.test(onresult) || !/mergeSpeech/.test(onresult)) {
    console.log('FAIL  onresult must merge segments, never accumulate them'); bad++;
  }
}

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
