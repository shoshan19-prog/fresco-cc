// LIVE VOICE — the realtime model is LIA's mouth, never a second brain (4.9).
//
// Two halves. The pure rules are extracted from lia.html so they cannot drift:
// the event reducer, the one-tool gate, the latency rule, the reconnect rule,
// the mint-refusal wording. Then the REAL controller runs in a real browser
// with the transport faked exactly where the network would be — the WebRTC
// peer, the data channel, the microphone, the speaker — and the panel's own
// command-center calls are answered by a stub that records them:
//   · a voice tool call becomes ONE action:'kernel' request with voice:true,
//     the same code the keyboard sends, and the server's voice_output is what
//     goes back to the model, verbatim;
//   · an unknown tool is refused without a request;
//   · a scoped code that may not open voice gets the server's refusal, no session;
//   · a refused code (401) inside a tool call answers the model "unauthorized"
//     and logs the panel out, like every 401;
//   · a dropped channel reconnects on a fresh secret; a user stop never does;
//   · barge-in marks the cut reply; end-of-speech → first sound is measured;
//   · while the session is on, the browser's own speech engine stays silent
//     and the tap-microphone stays shut.
//   node test-voice-live.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const PAGE = 'file://' + fileURLToPath(new URL('./lia.html', import.meta.url));
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
let bad = 0, total = 0;
const ok = (label, cond, extra) => { total++; if (!cond) { bad++; console.log(`FAIL  ${label}${extra ? '\n      ' + extra : ''}`); } };

// ── the pure rules ──────────────────────────────────────────────────────────
const P = new Function(slice("const LIVE_URL=", 'const LIVE={')
  + '\nreturn {LIVE_TOOL, LIVE_TOOLS, LIVE_RECONNECT_MAX, liveReconnectDelay, liveShouldReconnect, liveReduce, liveToolCall, liveLatency, liveMintError, liveHeardText, LIVE_POLICY, liveIsBackchannel, liveOutcome, liveYieldActions, liveSeedItems, liveOverlapRatio, liveQuestionFrom};')();
const POL = P.LIVE_POLICY;

ok('the one tool is deep_answer — LIA\'s own deeper processing; the old name is still accepted during the rollout', P.LIVE_TOOL === 'deep_answer' && P.LIVE_TOOLS.join(',') === 'deep_answer,ask_lia');
ok('both names pass the tool gate with a question; anything else is refused', P.liveToolCall('deep_answer', { question: 'מה מצב ריל לוקיישן?' }).ok && P.liveToolCall('ask_lia', { question: 'x' }).ok && !P.liveToolCall('delete_everything', { question: 'x' }).ok);
ok('reconnect rule = the server\'s (1s, 2s, 4s; three tries)',
  JSON.stringify([1, 2, 3, 9].map(P.liveReconnectDelay)) === '[1000,2000,4000,4000]' && P.LIVE_RECONNECT_MAX === 3);
ok('a drop is retried up to the ceiling', P.liveShouldReconnect({ attempt: 2, userStopped: false }) && !P.liveShouldReconnect({ attempt: 3, userStopped: false }));
ok('a user stop is never retried', !P.liveShouldReconnect({ attempt: 0, userStopped: true }));

