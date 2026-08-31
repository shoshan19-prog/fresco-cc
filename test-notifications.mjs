// THE KNOCK ON THE DOOR (David, 28.8 — "התראה רגילה במכשיר, לא מייל").
//
// Two halves, both real code, neither mocked: the service worker that renders
// the push and routes the tap, and the panel functions that register the
// device and keep the notification visible when no push ever arrived.
//
// These RUN the shipped functions — sw.js is executed with a fake global scope
// and lia.html's block is executed with fake DOM and API — because a text
// check would pass on a version where the tap opens the app instead of the
// task, which is exactly the failure worth catching.
//   node test-notifications.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./lia.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');

let bad = 0, total = 0;
function ok(label, cond, detail) {
  total++;
  if (!cond) { console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`); bad++; }
  else console.log(`PASS  ${label}`);
}

// ── THE SERVICE WORKER, RUN ─────────────────────────────────────────────────
function runSw() {
  const handlers = {}, shown = [], opened = [], posted = [], focused = [];
  let claimed = false;
  const self_ = {
    addEventListener: (t, f) => { handlers[t] = f; },
    skipWaiting: () => {},
    location: { href: 'https://shoshan19-prog.github.io/fresco-cc/sw.js' },
    registration: {
      scope: 'https://shoshan19-prog.github.io/fresco-cc/',
      showNotification: (title, opts) => { shown.push({ title, opts }); return Promise.resolve(); },
    },
    clients: {
      claim: () => { claimed = true; return Promise.resolve(); },
      matchAll: () => Promise.resolve(self_._windows),
      openWindow: (u) => { opened.push(u); return Promise.resolve(); },
    },
    _windows: [],
  };
  new Function('self', swSrc)(self_);
  const fire = async (type, ev) => {
    const waits = [];
    await handlers[type]({ ...ev, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return { handlers, shown, opened, posted, focused, self_, fire,
           win: (url) => ({ url, focus: () => { focused.push(url); return Promise.resolve(); },
                            postMessage: (m) => posted.push(m) }) };
}

const MSG = {
  title: 'LIA · סיימתי: בדיקת חשבוניות אוגוסט',
  body: 'סיימתי — בדיקת חשבוניות אוגוסט.\n205 חשבוניות, 744,042 ₪',
  tag: 'lia-task-7e217713', task_id: '7e217713', notification_id: 'n1', reason: 'COMPLETED',
  url: 'https://shoshan19-prog.github.io/fresco-cc/lia.html?task=7e217713&n=n1',
};

{
  const sw = runSw();
  await sw.fire('push', { data: { json: () => MSG } });
  ok('a push becomes a real device notification', sw.shown.length === 1, JSON.stringify(sw.shown));
  const n = sw.shown[0];
  ok('it says which task and what happened', n.title === MSG.title, n.title);
  ok('it carries the one-line result', /205 חשבוניות/.test(n.opts.body), n.opts.body);
  ok('it is tagged per task, so an update replaces rather than stacks',
     n.opts.tag === 'lia-task-7e217713' && n.opts.renotify === true, JSON.stringify(n.opts));
  ok('it renders right-to-left with the LIA icon',
     n.opts.dir === 'rtl' && n.opts.lang === 'he' && /lia-icon/.test(n.opts.icon), JSON.stringify(n.opts));
  ok('the task travels with it, so the tap can be exact',
     n.opts.data.task_id === '7e217713' && n.opts.data.url === MSG.url, JSON.stringify(n.opts.data));
}

{
  const sw = runSw();
  await sw.fire('push', { data: { json: () => { throw new Error('not json'); } } });
  ok('a malformed push still shows something instead of throwing in the worker',
     sw.shown.length === 1 && sw.shown[0].title === 'LIA', JSON.stringify(sw.shown));
  await sw.fire('push', {});
  ok('a payload-less push does not crash the worker', sw.shown.length === 2);
}

{
  const sw = runSw();
  sw.self_._windows = [sw.win('https://shoshan19-prog.github.io/fresco-cc/lia.html')];
  await sw.fire('notificationclick', {
    notification: { close: () => {}, data: { url: MSG.url, task_id: '7e217713', notification_id: 'n1' } } });
  ok('an open LIA is focused, not duplicated',
     sw.focused.length === 1 && sw.opened.length === 0, `focused=${sw.focused.length} opened=${sw.opened.length}`);
  ok('and it is told which task to show',
     sw.posted.length === 1 && sw.posted[0].type === 'lia-open-task' && sw.posted[0].task_id === '7e217713',
     JSON.stringify(sw.posted));
}

{
  const sw = runSw();
  sw.self_._windows = [];
  await sw.fire('notificationclick', {
    notification: { close: () => {}, data: { url: MSG.url, task_id: '7e217713' } } });
  ok('with nothing open, the tap opens THAT task', sw.opened[0] === MSG.url, sw.opened[0]);
}

{
  const sw = runSw();
  sw.self_._windows = [sw.win('https://example.com/other')];
  await sw.fire('notificationclick', { notification: { close: () => {}, data: { url: MSG.url } } });
  ok('a window from another site is never focused or messaged',
     sw.focused.length === 0 && sw.posted.length === 0 && sw.opened.length === 1,
     `focused=${sw.focused.length} posted=${sw.posted.length}`);
}

{
  const sw = runSw();
  ok('the worker never caches the panel — no fetch handler',
     !sw.handlers.fetch, 'a caching worker would serve David yesterday\'s LIA');
  ok('it handles a rotated subscription instead of going quiet', !!sw.handlers.pushsubscriptionchange);
}

// ── THE PANEL BLOCK, RUN ────────────────────────────────────────────────────
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not locate ${from} .. ${to}`);
  return src.slice(a, b);
}
const BLOCK = slice('let NOTIFS=[];', '/* One way to put words in the composer');

