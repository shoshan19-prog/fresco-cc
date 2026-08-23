/* LIA Voice Lab — ElevenLabs as ears and voice. Not as a brain.
 *
 * The whole point of this file is what it does NOT do. It does not reason, does
 * not remember, does not route tools, does not decide permissions. A transcript
 * from here becomes an ordinary David turn in the existing thread; an answer
 * from the existing kernel becomes audio. Everything between those two points
 * is the LIA that already exists.
 *
 *   microphone → Scribe Realtime v2 (~150ms) → the SAME classify()/doAsk()
 *   → command-center kernel → the SAME answer → TTS stream-input (Flash v2.5)
 *
 * ElevenAgents is deliberately not used: it carries its own LLM, memory and
 * tool routing, which is a second brain by definition.
 *
 * Every export below is pure or state-only so test-voicelab.mjs can run the
 * conversation logic with no audio, no network and no microphone. */

/* ── states ───────────────────────────────────────────────────────────────
   The four production states are unchanged so this can share the existing
   machine rather than fork it. Three are added for what voice introduces. */
const VS = {
  IDLE: 'IDLE', LISTENING: 'LISTENING', PROCESSING: 'PROCESSING', SPEAKING: 'SPEAKING',
  INTERRUPTED: 'INTERRUPTED',              // he talked over her; hers stops, his continues
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  ERROR: 'ERROR',
};

/* ── natural silence ──────────────────────────────────────────────────────
   A pause is not an end of turn. "אני חושב ש…" followed by two seconds of
   silence is a man thinking, and cutting him off there is the single most
   robotic thing a voice assistant does.
   Two signals decide it: how long the silence is, and whether what he said so
   far can stand as a sentence. A trailing conjunction or preposition means
   more is coming, so the window stretches. */
const TRAILING_INCOMPLETE =
  /(?:^|\s)(?:ש|של|את|עם|על|כי|אבל|אז|גם|או|לא|רק|כדי|בגלל|למרות|אם|כאשר|בעצם|יעני|כלומר|לגבי|בקשר|מול|בין|לפני|אחרי|תוך|בזמן)\s*$|[,\-–—]\s*$/;
const SILENCE_MS = { base: 900, thinking: 2200, hardCap: 6000 };

function endOfTurn({ transcript, silenceMs, isFinalFromStt }) {
  const t = String(transcript || '').trim();
  if (!t) return false;
  // The service saying "committed" is strong evidence, but it is still wrong
  // mid-thought — hold briefly rather than answering half a sentence.
  if (isFinalFromStt && !TRAILING_INCOMPLETE.test(t)) return true;
  if (silenceMs >= SILENCE_MS.hardCap) return true;         // he trailed off for good
  if (TRAILING_INCOMPLETE.test(t)) return silenceMs >= SILENCE_MS.thinking;
  return silenceMs >= SILENCE_MS.base;
}

/* ── speaking early ───────────────────────────────────────────────────────
   Waiting for a whole answer before making a sound is most of the felt
   latency. Speech is emitted clause by clause, so she starts on the first
   idea while the rest is still arriving. Chunks are split on sentence ends,
   never mid-word, and the first one is kept short on purpose — time to first
   audio matters more than the size of the buffer. */
/* first is deliberately about one clause. Testing this against a real answer
   showed 90/220 producing a SINGLE chunk for a short reply and two for a long
   one — which means she waits for the whole sentence before making a sound,
   the exact latency this is supposed to remove. A clause is enough to start. */
function speechChunks(text, { first = 55, rest = 140 } = {}) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const out = [];
  let i = 0;
  /* Prefer the last natural break at or BEFORE the target size. The first
     version searched a window of want+60 with lastIndexOf, which picks the
     FURTHEST break in that window — so a 55-character target produced a
     99-character first chunk and she still waited most of a sentence before
     speaking. Overshoot is allowed only when there is no break before the
     target at all. */
  const breakAt = (win, want) => {
    const ends = ['. ', '! ', '? ', ', ', ' '];
    for (const sep of ends) {
      const before = win.lastIndexOf(sep, want);
      if (before > want * 0.35) return before + sep.length - 1;
    }
    for (const sep of ends) {                 // nothing before the target: take the next one
      const after = win.indexOf(sep, want);
      if (after > -1 && after < want * 1.6) return after + sep.length - 1;
    }
    return -1;
  };
  while (i < s.length) {
    const want = out.length === 0 ? first : rest;
    // Absorb the remainder only when it is genuinely a tail. At 1.3 this
    // swallowed two whole sentences into the final chunk, which is a long
    // silence right where the answer should be flowing.
    if (s.length - i <= want * 1.05) { out.push(s.slice(i).trim()); break; }
    const win = s.slice(i, i + Math.ceil(want * 1.6));
    let cut = breakAt(win, want);
    if (cut <= 0) cut = want;
    out.push(s.slice(i, i + cut + 1).trim());
    i += cut + 1;
  }
  return out.filter(Boolean);
}

