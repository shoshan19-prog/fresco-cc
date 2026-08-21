// Can David get in? Driven by a real production signal, not a hypothetical:
// 1,518 requests to the lia function in 24h — 1,515 × 200 and 3 × 502. A single
// one of those 502s landing on the login call used to tell him his code was
// wrong, which is how a healthy system locked him out of it.
//   node test-connect.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const block = src.slice(src.indexOf('const TRANSIENT='), src.indexOf('async function api('));

let bad = 0, total = 0;
function ok(label, cond) { total++; if (!cond) { console.log(`FAIL  ${label}`); bad++; } }
function eq(label, got, want) {
  total++;
  if (got !== want) { console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); bad++; }
}

// A fake edge gateway: hands back a scripted sequence of responses.
function harness(sequence) {
  let calls = 0;
  const res = (status, ct, body) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? ct : null) },
    json: async () => JSON.parse(body),
    text: async () => body,
  });
  const fetchStub = async () => {
    const s = sequence[Math.min(calls++, sequence.length - 1)];
    if (s.throw) throw new Error('network down');
    return res(s.status, s.ct ?? 'application/json', s.body ?? '{"ok":true}');
  };
  const { post, asJson } = new Function('fetch', 'CODE', 'setTimeout',
    block + '\nreturn {post, asJson};')(fetchStub, 'code', (f) => f());   // no real delay in tests
  return { post, asJson, calls: () => calls };
}

// --- the exact production failure ------------------------------------------
{
  const h = harness([{ status: 502, ct: 'text/html', body: '<html>Bad Gateway</html>' },
                     { status: 200, body: '{"ok":true}' }]);
  const out = await h.post('u', {});
  eq('a transient 502 is retried, and the retry succeeds', out.status, 200);
  eq('exactly one retry, not a storm', h.calls(), 2);
}
{
  const h = harness([{ status: 200, body: '{"ok":true}' }]);
  await h.post('u', {});
  eq('a healthy request is not retried', h.calls(), 1);
}
// --- a wrong code must never be retried or confused with a server fault -----
{
  const h = harness([{ status: 401, ct: 'text/plain', body: 'unauthorized' }]);
  const out = await h.post('u', {});
  eq('401 is returned immediately', out.status, 401);
  eq('401 is never retried — a wrong code does not get better on a second try', h.calls(), 1);
}
// --- an HTML error page must never be parsed as JSON ------------------------
{
  const h = harness([{ status: 502, ct: 'text/html', body: '<html>Bad Gateway</html>' }]);
  const out = await h.post('u', {}, 1);
  eq('a non-JSON body yields null rather than throwing a SyntaxError',
    await h.asJson(out.r), null);
}
{
  const h = harness([{ status: 200, ct: 'application/json; charset=utf-8', body: '{"a":1}' }]);
  const out = await h.post('u', {});
  eq('a declared JSON body parses', (await h.asJson(out.r)).a, 1);
}
{
  const h = harness([{ status: 200, ct: 'application/json', body: 'not json at all' }]);
  const out = await h.post('u', {});
  eq('a body that claims JSON but is not does not throw', await h.asJson(out.r), null);
}
// --- a dropped connection is survivable ------------------------------------
{
  const h = harness([{ throw: true }, { status: 200, body: '{"ok":true}' }]);
  eq('a dropped connection is retried once', (await h.post('u', {})).status, 200);
}
{
  const h = harness([{ throw: true }, { throw: true }]);
  const out = await h.post('u', {});
  ok('a total outage resolves rather than hanging', out && out.r === null);
}
// --- and every persistent 5xx eventually reports honestly -------------------
for (const code of [502, 503, 504]) {
  const h = harness([{ status: code, ct: 'text/html', body: 'x' }]);
  eq(`a persistent ${code} is reported, not retried forever`, (await h.post('u', {})).status, code);
}

// --- the login path is the one that actually locked him out ----------------
const loginSrc = src.slice(src.indexOf('async function login('), src.indexOf('function esc('));
ok('login says "wrong code" ONLY for 401', /status===401\?'קוד שגוי'/.test(loginSrc));
ok('a server fault tells him the code is probably fine',
  loginSrc.includes('הקוד כנראה בסדר'));
ok('login goes through the retrying post(), not a bare fetch',
  /await post\(API,/.test(loginSrc) && !/fetch\(API/.test(loginSrc));
ok('login only boots on a real parsed body', /const j=status===200\?await asJson\(r\):null/.test(loginSrc));

// --- no bare fetch may remain on the authed paths ---------------------------
const apiSrc = src.slice(src.indexOf('async function api('), src.indexOf('async function login('));
ok('api() goes through post()', /await post\(API,/.test(apiSrc));
ok('api() never parses an undeclared body', /asJson\(r\)/.test(apiSrc));
const ccSrc = src.slice(src.indexOf('async function ccApi('), src.indexOf('const ACT_RE'));
ok('ccApi() goes through post()', /await post\(CC,/.test(ccSrc));
ok('ccApi() still clears a stale code on 401', /localStorage\.removeItem\('lia_code'\)/.test(ccSrc));

console.log(bad ? `\n${bad}/${total} FAILED` : `\n${total}/${total} asserts passed`);
process.exit(bad ? 1 : 0);