{
  const st = { lia: '', calls: {} };
  const r = (ev) => P.liveReduce(ev, st);
  ok('session.created → ready', r({ type: 'session.created' })[0].kind === 'ready');
  ok('speech_started / speech_stopped are recognized', r({ type: 'input_audio_buffer.speech_started' })[0].kind === 'speech_started' && r({ type: 'input_audio_buffer.speech_stopped' })[0].kind === 'speech_stopped');
  ok('the user transcript is trimmed and keeps its utterance id', JSON.stringify(r({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item_u1', transcript: '  ליה, מה מצב REAL·LOCATION?  ' })) === '[{"kind":"user_said","text":"ליה, מה מצב REAL·LOCATION?","item_id":"item_u1"}]');
  ok('an empty transcript settles its utterance as heard-nothing (nothing waits on it)', JSON.stringify(r({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item_u2', transcript: '  ' })) === '[{"kind":"ear_failed","item_id":"item_u2"}]');
  ok('a failed transcription settles its utterance too', JSON.stringify(r({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'item_u3' })) === '[{"kind":"ear_failed","item_id":"item_u3"}]');
  ok('a commit names its utterance', JSON.stringify(r({ type: 'input_audio_buffer.committed', item_id: 'item_u4' })) === '[{"kind":"speech_stopped","item_id":"item_u4","committed":true}]');
  const fc = r({ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'ask_lia', arguments: '{"question":"מה מצב REAL·LOCATION?"}' } });
  ok('a function call is one action with parsed arguments', fc.length === 1 && fc[0].kind === 'tool_call' && fc[0].call_id === 'c1' && fc[0].args.question === 'מה מצב REAL·LOCATION?');
  ok('the same call announced again (arguments.done) is NOT a second action', r({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'ask_lia', arguments: '{"question":"x"}' }).length === 0);
  ok('the preview name works too, once', r({ type: 'response.function_call_arguments.done', call_id: 'c2', name: 'ask_lia', arguments: '{"question":"y"}' })[0].kind === 'tool_call');
  ok('broken arguments are an empty object, not a crash', r({ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c3', name: 'ask_lia', arguments: '{bad' } })[0].args.question === undefined);
  r({ type: 'response.output_audio_transcript.delta', delta: 'ריל לוקיישן ' }); r({ type: 'response.output_audio_transcript.delta', delta: 'בביצוע.' });
  const said = r({ type: 'response.output_audio_transcript.done' });
  ok('the reply transcript is assembled from deltas when done carries none', said[0].kind === 'lia_said' && said[0].text === 'ריל לוקיישן בביצוע.');
  ok('…and reset afterwards', r({ type: 'response.output_audio_transcript.done' }).length === 0);
  ok('done with a transcript wins over deltas', r({ type: 'response.audio_transcript.done', transcript: 'שלום' })[0].text === 'שלום');
  ok('audio start: WebRTC event and WebSocket delta both count', r({ type: 'output_audio_buffer.started' })[0].kind === 'audio_started' && r({ type: 'response.output_audio.delta', delta: 'AAAA' })[0].kind === 'audio_started');
  ok('audio cleared = stopped by barge-in', r({ type: 'output_audio_buffer.cleared' })[0].cleared === true);
  ok('response.done carries the status', r({ type: 'response.done', response: { status: 'completed' } })[0].status === 'completed');
  ok('response.done says whether the reply called the tool', r({ type: 'response.done', response: { status: 'completed', output: [{ type: 'message' }, { type: 'function_call' }] } })[0].tool === true
     && r({ type: 'response.done', response: { status: 'completed', output: [{ type: 'message' }] } })[0].tool === false && r({ type: 'response.done', response: { status: 'completed' } })[0].tool === false);
  ok('response.done says whether the reply said anything', r({ type: 'response.done', response: { status: 'completed', output: [{ type: 'message' }] } })[0].said === true
     && r({ type: 'response.done', response: { status: 'completed', output: [] } })[0].said === false && r({ type: 'response.done', response: { status: 'completed' } })[0].said === false);
  ok('an error event carries the message', r({ type: 'error', error: { message: 'boom', code: 'x' } })[0].message === 'boom');
  ok('an unknown event is nothing', r({ type: 'rate_limits.updated' }).length === 0 && r(null).length === 0);
}
ok('ask_lia with a question runs', JSON.stringify(P.liveToolCall('ask_lia', { question: '  מה  מצב  REAL·LOCATION? ' })) === '{"ok":true,"question":"מה מצב REAL·LOCATION?"}');
ok('an unknown tool is refused, never run', P.liveToolCall('delete_everything', { question: 'x' }).ok === false && P.liveToolCall('delete_everything', {}).output.error === 'unknown_tool');
ok('an empty question is refused', P.liveToolCall('ask_lia', {}).output.error === 'empty_question');
ok('the ear\'s Hebrew is shown as David\'s words', P.liveHeardText('ליה, מה מצב הפרויקט?', 'מה מצב הפרויקט?') === 'ליה, מה מצב הפרויקט?');
ok('an ear that wrote no Hebrew is replaced by what LIA acted on', P.liveHeardText('Niya, mamycava projekt.', 'ליה, מה מצב הפרויקט?') === 'ליה, מה מצב הפרויקט?');
ok('…and kept when there is no tool question', P.liveHeardText('Niya, mamycava projekt.', '') === 'Niya, mamycava projekt.');
ok('latency = end of speech → first sound', P.liveLatency({ speech_stopped: 1000, audio_started: 2750 }) === 1750);
ok('latency is null without both marks, or out of order', P.liveLatency({ speech_stopped: 1000 }) === null && P.liveLatency({ speech_stopped: 3000, audio_started: 2000 }) === null);
ok('a refused model is named with the account\'s list — never swapped', /gpt-realtime-2/.test(P.liveMintError({ error: 'mint_failed', reason: 'model_unavailable', model: 'gpt-realtime-2', realtime_models: ['gpt-realtime'] })) && /gpt-realtime\b/.test(P.liveMintError({ reason: 'model_unavailable', model: 'gpt-realtime-2', realtime_models: ['gpt-realtime'] })) && /לא הוחלף/.test(P.liveMintError({ reason: 'model_unavailable' })));
ok('no key / no credit / bad key each say so', /OPENAI_API_KEY/.test(P.liveMintError({ error: 'no_key' })) && /יתרה/.test(P.liveMintError({ reason: 'no_api_credit' })) && /לא תקף/.test(P.liveMintError({ reason: 'bad_key' })));

// ── turn control (28.9): the rules LIA decides by ──────────────────────────
{
  const st = { lia: '', calls: {} };
  const r = (ev) => P.liveReduce(ev, st);
  const ss = r({ type: 'input_audio_buffer.speech_started', audio_start_ms: 1234, item_id: 'item_u1' })[0];
  ok('speech_started carries the offset and the user item', ss.kind === 'speech_started' && ss.audio_start_ms === 1234 && ss.item_id === 'item_u1');
  const ia = r({ type: 'response.output_item.added', response_id: 'resp_1', item: { id: 'item_1', type: 'message', role: 'assistant' } });
  ok('the assistant item id is captured when the reply starts (truncate needs it)', ia.length === 1 && ia[0].kind === 'item_added' && ia[0].item_id === 'item_1' && ia[0].response_id === 'resp_1');
  ok('a function-call output item is not an assistant message', r({ type: 'response.output_item.added', item: { id: 'x', type: 'function_call' } }).length === 0);
  const tr = r({ type: 'conversation.item.truncated', item_id: 'item_1', content_index: 0, audio_end_ms: 1800 })[0];
  ok('the server\'s truncation confirmation is an action', tr.kind === 'truncated' && tr.item_id === 'item_1' && tr.audio_end_ms === 1800);
}
ok('the policy is one object of numbers', ['grace_ms', 'overlap_yield_ms', 'backchannel_max_ms', 'transcript_wait_ms', 'truncate_margin_ms', 'seed_turns'].every((k) => Number.isFinite(POL[k])));
ok('"כן" / "ממ" / "אוקיי" while she speaks are backchannels', P.liveIsBackchannel('כן', 300) && P.liveIsBackchannel('ממ', 250) && P.liveIsBackchannel('אוקיי, כן', 600) && P.liveIsBackchannel('yeah', 200));
ok('a backchannel is short: the same word over the ceiling is not one', !P.liveIsBackchannel('כן', POL.backchannel_max_ms + 1));
ok('"כן, אבל מה עם ההזמנה?" is not a backchannel', !P.liveIsBackchannel('כן, אבל מה עם ההזמנה?', 900));
ok('"רגע" / "עצרי" are not backchannels', !P.liveIsBackchannel('רגע', 300) && !P.liveIsBackchannel('עצרי', 300));
ok('an empty ear is never a backchannel', !P.liveIsBackchannel('', 100));
ok('outcome: "רגע רגע" is an explicit signal', P.liveOutcome('רגע רגע', { heard: 'x' }).outcome === 'explicit_signal');
ok('outcome: "לא, התכוונתי לפרויקט השני" is a correction', P.liveOutcome('לא, התכוונתי לפרויקט השני', { heard: 'מה מצב הפרויקט' }).outcome === 'corrected');
ok('outcome: the same words again = repeated', P.liveOutcome('מה מצב ריל לוקיישן', { heard: 'מה מצב ריל לוקיישן?' }).outcome === 'repeated');
ok('outcome: nothing shared with the exchange = changed direction', P.liveOutcome('תשלחי מייל לרחל על הפגישה מחר', { heard: 'מה מצב ריל לוקיישן', said: 'שלוש הזמנות פתוחות' }).outcome === 'changed_direction');
ok('outcome: a follow-up on the same subject = continued normally', P.liveOutcome('ומה עם ההזמנה האחרונה של ריל לוקיישן?', { heard: 'מה מצב ריל לוקיישן', said: 'שלוש הזמנות פתוחות' }).outcome === 'continued_normally');
ok('outcome: speaking over her again = interrupted_again', P.liveOutcome('', { interrupted_again: true }).outcome === 'interrupted_again');
ok('outcome: nothing said yet = nothing to read', P.liveOutcome('', {}) === null);
{
  const y = P.liveYieldActions({ item_id: 'item_1', audio_started_at: 10000, now: 12000 });
  ok('a YIELD is cancel → clear → truncate, in that order', y.map((a) => a.type).join(',') === 'response.cancel,output_audio_buffer.clear,conversation.item.truncate');
  ok('…truncated to the audio heard, a margin short, never long', y[2].item_id === 'item_1' && y[2].content_index === 0 && y[2].audio_end_ms === 2000 - POL.truncate_margin_ms);
  ok('…no item yet = cancel and clear only (nothing to cut)', P.liveYieldActions({ item_id: '', audio_started_at: 0 }).length === 2);
  ok('…the margin never goes below zero', P.liveYieldActions({ item_id: 'i', audio_started_at: 100, now: 110 })[2].audio_end_ms === 0);
}
{
  const seed = P.liveSeedItems([{ role: 'me', text: 'מה מצב ריל לוקיישן?' }, { role: 'lia', text: '(נקטע) שלוש הזמנות פתוחות' }, { role: 'me', text: '   ' }], 6);
  ok('a renewed session is seeded from the visible conversation as text items, roles kept, the cut label dropped',
    seed.length === 2 && seed[0].type === 'conversation.item.create' && seed[0].item.role === 'user' && seed[0].item.content[0].type === 'input_text'
    && seed[1].item.role === 'assistant' && seed[1].item.content[0].type === 'output_text' && seed[1].item.content[0].text === 'שלוש הזמנות פתוחות');
  ok('…only the last N turns', P.liveSeedItems(Array.from({ length: 20 }, (_, i) => ({ role: 'me', text: 't' + i })), 3).length === 3);
  const now = 1_000_000_000;
  const aged = P.liveSeedItems([{ role: 'me', text: 'ישן', at: now - 3_600_000 }, { role: 'lia', text: 'גם ישן', at: now - 3_500_000 }, { role: 'me', text: 'טרי', at: now - 60_000 }, { role: 'lia', text: 'בלי זמן' }], 6, now, 1_800_000);
  ok('…seeding is bounded by recency (Phase A): an hour-old turn is not resurrected, a fresh one and an undated one are', aged.length === 2 && aged[0].item.content[0].text === 'טרי' && aged[1].item.content[0].text === 'בלי זמן');
  ok('the policy names the tool bound (doAsk\'s 150 s) and the seed window', POL.tool_timeout_ms === 150000 && POL.seed_window_ms === 1800000);
}

// ── wiring, as text ────────────────────────────────────────────────────────
const live = slice('/* ── LIVE VOICE', '/* ── the keyless road');
ok('the tool runs through action:kernel with voice:true and its correlation ids, nothing else', /const call=ccApi\(\{voice_session_id:run\.session_id,voice_request_id:run\.request_id,parent_item_id:run\.item_id,call_id:run\.call_id,\s*action:'kernel',body:text,history:historyForKernel\(text\),retracted:retractedForKernel\(\),request_id:reqId,voice:true\}\)/.test(live) && !/action:'cap'/.test(live));
ok('a tool reply never starts over David: while he speaks the output is returned and the reply waits for his turn end (replyOwed → the next SPEAK)', /if\(LIVE\.userSpeaking&&d\.ok\)\{LIVE\.replyOwed=true;liveRecord\('TOOL'/.test(live) && /continuity_state:LIVE\.replyOwed\?'turn_end_with_tool_reply'/.test(live) && /LIVE\.replyOwed=false;LIVE\.lastCreateFor=0;/.test(live));
ok('the tool leg is bounded by the policy (Promise.race with tool_timeout_ms), and a result is accepted only in the epoch that asked', /Promise\.race\(\[call,new Promise\(\(_,rej\)=>setTimeout\(\(\)=>rej\(new Error\('timeout'\)\),LIVE_POLICY\.tool_timeout_ms\)\)\]\)/.test(live) && /if\(run\.epoch!==LIVE\.epoch\)\{/.test(live));
ok('teardown moves the epoch and kills every session-local flag (toolBusy, lastCreateFor, pending, responseActive)', /function liveTeardown\(reason\)\{/.test(live) && /LIVE\.epoch\+\+;LIVE\.toolBusy=false;LIVE\.replyOwed=false;LIVE\.lastCreateFor=0;/.test(live) && /LIVE\.pending=null;LIVE\.audioStartedAt=0;LIVE\.responseActive=false;/.test(live));
ok('a response covers only utterances the VAD had closed before it was asked for (the 01:34:42 seam)', /LIVE\.lastCreateFor=LIVE\.userSpeaking\?\(LIVE\.lastCommittedUtt\|\|0\):\(LIVE\.uttStartedAt\|\|0\)/.test(live) && /LIVE\.lastCommittedUtt=LIVE\.uttStartedAt;/.test(live));
ok('the ordinary road says how the words arrived: typed at the send door, dictation at the transcript door, on every kernel body', /INPUT_MODALITY='typed';\s*road\(intent\)/.test(src) && /INPUT_MODALITY='dictation';\s*road\(intent\)/.test(src) && (src.match(/modality:INPUT_MODALITY/g) || []).length === 3);
ok('a synced message keeps its server time (created_at, else server_at) — so the seed window measures age, not sync time', (src.match(/at:Date\.parse\(m\.created_at\|\|m\.server_at\)\|\|Date\.now\(\)/g) || []).length === 2);
ok('nothing on the screen calls the tool "checking with LIA"', !/בודקת אצל ליה/.test(src) && !/להגיע לליה/.test(src));
ok('what goes back to the model is the server\'s voice_output', /output=res\.voice_output\|\|\{error:'no_voice_output'/.test(live));
ok('the SDP goes to OpenAI with the client secret only', /Authorization:'Bearer '\+mint\.client_secret/.test(live) && !/sk-/.test(live) && !/sk-[A-Za-z0-9_-]{20,}/.test(src));
ok('the secret is minted by command-center (voice_session), never held in the page — and the panel says it sends David\'s transcript', /ccApi\(\{action:'voice_session',transcript_question:true\}\)/.test(live) && !/localStorage\.setItem\('[^']*(secret|ek)/.test(live));
ok('the button exists and starts hidden', /id="live" onclick="liveTap\(\)"[^>]*display:none/.test(html));
ok('response.create has ONE door (liveCreateResponse); nothing else asks the model to speak', (live.match(/type:'response\.create'/g) || []).length === 1 && /function liveCreateResponse\(\)\{LIVE\.responseActive=true;/.test(live));
ok('a YIELD sends the wire of liveYieldActions and nothing decides an interruption elsewhere', /const acts=liveYieldActions\(\{item_id:LIVE\.itemId,audio_started_at:LIVE\.audioStartedAt/.test(live) && /acts\.forEach\(m=>liveSend\(m\)\)/.test(live));
ok('the trace reaches the ledger through voice_trace_log, in batches of 50', /cap\('voice_trace_log',\{session_id:LIVE\.sessionId\|\|'',model:LIVE\.model\|\|'',events:batch\}\)/.test(live) && /i\+=50/.test(live));
ok('a stop flushes what is left (pending → no_repair); EVERY connect (tap, reconnect, renewal) seeds the new channel from the recent conversation', /liveFlushTrace\(true\)/.test(live) && /LIVE\.renewing=true;liveTeardown\('renewal'\);liveFlushTrace\(false\)/.test(live) && /const seed=liveSeedItems\(SESSION\.turns,LIVE_POLICY\.seed_turns,Date\.now\(\),LIVE_POLICY\.seed_window_ms\);/.test(live));
ok('the build is bumped', /const LIA_BUILD='2026-10-01\.2'/.test(src));
ok('the tap-microphone is shut while live', /function micAllowed\(\)\{return TURN==='IDLE'&&!TTS&&!\(typeof LIVE!=='undefined'&&LIVE\.on\);\}/.test(src));
ok('the browser speech engine yields while live', /if\(typeof LIVE!=='undefined'&&LIVE\.on\)\{TTS=false;if\(done\)setTimeout\(done,0\);return;\}/.test(src));

// ── the real controller in a real browser, transport faked at the wire ─────
const browser = await chromium.launch();
const errors = [];
const STUBS = () => {
  const put = (k, v) => Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
  window.__live = { pcs: [], dcs: [], mics: 0, tracksStopped: 0 };
  class FakeDC {
    constructor(label) { this.label = label; this.readyState = 'connecting'; this.sent = []; window.__live.dcs.push(this); }
    send(s) { this.sent.push(JSON.parse(s)); try { window.__sent && window.__sent(s); } catch (e) {} }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; if (this.onclose) this.onclose(); }
    feed(ev) { this.onmessage && this.onmessage({ data: JSON.stringify(ev) }); }
  }
  class FakePC {
    constructor() { this.connectionState = 'new'; this.tracks = 0; window.__live.pcs.push(this); }
    addTrack() { this.tracks++; }
    createDataChannel(label) { this.dc = new FakeDC(label); return this.dc; }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.connectionState = 'connected';
      setTimeout(() => { this.dc.readyState = 'open'; this.dc.onopen && this.dc.onopen(); }, 5); }
    close() { this.connectionState = 'closed'; }
  }
  put('RTCPeerConnection', FakePC);
  Object.defineProperty(navigator, 'mediaDevices', { value: {
    getUserMedia: async () => { window.__live.mics++; return { getTracks: () => [{ stop() { window.__live.tracksStopped++; } }] }; } }, configurable: true });
  put('Audio', function () { this.play = () => Promise.resolve(); });
  window.__tts = { spoke: [] };
  put('speechSynthesis', { getVoices: () => [{ name: 'Carmit', lang: 'he-IL' }], cancel() {}, speak(u) { window.__tts.spoke.push(u.text); u.onend && u.onend(); } });
  put('SpeechSynthesisUtterance', function (t) { this.text = t; });
  put('SpeechRecognition', undefined); put('webkitSpeechRecognition', undefined);
};
const KERNEL = {
  answer: 'REAL·LOCATION: בביצוע. שלוש הזמנות פתוחות, האחרונה מאתמול.', confidence: 'HIGH',
  sources: ['ORDERS · קריאה חיה', 'entity_state:REAL-LOCATION'], capabilities_used: ['priority_query'],
  missing_information: [], meta: { route_taken: 'entity_status', entity_key: 'REAL-LOCATION' },
  voice_output: { answer: 'REAL·LOCATION: בביצוע. שלוש הזמנות פתוחות, האחרונה מאתמול.', confidence: 'HIGH', route: 'entity_status',
    evidence: { sources: ['ORDERS · קריאה חיה', 'entity_state:REAL-LOCATION'], capabilities_used: ['priority_query'], count: 2 } },
};
async function session(tag, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
  // A refused request (401/403/502) is part of these scenarios; the browser's
  // own "Failed to load resource" line for it is not a page error.
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  const calls = [], sent = [];
  await page.exposeFunction('__sent', (s) => sent.push(JSON.parse(s)));
  let mints = 0;
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    const code = req.headers()['x-fresco-code'] || '';
    calls.push({ ...body, __code: code });
    let json = { ok: true }, status = 200;
    if (body.action === 'state') json = { queue: [], counts: { active: 0, expired: 0, canonical: 0, pending_notes: 0 }, voice: { available: false }, model: { connected: true, provider: 'openai' }, panel_build_latest: '2026-09-04.3' };
    else if (body.action === 'voice_session' && body.probe === true) json = { probe: true, model: 'gpt-realtime-2', configured_available: opts.available !== false, realtime_models: ['gpt-realtime-2', 'gpt-realtime'], tool: 'ask_lia' };
    else if (body.action === 'voice_session') {
      if (opts.scoped) { status = 403; json = { error: 'הקוד הזה פתוח לפעולות kernel/state בלבד' }; }
      else if (opts.mintFails && mints >= (opts.mintFails.after || 0)) { status = 502; json = { error: 'mint_failed', reason: 'model_unavailable', model: 'gpt-realtime-2', realtime_models: ['gpt-realtime'], detail: 'The model `gpt-realtime-2` does not exist' }; }
      else { mints++; json = { client_secret: 'ek_test_' + mints, expires_at: Math.floor(Date.now() / 1000) + 600, model: 'gpt-realtime-2', tool: 'deep_answer', who: 'david', scoped: false, session_id: 'sess_test_' + mints }; }
    }
    else if (body.action === 'kernel') { if (code === 'bad-code') { status = 401; json = null; } else { json = KERNEL; if (opts.kernel && opts.kernel.delay) await new Promise((r) => setTimeout(r, opts.kernel.delay)); } }
    await route.fulfill({ status, contentType: json === null ? 'text/plain' : 'application/json', body: json === null ? 'unauthorized' : JSON.stringify(json) });
  });
  await page.route('https://api.openai.com/**', async (route) => {
    const req = route.request();
    calls.push({ __openai: req.url(), __auth: req.headers()['authorization'] || '', __ct: req.headers()['content-type'] || '' });
    await route.fulfill({ status: 200, contentType: 'application/sdp', body: 'v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\n' });
  });
  await page.addInitScript(() => localStorage.setItem('lia_code', 'test-code'));
  await page.addInitScript(STUBS);
  await page.goto(PAGE);
  await page.waitForSelector('#app', { state: 'visible', timeout: 5000 });
  return { page, calls, sent, ctx, mints: () => mints };
}
const feed = (page, ev) => page.evaluate((ev) => { const d = window.__live.dcs[window.__live.dcs.length - 1]; d.feed(ev); }, ev);
const liveOn = (page) => page.evaluate(() => LIVE.on);
const stat = (page) => page.textContent('#noteStat');

// ── 1. the whole loop: tap → mint → call → speech → tool → kernel → voice ───
{
  const { page, calls, sent } = await session('loop');
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  ok('1. the button appears only after the server says the model is available', calls.some(c => c.action === 'voice_session' && c.probe === true));
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  const mint = calls.find(c => c.action === 'voice_session' && !c.probe);
  ok('1a. one mint, with the panel\'s own code', !!mint && mint.__code === 'test-code');
  const sdp = calls.find(c => c.__openai);
  ok('1b. the SDP went to /v1/realtime/calls with the client secret, nothing else', !!sdp && /\/v1\/realtime\/calls\?model=gpt-realtime-2/.test(sdp.__openai) && sdp.__auth === 'Bearer ek_test_1' && /application\/sdp/.test(sdp.__ct));
  ok('1c. the microphone opened once, into the peer', await page.evaluate(() => window.__live.mics === 1 && window.__live.pcs[0].tracks === 1));
  ok('1d. the button reads ⏹ while on', (await page.textContent('#live')) === '⏹');
  await feed(page, { type: 'session.created' });
  await feed(page, { type: 'input_audio_buffer.speech_started' });
  await page.waitForTimeout(20);
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'Yeah, mama\'s have the location.' });
  ok('2. what the ear heard is on the screen at once', await page.evaluate(() => [...document.querySelectorAll('#thread .msg.me .bubble')].some(b => /mama/.test(b.textContent))));
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_1', name: 'ask_lia', arguments: JSON.stringify({ question: 'מה מצב REAL·LOCATION?' }) } });
  await page.waitForFunction(() => window.__live.dcs[window.__live.dcs.length - 1].sent.length >= 2, null, { timeout: 5000 });
  const k = calls.filter(c => c.action === 'kernel');
  ok('3. the tool became exactly ONE action:kernel request', k.length === 1, `got ${k.length}`);
  ok('3a. …with the question, voice:true, history, and the same code', k[0] && k[0].body === 'מה מצב REAL·LOCATION?' && k[0].voice === true && Array.isArray(k[0].history) && k[0].__code === 'test-code');
  ok('2a. a non-Hebrew ear line is replaced by the question LIA acted on', await page.evaluate(() => { const me = SESSION.turns.filter(t => t.role === 'me'); return me.length === 1 && me[0].text === 'מה מצב REAL·LOCATION?'; }));
  const out = sent.find(s => s.type === 'conversation.item.create');
  ok('3b. the function output is the server\'s voice_output, verbatim', !!out && out.item.type === 'function_call_output' && out.item.call_id === 'call_1' && out.item.output === JSON.stringify(KERNEL.voice_output));
  ok('3d. the kernel call names the realtime session, its own request id, the provider call and the user item (Phase A ids)', k[0].voice_session_id === 'sess_test_1' && k[0].voice_request_id === k[0].request_id && /^[0-9a-f-]{36}$/.test(k[0].request_id) && k[0].call_id === 'call_1' && k[0].parent_item_id === '');
  ok('3e. the trace holds TOOL started + done with the same ids, outcome n/a, the kernel route as continuity', await page.evaluate((rid) => { const t = LIVE.trace.filter((r) => r.decision === 'TOOL'); return t.length === 2 && t[0].continuity_state === 'tool_started' && t[1].continuity_state === 'tool_done' && t.every((r) => r.request_id === rid && r.call_id === 'call_1' && r.session_id === 'sess_test_1' && r.outcome === 'n/a') && t[1].continuity_result === 'route:entity_status' && t[1].latency_ms >= 0; }, k[0].request_id));
  ok('3c. …followed by response.create', sent[sent.indexOf(out) + 1].type === 'response.create');
  await page.waitForTimeout(30);
  await feed(page, { type: 'response.output_item.added', response_id: 'resp_1', item: { id: 'item_1', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'resp_1' });
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'ריל לוקיישן בביצוע. שלוש הזמנות פתוחות.' });
  ok('4. LIA\'s spoken answer is on the screen, with the kernel result behind it', await page.evaluate(() => { const t = SESSION.turns[SESSION.turns.length - 1]; return t.role === 'lia' && /בביצוע/.test(t.text) && t.res && t.res.meta && t.res.meta.route_taken === 'entity_status'; }));
  const lat = await page.evaluate(() => LIVE.lat.slice());
  ok('5. latency (end of speech → first sound) was measured', lat.length === 1 && lat[0] >= 20 && lat[0] < 5000, JSON.stringify(lat));
  ok('5a. …and shown', /⚡/.test(await page.textContent('#recLabel')));
  // barge-in → YIELD: David keeps talking over her
  const n0 = sent.length;
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 4000, item_id: 'item_u2' });
  ok('6. speaking over her is not yet a decision — the ear may still say "כן"', await page.evaluate(() => LIVE.interrupted === false && !!LIVE.overlap && LIVE.overlap.decided === false) && sent.length === n0);
  await page.waitForTimeout(POL.overlap_yield_ms + 150);
  const y = sent.slice(n0);
  ok('6a. past the threshold she yields: cancel → clear → truncate, in that order', y.length >= 3 && y[0].type === 'response.cancel' && y[1].type === 'output_audio_buffer.clear' && y[2].type === 'conversation.item.truncate', JSON.stringify(y.map((a) => a.type)));
  ok('6b. the truncate names the assistant item and the audio David actually heard', !!y[2] && y[2].item_id === 'item_1' && y[2].content_index === 0 && y[2].audio_end_ms >= 0 && y[2].audio_end_ms < 5000, JSON.stringify(y[2]));
  ok('6c. the YIELD is on the trace with what it did', await page.evaluate(() => { const r = LIVE.trace[LIVE.trace.length - 1]; return r.decision === 'YIELD' && r.response_cancelled === true && r.cleared === true && r.truncated_ms != null && r.interruption_source === 'user' && r.overlap_state === 'overlap' && r.overlap_ms >= 300; }));
  ok('6d. …and she is marked interrupted only now', await page.evaluate(() => LIVE.interrupted === true && LIVE.speaking === false));
  await feed(page, { type: 'output_audio_buffer.cleared' });
  await feed(page, { type: 'conversation.item.truncated', item_id: 'item_1', content_index: 0, audio_end_ms: y[2].audio_end_ms });
  await feed(page, { type: 'response.done', response: { status: 'cancelled' } });
  ok('6e. the server confirms the cut; continuity is recorded on the YIELD', await page.evaluate(() => /^truncated_\d+ms$/.test(LIVE.trace.filter((r) => r.decision === 'YIELD').pop().continuity_result)));
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'ועוד משהו שלא נאמר עד הסוף' });
  ok('6f. the cut sentence is labelled', await page.evaluate(() => /^\(נקטע\)/.test(SESSION.turns[SESSION.turns.length - 1].text)));
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'רגע, מה עם ההזמנה של אתמול?' });
  ok('6g. the YIELD\'s outcome is read from the words that interrupted: an explicit signal ("רגע")', await page.evaluate(() => LIVE.trace.filter((r) => r.decision === 'YIELD').pop().outcome === 'explicit_signal'));
  const n1 = sent.length;
  ok('6h. …and nothing is asked of the model while his turn is open', sent.slice(n0 + 3).filter((a) => a.type === 'response.create').length === 0);
  await page.waitForTimeout(POL.grace_ms + 150);
  ok('6i. his turn ended + grace → exactly one response.create (SPEAK after the yield)', sent.slice(n1).filter((a) => a.type === 'response.create').length === 1 && await page.evaluate(() => { const r = LIVE.trace.filter((x) => x.decision === 'SPEAK').pop(); return !!r && r.continuity_state === 'after_yield'; }));
  await feed(page, { type: 'response.done', response: { status: 'completed' } });
  // unknown tool
  const before = calls.filter(c => c.action === 'kernel').length;
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_2', name: 'delete_everything', arguments: '{}' } });
  await page.waitForFunction(() => window.__live.dcs[window.__live.dcs.length - 1].sent.length >= 4, null, { timeout: 5000 });
  const bad = sent.filter(s => s.type === 'conversation.item.create').find(s => s.item.call_id === 'call_2');
  ok('7. an unknown tool is refused without touching the kernel', !!bad && JSON.parse(bad.item.output).error === 'unknown_tool' && calls.filter(c => c.action === 'kernel').length === before);
  // one voice, one ear
  await page.evaluate(() => speak('שלום'));
  ok('8. the browser speech engine stays silent while live', await page.evaluate(() => window.__tts.spoke.length === 0));
  await page.evaluate(() => micTap());
  ok('8a. the tap-microphone stays shut while live', /שיחה חיה פעילה/.test(await stat(page)));
  // user stop
  await page.click('#live');
  ok('9. a user stop ends the session, releases the mic, and never reconnects', await page.evaluate(() => LIVE.on === false && LIVE.userStopped === true && window.__live.tracksStopped === 1 && LIVE.pc === null));
  await page.waitForTimeout(1200);
  ok('9a. …no new mint after the stop', calls.filter(c => c.action === 'voice_session' && !c.probe).length === 1);
  ok('9b. the button is back to 🎧', (await page.textContent('#live')) === '🎧');
  await page.close();
}

// ── 1b. the six acceptance cases on the faked wire (28.9) ───────────────────
{
  const { page, calls, sent } = await session('turns');
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  await feed(page, { type: 'session.created' });
  const creates = () => sent.filter((a) => a.type === 'response.create').length;
  const trace = (f) => page.evaluate((f) => LIVE.trace.filter((r) => r.decision !== 'SESSION' && r.decision !== 'TOOL').map((r) => ({ d: r.decision, c: r.continuity_state, cr: r.continuity_result, o: r.outcome, s: r.interruption_source })), f);
  // CASE 1 — continuous speech: no entry
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 0, item_id: 'u1' });
  await page.waitForTimeout(POL.grace_ms + 400);
  ok('C1. while David keeps talking, LIA asks for nothing and decides nothing', creates() === 0 && (await trace()).length === 0);
  // CASE 2 — a mid-thought pause is not a turn end
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await page.waitForTimeout(150);
  ok('C2. a stop opens the grace window: WAIT, no response.create', creates() === 0 && (await trace()).pop().d === 'WAIT');
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 900, item_id: 'u1b' });
  await page.waitForTimeout(POL.grace_ms + 200);
  ok('C2a. he resumed inside the window → the WAIT was right (user_resumed), still nothing asked', creates() === 0 && (await trace()).pop().cr === 'user_resumed');
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'מה מצב ריל לוקיישן, ומה עם ההזמנה האחרונה?' });
  await page.waitForTimeout(POL.grace_ms + 200);
  ok('C2b. his turn really ended → grace elapsed → ONE response.create (SPEAK, turn_end)', creates() === 1 && (await trace()).slice(-2).map((r) => r.d + ':' + (r.cr !== 'n/a' ? r.cr : r.c)).join(',') === 'WAIT:grace_elapsed,SPEAK:turn_end');
  // the reply arrives
  await feed(page, { type: 'response.output_item.added', response_id: 'r2', item: { id: 'item_2', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'r2' });
  await feed(page, { type: 'response.done', response: { status: 'completed' } });
  ok('C2c. the SPEAK now carries its latency (end of speech → first sound)', await page.evaluate(() => { const r = LIVE.trace.filter((x) => x.decision === 'SPEAK').pop(); return r.latency_ms != null && r.latency_ms > 0; }));
  // CASE 5 — a backchannel does not cancel
  const n5 = sent.length;
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 5000, item_id: 'u2' });
  await page.waitForTimeout(120);
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'כן' });
  await page.waitForTimeout(80);
  ok('C5. "כן" while she speaks: BACKCHANNEL — no cancel, no clear, no response.create; she keeps speaking', sent.length === n5 && await page.evaluate(() => LIVE.speaking === true && LIVE.interrupted === false) && (await trace()).pop().d === 'BACKCHANNEL' && (await trace()).pop().s === 'backchannel');
  ok('C5a. the backchannel is on the screen as David\'s words', await page.evaluate(() => SESSION.turns.filter((t) => t.role === 'me').pop().text === 'כן'));
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'ריל לוקיישן בביצוע, שלוש הזמנות פתוחות, האחרונה מאתמול.' });
  await feed(page, { type: 'output_audio_buffer.stopped' });
  await page.waitForTimeout(80);
  ok('C5b. …and when she finishes nothing is owed (a backchannel is not a question)', creates() === 1 && await page.evaluate(() => !/נקטע/.test(SESSION.turns[SESSION.turns.length - 1].text)));
  // CASE 6 — LIA enters after a pause; David resumes over her: recorded, auditable
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 9000, item_id: 'u3' });
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'ותשלחי לרחל את הסיכום של הפגישה' });
  await page.waitForTimeout(POL.grace_ms + 200);
  ok('C6. after his pause + grace LIA enters (SPEAK)', creates() === 2 && (await trace()).pop().d === 'SPEAK');
  ok('C6a. the BACKCHANNEL decision before it is judged by his next move: changed_direction', (await trace()).find((r) => r.d === 'BACKCHANNEL').o === 'changed_direction');
  await feed(page, { type: 'response.output_item.added', response_id: 'r3', item: { id: 'item_3', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'r3' });
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 11000, item_id: 'u4' });   // he was not done
  await page.waitForTimeout(POL.overlap_yield_ms + 150);
  ok('C6b. the entry is judged by what followed: interrupted_again — and she yields', (await trace()).filter((r) => r.d === 'SPEAK').pop().o === 'interrupted_again' && (await trace()).pop().d === 'YIELD');
  await feed(page, { type: 'output_audio_buffer.cleared' });
  await feed(page, { type: 'response.done', response: { status: 'cancelled' } });
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'ותשלחי לרחל את הסיכום של הפגישה, אבל רק אחרי שאני אאשר' });
  await page.waitForTimeout(POL.grace_ms + 200);
  const flushed = calls.filter((c) => c.action === 'cap' && c.name === 'voice_trace_log');
  ok('C6c. resolved decisions reached the ledger road (voice_trace_log) with decision, reason, outcome', flushed.length >= 1 && flushed.some((c) => (c.args.events || []).some((e) => e.decision === 'SPEAK' && e.outcome === 'interrupted_again' && e.reason && e.policy)), JSON.stringify(flushed.map((c) => (c.args.events || []).map((e) => e.decision + '/' + e.outcome))));
  ok('C6d. every flushed record has the trace fields David asked for', flushed.every((c) => (c.args.events || []).every((e) => ['at', 'decision', 'reason', 'user_speaking', 'lia_speaking', 'overlap_state', 'interruption_source', 'response_cancelled', 'cleared', 'latency_ms', 'continuity_state', 'continuity_result', 'outcome'].every((k) => k in e))));
  // CASE 4/continuity — a renewed session is seeded from the visible conversation
  const dcsBefore = await page.evaluate(() => window.__live.dcs.length);
  await page.evaluate(() => { LIVE.on = false; LIVE.renewing = true; liveFlushTrace(false); liveTeardown(); liveUi('connecting'); liveConnect(); });
  await page.waitForFunction((n) => window.__live.dcs.length === n + 1 && window.__live.dcs[n].readyState === 'open', dcsBefore, { timeout: 5000 });
  await page.waitForTimeout(50);
  const seeds = await page.evaluate((n) => window.__live.dcs[n].sent.filter((m) => m.type === 'conversation.item.create'), dcsBefore);
  ok('C4. the renewed channel is seeded with the last turns (user + assistant, text), so the thread continues', seeds.length >= 2 && seeds.some((m) => m.item.role === 'user') && seeds.some((m) => m.item.role === 'assistant') && (await trace()).pop().c === 'session_renewed_seeded');
  // CONTINUE — a short overlap the ear never transcribed: she finishes, then answers
  await feed(page, { type: 'response.output_item.added', response_id: 'r4', item: { id: 'item_4', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'r4' });
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 20000, item_id: 'u5' });
  await page.waitForTimeout(150);
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await page.waitForTimeout(POL.transcript_wait_ms + 200);
  ok('C3b. a short overlap with no transcript: CONTINUE (she finishes; his words are owed an answer)', (await trace()).pop().d === 'CONTINUE' && await page.evaluate(() => LIVE.speaking === true && LIVE.pending && LIVE.pending.answer_after === true));
  const c7 = creates();
  await feed(page, { type: 'output_audio_buffer.stopped' });
  await page.waitForTimeout(50);
  ok('C3c. …when she finishes, the owed answer is asked for once', creates() === c7 + 1);
  // stop → the rest is flushed as no_repair
  await page.click('#live');
  await page.waitForTimeout(300);
  const last = calls.filter((c) => c.action === 'cap' && c.name === 'voice_trace_log').pop();
  ok('C7. a stop flushes the pending decisions as no_repair (no further move)', !!last && (last.args.events || []).some((e) => e.outcome === 'no_repair'));
  await page.close();
}

