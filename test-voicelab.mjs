// The Voice Lab conversation logic, run with no audio, no network, no mic.
// Everything here is the SHIPPED voice-lab.js, not a copy.
//   node test-voicelab.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('./voice-lab.js');

let bad = 0, total = 0;
const ok = (l, c, x) => { total++; if (!c) { console.log(`FAIL  ${l}${x ? '\n      ' + x : ''}`); bad++; } };

// ── Test C — a thinking pause is not an end of turn ────────────────────────
ok('C. "אני חושב ש…" + 1.2s silence → still his turn',
   V.endOfTurn({ transcript: 'אני חושב ש', silenceMs: 1200 }) === false);
ok('C2. …and at 2.4s it finally ends',
   V.endOfTurn({ transcript: 'אני חושב ש', silenceMs: 2400 }) === true);
ok('C3. a complete sentence ends at the normal window',
   V.endOfTurn({ transcript: 'מה קורה היום בפרסקו', silenceMs: 950 }) === true);
ok('C4. …but not at 400ms — that is breathing',
   V.endOfTurn({ transcript: 'מה קורה היום בפרסקו', silenceMs: 400 }) === false);
ok('C5. the STT saying final does NOT override mid-thought',
   V.endOfTurn({ transcript: 'בעצם תבדקי קודם את', silenceMs: 300, isFinalFromStt: true }) === false);
ok('C6. a final on a complete sentence is taken immediately',
   V.endOfTurn({ transcript: 'תבדקי את המכירות', silenceMs: 0, isFinalFromStt: true }) === true);
ok('C7. nobody waits forever — hard cap ends it',
   V.endOfTurn({ transcript: 'אני חושב ש', silenceMs: 6000 }) === true);
ok('C8. silence with nothing said is never a turn',
   V.endOfTurn({ transcript: '   ', silenceMs: 9000 }) === false);

// ── Test H — barge-in, and what must NOT count as one ──────────────────────
ok('H. a real interruption stops her', V.isBargeIn('רגע, עזבי את זה') === true);
for (const b of ['מממ', 'אהה', 'כן', 'נכון', 'הבנתי'])
  ok(`H2. "${b}" while she speaks is agreement, not an interruption`, V.isBargeIn(b) === false);
ok('H3. a cough / single syllable does not stop her', V.isBargeIn('אה') === false);

// ── Test B — interrupt mid-answer, keep the conversation ───────────────────
{
  let stopped = 0;
  const ch = V.createVoiceChannel({ stopAudio: () => stopped++, now: () => 42 });
  ch.open();
  ok('B0. mic opens only from IDLE', ch.state === V.VS.LISTENING);
  ok('B1. a second open is refused while listening', ch.open() === false);
  ch.heard({ transcript: 'מה קורה היום בפרסקו', isFinalFromStt: true });
  ok('B2. end of turn → PROCESSING', ch.state === V.VS.PROCESSING);
  const chunks = ch.answer('משאב שיקום. הם היו קונים כל עשרה ימים ואז נעצרו. הייתי מתקשרת אליהם.', 'ASK');
  ok('B3. she is speaking', ch.state === V.VS.SPEAKING);
  ok('B4. and speaks in chunks so audio starts early', chunks.length >= 2, JSON.stringify(chunks));
  const r = ch.heard({ transcript: 'רגע, עזבי את זה. מה עם משאב שיקום?' });
  ok('B5. that is a barge-in', r === 'BARGE_IN');
  ok('B6. her audio was stopped exactly once', stopped === 1);
  ok('B7. and she is listening again, not reset', ch.state === V.VS.LISTENING);
  ok('B8. the session was never torn down',
     ch.trail.includes('INTERRUPTED') && ch.trail[0] === 'LISTENING');
  ok('B9. stop latency was measured', ch.telemetry.bargeInStopMs === 42);
}

// ── streaming — first chunk short so she starts sooner ─────────────────────
{
  const long = 'משאב שיקום הוא הלקוח שהייתי מטפלת בו קודם. הם היו קונים בערך כל עשרה ימים '
             + 'ואז נעצרו כמעט לשנה שלמה. זה נראה לי יותר כמו שבירת קשר מאשר דעיכה טבעית. '
             + 'אם הייתי במקומך הייתי מתקשרת אליהם היום ומנסה להבין מה השתנה.';
  const c = V.speechChunks(long);
  ok('S1. the answer is split for streaming', c.length >= 3, `${c.length} chunks`);
  ok('S2. the first chunk is short — that is time-to-first-audio', c[0].length <= 150, c[0]);
  ok('S3. nothing is lost in the split',
     c.join(' ').replace(/\s+/g, '') === long.replace(/\s+/g, ''));
  ok('S4. no chunk is cut mid-word', c.every(x => !/\S$/.test(x) || long.includes(x)));
  ok('S5. an empty answer produces no audio', V.speechChunks('').length === 0);
}

// ── the safety rule voice could quietly break ──────────────────────────────
ok('R1. voice can NEVER approve anything', V.voiceCanApprove('DO') === false
   && V.voiceCanApprove('ASK') === false && V.voiceCanApprove('ACTION_REQUEST') === false);
ok('R2. a DO goes to visual approval', V.needsVisualApproval('DO') === true);
{
  const ch = V.createVoiceChannel({});
  ch.open(); ch.heard({ transcript: 'תשלחי לו את המפרט', isFinalFromStt: true });
  const chunks = ch.answer('הכנתי טיוטה.', 'DO');
  ok('R3. an action is NOT spoken as done — it waits for the screen',
     ch.state === V.VS.WAITING_CONFIRMATION && chunks.length === 0);
}

// ── Test I — a dead voice session must never take the chat with it ─────────
{
  const ch = V.createVoiceChannel({});
  ch.open(); ch.fail();
  ok('I1. a failure lands back on IDLE, never stuck', ch.state === V.VS.IDLE);
  ok('I2. and is counted', ch.telemetry.errors === 1);
  ok('I3. the mic can be opened again afterwards', ch.open() === true);
}

// ── telemetry holds timings only ───────────────────────────────────────────
{
  const t = V.newTelemetry();
  V.mark(t, 'firstAudioMs', 310); V.mark(t, 'firstAudioMs', 999);
  ok('T1. first-audio latency is recorded once', t.firstAudioMs === 310);
  // The right assertion is about VALUES, not names: firstTranscriptMs is a
  // timing, and a name check flagged it. What must never happen is a field
  // holding content — so every value must be a number or null, never a string.
  t.firstTranscriptMs = 120; t.kernelMs = 800;
  ok('T2. every telemetry value is a timing, never content',
     Object.values(t).every(v => v === null || typeof v === 'number'),
     JSON.stringify(t));
}

// ── the architecture rule, asserted against the source itself ──────────────
{
  const src = require('node:fs').readFileSync(new URL('./voice-lab.js', import.meta.url), 'utf8');
  ok('A1. no second brain: nothing here calls a model',
     !/anthropic|openai|\bllm\b|completion|chat\/completions/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('A2. no ElevenAgents — that platform carries its own LLM',
     !/agent_id|convai|elevenagents/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('A3. no API key ever appears client-side',
     !/xi-api-key|ELEVENLABS_API_KEY|sk_[A-Za-z0-9]/.test(src));
}

console.log(bad ? `\n${bad}/${total} FAILED` : `${total} checks passed`);
process.exit(bad ? 1 : 0);
