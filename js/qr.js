// باركود الإسعاف المؤقت: الإنشاء، القراءة بالكاميرا، والعرض المؤقت مع العدّ التنازلي.
import { esc, $, store, formatTime, formatCountdown, copyText } from './util.js';
import {
  guard, getCard, encodeCard, decodeCard, bigCardHtml, qrSvg, confirmImport, isLocked, KEY_TEMP,
} from './card.js';
import { icon, pageHead } from './icons.js';

const TTL = 2 * 60 * 60 * 1000; // ساعتان
const CLOCK_SKEW = 5 * 60 * 1000;

// ---------- التخزين المؤقت ----------

/** يحذف البطاقة المؤقتة إذا انتهت. يعيدها إن كانت ما زالت صالحة. */
export function purgeExpiredTemp() {
  const t = store.get(KEY_TEMP);
  if (!t) return null;
  if (!(t.expiresAt > Date.now()) || !t.card) {
    store.remove(KEY_TEMP);
    return null;
  }
  return t;
}

function saveTemp(card, createdAt) {
  const now = Date.now();
  // إذا كانت ساعة الجهاز المنشئ متقدمة كثيراً نعتمد وقت القراءة.
  const created = createdAt > now + CLOCK_SKEW ? now : createdAt;
  const expiresAt = Math.min(created + TTL, now + TTL);
  if (expiresAt <= now) return false;
  store.set(KEY_TEMP, { card, createdAt: created, expiresAt });
  return true;
}

const WARNING = `
  <div class="notice warn small">
    <p><strong>انتبه:</strong> الباركود يحمل معلومات بطاقتك نفسها، وليس رابطاً. لا تُره إلا للمسؤول عن الإسعاف أو الممرض/ة.</p>
    <p style="margin:0">تختفي البطاقة من جوال القارئ بعد ساعتين، لكن هذا لا يمنع أحداً من تصوير الشاشة.</p>
  </div>`;

// ---------- إنشاء الباركود ----------

export function qrGenerateView(el, nav) {
  return guard(el, nav, () => {
    const card = getCard();
    if (!card) {
      el.innerHTML = `${pageHead('qr-code', 'red', 'باركود للإسعاف')}<p>أنشئ بطاقتك الصحية أولاً.</p><a class="btn btn-primary" href="#/card/edit">إنشاء بطاقتي</a>`;
      return;
    }
    const render = async () => {
      const code = await encodeCard(card, 'emergency');
      const now = Date.now();
      el.innerHTML = `
        ${pageHead('qr-code', 'red', 'باركود للإسعاف')}
        ${WARNING}
        <div class="qr-wrap" aria-label="باركود بطاقة الإسعاف">${qrSvg(code)}</div>
        <p style="text-align:center">أُنشئ الساعة <strong>${esc(formatTime(now))}</strong> وصالح حتى <strong>${esc(formatTime(now + TTL))}</strong></p>
        <p class="muted small" style="text-align:center">يقرؤه المسعف من تطبيق إسعافي، من «قراءة باركود».</p>
        <div class="stack">
          <button class="btn" id="again">إنشاء باركود جديد</button>
          <details>
            <summary class="btn btn-ghost">إذا لم تعمل الكاميرا: نسخ النص</summary>
            <textarea class="code" readonly>${esc(code)}</textarea>
            <button class="btn" id="cp">نسخ النص</button>
          </details>
        </div>`;
      $('#again', el).onclick = render;
      $('#cp', el).onclick = async (e) => {
        const ok = await copyText(code, $('textarea.code', el));
        e.target.textContent = ok ? 'تم النسخ' : 'انسخ النص يدوياً';
      };
    };
    render();
  });
}

// ---------- قراءة الباركود ----------