// ── 1c. the server's own cut (measured 29.9, run 36506338290): over WebRTC the output audio is cleared the
//        instant the VAD hears speech, whatever interrupt_response says — the client records it as a YIELD it did
//        not choose, and the ear still classifies the utterance ─────────────────────────────────────────────
{
  const { page, calls, sent } = await session('servercut');
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  await feed(page, { type: 'session.created' });
  const creates = () => sent.filter((a) => a.type === 'response.create').length;
  const trace = () => page.evaluate(() => LIVE.trace.filter((r) => r.decision !== 'SESSION' && r.decision !== 'TOOL').map((r) => ({ d: r.decision, s: r.interruption_source, c: r.continuity_state, cr: r.continuity_result, o: r.outcome, cancelled: r.response_cancelled, cleared: r.cleared })));
  // LIA is speaking
  await feed(page, { type: 'response.output_item.added', response_id: 'r1', item: { id: 'item_s1', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'r1' });
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 3000, item_id: 'u1' });
  const n0 = sent.length;
  // …and 180 ms later the SERVER clears and truncates on its own
  await page.waitForTimeout(180);
  await feed(page, { type: 'output_audio_buffer.cleared' });
  await feed(page, { type: 'conversation.item.truncated', item_id: 'item_s1', content_index: 0, audio_end_ms: 2800 });
  await page.waitForTimeout(POL.overlap_yield_ms + 100);
  ok('S1. the server\'s cut is on the trace as a YIELD the client did not choose', (await trace()).pop().d === 'YIELD' && (await trace()).pop().s === 'server_vad' && (await trace()).pop().cancelled === false && (await trace()).pop().cleared === true);
  ok('S1a. …with the server\'s truncation as its continuity', /^truncated_2800ms$/.test((await trace()).pop().cr));
  ok('S1b. …and the client sent nothing (no second cancel, no clear, no truncate)', sent.length === n0 && await page.evaluate(() => LIVE.speaking === false && LIVE.interrupted === true));
  await feed(page, { type: 'response.done', response: { status: 'completed' } });
  // the utterance ends and the ear says it was a backchannel
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'כן' });
  await page.waitForTimeout(80);
  ok('S2. a backchannel the server already cut is recorded as such — nothing is asked of the model', (await trace()).pop().d === 'BACKCHANNEL' && (await trace()).pop().c === 'cut_by_server' && creates() === 0);
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'שלוש הזמנות פתוחות, האחרונה' });
  ok('S2a. the cut sentence is labelled', await page.evaluate(() => /^\(נקטע\)/.test(SESSION.turns[SESSION.turns.length - 1].text)));
  // a second cut, this time a real interruption
  await feed(page, { type: 'response.output_item.added', response_id: 'r2', item: { id: 'item_s2', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'r2' });
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 9000, item_id: 'u2' });
  await page.waitForTimeout(150);
  await feed(page, { type: 'output_audio_buffer.cleared' });
  await feed(page, { type: 'conversation.item.truncated', item_id: 'item_s2', content_index: 0, audio_end_ms: 900 });
  await feed(page, { type: 'response.done', response: { status: 'completed' } });
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'רגע, לא זה — מה עם ההזמנה של אתמול?' });
  await page.waitForTimeout(80);
  ok('S3. a real interruption the server cut is answered (SPEAK after the server\'s cut), once', creates() === 1 && (await trace()).pop().d === 'SPEAK' && await page.evaluate(() => /השרת חתך/.test(LIVE.trace[LIVE.trace.length - 1].reason)));
  ok('S3a. the first cut\'s outcome is what David actually said over her — "כן" — so the pair YIELD(server_vad) → BACKCHANNEL is the Gym\'s "backchannel treated as interruption" pattern, on the record', (await trace()).find((r) => r.d === 'YIELD').o === 'continued_normally' && await page.evaluate(() => LIVE.trace.find((r) => r.decision === 'YIELD').outcome_evidence === 'כן'));
  await page.click('#live');
  await page.waitForTimeout(300);
  const last = calls.filter((c) => c.action === 'cap' && c.name === 'voice_trace_log').pop();
  ok('S4. the server-cut YIELD reached the ledger road with its source named', !!last && calls.filter((c) => c.action === 'cap' && c.name === 'voice_trace_log').some((c) => (c.args.events || []).some((e) => e.decision === 'YIELD' && e.interruption_source === 'server_vad')));
  await page.close();
}

