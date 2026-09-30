/*
 * 離線快取（service worker）。使用者：「加到主畫面當 App，離線可開」。
 *
 * 網路優先：有網路就照常抓最新的（版本號在網址 ?v= 上，新版一上線就拿新的），順手把拿到的存一份；
 * 沒網路才用存著的那份，所以地下室、電梯裡也打得開名單（名單與紀錄本來就在瀏覽器的 IndexedDB）。
 * 只存網站本身（頁面、css、js、圖示）；leads/ 底下的清冊資料大、而且離線用不到，不存。
 * 外站（Google 登入、雲端硬碟、地圖、政府網站）一律不碰。
 *
 * 做不到的事：網頁沒有後端，回撥提醒還是要網站開著才會響；service worker 不會在背景替你叫。
 */
const CACHE = 'shell-v1';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // 外站不碰
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (rel.startsWith('leads/') || rel === 'version.json') return; // 清冊資料與版本檢查照走網路
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = await cache.match(new URL('./', self.registration.scope).href) || await cache.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true });
        if (home) return home;
      }
      throw err;
    }
  })());
});