export function scanView(el, nav) {
  let stream = null;
  let raf = 0;
  let stopped = false;
  let lastScan = 0;

  el.innerHTML = `
    ${pageHead('scan-qr-code', 'slate', 'قراءة باركود')}
    <p class="muted">وجّه الكاميرا نحو باركود الإسعاف من جوال الطالب.</p>
    <div id="camArea">
      <div class="scanner" id="scanner" hidden>
        <video id="video" playsinline muted autoplay></video>
        <div class="frame"></div>
      </div>
      <button class="btn btn-primary" id="startCam">${icon('camera')} تشغيل الكاميرا</button>
    </div>
    <p id="camMsg" class="notice warn" hidden></p>
    <div id="result"></div>
    <hr>
    <div class="field">
      <label for="code">أو الصق نص الباركود</label>
      <textarea id="code" class="code" placeholder="FAE.z.…"></textarea>
    </div>
    <button class="btn" id="readText">قراءة النص</button>`;

  const video = $('#video', el);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const camMsg = (text) => { const m = $('#camMsg', el); m.textContent = text; m.hidden = !text; };
  const result = (html) => { $('#result', el).innerHTML = html; };

  function stopCamera() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const sc = $('#scanner', el);
    if (sc) sc.hidden = true;
    const btn = $('#startCam', el);
    if (btn) btn.hidden = false;
  }

  async function handle(text) {
    stopCamera();
    try {
      const parsed = await decodeCard(text);
      if (parsed.type === 'emergency') {
        if (!saveTemp(parsed.card, parsed.createdAt)) {
          result('<p class="notice err">هذا الباركود منتهي: أُنشئ قبل أكثر من ساعتين. اطلب من الطالب إنشاء باركود جديد.</p>');
          return;
        }
        nav('#/temp');
      } else if (isLocked()) {
        result('<p class="notice">هذا باركود نسخة احتياطية. افتح <a href="#/card">بطاقتي</a> برمز PIN أولاً ثم أعد القراءة.</p>');
      } else {
        result('<p class="notice">هذا باركود نسخة احتياطية لبطاقة شخصية.</p><div id="imp"></div>');
        confirmImport(el, parsed.card, nav, (html) => { $('#imp', el).innerHTML = html; });
      }
    } catch (err) {
      result(`<p class="notice err">${esc(err.message)}</p>`);
    }
  }

  function tick(ts) {
    if (stopped || !stream) return;
    raf = requestAnimationFrame(tick);
    if (ts - lastScan < 150 || video.readyState < 2) return;
    lastScan = ts;
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const found = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (found?.data) handle(found.data);
  }

  async function startCamera() {
    camMsg('');
    result('');
    if (!navigator.mediaDevices?.getUserMedia) {
      camMsg('الكاميرا غير متاحة هنا (تحتاج رابطاً آمناً https). الصق نص الباركود في الأسفل.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (stopped) return stopCamera();
      video.srcObject = stream;
      $('#scanner', el).hidden = false;
      $('#startCam', el).hidden = true;
      await video.play().catch(() => {});
      raf = requestAnimationFrame(tick);
    } catch (err) {
      stopCamera();
      camMsg(err?.name === 'NotAllowedError'
        ? 'تم رفض إذن الكاميرا. اسمح بالكاميرا من إعدادات المتصفح، أو الصق نص الباركود في الأسفل.'
        : 'تعذر تشغيل الكاميرا. الصق نص الباركود في الأسفل.');
    }
  }

  $('#startCam', el).onclick = startCamera;
  $('#readText', el).onclick = () => handle($('#code', el).value);
  startCamera();

  return () => {
    stopped = true;
    stopCamera();
  };
}

// ---------- عرض البطاقة المؤقتة ----------

export function tempView(el) {
  let timer = 0;

  const expired = (manual = false) => {
    clearInterval(timer);
    store.remove(KEY_TEMP);
    el.innerHTML = `
      <h1>${manual ? 'حُذفت البطاقة المؤقتة' : 'لا توجد بطاقة مؤقتة'}</h1>
      <p>${manual ? 'حُذفت البطاقة من هذا الجوال.' : 'انتهت مدة البطاقة (ساعتان من إنشاء الباركود) فحُذفت من هذا الجوال، أو لم تُقرأ أي بطاقة.'}</p>
      <a class="btn" href="#/scan">قراءة باركود جديد</a>`;
  };

  const t = purgeExpiredTemp();
  if (!t) {
    expired();
    return () => clearInterval(timer);
  }

  el.innerHTML = `
    ${pageHead('hourglass', 'red', 'بطاقة إسعاف مؤقتة')}
    <p class="muted small">قُرئت من باركود. تُحذف تلقائياً بعد:</p>
    <p class="countdown" id="cd" aria-live="off">${formatCountdown(t.expiresAt - Date.now())}</p>
    ${bigCardHtml(t.card)}
    <p class="muted small" style="margin-top:12px">أُنشئ الباركود الساعة ${esc(formatTime(t.createdAt))}. هذه البيانات لا تُرسل لأي مكان، ولا تشاركها.</p>
    <button class="btn" id="del">حذف البطاقة الآن</button>`;

  const cd = $('#cd', el);
  const check = () => {
    const current = store.get(KEY_TEMP);
    const left = (current?.expiresAt || 0) - Date.now();
    if (left <= 0) return expired();
    cd.textContent = formatCountdown(left);
  };
  timer = setInterval(check, 1000);
  $('#del', el).onclick = () => expired(true);

  return () => clearInterval(timer);
}