// ── 2. a dropped channel reconnects on a fresh secret ──────────────────────
{
  const { page, calls, mints } = await session('drop');
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  const drop = await page.evaluate(() => { window.__live.dcs[window.__live.dcs.length - 1].close();   // the network died
    return { on: LIVE.on, attempt: LIVE.attempt, stat: document.getElementById('noteStat').textContent }; });
  ok('10. the drop is announced and the session is off until the channel is back', /מתחברת מחדש/.test(drop.stat) && drop.on === false && drop.attempt === 1, JSON.stringify(drop));
  await page.waitForFunction(() => LIVE.on === true && LIVE.ready === true && window.__live.pcs.length === 2, null, { timeout: 5000 });
  ok('10a. reconnected within the first backoff on a NEW secret', mints() === 2 && calls.filter(c => c.__openai).length === 2 && calls.filter(c => c.__openai)[1].__auth === 'Bearer ek_test_2');
  ok('10b. the attempt counter is reset once the channel is open', await page.evaluate(() => LIVE.attempt === 0));
  ok('10c. the microphone was NOT reopened (same stream)', await page.evaluate(() => window.__live.mics === 1));
  await page.click('#live');
  await page.close();
}

// ── 3. the ceiling: three failed tries, then the honest line ───────────────
{
  const { page } = await session('ceiling', { mintFails: { after: 1 } });
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  await page.evaluate(() => window.__live.dcs[window.__live.dcs.length - 1].close());
  await page.waitForFunction(() => /לא הוחלף מודל/.test(document.getElementById('noteStat').textContent), null, { timeout: 5000 });
  ok('11. a mint refused after a drop ends the session with the provider\'s evidence, not a swapped model', await page.evaluate(() => LIVE.on === false && LIVE.pc === null) && /gpt-realtime-2/.test(await stat(page)));
  await page.close();
}

