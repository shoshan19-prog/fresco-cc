// ASK-IN-A-ROW + THE YAELI MICROPHONE (David, 1.9), pinned.
//
// lia.html: a typed QUESTION no longer waits for the one in flight — each ask
// owns a pending bubble and its answer lands in it, in place. Everything with
// side effects (notes, actions, files) and the microphone stay single-turn.
// yaeli.html: mic (browser speech → Whisper fallback via the lia transcribe
// route) and the same non-blocking ask pattern.
//   node test-ask-row.mjs
import { readFileSync } from 'node:fs';

const lia = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const yaeli = readFileSync(new URL('./yaeli.html', import.meta.url), 'utf8');
let passed = 0, failed = 0;
const check = (n, f) => { try { f(); passed++; console.log('PASS ', n); } catch (e) { failed++; console.log('FAIL ', n, '—', e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };

// ── LIA: the blanket gate is gone, the guards that matter stayed ───────────
check('LIA: the blanket "request in flight" return is out of sendPrimary', () => {
  assert(!/if\(TURN==='PROCESSING'\)return;\s*\/\/ a request is in flight/.test(lia),
    'typed questions still wait for the previous one');
});
check('LIA: actions (DO/EXECUTE) still run one at a time', () => {
  assert(/פעולות רצות אחת-אחת/.test(lia), 'an action could start on top of a live turn');
});
check('LIA: attachments still take the single turn', () => {
  assert(/מסיימת את הקודמת ואז אסתכל על הקובץ/.test(lia));
});
check('LIA: an overflow ask gets its own id; a double-send of the same words within 900ms is one', () => {
  assert(/if\(intent!=='ASK'\)return;/.test(lia), 'non-ask intents can overflow the turn');
  assert(/LASTSEND\.t&&Date\.now\(\)-LASTSEND\.at<900/.test(lia), 'no double-tap guard');
});
check('LIA: every ask owns a pending bubble and resolves IT (answers glued to questions)', () => {
  assert(/function addPendingTurn\(\)/.test(lia) && /function resolvePendingTurn\(/.test(lia));
  assert(/const ph=addPendingTurn\(\);/.test(lia), 'doAsk does not take a pending bubble');
  assert(/finishAsk\(ph,res,spokenAnswer\(res\)\)/.test(lia), 'the answer does not land in its bubble');
});
check('LIA: the turn machine is released by the LAST resolver; overlapped answers are text, not two voices', () => {
  assert(/if\(INFLIGHT>0\)return;\s*\/\/ others still thinking/.test(lia.replace(/ /g, ' ')) || /INFLIGHT>0\)return;/.test(lia));
  assert(/if\(overlapped\)\{setMode\('idle'\);endTurn\(\);\}/.test(lia), 'overlap does not release the turn silently');
  assert(/if\(INFLIGHT===1\)speak\(filler\(\)\)/.test(lia), 'every overlapping ask would speak a filler');
});
check('LIA: an unanswered ask never pairs as an answer in kernel history', () => {
  assert(/else if\(t\.pending\)continue;/.test(lia), 'pending bubbles leak into {q,a} history');
});
// The pairing law, executed — not just grepped.
check('LIA: historyForKernel truly skips pending bubbles (executed)', () => {
  const m = lia.match(/function historyForKernel\(currentText\)\{[\s\S]*?\n return out\.slice\(-4\);\}/);
  assert(m, 'could not slice historyForKernel');
  const SESSION = { turns: [
    { role: 'me', text: 'שאלה 1' }, { role: 'lia', text: 'תשובה 1' },
    { role: 'me', text: 'שאלה 2' }, { role: 'lia', text: '⏳ חושבת על זה…', pending: true },
    { role: 'me', text: 'שאלה 3' }, { role: 'lia', text: 'תשובה 3' },
  ] };
  const fn = new Function('SESSION', 'ENTITY_Q', m[0] + '; return historyForKernel("מה?");');
  const out = fn(SESSION, undefined);
  assert(out.length === 2, `paired ${out.length}, expected 2`);
  assert(out[0].a === 'תשובה 1' && out[1].a === 'תשובה 3', JSON.stringify(out));
  assert(!out.some((p) => /חושבת/.test(p.a)), 'a pending bubble was sent as an answer');
});

// ── YAELI: the microphone and the same non-blocking asks ───────────────────
check('YAELI: a microphone button exists beside שלח', () => {
  assert(/id="mic"/.test(yaeli) && /toggleMic\(\)/.test(yaeli));
});
check('YAELI: two engines — browser speech first, Whisper fallback through the lia transcribe route', () => {
  assert(/SpeechRecognition\|\|window\.webkitSpeechRecognition/.test(yaeli));
  assert(/API\+'&transcribe'/.test(yaeli), 'no server transcription fallback');
  assert(/x-audio-type/.test(yaeli), 'audio type header missing');
});
check('YAELI: a transcript becomes a SENT question — a talk, not a form', () => {
  assert(/if\(t\)send\(t\);/.test(yaeli), 'the transcript does not auto-send');
});
check('YAELI: asks never block each other; each answer fills its own bubble', () => {
  assert(!/if\(BUSY\)return/.test(yaeli), 'the composer still blocks while thinking');
  assert(/function fillBubble\(/.test(yaeli) && /fillBubble\(w,ans/.test(yaeli));
  assert(/let INFLIGHT=0/.test(yaeli));
});
check('YAELI: recording is explicit — tap to start, visible state, tap to stop', () => {
  assert(/setRec\(true\)/.test(yaeli) && /setRec\(false\)/.test(yaeli) && /#mic\.rec/.test(yaeli));
});

console.log(`\n${passed}/${passed + failed} asserts passed`);
process.exit(failed ? 1 : 0);