/* ── barge-in ─────────────────────────────────────────────────────────────
   He must be able to cut across her. Speech stops on the FIRST real word, not
   at the end of the utterance — but a cough or a "מממ" must not stop her, or
   she becomes impossible to listen to. So: a barge-in needs enough speech to
   be a genuine interruption, and the conversation is preserved either way. */
const BACKCHANNEL = /^(?:מממ|אהמ|אה|אוקיי|אוקי|כן|נכון|בסדר|הבנתי|מ+)\s*$/;
function isBargeIn(partial, { minChars = 4 } = {}) {
  const t = String(partial || '').trim();
  if (!t) return false;
  if (BACKCHANNEL.test(t)) return false;      // agreeing while she talks is not interrupting
  return t.length >= minChars;
}

/* ── raw speech is not authority ──────────────────────────────────────────
   The existing rule, restated where voice could quietly break it: a
   transcribed "כן" never approves anything. Speech recognition mishears, and
   an R3/R4 action approved because a microphone thought it heard a yes is the
   one failure this system must not have. Confirmation of an ACTION always
   returns to the visible approval path. */
function voiceCanApprove(intent) {
  return false;                                // deliberately total. Voice never approves.
}
function needsVisualApproval(intent) {
  return intent === 'DO' || intent === 'ACTION_REQUEST';
}

/* ── telemetry ────────────────────────────────────────────────────────────
   Timings only. No audio is retained, no transcript is stored here, and
   nothing about what was said leaves the object — the point is to know
   whether she feels fast, not what was discussed. */
function newTelemetry() {
  return {
    firstTranscriptMs: null, endOfTurnMs: null, kernelMs: null,
    firstAudioMs: null, bargeInStopMs: null, errors: 0, turns: 0,
  };
}
function mark(t, field, ms) {
  if (t && t[field] === null && typeof ms === 'number') t[field] = Math.round(ms);
  return t;
}

/* ── the channel ──────────────────────────────────────────────────────────
   Holds state and timings. The transport (WebSocket, MediaRecorder,
   AudioContext) is injected, so the whole conversation can be driven in a
   test with no browser at all. */
function createVoiceChannel(io = {}) {
  let state = VS.IDLE;
  let tel = newTelemetry();
  const log = [];
  const set = (s) => { log.push(s); state = s; if (io.onState) io.onState(s); return s; };

  return {
    get state() { return state; },
    get telemetry() { return tel; },
    get trail() { return log.slice(); },

    // Only ever from an explicit gesture — the production rule, unchanged.
    open() {
      if (state !== VS.IDLE) return false;
      set(VS.LISTENING); return true;
    },
    heard({ transcript, silenceMs = 0, isFinalFromStt = false }) {
      if (state === VS.SPEAKING && isBargeIn(transcript)) {
        if (io.stopAudio) io.stopAudio();
        mark(tel, 'bargeInStopMs', io.now ? io.now() : 0);
        set(VS.INTERRUPTED);
        set(VS.LISTENING);                    // his new sentence continues, session intact
        return 'BARGE_IN';
      }
      if (state !== VS.LISTENING) return 'IGNORED';
      if (!endOfTurn({ transcript, silenceMs, isFinalFromStt })) return 'STILL_TALKING';
      set(VS.PROCESSING);
      tel.turns++;
      return 'END_OF_TURN';
    },
    // The answer comes from the existing kernel. This only voices it.
    answer(text, intent) {
      if (needsVisualApproval(intent)) { set(VS.WAITING_CONFIRMATION); return []; }
      set(VS.SPEAKING);
      return speechChunks(text);
    },
    finishedSpeaking() { if (state === VS.SPEAKING) set(VS.IDLE); },
    fail() { tel.errors++; set(VS.ERROR); set(VS.IDLE); },   // never strands the UI
    reset() { tel = newTelemetry(); set(VS.IDLE); },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { VS, endOfTurn, speechChunks, isBargeIn, voiceCanApprove,
                     needsVisualApproval, newTelemetry, mark, createVoiceChannel,
                     SILENCE_MS, TRAILING_INCOMPLETE, BACKCHANNEL };
}