// ── 4. permission: a scoped code that may not open voice ───────────────────
{
  const { page, calls } = await session('scoped', { scoped: true });
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => /נדחה|kernel\/state/.test(document.getElementById('noteStat').textContent), null, { timeout: 5000 });
  ok('12. the server\'s refusal is shown and no session opens', await page.evaluate(() => LIVE.on === false && window.__live.pcs.length === 0) && !calls.some(c => c.__openai));
  ok('12a. the microphone was released', await page.evaluate(() => window.__live.tracksStopped === 1));
  await page.close();
}

// ── 5. permission: a refused code inside a tool call ───────────────────────
{
  const { page, calls, sent } = await session('401');
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  await page.evaluate(() => { CODE = 'bad-code'; });                      // the code was revoked mid-call
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_9', name: 'ask_lia', arguments: JSON.stringify({ question: 'מה מצב REAL·LOCATION?' }) } });
  const statesBefore = calls.filter(c => c.action === 'state').length;
  await page.waitForFunction(() => window.__live === undefined || window.__live.dcs.length === 0, null, { timeout: 8000 }).catch(() => {});
  const k = calls.find(c => c.action === 'kernel');
  ok('13. the tool still went through the kernel gate (and was refused there)', !!k && k.__code === 'bad-code');
  const out = sent.find(s => s.type === 'conversation.item.create' && s.item.call_id === 'call_9');
  ok('13a. the model is told "unauthorized" — no data, no invented answer', !!out && JSON.parse(out.item.output).error === 'unauthorized' && !/בביצוע/.test(out.item.output));
  await page.waitForFunction((n) => true, statesBefore, { timeout: 100 }).catch(() => {});
  await page.waitForTimeout(600);
  ok('13b. the panel reloaded (logged out), as on every refused code', calls.filter(c => c.action === 'state').length > statesBefore, `state calls before=${statesBefore} after=${calls.filter(c => c.action === 'state').length}`);
  await page.close();
}

