// Bump this version when changing a precached file.
const CACHE_PREFIX = 'sam-tennis-shell-';
const CACHE = CACHE_PREFIX + '9.1';
const assets = new Set([
  '/pwa/offline.html', '/pwa/manifest.webmanifest', '/pwa/icon-192.png',
  '/pwa/icon-512.png', '/pwa/maskable-512.png', '/pwa/apple-icon.png',
]);
const org = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const notificationPath = new RegExp('^/club/' + org + '/notifications$');
const noticeTag = new RegExp('^' + org + '$');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...assets])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'activate-sam-update') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.search && assets.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(hit => hit || fetch(request)));
    return;
  }
  if (request.mode !== 'navigate' || url.pathname.startsWith('/api/') || url.pathname.endsWith('/excel')) return;
  const offline = async () => {
    const page = await (await caches.open(CACHE)).match('/pwa/offline.html');
    return page || new Response('اتصال به سامانه برقرار نیست.', {status:503, headers:{'Content-Type':'text/plain;charset=utf-8'}});
  };
  event.respondWith(fetch(request).then(response => [502,503,504].includes(response.status) ? offline() : response, offline));
});
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || !noticeTag.test(data.id) || !notificationPath.test(data.path)) return;
  event.waitUntil(self.registration.showNotification('باشگاه تنیس سام', {
    body: 'یک اعلان مدیریتی در پنل آماده است.',
    icon: '/pwa/icon-192.png',
    tag: 'sam-notice-' + data.id,
    data: {path:data.path},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (!notificationPath.test(path)) return;
  event.waitUntil((async () => {
    const url = new URL(path,self.location.origin).href;
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => client.url === url);
    if (existing) await existing.focus();
    else await self.clients.openWindow(url);
  })());
});
