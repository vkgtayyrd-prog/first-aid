// Service Worker: يحفظ كل ملفات التطبيق عند التثبيت ويخدمها من الذاكرة (cache-first).
// عند تعديل أي ملف (مثل المحتوى بعد مراجعة الممرض/ة) غيّر رقم VERSION ليحصل الطلاب على التحديث.
const VERSION = 'isaafi-v1.0.0';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/util.js',
  './js/data.js',
  './js/search.js',
  './js/triage.js',
  './js/card.js',
  './js/qr.js',
  './vendor/qrcode.js',
  './vendor/jsQR.js',
  './data/conditions.json',
  './data/synonyms.json',
  './data/triage.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return fetch(req);
  })());
});