function panel(opts = {}) {
  const calls = [], answers = [], els = {};
  const el = (id) => (els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '' }));
  const doc = { getElementById: (id) => el(id) };
  const cap = async (name, args) => {
    calls.push({ name, args });
    if (opts.cap) return opts.cap(name, args);
    return { rows: [] };
  };
  /* 31.8: notices left the chat column — renderNotifications now routes into
     renderNeeds (desktop rail card) + renderStateStrip (in the block). The
     harness injects railsOn and a renderNeeds spy for the desktop path. */
  const needsCalls = [];
  const api = new Function(
    'document', 'cap', 'esc', 'showAnswer', 'said', 'SURFACE', 'CODE',
    'navigator', 'Notification', 'location', 'history', 'setInterval', 'window', 'atob', 'btoa',
    'railsOn', 'renderNeeds',
    `${BLOCK}
     return { loadNotifications, renderNotifications, openNotification, markNotificationRead,
              clearNotifications, showTask, openTaskFromUrl, enableNotifications, initNotifications,
              pushSupported, b64ToBytes, bytesToB64, toggleStateDetail,
              get NOTIFS(){return NOTIFS;}, set NOTIFS(v){NOTIFS=v;} };`,
  )(doc, cap, (s) => String(s || ''), (r) => answers.push(r), (a, f, s, m) => ({ answer: a, facts: f, sources: s, missing: m }),
    opts.surface || 'phone', opts.code === undefined ? 'code' : opts.code,
    opts.navigator || {}, opts.Notification || undefined,
    { href: opts.href || 'https://x/lia.html', pathname: '/lia.html' },
    { replaceState: () => { els._history = true; } }, () => 1,
    opts.window || {}, globalThis.atob, globalThis.btoa,
    () => !!opts.rails, (row) => needsCalls.push(row));
  return { api, calls, answers, el, needsCalls };
}

