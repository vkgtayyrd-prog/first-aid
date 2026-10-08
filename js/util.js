// أدوات مشتركة صغيرة.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** تهريب النص قبل وضعه داخل HTML (كل بيانات المستخدم تمر من هنا). */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const AR_DIGITS = /[٠-٩۰-۹]/g;

/**
 * توحيد النص العربي للبحث: حذف التشكيل والتطويل، توحيد الهمزات والألف،
 * التاء المربوطة إلى هاء، والألف المقصورة إلى ياء، والأرقام الهندية إلى عربية.
 */
export function normalizeArabic(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(AR_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** تنسيق الوقت بالعربية مع أرقام لاتينية واضحة. */
export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(ms) {
  return new Date(ms).toLocaleString('ar-SA-u-nu-latn-ca-gregory', {
    day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  });
}

/** h:mm:ss من عدد ملّي ثوانٍ. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** localStorage مع حماية من الأخطاء (التصفح الخاص، امتلاء المساحة). */
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* تجاهل */ }
  },
};

/** نسخ نص إلى الحافظة مع بديل للمتصفحات القديمة. */
export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      fallbackEl.focus();
      fallbackEl.select?.();
      try { return document.execCommand('copy'); } catch { return false; }
    }
    return false;
  }
}
