/* LIA service worker — notifications only.
 *
 * WHY IT EXISTS: a task that finishes on the server while David's phone is
 * locked has to knock. Web Push is the browser's own mechanism for that, and a
 * service worker is the only place a browser will deliver a push to. Nothing
 * else lives here.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: there is no fetch handler and no cache.
 * The panel is a single page that must always be the freshest version — a
 * caching worker would serve David yesterday's LIA and take a deploy to fix.
 * Caching is not the job; the knock is.
 */
const PANEL = './lia.html';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const title = d.title || 'LIA';
  const url = d.url || PANEL;
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    // One card per task: a second update about the same task replaces the
    // first instead of stacking another line on the lock screen.
    tag: d.tag || 'lia',
    renotify: true,
    dir: 'rtl',
    lang: 'he',
    icon: 'lia-icon-192.png',
    badge: 'lia-icon-192.png',
    timestamp: Date.now(),
    data: { url: url, task_id: d.task_id || '', notification_id: d.notification_id || '', reason: d.reason || '' },
  }));
});

/* The tap opens THAT task. If LIA is already open somewhere, focus that window
   and tell it which task to show — opening a second copy would lose whatever
   David was in the middle of. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const target = new URL(data.url || PANEL, self.location.href).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(self.registration.scope) === 0) {
        c.postMessage({ type: 'lia-open-task', task_id: data.task_id || '', notification_id: data.notification_id || '', url: target });
        if ('focus' in c) return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});

/* A subscription can be rotated by the browser. Saying so is better than
   silently going quiet: the panel re-registers on its next open, and this
   marks the moment so a missing knock has an explanation. */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(self.registration.showNotification('LIA', {
    body: 'ההרשמה להתראות התחדשה — פתח את LIA פעם אחת כדי לחבר אותה מחדש.',
    tag: 'lia-subscription', dir: 'rtl', lang: 'he',
    icon: 'lia-icon-192.png', badge: 'lia-icon-192.png',
    data: { url: PANEL },
  }));
});