{
  const N = [
    { id: 'n1', work_id: 'w1', title: 'LIA · סיימתי: בדיקת חשבוניות', line: '205 חשבוניות', unread: true },
    { id: 'n2', work_id: 'w2', title: 'LIA · נתקעתי: סנכרון פריוריטי', line: 'HTTP 500', unread: true },
  ];
  const p = panel({ cap: async (name) => (name === 'notifications' ? { rows: N } : { rows: [] }) });
  await p.api.loadNotifications();
  const strip = p.el('stateStrip');
  ok('the inbox is read from the server, unread only',
     p.calls[0].name === 'notifications' && p.calls[0].args.unread_only === true, JSON.stringify(p.calls[0]));
  ok('waiting notices surface on the compact strip — never a block over the chat (David, 31.8)',
     /עדכונים ממתינים/.test(strip.innerHTML) && strip.style.display === 'flex', strip.innerHTML.slice(0, 120));
  p.el('stateDetail').style.display = 'none';   // as the real markup boots it
  p.api.toggleStateDetail();
  const detail = p.el('stateDetail');
  ok('what a push would have said is one tap away, with a way to clear it',
     /בדיקת חשבוניות/.test(detail.innerHTML) && /סנכרון פריוריטי/.test(detail.innerHTML)
     && /הבנתי/.test(detail.innerHTML), detail.innerHTML.slice(0, 160));
}

{
  const p = panel({ cap: async (name) => (name === 'notifications'
    ? { rows: [{ id: 'n1', work_id: 'w1', title: 'LIA · סיימתי: בדיקה', line: 'x', unread: true }] } : { rows: [] }),
    rails: true });
  await p.api.loadNotifications();
  ok('on desktop the same queue re-renders the alerts card, one source for both surfaces',
     p.needsCalls.length === 1, JSON.stringify(p.needsCalls));
}

{
  const p = panel({ cap: async () => ({ rows: [] }) });
  await p.api.loadNotifications();
  ok('nothing waiting means no strip at all', p.el('stateStrip').style.display === 'none');
}

{
  const seen = [];
  const p = panel({ cap: async (name, args) => {
    seen.push([name, args]);
    if (name === 'notifications') return { rows: [{ id: 'n1', work_id: 'w1', title: 't', line: 'l', unread: true }] };
    if (name === 'work_status') return { rows: [{ work_id: 'w1', objective: 'בדיקת חשבוניות אוגוסט',
      status_line: 'הושלמה', outcome: '205 חשבוניות', progress: { text: '2/2' } }] };
    return { rows: [] };
  } });
  await p.api.loadNotifications();
  await p.api.openNotification(0);
  ok('opening one marks it read ON THE SERVER, so the other device clears too',
     seen.some(([n, a]) => n === 'notification_read' && a.notification_id === 'n1'), JSON.stringify(seen));
  ok('and it opens the task itself, read from the stored package',
     seen.some(([n, a]) => n === 'work_status' && a.work_id === 'w1'), JSON.stringify(seen));
  ok('the task is shown with its outcome, not just its name',
     /בדיקת חשבוניות אוגוסט/.test(p.answers[0].answer) && /205 חשבוניות/.test(p.answers[0].answer),
     JSON.stringify(p.answers[0]));
  ok('the strip empties once it is read', p.el('stateStrip').style.display === 'none');
}

{
  const p = panel({ cap: async (name) => (name === 'work_status' ? { rows: [] } : { rows: [] }) });
  await p.api.showTask('missing');
  ok('a task that is not there says so instead of showing a blank card',
     /לא מצאתי את המשימה/.test(p.answers[0].answer), JSON.stringify(p.answers[0]));
}

{
  const seen = [];
  const p = panel({
    href: 'https://x/lia.html?task=w9&n=n9',
    cap: async (name, args) => {
      seen.push([name, args]);
      if (name === 'work_status') return { rows: [{ work_id: 'w9', objective: 'משימה', status_line: 'הושלמה' }] };
      return { rows: [] };
    },
  });
  p.api.openTaskFromUrl();
  await new Promise((r) => setTimeout(r, 10));
  ok('a tap that opened a new window still lands on the exact task',
     seen.some(([n, a]) => n === 'work_status' && a.work_id === 'w9'), JSON.stringify(seen));
  ok('and that notification is marked read on the way in',
     seen.some(([n, a]) => n === 'notification_read' && a.notification_id === 'n9'), JSON.stringify(seen));
}