// ── 6. no model on the account → no button ─────────────────────────────────
{
  const { page } = await session('nomodel', { available: false });
  await page.waitForTimeout(400);
  ok('14. when the server cannot mint for the model David named, there is no button', await page.evaluate(() => document.getElementById('live').style.display === 'none'));
  await page.close();
}

// ── 1d. PHASE A-D (29.9): David's next utterance is never swallowed by a tool reply that started before it was committed ──
{
  const kernel = { delay: 0 };
  const { page, calls, sent } = await session('overlap', { kernel });
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  await feed(page, { type: 'session.created' });
  const creates = () => sent.filter((a) => a.type === 'response.create').length;
  const dec = () => page.evaluate(() => LIVE.trace.filter((r) => r.decision !== 'SESSION' && r.decision !== 'TOOL').map((r) => ({ d: r.decision, c: r.continuity_state, cr: r.continuity_result, reason: r.reason })));
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 0, item_id: 'uA' });
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'מה מצב ריל לוקיישן?' });
  await page.waitForTimeout(POL.grace_ms + 150);
  ok('D0. A ends → SPEAK (one response.create)', creates() === 1);
  kernel.delay = 1500;                                                      // the kernel takes its time
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_A', name: 'deep_answer', arguments: JSON.stringify({ question: 'מה מצב ריל לוקיישן?' }) } });
  await page.waitForFunction(() => LIVE.toolBusy === true, null, { timeout: 2000 });
  await feed(page, { type: 'response.done', response: { status: 'completed' } });   // the tool-call response itself is done
  await page.waitForTimeout(300);
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 4000, item_id: 'uB' });   // B begins while A is still out
  const bStart = await page.evaluate(() => LIVE.uttStartedAt);
  await page.waitForFunction(() => LIVE.toolBusy === false, null, { timeout: 5000 });   // A returns while B is in progress
  await page.waitForTimeout(50);
  ok('D1. A\'s reply is NOT asked for while B is still being spoken — the output is returned to the model, the reply waits (no talking over David)', creates() === 1 && sent.some((m) => m.type === 'conversation.item.create' && m.item.type === 'function_call_output' && m.item.call_id === 'call_A') && await page.evaluate(() => LIVE.userSpeaking === true && LIVE.replyOwed === true && LIVE.toolBusy === false));
  ok('D1a. …and the trace says why', await page.evaluate(() => LIVE.trace.filter((r) => r.decision === 'TOOL').pop().continuity_state === 'reply_deferred_user_speaking'));
  ok('D2. nothing claims B: lastCreateFor stays before B\'s start', await page.evaluate((b) => LIVE.lastCreateFor < b, bStart), await page.evaluate((b) => `lastCreateFor=${LIVE.lastCreateFor} bStart=${b}`, bStart));
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'רגע, לפני שאת בודקת, בואי נחשוב על זה יחד.' });
  await page.waitForTimeout(POL.grace_ms + 150);
  const d = await dec();
  ok('D3. when B ends, ONE response.create answers the tool output and B together (SPEAK · turn_end_with_tool_reply) — never "already_answered"', creates() === 2 && d[d.length - 1].d === 'SPEAK' && d[d.length - 1].c === 'turn_end_with_tool_reply' && !d.some((r) => r.c === 'already_answered') && await page.evaluate(() => LIVE.replyOwed === false), JSON.stringify(d));
  await feed(page, { type: 'response.output_item.added', response_id: 'rA', item: { id: 'item_A', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'rA' });
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'ריל לוקיישן בביצוע. ולגבי לחשוב יחד — בסדר.' });
  await feed(page, { type: 'output_audio_buffer.stopped' });
  await feed(page, { type: 'response.done', response: { status: 'completed' } });
  await page.waitForTimeout(80);
  ok('D4. nothing else is asked for afterwards (no second reply, nothing pending)', creates() === 2 && await page.evaluate(() => LIVE.pending === null && LIVE.responseActive === false));
  // the reply is immediate when David is NOT speaking
  kernel.delay = 300;
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_B', name: 'deep_answer', arguments: JSON.stringify({ question: 'מה מצב ריל לוקיישן?' }) } });
  await page.waitForFunction(() => LIVE.toolBusy === false, null, { timeout: 5000 });
  await page.waitForTimeout(50);
  ok('D5. with David silent, the tool reply is asked for at once (response.create #3), as before', creates() === 3 && await page.evaluate(() => LIVE.replyOwed === false));
  await page.click('#live');
  await page.close();
}

