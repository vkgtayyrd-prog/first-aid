// البطاقة الصحية: التخزين المحلي، رمز PIN، الترميز للباركود، والشاشات.
import { esc, $, $$, store, formatDateTime, copyText } from './util.js';

const KEY_CARD = 'fa.card';
const KEY_PIN = 'fa.pin';
const KEY_ONBOARD = 'fa.onboarded';
export const KEY_TEMP = 'fa.temp';

export const CONDITIONS = [
  { code: 'a', label: 'ربو' },
  { code: 'd', label: 'سكري' },
  { code: 'e', label: 'صرع' },
  { code: 'x', label: 'حساسية شديدة' },
  { code: 'h', label: 'مرض في القلب' },
  { code: 'o', label: 'أخرى' },
];
const COND_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.code, c.label]));

const LIMITS = { n: 60, d: 200, a: 300, m: 120, p: 20 };

export const EXAMPLE_CARD = {
  n: 'سارة أحمد (اسم وهمي)',
  c: 'ax',
  d: 'حساسية من الفول السوداني',
  a: 'عند ضيق التنفس: بخاخ الربو الأزرق. عند تورم الوجه: قلم الإبينفرين في الفخذ واتصل 997.',
  m: 'الجيب الأمامي في الحقيبة، ونسخة عند الممرضة',
  p: '0500000000',
};

// ---------- التحقق والتنظيف ----------

