// Service Worker: يحفظ كل ملفات التطبيق عند التثبيت ويخدمها من الذاكرة (cache-first).
// عند تعديل أي ملف (مثل المحتوى بعد مراجعة الممرض/ة) غيّر رقم VERSION ليحصل الطلاب على التحديث.
const VERSION = 'isaafi-v1.3.0';

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
  './js/admin.js',
  './js/icons.js',
  './js/illustrations.js',
  './vendor/qrcode.js',
  './vendor/jsQR.js',
  './data/conditions.json',
  './data/synonyms.json',
  './data/triage.json',
  './data/roster.enc.json',
  './fonts/plex-arabic-400.woff2',
  './fonts/plex-arabic-500.woff2',
  './fonts/plex-arabic-600.woff2',
  './fonts/plex-arabic-700.woff2',
  './fonts/plex-latin-400.woff2',
  './fonts/plex-latin-600.woff2',
  './fonts/plex-latin-700.woff2',
  './media/cpr-compressions.gif',
  './media/asthma-inhaler.mp4',
  './media/recovery-position.png',
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

// Safari يطلب الفيديو بأجزاء (Range) ولا يشغّله إلا برد 206، فنقتطع الجزء المطلوب من النسخة المحفوظة.
async function rangeResponse(response, range) {
  const buf = await response.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : buf.byteLength - 1;
  if (m && !m[1] && m[2]) { start = buf.byteLength - Number(m[2]); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.byteLength}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      const range = req.headers.get('range');
      return range ? rangeResponse(hit, range) : hit;
    }
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return fetch(req);
  })());
});