// ── 1e. PHASE A-C (29.9): a result created for session X never touches session Y; the tool leg is bounded; every connect seeds ──
{
  const kernel = { delay: 0 };
  const { page, calls, sent } = await session('stale', { kernel });
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true && LIVE.ready === true, null, { timeout: 5000 });
  await feed(page, { type: 'session.created' });
  ok('E0. session 1 is named on the trace (SESSION · session_started · tap), no seed — nothing to seed yet', await page.evaluate(() => { const r = LIVE.trace.filter((x) => x.decision === 'SESSION'); return r.length === 1 && r[0].continuity_state === 'session_started' && r[0].continuity_result === 'tap' && r[0].session_id === 'sess_test_1' && !LIVE.trace.some((x) => x.decision === 'CONTINUE'); }));
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 0, item_id: 'u1' });
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'מה מצב ריל לוקיישן?' });
  await page.waitForTimeout(POL.grace_ms + 150);
  kernel.delay = 2500;
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_X', name: 'deep_answer', arguments: JSON.stringify({ question: 'מה מצב ריל לוקיישן?' }) } });
  await page.waitForFunction(() => LIVE.toolBusy === true, null, { timeout: 2000 });
  const reqX = calls.filter((c) => c.action === 'kernel').pop().request_id;
  // David stops and re-taps before X returns
  await page.click('#live');
  ok('C1. the stop kills the session-local flags at once (toolBusy, responseActive, pending)', await page.evaluate(() => LIVE.toolBusy === false && LIVE.responseActive === false && LIVE.pending === null && LIVE.on === false));
  ok('C1a. the teardown is on the trace under the OLD session id', await page.evaluate(() => { const r = LIVE.trace.filter((x) => x.decision === 'SESSION').pop(); return r.continuity_state === 'session_teardown' && r.session_id === 'sess_test_1' && /user|stop/.test(r.continuity_result); }));
  await page.waitForTimeout(200);
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true && LIVE.ready === true && LIVE.sessionId === 'sess_test_2', null, { timeout: 5000 });
  await feed(page, { type: 'session.created' });
  const dc2 = () => page.evaluate(() => window.__live.dcs[window.__live.dcs.length - 1].sent.slice());
  const seeds = (await dc2()).filter((m) => m.type === 'conversation.item.create');
  ok('E1. session 2 (a re-tap, not a renewal) is seeded from the conversation so far — David\'s question rides in as a user item', seeds.length >= 1 && seeds[0].item.role === 'user' && /ריל לוקיישן/.test(seeds[0].item.content[0].text) && await page.evaluate(() => { const r = LIVE.trace.filter((x) => x.decision === 'CONTINUE').pop(); return r && r.continuity_state === 'session_tap_seeded' && r.session_id === 'sess_test_2'; }), JSON.stringify(seeds.map((m) => m.item.role)));
  await page.waitForTimeout(2800);                                                  // X lands now, in session 2's lifetime
  ok('C2. X\'s late result is discarded: no function_call_output, no response.create on session 2', !(await dc2()).some((m) => m.type === 'conversation.item.create' && m.item.type === 'function_call_output') && !(await dc2()).some((m) => m.type === 'response.create'));
  ok('C2a. …and session 2 is untouched: not busy, no response active, nothing pending, nothing "answered"', await page.evaluate(() => LIVE.toolBusy === false && LIVE.responseActive === false && LIVE.pending === null && LIVE.lastCreateFor === 0));
  ok('C2b. the trace says so explicitly: TOOL · tool_discarded_stale, under session 1, with X\'s request id', await page.evaluate((rid) => { const r = LIVE.trace.filter((x) => x.decision === 'TOOL').pop(); return r.continuity_state === 'tool_discarded_stale' && r.continuity_result === 'discarded' && r.session_id === 'sess_test_1' && r.request_id === rid && r.call_id === 'call_X'; }, reqX));
  const flushedStale = calls.filter((c) => c.action === 'cap' && c.name === 'voice_trace_log').some((c) => (c.args.events || []).some((e) => e.decision === 'TOOL' && e.continuity_state === 'tool_discarded_stale' && e.session_id === 'sess_test_1' && e.request_id === reqX));
  ok('C2c. …and it reached the ledger road with the dead session\'s id, not the live one\'s', flushedStale);
  // session 2 works normally afterwards
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 0, item_id: 'u2' });
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'שלום, את שומעת אותי?' });
  await page.waitForTimeout(POL.grace_ms + 150);
  ok('C3. session 2 answers its own first turn (one response.create on ITS channel)', (await dc2()).filter((m) => m.type === 'response.create').length === 1);
  // the bound: a slow kernel is answered "timeout" and the late answer is discarded
  await page.evaluate(() => { LIVE_POLICY.tool_timeout_ms = 400; });
  kernel.delay = 1500;
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_T', name: 'deep_answer', arguments: JSON.stringify({ question: 'מה מצב ריל לוקיישן?' }) } });
  await page.waitForFunction(() => LIVE.trace.some((r) => r.decision === 'TOOL' && r.continuity_state === 'tool_timeout'), null, { timeout: 3000 });
  const tOut = (await dc2()).filter((m) => m.type === 'conversation.item.create' && m.item.type === 'function_call_output' && m.item.call_id === 'call_T');
  ok('T1. past the bound the model is told "timeout" (first person, no invented answer) and the panel is free again', tOut.length === 1 && JSON.parse(tOut[0].item.output).error === 'timeout' && await page.evaluate(() => LIVE.toolBusy === false));
  await page.waitForTimeout(1600);
  ok('T2. the answer that limps in later is recorded as discarded_late and NOT sent a second time', (await dc2()).filter((m) => m.type === 'conversation.item.create' && m.item.type === 'function_call_output' && m.item.call_id === 'call_T').length === 1 && await page.evaluate(() => LIVE.trace.some((r) => r.decision === 'TOOL' && r.continuity_state === 'tool_discarded_late' && r.call_id === 'call_T')));
  await page.click('#live');
  await page.close();
}

// ── 1g. PHASE A-A (29.9): the ordinary road tells the server how the words arrived ──
{
  const { page, calls } = await session('modality');
  await page.fill('#note', 'מה מצב ריל לוקיישן?');
  await page.evaluate(() => sendPrimary());
  await page.waitForTimeout(500);
  const k = calls.find((c) => c.action === 'kernel');
  ok('M1. a typed question carries modality:typed', !!k && k.modality === 'typed', JSON.stringify(k && { modality: k.modality }));
  await page.close();
}

