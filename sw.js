/*
 * 離線快取（service worker）。使用者：「加到主畫面當 App，離線可開」。
 *
 * 網路優先：有網路就照常抓最新的（版本號在網址 ?v= 上，新版一上線就拿新的），順手把拿到的存一份；
 * 沒網路才用存著的那份，所以地下室、電梯裡也打得開名單（名單與紀錄本來就在瀏覽器的 IndexedDB）。
 * 只存網站本身（頁面、css、js、圖示）；leads/ 底下的清冊資料大、而且離線用不到，不存。
 * 外站（Google 登入、雲端硬碟、地圖、政府網站）一律不碰。
 *
 * 網路「連得上但一直沒回應」也算沒網路（版本 448；使用者 11/19 在公司電腦：「為甚麼網頁開不起來?」，畫面整片空白）：
 * 公司網路對 GitHub 不是拒絕、是一直等到逾時；原本要等每個檔案逾時才肯用存著的那份，二十幾個檔案排隊等，看起來就是打不開。
 * 現在存著一模一樣的那份（網址連版本號都一樣）就只等 NET_WAIT；只有不同版本號的舊檔（新舊可能混著）才多等到 NET_WAIT_LOOSE。
 * 等不到就先用存著的，網路那邊繼續抓、抓到了更新存檔，下次開就是新的。
 *
 * 做不到的事：網頁沒有後端，回撥提醒還是要網站開著才會響；service worker 不會在背景替你叫。
 */
const CACHE = 'shell-v1';
const NET_WAIT = 3000;
const NET_WAIT_LOOSE = 10000;

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
    const exact = await cache.match(req);
    // 存著的那份：一模一樣的 → 不管版本號的 → 開頁面時退回首頁
    const stored = async () => {
      const hit = exact || await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        return await cache.match(new URL('./', self.registration.scope).href) || await cache.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true }) || null;
      }
      return null;
    };
    const net = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    const SLOW = {};
    let timer;
    const slow = new Promise((resolve) => { timer = setTimeout(() => resolve(SLOW), exact ? NET_WAIT : NET_WAIT_LOOSE); });
    try {
      const first = await Promise.race([net, slow]);
      clearTimeout(timer);
      if (first !== SLOW) return first;
      const hit = await stored();
      if (!hit) return await net;            // 沒有存著的可以用，只能繼續等網路
      event.waitUntil(net.catch(() => {}));  // 網路那邊繼續抓，抓到了更新存檔
      return hit;
    } catch (err) {
      clearTimeout(timer);
      const hit = await stored();
      if (hit) return hit;
      throw err;
    }
  })());
});
