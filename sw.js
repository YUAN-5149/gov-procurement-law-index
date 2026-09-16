/* 政府採購法令彙編 · 學習索引
   離線快取策略（重點是「不要讓使用者卡在舊版」）：
   1. 導覽請求（index.html）→ 先連網，連不上才用快取。改版後一次重新整理就會拿到新版。
   2. 帶 ?v= 版號的檔案（app.js / data.js / letters.js）→ 直接用快取，
      因為內容一改版號就跟著改，網址不同自然會重新下載。
   3. 其餘同源資源（圖片、CSS）→ 先給快取、背景更新。
   改版時執行 tools/bump_version.py，VERSION 與 ?v= 會一起更新。 */
const VERSION = '2026-09-15-290894';
const CACHE = 'gpa-' + VERSION;

const SHELL = [
  './',
  'index.html',
  'editorial.css',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/acceptance-editorial.webp'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));   // 單檔失敗不影響整體安裝
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.indexOf('gpa-') === 0 && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function putSafe(cache, req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    try { await cache.put(req, res.clone()); } catch (e) {}
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // 外部字型交給瀏覽器自己處理

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;
  const isVersioned = url.searchParams.has('v');

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // 1. 頁面本體：先連網
    if (isNav) {
      try {
        const res = await fetch(req);
        return await putSafe(cache, req, res);
      } catch (err) {
        return (await cache.match(req, { ignoreSearch: true }))
          || (await cache.match('index.html', { ignoreSearch: true }))
          || new Response('離線中，且尚未快取任何頁面。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    }

    // 2. 有版號的資源：網址即版本，命中就直接給
    if (isVersioned) {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        return await putSafe(cache, req, res);
      } catch (err) {
        const loose = await cache.match(req, { ignoreSearch: true });   // 離線時退而求其次
        if (loose) return loose;
        throw err;
      }
    }

    // 3. 其他資源：先給快取、背景更新
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => putSafe(cache, req, res)).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || new Response('離線中，且這個資源尚未被快取。', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});