// ── 1h. PHASE A-D (29.9, run 36573775204): the VAD closes David's sentence, he resumes 300 ms later,
//        and the transcript of the closed part must not ask for a reply over him ──
{
  const { page, sent } = await session('resume');
  await page.waitForFunction(() => document.getElementById('live').style.display !== 'none', null, { timeout: 5000 });
  await page.click('#live');
  await page.waitForFunction(() => LIVE.on === true, null, { timeout: 5000 });
  await feed(page, { type: 'session.created' });
  // David asks, LIA answers and is speaking
  await feed(page, { type: 'input_audio_buffer.speech_started', item_id: 'item_h1' });
  await page.waitForTimeout(20);
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'ליה, מה מצב ההזמנות של ריל לוקיישן?' });
  await page.waitForTimeout(POL.grace_ms + 150);
  ok('H0. his first turn end + grace → one response.create', sent.filter((m) => m.type === 'response.create').length === 1);
  await feed(page, { type: 'response.output_item.added', response_id: 'resp_h1', item: { id: 'item_h_a', type: 'message', role: 'assistant' } });
  await feed(page, { type: 'output_audio_buffer.started', response_id: 'resp_h1' });
  // he talks over her; the server cuts the audio at his speech onset
  const n0 = sent.length;
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 3000, item_id: 'item_h2' });
  await feed(page, { type: 'output_audio_buffer.cleared' });
  await feed(page, { type: 'conversation.item.truncated', item_id: 'item_h_a', content_index: 0, audio_end_ms: 900 });
  await feed(page, { type: 'response.done', response: { status: 'cancelled' } });
  // the VAD closes his first sentence…
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  // …he resumes 300 ms later, and only then the transcript of the closed sentence lands
  await page.waitForTimeout(300);
  await feed(page, { type: 'input_audio_buffer.speech_started', audio_start_ms: 5200, item_id: 'item_h3' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'רגע, לפני שאת בודקת, אני חושב שהכיוון של ההזמנות פחות חשוב עכשיו.' });
  await page.waitForTimeout(POL.grace_ms + 200);
  ok('H1. the transcript of a closed sentence asks nothing of the model while David is speaking again', sent.slice(n0).filter((m) => m.type === 'response.create').length === 0, JSON.stringify(sent.slice(n0).map((m) => m.type)));
  ok('H2. the wait is on the trace as user_speaking', await page.evaluate(() => LIVE.trace.some((r) => r.decision === 'WAIT' && r.continuity_state === 'user_speaking')));
  // his turn really ends → grace → exactly one response.create
  await feed(page, { type: 'input_audio_buffer.speech_stopped' });
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'מה שחשוב לי זה להבין מה הלקוח באמת צריך מאיתנו.' });
  await page.waitForTimeout(POL.grace_ms + 200);
  ok('H3. his turn end + grace → exactly one response.create, after he finished', sent.slice(n0).filter((m) => m.type === 'response.create').length === 1, JSON.stringify(sent.slice(n0).map((m) => m.type)));
  await page.click('#live');
  await page.close();
}

await browser.close();
ok('no page errors', errors.length === 0, errors.join('\n      '));

// ── WHAT THE BRAIN HEARS (David, 1.10): David's transcript, never the voice model's rewording ──
ok('the transcript is the question when the ear heard Hebrew', JSON.stringify(P.liveQuestionFrom(['ליה, מה מצב ההזמנות של רילוקיישן?'], 'דוד, מה מצב הצוואז מנוצ׳יל Relocation?')) === JSON.stringify({ question: 'ליה, מה מצב ההזמנות של רילוקיישן?', source: 'transcript' }));
ok('a monologue in several utterances reaches the brain whole, in order', P.liveQuestionFrom(['איך אנחנו יודעים שהמבצע יתפוס אותה,', ' מה  אנחנו צריכים לעשות?'], 'x').question === 'איך אנחנו יודעים שהמבצע יתפוס אותה, מה אנחנו צריכים לעשות?');
ok('no transcript → the model\'s wording, marked as such', JSON.stringify(P.liveQuestionFrom([], 'מה מצב הפרויקט?')) === JSON.stringify({ question: 'מה מצב הפרויקט?', source: 'model' }));
ok('a transcript with no Hebrew (the ear misheard the script) → the model\'s wording', P.liveQuestionFrom(['Niya, mamycava projekt.'], 'ליה, מה מצב הפרויקט?').source === 'model');
ok('the question is bounded', P.liveQuestionFrom(['א'.repeat(3000)], '').question.length === 2000);
{
  // the ear's ledger, run against a stand-in LIVE: open → commit → transcript → consumed once
  const helpers = slice('function liveEarOpen(', '/* THE TOOL: one call');
  const E = new Function('LIVE_POLICY', helpers + '\nconst LIVE={ear:[],earMark:0,epoch:0};\nreturn {LIVE, liveEarOpen, liveEarCommit, liveEarHeard, liveEarSince, liveEarAnswered};')({ transcript_wait_ms: 300 });
  E.liveEarOpen('i1'); E.liveEarCommit('i1'); E.liveEarHeard('i1', 'מה מצב ההזמנות?', false);
  E.liveEarOpen('i2'); E.liveEarCommit('i2'); E.liveEarHeard('i2', 'כן', true);          // a backchannel is not a question
  E.liveEarOpen('i3'); E.liveEarCommit('i3'); E.liveEarHeard('i3', 'ומה עם החשבוניות?', false);
  const first = await E.liveEarSince();
  ok('the ledger hands over every utterance since the last call, backchannels excluded', JSON.stringify(first) === JSON.stringify(['מה מצב ההזמנות?', 'ומה עם החשבוניות?']), JSON.stringify(first));
  ok('…and each utterance is consumed once', (await E.liveEarSince()).length === 0);
  E.liveEarOpen('i4'); E.liveEarCommit('i4');                                            // committed, transcript still in flight
  setTimeout(() => E.liveEarHeard('i4', 'תודה, ומה עוד?', false), 120);
  ok('a committed utterance whose transcript is in flight is waited for (bounded)', JSON.stringify(await E.liveEarSince()) === JSON.stringify(['תודה, ומה עוד?']));
  E.liveEarOpen('i5'); E.liveEarCommit('i5');                                            // never transcribed
  const t0 = Date.now(); const none = await E.liveEarSince();
  ok('a transcript that never lands costs at most the wait, then the model\'s wording is used', none.length === 0 && Date.now() - t0 < 600);
  E.liveEarOpen('i6');                                                                   // David still speaking when the tool is called
  const t1 = Date.now(); const early = await E.liveEarSince();
  ok('an uncommitted utterance is not waited for', Date.now() - t1 < 100 && early.length === 0);
  E.liveEarCommit('i6'); E.liveEarHeard('i6', 'ומה עם הלקוח החדש?', false);
  ok('…and it is not lost: it belongs to the next call', JSON.stringify(await E.liveEarSince()) === JSON.stringify(['ומה עם הלקוח החדש?']));
  // a reply that finished without the tool answered what came before it — small talk does not ride along later
  E.liveEarOpen('g1'); E.liveEarCommit('g1'); E.liveEarHeard('g1', 'שלום, את שומעת אותי?', false);
  E.LIVE.earMark = E.LIVE.ear.length;                                                     // the panel asked for a reply here
  E.liveEarOpen('g2'); E.liveEarCommit('g2'); E.liveEarHeard('g2', 'רגע, עוד משהו', false); // said after the reply was asked for
  E.liveEarAnswered();
  ok('a conversational reply consumes what it answered, and only that', JSON.stringify(await E.liveEarSince()) === JSON.stringify(['רגע, עוד משהו']));
}
{
  const live = slice('async function liveRunTool(', 'function liveTeardown(');
  ok('the tool sends the chosen question — the ear first — and records which one', /const asked=liveQuestionFrom\(await liveEarSince\(\),d\.question\);/.test(live) && /const text=asked\.question,reqId=run\.request_id;/.test(live) && /continuity_result:'question:'\+asked\.source/.test(live) && /outcome_evidence:\('model: '\+d\.question\)/.test(live));
  const td = slice('function liveTeardown(', 'function liveReleaseMic(');
  ok('the ear belongs to its session (teardown resets it)', /LIVE\.ear=\[\];LIVE\.earMark=0;/.test(td));
  ok('every reply the panel asks for marks how far the ear had got', /function liveCreateResponse\(\)\{LIVE\.responseActive=true;LIVE\.earMark=LIVE\.ear\.length;/.test(src));
  const on = slice('function liveOn(ev){', '/* The ear\'s ledger');
  ok('a reply that SAID something, completed without the tool, while no tool runs, settles what it answered (a silent reply answered nothing)', /if\(a\.status==='completed'&&a\.said&&!a\.tool&&!LIVE\.toolBusy\)liveEarAnswered\(\);/.test(on));
  ok('every utterance opens, commits and settles its ledger entry', /liveEarOpen\(a\.item_id\)/.test(on) && /if\(a\.committed\)liveEarCommit\(a\.item_id\);/.test(on) && /liveEarHeard\(a\.item_id,a\.text,bc\);/.test(on) && /a\.kind==='ear_failed'\)\{liveEarHeard\(a\.item_id,'',false\);/.test(on));
}
console.log(bad ? `${total - bad}/${total} passed — ${bad} FAILED` : `${total}/${total} live-voice asserts passed`);
process.exit(bad ? 1 : 0);
