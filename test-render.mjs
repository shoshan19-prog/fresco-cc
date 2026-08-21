// What David actually sees in the chat. Driven by a real failure from his live
// transcript: the kernel's whole payload was rendered into the bubble as if it
// were prose, heb() having translated "inferences" INSIDE the JSON string.
//   node test-render.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
const unwrapPayload = new Function(
  slice('const BROKEN_ANSWER', '\nfunction showAnswer') + '\nreturn unwrapPayload;')();

let bad = 0, total = 0;
function eq(label, got, want) {
  total++;
  if (got !== want) { console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); bad++; }
}
function ok(label, cond) { total++; if (!cond) { console.log(`FAIL  ${label}`); bad++; } }

// The exact shape from the transcript: the model printed its result instead of
// calling final_answer, so the entire object arrived as the answer string.
const leaked = {
  answer: JSON.stringify({
    answer: 'צודק. מעכשיו לא אעדכן אותך על עצם הבדיקה; אבדוק בשקט ואחזור רק עם המסקנה.',
    facts: [],
    inferences: ['זו העדפת סגנון לשיחה, ולא בקשת מידע שדורשת בדיקה.'],
    risks_opportunities: [],
    recommended_next_action: '',
    sources: [], evidence: [],
    confidence: 'HIGH',
    missing_information: [],
  }),
  capabilities_used: ['none'],
};
const fixed = unwrapPayload(leaked);
eq('the payload is unwrapped to the sentence David should see',
  fixed.answer, 'צודק. מעכשיו לא אעדכן אותך על עצם הבדיקה; אבדוק בשקט ואחזור רק עם המסקנה.');
ok('no brace survives into the bubble', !/[{}]/.test(fixed.answer));
ok('the evidence trapped inside the string is recovered, so פרטים works',
  Array.isArray(fixed.inferences) && fixed.inferences.length === 1);
eq('confidence is recovered too', fixed.confidence, 'HIGH');
ok('fields from the outer envelope are kept',
  Array.isArray(fixed.capabilities_used) && fixed.capabilities_used[0] === 'none');

// Fenced output — some models wrap the payload in a code fence.
{
  const fenced = { answer: '```json\n' + JSON.stringify({ answer: 'מורן מחכה לתשובה.', facts: [] }) + '\n```' };
  eq('a fenced payload is unwrapped', unwrapPayload(fenced).answer, 'מורן מחכה לתשובה.');
  const bare = { answer: '```\n' + JSON.stringify({ answer: 'שתי הודעות מחכות.' }) + '\n```' };
  eq('a bare fence is unwrapped too', unwrapPayload(bare).answer, 'שתי הודעות מחכות.');
}

// JSON-shaped but broken must still never reach the bubble or the speaker.
{
  const broken = unwrapPayload({ answer: '{"answer": broken}' });
  ok('malformed JSON never renders raw', !/[{}]/.test(broken.answer));
  ok('malformed JSON drops to low confidence', broken.confidence === 'LOW');
  const wrong = unwrapPayload({ answer: '{"facts":[1,2]}' });
  ok('valid JSON with no answer field never renders raw', !/[{}\[\]]/.test(wrong.answer));
  const empty = unwrapPayload({ answer: '{"answer":"   "}' });
  ok('an empty answer string never renders raw', !/[{}]/.test(empty.answer));
}

// It must not "fix" anything that was already correct.
{
  const normal = { answer: 'מורן מחכה לתשובה כבר יומיים.', facts: ['x'], confidence: 'MEDIUM' };
  eq('a normal answer passes through untouched', unwrapPayload(normal).answer, normal.answer);
  ok('a normal answer keeps its own fields', unwrapPayload(normal).facts[0] === 'x');
}
// Hebrew prose that merely mentions braces, or looks JSON-ish but is not.
eq('an answer that only starts with a brace is left alone',
  unwrapPayload({ answer: '{ זה לא JSON' }).answer, '{ זה לא JSON');

// Shape safety — this runs on whatever the network returned.
ok('null does not throw', unwrapPayload(null) === null);
ok('a bare string is returned as-is', unwrapPayload('hi') === 'hi');
ok('a missing answer field does not throw', unwrapPayload({ facts: [] }).facts.length === 0);

// It has to be applied on every road out: screen, voice, and memory.
ok('the screen unwraps', /function showAnswer\([^)]*\)\{\s*r=unwrapPayload\(r\);/.test(src));
ok('the voice unwraps', /function spokenAnswer\([^)]*\)\{\s*r=unwrapPayload\(r\);/.test(src));
ok('conversation memory stores prose, not a payload',
  /res=unwrapPayload\(res\);[\s\S]{0,120}LAST=\{q:text,res:res\}/.test(src));

// David asked for the standing headings to go.
ok('"מה שמעניין" is no longer stamped on answers', !src.includes("'מה שמעניין'"));
ok('"אני ממליצה" is no longer stamped on answers', !src.includes("'אני ממליצה'"));
ok('the extra line still exists when it adds something',
  /for\(const txt of extra\)/.test(src));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
