// Offline support. Network first, so updated scores arrive immediately when
// online; the cache answers when the network is down or slower than 3 s.
const CACHE = 'klinikscores-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/scores.js',
  'js/app.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(request, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(reject, timeout);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      resolve(res);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fromNetwork(req, 3000).catch(() =>
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