{
  const p = panel({ cap: async (name) => (name === 'notifications'
    ? { rows: [{ id: 'n1', work_id: 'w1', title: 't', line: 'l', unread: true }] } : { rows: [] }) });
  await p.api.loadNotifications();
  await p.api.clearNotifications();
  ok('"הבנתי" clears them everywhere, not only on this screen',
     p.calls.some((c) => c.name === 'notification_read' && c.args.all === true), JSON.stringify(p.calls));
}

// ── PERMISSION: THE ONE MANUAL STEP, AND WHAT HAPPENS WITHOUT IT ────────────
{
  const p = panel({ navigator: {}, Notification: undefined });
  const okd = await p.api.enableNotifications(true);
  ok('a browser without push says so and points at the inbox — it does not throw',
     okd === false && /ימתינו כאן/.test(p.el('notifStat').textContent), p.el('notifStat').textContent);
}

{
  // iOS gives a web app push only once it is on the home screen. "Your browser
  // cannot" would send him hunting for a broken feature instead of taking the
  // one step that turns it on.
  const p = panel({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari' },
    window: {}, Notification: undefined });
  await p.api.enableNotifications(true);
  ok('on an iPhone that is not installed, it names the step that enables it',
     /מסך הבית/.test(p.el('notifStat').textContent), p.el('notifStat').textContent);
}

{
  const p = panel({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh) Safari' }, window: {}, Notification: undefined });
  await p.api.enableNotifications(true);
  ok('on a desktop browser without push it does NOT tell him to install anything',
     !/מסך הבית/.test(p.el('notifStat').textContent), p.el('notifStat').textContent);
}

{
  const nav = { serviceWorker: { register: async () => ({ pushManager: {} }), ready: Promise.resolve(),
    addEventListener: () => {} } };
  const p = panel({ navigator: nav, window: { PushManager: function () {}, Notification: {} },
    Notification: { permission: 'denied', requestPermission: async () => 'denied' } });
  const okd = await p.api.enableNotifications(true);
  ok('blocked notifications are stated plainly, and the inbox still carries the message',
     okd === false && /חסומות/.test(p.el('notifStat').textContent), p.el('notifStat').textContent);
}

{
  const KEY = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const p = panel();
  const bytes = p.api.b64ToBytes(KEY);
  ok('the application server key survives the trip into the browser',
     bytes.length === 65 && bytes[0] === 4 && p.api.bytesToB64(bytes) === KEY, `${bytes.length} bytes`);
}

{
  let subscribed = null, registered = null;
  const sub = { options: {}, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p', auth: 'a' } }) };
  const nav = { serviceWorker: {
    register: async () => ({ pushManager: {
      getSubscription: async () => null,
      subscribe: async (o) => { subscribed = o; return sub; } } }),
    ready: Promise.resolve(), addEventListener: () => {} } };
  const p = panel({ navigator: nav, surface: 'phone',
    window: { PushManager: function () {}, Notification: {} },
    Notification: { permission: 'granted', requestPermission: async () => 'granted' },
    cap: async (name, args) => {
      if (name === 'push_key') return { rows: [{ public_key: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8' }] };
      if (name === 'push_subscribe') { registered = args; return { rows: [{ device_id: 'd1' }] }; }
      return { rows: [] };
    } });
  const okd = await p.api.enableNotifications(true);
  ok('allowing notifications registers THIS device with the server',
     okd === true && registered && registered.endpoint === 'https://fcm.googleapis.com/fcm/send/abc',
     JSON.stringify(registered));
  ok('the subscription is user-visible and bound to the server key',
     subscribed && subscribed.userVisibleOnly === true && subscribed.applicationServerKey.length === 65,
     JSON.stringify(!!subscribed));
  ok('the device says which surface it is, so the ledger can tell them apart',
     registered.surface === 'phone', registered.surface);
}

console.log(`\n${total - bad}/${total} passed`);
process.exit(bad ? 1 : 0);
