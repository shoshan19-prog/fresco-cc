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
  + '\nreturn {LIVE_TOOL, LIVE_RECONNECT_MAX, liveReconnectDelay, liveShouldReconnect, liveReduce, liveToolCall, liveLatency, liveMintError};')();

ok('the one tool is ask_lia', P.LIVE_TOOL === 'ask_lia');
ok('reconnect rule = the server\'s (1s, 2s, 4s; three tries)',
  JSON.stringify([1, 2, 3, 9].map(P.liveReconnectDelay)) === '[1000,2000,4000,4000]' && P.LIVE_RECONNECT_MAX === 3);
ok('a drop is retried up to the ceiling', P.liveShouldReconnect({ attempt: 2, userStopped: false }) && !P.liveShouldReconnect({ attempt: 3, userStopped: false }));
ok('a user stop is never retried', !P.liveShouldReconnect({ attempt: 0, userStopped: true }));

{
  const st = { lia: '', calls: {} };
  const r = (ev) => P.liveReduce(ev, st);
  ok('session.created → ready', r({ type: 'session.created' })[0].kind === 'ready');
  ok('speech_started / speech_stopped are recognized', r({ type: 'input_audio_buffer.speech_started' })[0].kind === 'speech_started' && r({ type: 'input_audio_buffer.speech_stopped' })[0].kind === 'speech_stopped');
  ok('the user transcript is trimmed', JSON.stringify(r({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  ליה, מה מצב REAL·LOCATION?  ' })) === '[{"kind":"user_said","text":"ליה, מה מצב REAL·LOCATION?"}]');
  ok('an empty transcript is nothing', r({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  ' }).length === 0);
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
  ok('an error event carries the message', r({ type: 'error', error: { message: 'boom', code: 'x' } })[0].message === 'boom');
  ok('an unknown event is nothing', r({ type: 'rate_limits.updated' }).length === 0 && r(null).length === 0);
}
ok('ask_lia with a question runs', JSON.stringify(P.liveToolCall('ask_lia', { question: '  מה  מצב  REAL·LOCATION? ' })) === '{"ok":true,"question":"מה מצב REAL·LOCATION?"}');
ok('an unknown tool is refused, never run', P.liveToolCall('delete_everything', { question: 'x' }).ok === false && P.liveToolCall('delete_everything', {}).output.error === 'unknown_tool');
ok('an empty question is refused', P.liveToolCall('ask_lia', {}).output.error === 'empty_question');
ok('latency = end of speech → first sound', P.liveLatency({ speech_stopped: 1000, audio_started: 2750 }) === 1750);
ok('latency is null without both marks, or out of order', P.liveLatency({ speech_stopped: 1000 }) === null && P.liveLatency({ speech_stopped: 3000, audio_started: 2000 }) === null);
ok('a refused model is named with the account\'s list — never swapped', /gpt-realtime-2/.test(P.liveMintError({ error: 'mint_failed', reason: 'model_unavailable', model: 'gpt-realtime-2', realtime_models: ['gpt-realtime'] })) && /gpt-realtime\b/.test(P.liveMintError({ reason: 'model_unavailable', model: 'gpt-realtime-2', realtime_models: ['gpt-realtime'] })) && /לא הוחלף/.test(P.liveMintError({ reason: 'model_unavailable' })));
ok('no key / no credit / bad key each say so', /OPENAI_API_KEY/.test(P.liveMintError({ error: 'no_key' })) && /יתרה/.test(P.liveMintError({ reason: 'no_api_credit' })) && /לא תקף/.test(P.liveMintError({ reason: 'bad_key' })));

// ── wiring, as text ────────────────────────────────────────────────────────
const live = slice('/* ── LIVE VOICE', '/* ── the keyless road');
ok('the tool runs through action:kernel with voice:true and nothing else', /ccApi\(\{action:'kernel',body:text,history:historyForKernel\(text\)[\s\S]*?request_id:reqId,voice:true\}\)/.test(live) && !/action:'cap'/.test(live));
ok('what goes back to the model is the server\'s voice_output', /output=res\.voice_output\|\|\{error:'no_voice_output'/.test(live));
ok('the SDP goes to OpenAI with the client secret only', /Authorization:'Bearer '\+mint\.client_secret/.test(live) && !/sk-/.test(live) && !/sk-[A-Za-z0-9_-]{20,}/.test(src));
ok('the secret is minted by command-center (voice_session), never held in the page', /ccApi\(\{action:'voice_session'\}\)/.test(live) && !/localStorage\.setItem\('[^']*(secret|ek)/.test(live));
ok('the button exists and starts hidden', /id="live" onclick="liveTap\(\)"[^>]*display:none/.test(html));
ok('the build is bumped', /const LIA_BUILD='2026-09-04\.2'/.test(src));
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
    if (body.action === 'state') json = { queue: [], counts: { active: 0, expired: 0, canonical: 0, pending_notes: 0 }, voice: { available: false }, model: { connected: true, provider: 'openai' }, panel_build_latest: '2026-09-04.2' };
    else if (body.action === 'voice_session' && body.probe === true) json = { probe: true, model: 'gpt-realtime-2', configured_available: opts.available !== false, realtime_models: ['gpt-realtime-2', 'gpt-realtime'], tool: 'ask_lia' };
    else if (body.action === 'voice_session') {
      if (opts.scoped) { status = 403; json = { error: 'הקוד הזה פתוח לפעולות kernel/state בלבד' }; }
      else if (opts.mintFails && mints >= (opts.mintFails.after || 0)) { status = 502; json = { error: 'mint_failed', reason: 'model_unavailable', model: 'gpt-realtime-2', realtime_models: ['gpt-realtime'], detail: 'The model `gpt-realtime-2` does not exist' }; }
      else { mints++; json = { client_secret: 'ek_test_' + mints, expires_at: Math.floor(Date.now() / 1000) + 600, model: 'gpt-realtime-2', tool: 'ask_lia', who: 'david', scoped: false }; }
    }
    else if (body.action === 'kernel') { if (code === 'bad-code') { status = 401; json = null; } else json = KERNEL; }
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
  await feed(page, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'ליה, מה מצב REAL·LOCATION?' });
  ok('2. what David said is on the screen', await page.evaluate(() => [...document.querySelectorAll('#thread .msg.me .bubble')].some(b => /REAL·LOCATION/.test(b.textContent))));
  await feed(page, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_1', name: 'ask_lia', arguments: JSON.stringify({ question: 'מה מצב REAL·LOCATION?' }) } });
  await page.waitForFunction(() => window.__live.dcs[window.__live.dcs.length - 1].sent.length >= 2, null, { timeout: 5000 });
  const k = calls.filter(c => c.action === 'kernel');
  ok('3. the tool became exactly ONE action:kernel request', k.length === 1, `got ${k.length}`);
  ok('3a. …with the question, voice:true, history, and the same code', k[0] && k[0].body === 'מה מצב REAL·LOCATION?' && k[0].voice === true && Array.isArray(k[0].history) && k[0].__code === 'test-code');
  const out = sent.find(s => s.type === 'conversation.item.create');
  ok('3b. the function output is the server\'s voice_output, verbatim', !!out && out.item.type === 'function_call_output' && out.item.call_id === 'call_1' && out.item.output === JSON.stringify(KERNEL.voice_output));
  ok('3c. …followed by response.create', sent[sent.indexOf(out) + 1].type === 'response.create');
  await page.waitForTimeout(30);
  await feed(page, { type: 'output_audio_buffer.started' });
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'ריל לוקיישן בביצוע. שלוש הזמנות פתוחות.' });
  ok('4. LIA\'s spoken answer is on the screen, with the kernel result behind it', await page.evaluate(() => { const t = SESSION.turns[SESSION.turns.length - 1]; return t.role === 'lia' && /בביצוע/.test(t.text) && t.res && t.res.meta && t.res.meta.route_taken === 'entity_status'; }));
  const lat = await page.evaluate(() => LIVE.lat.slice());
  ok('5. latency (end of speech → first sound) was measured', lat.length === 1 && lat[0] >= 20 && lat[0] < 5000, JSON.stringify(lat));
  ok('5a. …and shown', /⚡/.test(await page.textContent('#recLabel')));
  // barge-in
  await feed(page, { type: 'input_audio_buffer.speech_started' });
  ok('6. speaking over her marks the reply as interrupted', await page.evaluate(() => LIVE.interrupted === true));
  await feed(page, { type: 'output_audio_buffer.cleared' });
  await feed(page, { type: 'response.output_audio_transcript.done', transcript: 'ועוד משהו שלא נאמר עד הסוף' });
  ok('6a. the cut sentence is labelled', await page.evaluate(() => /^\(נקטע\)/.test(SESSION.turns[SESSION.turns.length - 1].text)));
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

await browser.close();
ok('no page errors', errors.length === 0, errors.join('\n      '));
console.log(bad ? `${total - bad}/${total} passed — ${bad} FAILED` : `${total}/${total} live-voice asserts passed`);
process.exit(bad ? 1 : 0);