/** يقبل أي كائن (من النموذج أو من ملف أو باركود) ويعيد بطاقة نظيفة بالحقول المسموحة فقط. */
export function sanitizeCard(input) {
  if (!input || typeof input !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const card = {
    n: str(input.n, LIMITS.n),
    c: [...new Set(String(input.c || '').split(''))].filter((c) => COND_LABEL[c]).join(''),
    d: str(input.d, LIMITS.d),
    a: str(input.a, LIMITS.a),
    m: str(input.m, LIMITS.m),
    p: str(input.p, LIMITS.p).replace(/[^\d+\s-]/g, ''),
  };
  if (!card.n && !card.c && !card.d && !card.a && !card.m && !card.p) return null;
  return card;
}

export const getCard = () => sanitizeCard(store.get(KEY_CARD));
export const saveCard = (card) => store.set(KEY_CARD, { ...card, u: Date.now() });

export function deleteAllData() {
  for (const k of [KEY_CARD, KEY_PIN, KEY_ONBOARD, KEY_TEMP]) store.remove(k);
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('fa.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* تجاهل */ }
  lock();
}

// ---------- رمز PIN ----------

let unlocked = false;
let failures = 0;
let blockedUntil = 0;

export const hasPin = () => !!store.get(KEY_PIN);
export const isLocked = () => hasPin() && !unlocked;
export function lock() { unlocked = false; }

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function cryptoReady() {
  return !!(window.crypto && crypto.subtle);
}

async function hashPin(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 150000;
  const hash = await hashPin(pin, salt, iter);
  store.set(KEY_PIN, { s: b64(salt), h: b64(hash), i: iter });
  unlocked = true;
}

export function removePin() {
  store.remove(KEY_PIN);
  unlocked = false;
}

/** يعيد true عند النجاح، أو رسالة خطأ. */
export async function tryUnlock(pin) {
  if (Date.now() < blockedUntil) {
    return `محاولات كثيرة. انتظر ${Math.ceil((blockedUntil - Date.now()) / 1000)} ثانية.`;
  }
  const saved = store.get(KEY_PIN);
  if (!saved) { unlocked = true; return true; }
  const hash = b64(await hashPin(pin, unb64(saved.s), saved.i));
  if (hash === saved.h) {
    unlocked = true;
    failures = 0;
    return true;
  }
  failures += 1;
  if (failures >= 5) {
    blockedUntil = Date.now() + 30000;
    failures = 0;
    return 'رمز غير صحيح. انتظر 30 ثانية ثم حاول مرة أخرى.';
  }
  return 'رمز غير صحيح.';
}

// ---------- ترميز الباركود ----------
// الشكل: FAE.z.<base64url>  (E = إسعاف مؤقت، B = نسخة احتياطية، z = مضغوط، j = غير مضغوط)

const TYPE_PREFIX = { emergency: 'FAE', backup: 'FAB' };

function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeCard(card, type) {
  const payload = { v: 1, ...card, t: Math.floor(Date.now() / 1000) };
  for (const k of Object.keys(payload)) if (payload[k] === '') delete payload[k];
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  let bytes = raw;
  let flag = 'j';
  if ('CompressionStream' in window) {
    try {
      const z = await pipe(raw, new CompressionStream('deflate-raw'));
      if (z.length < raw.length) { bytes = z; flag = 'z'; }
    } catch { /* المتصفح لا يدعم deflate-raw */ }
  }
  return `${TYPE_PREFIX[type]}.${flag}.${toB64url(bytes)}`;
}

/** يفك نص الباركود. يعيد { type, card, createdAt } أو يرمي خطأ برسالة عربية. */
export async function decodeCard(text) {
  const m = String(text || '').trim().match(/^(FAE|FAB)\.([zj])\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('هذا ليس باركود من تطبيق إسعافي.');
  let bytes;
  try {
    bytes = fromB64url(m[3]);
  } catch {
    throw new Error('نص الباركود ناقص أو تالف.');
  }
  if (m[2] === 'z') {
    if (!('DecompressionStream' in window)) throw new Error('متصفحك قديم ولا يستطيع قراءة هذا الباركود. حدّث المتصفح.');
    try {
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } catch {
      throw new Error('نص الباركود ناقص أو تالف.');
    }
  }
  let obj;
  try {
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('نص الباركود ناقص أو تالف.');
  }
  const card = sanitizeCard(obj);
  if (!card) throw new Error('الباركود لا يحتوي على بيانات.');
  const createdAt = Number(obj.t) > 0 ? Number(obj.t) * 1000 : Date.now();
  return { type: m[1] === 'FAE' ? 'emergency' : 'backup', card, createdAt };
}

// ---------- عرض البطاقة ----------

export function condLabels(card) {
  return card.c.split('').map((c) => COND_LABEL[c]).filter(Boolean);
}

/** HTML البطاقة بخط كبير للطوارئ. */
export function bigCardHtml(card, { example = false } = {}) {
  const conds = condLabels(card);
  const phoneHref = card.p.replace(/[^\d+]/g, '');
  const row = (k, v) => (v ? `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>` : '');
  return `
    <div class="big-card">
      ${example ? '<p><span class="example-tag">مثال</span> بيانات وهمية للتوضيح فقط</p>' : ''}
      ${row('الاسم', esc(card.n))}
      ${row('الحالة', esc(conds.join('، ')))}
      ${row('تفاصيل', esc(card.d))}
      ${row('ماذا تفعل عند النوبة', esc(card.a))}
      ${row('مكان الدواء', esc(card.m))}
      ${card.p ? `<div class="row"><span class="k">رقم ولي الأمر</span><span class="v phone">${
        example ? esc(card.p) : `<a href="tel:${esc(phoneHref)}">${esc(card.p)}</a>`
      }</span></div>` : ''}
    </div>`;
}

// ---------- الشاشات ----------

function onboardingView(el, nav, next) {
  el.innerHTML = `
    <h1>🪪 بطاقتي الصحية</h1>
    <div class="notice">
      <p><strong>بياناتك في جوالك فقط.</strong> لا تُرسل إلى أي مكان، ولا يوجد حساب ولا سيرفر.</p>
      <p>اكتب الحد الأدنى فقط: ما يحتاجه من يسعفك. لا تكتب تاريخك المرضي بالتفصيل.</p>
      <p>إذا كان عمرك أقل من 18 سنة فاملأ البطاقة بعلم ولي أمرك.</p>
      <p>في المدرسة: لا تُستخدم البطاقات إلا بموافقة ولي الأمر وعلم الإدارة والممرض/ة.</p>
      <p class="small">إذا حذفت التطبيق أو بيانات المتصفح تُحذف البطاقة، فاحفظ نسخة احتياطية.</p>
    </div>
    <div class="stack">
      <button class="btn btn-primary" id="ok">فهمت، متابعة</button>
      <a class="btn" href="#/card/example">عرض بطاقة مثال</a>
    </div>`;
  $('#ok', el).onclick = () => {
    store.set(KEY_ONBOARD, true);
    next();
  };
}

function pinView(el, onDone) {
  el.innerHTML = `
    <h1>🔒 البطاقة مقفلة</h1>
    <form id="f" class="stack" autocomplete="off">
      <div class="field">
        <label for="pin">أدخل رمز PIN</label>
        <input id="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" required>
      </div>
      <p id="msg" class="notice err" hidden></p>
      <button class="btn btn-primary" type="submit">فتح</button>
    </form>
    <p class="muted small" style="margin-top:16px">نسيت الرمز؟ يمكنك حذف كل بياناتك من <a href="#/settings">الإعدادات</a> والبدء من جديد.</p>`;
  const input = $('#pin', el);
  input.focus();
  $('#f', el).onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('#msg', el);
    const r = cryptoReady() ? await tryUnlock(input.value) : 'فتح الرمز يحتاج رابطاً آمناً (https).';
    if (r === true) return onDone();
    input.value = '';
    msg.textContent = r;
    msg.hidden = false;
  };
}

/** يتأكد من شاشة الترحيب والقفل قبل عرض أي شاشة تخص البطاقة. */
export function guard(el, nav, render) {
  if (!store.get(KEY_ONBOARD)) return onboardingView(el, nav, () => guard(el, nav, render));
  if (isLocked()) return pinView(el, () => guard(el, nav, render));
  return render();
}

export function cardHomeView(el, nav) {
  return guard(el, nav, () => {
    const card = getCard();
    if (!card) {
      el.innerHTML = `
        <h1>🪪 بطاقتي الصحية</h1>
        <p>لا توجد بطاقة بعد. البطاقة تساعد من يسعفك أن يعرف حالتك ومكان دوائك ورقم ولي أمرك.</p>
        <div class="stack">
          <a class="btn btn-primary" href="#/card/edit">إنشاء بطاقتي</a>
          <a class="btn" href="#/card/example">عرض بطاقة مثال</a>
          <a class="btn" href="#/card/backup">استيراد نسخة احتياطية</a>
          <a class="btn" href="#/scan">📷 قراءة باركود</a>
        </div>`;
      return;
    }
    el.innerHTML = `
      <h1>🪪 بطاقتي الصحية</h1>
      <p class="muted small">آخر تعديل: ${esc(formatDateTime(store.get(KEY_CARD)?.u || Date.now()))}</p>
      <div class="stack">
        <a class="btn btn-danger" href="#/card/view" style="min-height:72px;font-size:22px">عرض البطاقة للطوارئ</a>
        <a class="btn btn-primary" href="#/qr">🔳 إنشاء باركود للإسعاف</a>
        <a class="btn" href="#/scan">📷 قراءة باركود</a>
        <a class="btn" href="#/card/edit">✏️ تعديل البطاقة</a>
        <a class="btn" href="#/card/backup">💾 نسخة احتياطية واستيراد</a>
        <a class="btn" href="#/card/pin">🔒 ${hasPin() ? 'تغيير أو إزالة رمز PIN' : 'إضافة رمز PIN'}</a>
        <a class="btn" href="#/settings">⚙️ الإعدادات وحذف البيانات</a>
      </div>`;
  });
}

export function cardFullView(el, nav) {
  return guard(el, nav, () => {
    const card = getCard();
    if (!card) return nav('#/card');
    el.innerHTML = `<h1>بطاقة طوارئ</h1>${bigCardHtml(card)}`;
  });
}

export function cardExampleView(el) {
  el.innerHTML = `
    <h1>بطاقة مثال</h1>
    ${bigCardHtml(EXAMPLE_CARD, { example: true })}
    <p class="muted small" style="margin-top:12px">هذه بيانات وهمية. لا تكتب في التطبيق بيانات أي شخص آخر.</p>`;
}

export function cardEditView(el, nav) {
  return guard(el, nav, () => {
    const card = getCard() || { n: '', c: '', d: '', a: '', m: '', p: '' };
    el.innerHTML = `
      <h1>✏️ ${getCard() ? 'تعديل' : 'إنشاء'} البطاقة</h1>
      <p class="notice small">اكتب الحد الأدنى فقط. البيانات تبقى في جوالك.</p>
      <form id="f" autocomplete="off">
        <div class="field">
          <label for="n">الاسم</label>
          <input id="n" type="text" maxlength="${LIMITS.n}" value="${esc(card.n)}" placeholder="مثال: سارة أحمد">
        </div>
        <div class="field">
          <span class="label">الحالة</span>
          <div class="chips">
            ${CONDITIONS.map((c) => `
              <label class="chip"><input type="checkbox" name="c" value="${c.code}" ${card.c.includes(c.code) ? 'checked' : ''}><span>${c.label}</span></label>
            `).join('')}
          </div>
        </div>
        <div class="field">
          <label for="d">تفاصيل مختصرة (اختياري)</label>
          <input id="d" type="text" maxlength="${LIMITS.d}" value="${esc(card.d)}" placeholder="مثال: حساسية من الفول السوداني">
        </div>
        <div class="field">
          <label for="a">ماذا يُفعل عند النوبة</label>
          <textarea id="a" maxlength="${LIMITS.a}" placeholder="مثال: أعطني البخاخ الأزرق واتصل بالممرضة">${esc(card.a)}</textarea>
        </div>
        <div class="field">
          <label for="m">مكان الدواء</label>
          <input id="m" type="text" maxlength="${LIMITS.m}" value="${esc(card.m)}" placeholder="مثال: الجيب الأمامي في الحقيبة">
        </div>
        <div class="field">
          <label for="p">رقم ولي الأمر</label>
          <input id="p" type="tel" inputmode="tel" maxlength="${LIMITS.p}" value="${esc(card.p)}" placeholder="مثال: 0500000000" dir="ltr">
        </div>
        <p id="msg" class="notice err" hidden></p>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">حفظ</button>
          <a class="btn" href="#/card">إلغاء</a>
        </div>
      </form>`;
    $('#f', el).onsubmit = (e) => {
      e.preventDefault();
      const next = sanitizeCard({
        n: $('#n', el).value,
        c: $$('input[name=c]:checked', el).map((i) => i.value).join(''),
        d: $('#d', el).value,
        a: $('#a', el).value,
        m: $('#m', el).value,
        p: $('#p', el).value,
      });
      const msg = $('#msg', el);
      if (!next) {
        msg.textContent = 'املأ حقلاً واحداً على الأقل.';
        msg.hidden = false;
        return;
      }
      if (!saveCard(next)) {
        msg.textContent = 'تعذر الحفظ. قد يكون المتصفح في وضع التصفح الخاص.';
        msg.hidden = false;
        return;
      }
      nav('#/card');
    };
  });
}

export function cardPinView(el, nav) {
  return guard(el, nav, () => {
    if (!cryptoReady()) {
      el.innerHTML = `<h1>🔒 رمز PIN</h1><p class="notice err">رمز PIN يحتاج أن يُفتح التطبيق عبر رابط آمن (https).</p>`;
      return;
    }
    el.innerHTML = `
      <h1>🔒 رمز PIN</h1>
      <p>الرمز يمنع فتح البطاقة من جوالك بدون إذنك. يُحفظ مشفّراً بدالة تجزئة ولا يمكن استرجاعه إذا نسيته.</p>
      <p class="notice warn small">انتبه: إذا وضعت رمزاً فلن يستطيع من يسعفك فتح البطاقة من جوالك. استخدم باركود الإسعاف أو أخبر الممرض/ة بالرمز.</p>
      <form id="f" autocomplete="off">
        <div class="field">
          <label for="p1">الرمز الجديد (4 إلى 8 أرقام)</label>
          <input id="p1" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" required autocomplete="new-password">
        </div>
        <div class="field">
          <label for="p2">أعد كتابة الرمز</label>
          <input id="p2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" required autocomplete="new-password">
        </div>
        <p id="msg" class="notice err" hidden></p>
        <button class="btn btn-primary" type="submit">حفظ الرمز</button>
      </form>
      ${hasPin() ? '<hr><button class="btn" id="rm">إزالة الرمز</button>' : ''}`;
    const msg = $('#msg', el);
    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      const p1 = $('#p1', el).value;
      const p2 = $('#p2', el).value;
      if (!/^\d{4,8}$/.test(p1)) { msg.textContent = 'الرمز يجب أن يكون من 4 إلى 8 أرقام.'; msg.hidden = false; return; }
      if (p1 !== p2) { msg.textContent = 'الرمزان غير متطابقين.'; msg.hidden = false; return; }
      await setPin(p1);
      nav('#/card');
    };
    const rm = $('#rm', el);
    if (rm) rm.onclick = () => { removePin(); nav('#/card'); };
  });
}

export function cardBackupView(el, nav) {
  return guard(el, nav, () => {
    const card = getCard();
    el.innerHTML = `
      <h1>💾 نسخة احتياطية</h1>
      ${card ? `
        <p>احفظ نسخة من بطاقتك لتسترجعها إذا غيّرت جوالك أو حذفت التطبيق. النسخة تحتوي بياناتك، فاحفظها في مكان آمن.</p>
        <div class="stack">
          <button class="btn btn-primary" id="exp">تنزيل ملف النسخة</button>
          <button class="btn" id="showQr">عرض باركود النسخة</button>
        </div>
        <div id="qrOut"></div>
        <hr>` : ''}
      <h2>استيراد</h2>
      <p class="muted small">الاستيراد يستبدل البطاقة الحالية.</p>
      <div class="stack">
        <button class="btn" id="pick" type="button">📄 اختيار ملف نسخة</button>
        <input id="file" type="file" accept=".json,application/json,text/plain" hidden>
        <a class="btn" href="#/scan">📷 قراءة باركود النسخة</a>
      </div>
      <div class="field" style="margin-top:12px">
        <label for="code">أو الصق نص النسخة</label>
        <textarea id="code" class="code" placeholder="FAB.z.…"></textarea>
      </div>
      <button class="btn" id="imp">استيراد النص</button>
      <div id="impMsg"></div>`;

    const showMsg = (html) => { $('#impMsg', el).innerHTML = html; };

    const doImport = async (text) => {
      try {
        let parsed;
        const t = String(text).trim();
        if (t.startsWith('{')) {
          const obj = JSON.parse(t);
          if (obj.app !== 'isaafi') throw new Error('هذا الملف ليس نسخة من تطبيق إسعافي.');
          parsed = { type: 'backup', card: sanitizeCard(obj.card) };
          if (!parsed.card) throw new Error('الملف لا يحتوي على بيانات.');
        } else {
          parsed = await decodeCard(t);
        }
        if (parsed.type !== 'backup') throw new Error('هذا باركود إسعاف مؤقت وليس نسخة احتياطية. استخدم "قراءة باركود" لعرضه.');
        confirmImport(el, parsed.card, nav, showMsg);
      } catch (err) {
        showMsg(`<p class="notice err">${esc(err instanceof SyntaxError ? 'الملف تالف.' : err.message)}</p>`);
      }
    };

    $('#pick', el).onclick = () => $('#file', el).click();
    $('#file', el).onchange = async (e) => {
      const f = e.target.files?.[0];
      if (f) doImport(await f.text());
      e.target.value = '';
    };
    $('#imp', el).onclick = () => doImport($('#code', el).value);

    if (!card) return;
    $('#exp', el).onclick = () => {
      const blob = new Blob([JSON.stringify({ app: 'isaafi', type: 'backup', v: 1, card }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'isaafi-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    $('#showQr', el).onclick = async () => {
      const code = await encodeCard(card, 'backup');
      $('#qrOut', el).innerHTML = `
        <div class="qr-wrap">${qrSvg(code)}</div>
        <p class="notice warn small">هذا الباركود يحمل كل بيانات بطاقتك ولا ينتهي. لا تشاركه مع أحد، وصوّره فقط لتحفظه عندك.</p>
        <textarea class="code" readonly>${esc(code)}</textarea>
        <button class="btn" id="cp">نسخ النص</button>`;
      $('#cp', el).onclick = async (ev) => {
        const ok = await copyText(code, $('#qrOut textarea', el));
        ev.target.textContent = ok ? 'تم النسخ ✓' : 'انسخ النص يدوياً';
      };
    };
  });
}

/** تأكيد داخل الصفحة قبل استبدال البطاقة. */
export function confirmImport(el, card, nav, showMsg) {
  showMsg(`
    <div class="confirm">
      <p><strong>استيراد هذه البطاقة؟</strong> ستُستبدل البطاقة الحالية.</p>
      ${bigCardHtml(card)}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-danger" id="yesImp">نعم، استورد</button>
        <button class="btn" id="noImp">إلغاء</button>
      </div>
    </div>`);
  $('#yesImp', el).onclick = () => {
    store.set(KEY_ONBOARD, true);
    saveCard(card);
    nav('#/card');
  };
  $('#noImp', el).onclick = () => showMsg('');
}

/** يرسم الباركود كـ SVG بمكتبة qrcode-generator المحلية. */
export function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}
