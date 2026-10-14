// نقطة البداية: الموجّه والشاشات العامة.
import { esc, $, copyText } from './util.js';
import { loadData } from './data.js';
import { buildIndex, search } from './search.js';
import { triageView, resetTriage } from './triage.js';
import {
  cardHomeView, cardEditView, cardFullView, cardExampleView, cardPinView, cardBackupView,
  deleteAllData, lock,
} from './card.js';
import { qrGenerateView, scanView, tempView, purgeExpiredTemp } from './qr.js';
import { adminView, lockAdmin } from './admin.js';
import { icon, badge, row, pageHead } from './icons.js';
import { ILLUSTRATIONS } from './illustrations.js';

const APP_VERSION = '1.3.0';
const app = document.getElementById('app');
let data = null;
let index = null;
let cleanup = null;
let lastQuery = '';

const nav = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

// ---------- الرئيسية والبحث ----------

function resultsHtml(results) {
  if (!results.length) {
    return '<p class="notice">لم نجد نتيجة. جرّب كلمة أخرى، أو استخدم التقييم السريع، أو اختر من القائمة. إذا كان الوضع خطيراً اتصل بالإسعاف 997.</p>';
  }
  return `<ul class="results">${results.map(({ id }) => {
    const c = data.byId[id];
    return `<li><a class="result" href="#/c/${esc(c.id)}">${badge(c.icon, c.tone, 'sm')}
      <span><strong>${esc(c.title)}</strong><span class="sub">${esc(c.summary)}</span></span>
      <span class="chev">${icon('chevron-left')}</span></a></li>`;
  }).join('')}</ul>`;
}

function homeView(el) {
  const temp = purgeExpiredTemp();
  el.innerHTML = `
    <form class="search" role="search" onsubmit="return false">
      <input id="q" type="search" aria-label="بحث في الحالات" enterkeyhint="search" autocomplete="off" placeholder="اكتب ما حدث… مثلاً: طاح، ينزف، ما يتنفس" value="${esc(lastQuery)}">
      <span class="icon">${icon('search')}</span>
    </form>
    <div id="results"></div>
    <div id="homeBody">
      ${temp ? row('#/temp', 'hourglass', 'red', 'بطاقة إسعاف مؤقتة مفتوحة', 'تُحذف تلقائياً بعد ساعتين من إنشائها', 'alert') : ''}
      ${row('#/triage/start', 'compass', 'blue', 'تقييم سريع', 'لا تعرف ما الحالة؟ أجب عن أسئلة نعم/لا', 'triage')}
      <p class="section-title">الحالات</p>
      <div class="grid">
        ${data.conditions.filter((c) => c.inGrid).map((c) => `
          <a class="tile" href="#/c/${esc(c.id)}">${badge(c.icon, c.tone)}${esc(c.title)}</a>
        `).join('')}
      </div>
      <div style="margin-top:10px">
        ${row('#/c/cpr', 'med-cpr', 'red', 'ضغطات الصدر (الإنعاش)', 'لا يستجيب ولا يتنفس', 'alert')}
      </div>
      <p class="section-title">بطاقتي</p>
      ${row('#/card', 'id-card', 'green', 'بطاقتي الصحية', 'حالتك ودواؤك ورقم ولي أمرك، محفوظة في جوالك فقط')}
      ${row('#/scan', 'scan-qr-code', 'slate', 'قراءة باركود إسعاف', 'لعرض بطاقة طالب لمدة ساعتين')}
      ${row('#/settings', 'settings', 'slate', 'الإعدادات والخصوصية', 'نموذج موافقة ولي الأمر، حذف البيانات، التثبيت')}
    </div>`;

  const input = $('#q', el);
  const update = () => {
    lastQuery = input.value;
    const has = lastQuery.trim().length > 0;
    $('#homeBody', el).hidden = has;
    $('#results', el).innerHTML = has ? resultsHtml(search(index, lastQuery)) : '';
  };
  input.addEventListener('input', update);
  if (lastQuery) update();
}

// ---------- صفحة الحالة ----------

function list(items, ordered = false) {
  const tag = ordered ? 'ol class="steps"' : 'ul';
  const end = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${end}>`;
}

function metronome(el) {
  const wrap = document.createElement('div');
  wrap.className = 'box metronome';
  wrap.innerHTML = `
    <h2>${icon('heart-pulse')} إيقاع الضغطات</h2>
    <p class="small muted">اضغط مع كل نبضة (110 في الدقيقة).</p>
    <div class="beat" id="beat" aria-hidden="true"></div>
    <button class="btn btn-danger" id="metro">تشغيل الإيقاع</button>`;
  el.querySelector('#metroSlot').appendChild(wrap);

  let timer = 0;
  let ctx = null;
  const beat = $('#beat', wrap);
  const btn = $('#metro', wrap);

  const pulse = () => {
    beat.classList.add('on');
    setTimeout(() => beat.classList.remove('on'), 120);
    if (ctx) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    }
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    btn.textContent = 'تشغيل الإيقاع';
  };
  btn.onclick = () => {
    if (timer) return stop();
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume?.();
    } catch { ctx = null; }
    pulse();
    timer = setInterval(pulse, 60000 / 110);
    btn.textContent = 'إيقاف الإيقاع';
  };
  return () => {
    stop();
    ctx?.close?.();
  };
}

function conditionView(el, params) {
  const c = data.byId[params.id];
  if (!c) {
    el.innerHTML = '<p class="notice err">الصفحة غير موجودة.</p><a class="btn" href="#/">الرئيسية</a>';
    return;
  }
  const tnode = params.node ? data.triage.nodes[params.node] : null;
  const urgent = tnode?.urgent
    ? `<div class="urgent" role="alert">${icon('phone-call')}<span>${esc(tnode.note || 'اتصل بالإسعاف 997 الآن، ثم اتبع الخطوات.')}</span></div>`
    : '';

  el.innerHTML = `
    ${c.reviewed ? '' : `<span class="draft">${icon('triangle-alert')} مسودة تحتاج مراجعة ممرض/ة</span>`}
    ${urgent}
    <div class="cond-head">${badge(c.icon, c.tone, 'lg')}<h1>${esc(c.title)}</h1></div>
    <p class="muted" style="margin-top:10px">${esc(c.summary)}</p>
    ${c.signs?.length ? `<section class="box signs"><h2>${icon('stethoscope')} العلامات</h2>${list(c.signs)}</section>` : ''}
    ${c.media ? `<figure class="media">
      ${c.media.anim ? `<span class="ill">${ILLUSTRATIONS[c.media.anim] || ''}</span>` : c.media.video
    ? `<video src="${esc(c.media.src)}" width="${c.media.w}" height="${c.media.h}" autoplay muted loop playsinline aria-label="${esc(c.media.alt)}"></video>`
    : `<img src="${esc(c.media.src)}" alt="${esc(c.media.alt)}" width="${c.media.w}" height="${c.media.h}" loading="lazy">`}
      <figcaption>${esc(c.media.caption)}
        ${c.media.credit ? `<a class="credit" href="${esc(c.media.creditUrl)}" target="_blank" rel="noopener">${esc(c.media.credit)}</a>` : ''}</figcaption>
    </figure>` : ''}
    <section class="box do"><h2>${icon('circle-check')} افعل</h2>${list(c.steps, true)}</section>
    <div id="metroSlot"></div>
    ${c.dont?.length ? `<section class="box dont"><h2>${icon('ban')} لا تفعل</h2>${list(c.dont)}</section>` : ''}
    ${c.call?.length ? `<section class="box call"><h2>${icon('phone-call')} اتصل بالإسعاف 997 فوراً إذا</h2>${list(c.call)}
      <a class="btn btn-danger" href="tel:997" style="margin-top:12px">${icon('phone')} اتصل بالإسعاف 997</a></section>` : ''}
    ${c.after?.length ? `<section class="box"><h2>${icon('clipboard-check')} بعد ذلك</h2>${list(c.after)}</section>` : ''}
    ${c.related?.length ? `<p class="section-title">حالات قريبة</p>${c.related
    .map((r) => data.byId[r]).filter(Boolean)
    .map((r) => row(`#/c/${esc(r.id)}`, r.icon, r.tone, esc(r.title), esc(r.summary))).join('')}` : ''}
    ${tnode ? `<a class="btn btn-ghost" href="#/triage" style="margin-top:16px">${icon('arrow-right')} رجوع للتقييم السريع</a>` : ''}`;

  if (c.id === 'cpr') return metronome(el);
  return null;
}

// ---------- الإعدادات ----------

const CONSENT = `نموذج موافقة ولي الأمر على استخدام البطاقة الصحية في تطبيق "إسعافي"

اسم الطالب/ة: ....................................
الصف: ..........

أوافق أنا ولي أمر الطالب/ة المذكور أعلاه على أن يحفظ ابني/ابنتي بطاقة صحية مختصرة في تطبيق "إسعافي" على جواله/ا، تحتوي على: الحالة الصحية، وما يُفعل عند النوبة، ومكان الدواء، ورقم ولي الأمر.

وأعلم أن:
- البيانات محفوظة في الجوال فقط ولا تُرسل إلى أي جهة.
- باركود الإسعاف يحمل البيانات نفسها، ويُعرض فقط للمسؤول عن الإسعاف أو الممرض/ة في المدرسة.
- التطبيق إرشادات أولية ولا يغني عن الإسعاف أو الطبيب.
- يمكن حذف البيانات في أي وقت من داخل التطبيق.

اسم ولي الأمر: ....................................
التوقيع: ....................   التاريخ: ....../....../..........

اطلعت إدارة المدرسة: ....................
اطلع الممرض/ة: ....................`;

function settingsView(el, nav) {
  el.innerHTML = `
    ${pageHead('settings', 'slate', 'الإعدادات والخصوصية')}

    <section class="box">
      <h2>${icon('shield-check')} الخصوصية</h2>
      <ul>
        <li>لا حسابات ولا تسجيل دخول.</li>
        <li>البطاقة الصحية محفوظة في هذا الجوال فقط ولا تُرسل لأي مكان.</li>
        <li>لا إعلانات ولا أدوات تتبع، ولا يتصل التطبيق بالإنترنت بعد تثبيته إلا لجلب التحديثات.</li>
        <li>لا تُفعَّل البطاقات في المدرسة إلا بموافقة ولي الأمر وعلم الإدارة والممرض/ة.</li>
        <li>يحتوي التطبيق سجلاً مشفّراً لبطاقات الطلاب الذين وافق أولياء أمورهم، ولا يفتحه إلا الإداريون والممرض/ة بكود خاص.</li>
      </ul>
    </section>

    ${row('#/admin', 'folder-lock', 'blue', 'للإداريين', 'سجل بطاقات الطلاب (يحتاج كود)')}

    <section class="box">
      <h2>${icon('clipboard-signature')} نموذج موافقة ولي الأمر</h2>
      <p class="small muted">انسخه واطبعه أو أرسله لولي الأمر.</p>
      <textarea id="consent" class="consent" readonly style="width:100%;min-height:260px;direction:rtl;text-align:right">${esc(CONSENT)}</textarea>
      <button class="btn" id="copyConsent" style="margin-top:8px">نسخ النموذج</button>
    </section>

    <section class="box">
      <h2>${icon('smartphone')} تثبيت التطبيق على الشاشة الرئيسية</h2>
      <p><strong>آيفون (Safari):</strong> زر المشاركة، ثم "إضافة إلى الشاشة الرئيسية".</p>
      <p><strong>سامسونج وأندرويد (Chrome أو Samsung Internet):</strong> القائمة ⋮ أو ≡، ثم "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق".</p>
      <p class="small muted" style="margin:0">بعد أول فتح يعمل التطبيق بدون إنترنت.</p>
    </section>

    <section class="box dont">
      <h2>${icon('trash-2')} احذف كل بياناتي</h2>
      <p>يحذف البطاقة الصحية ورمز PIN وأي بطاقة مؤقتة من هذا الجوال. لا يمكن التراجع.</p>
      <button class="btn btn-danger" id="del">احذف كل بياناتي</button>
      <div id="delConfirm"></div>
    </section>

    <p class="muted small" style="text-align:center">إسعافي، الإصدار ${APP_VERSION}</p>`;

  $('#copyConsent', el).onclick = async (e) => {
    const ok = await copyText(CONSENT, $('#consent', el));
    e.target.textContent = ok ? 'تم النسخ' : 'انسخ النص يدوياً';
  };

  $('#del', el).onclick = () => {
    $('#delConfirm', el).innerHTML = `
      <div class="confirm">
        <p><strong>متأكد؟</strong> ستُحذف كل بياناتك من هذا الجوال نهائياً.</p>
        <div class="btn-row">
          <button class="btn btn-danger" id="delYes">نعم، احذف</button>
          <button class="btn" id="delNo">إلغاء</button>
        </div>
      </div>`;
    $('#delYes', el).onclick = () => {
      deleteAllData();
      $('#delConfirm', el).innerHTML = '<p class="notice ok">تم حذف كل بياناتك.</p>';
    };
    $('#delNo', el).onclick = () => { $('#delConfirm', el).innerHTML = ''; };
  };
}

// ---------- الموجّه ----------

const routes = [
  [/^$/, () => homeView],
  [/^c\/([\w-]+)(?:\/t\/([\w-]+))?$/, (m) => (el) => conditionView(el, { id: m[1], node: m[2] })],
  [/^triage\/start$/, () => () => { resetTriage(); location.replace('#/triage'); }],
  [/^triage$/, () => (el) => triageView(el, nav, data)],
  [/^card$/, () => cardHomeView],
  [/^card\/edit$/, () => cardEditView],
  [/^card\/view$/, () => cardFullView],
  [/^card\/example$/, () => cardExampleView],
  [/^card\/pin$/, () => cardPinView],
  [/^card\/backup$/, () => cardBackupView],
  [/^qr$/, () => qrGenerateView],
  [/^scan$/, () => scanView],
  [/^temp$/, () => tempView],
  [/^settings$/, () => settingsView],
  [/^admin$/, () => adminView],
];

function currentPath() {
  return location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
}

function render() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  purgeExpiredTemp();

  const path = currentPath();
  document.body.classList.toggle('is-home', path === '');
  let view = null;
  for (const [re, make] of routes) {
    const m = path.match(re);
    if (m) { view = make(m); break; }
  }
  if (!view) view = () => { app.innerHTML = '<p class="notice err">الصفحة غير موجودة.</p><a class="btn" href="#/">الرئيسية</a>'; };

  window.scrollTo(0, 0);
  cleanup = view(app, nav) || null;
  if (path !== '') app.focus({ preventScroll: true });
}

// ---------- المظهر: تلقائي ← داكن ← فاتح ----------

const THEMES = {
  auto: { icon: 'sun-moon', label: 'المظهر: تلقائي حسب الجوال' },
  dark: { icon: 'moon', label: 'المظهر: الوضع الليلي' },
  light: { icon: 'sun', label: 'المظهر: الوضع الفاتح' },
};

function currentTheme() {
  return document.documentElement.dataset.theme || 'auto';
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'auto') localStorage.removeItem('fa.theme');
    else localStorage.setItem('fa.theme', theme);
  } catch { /* التصفح الخاص */ }
  const btn = document.getElementById('themeBtn');
  btn.innerHTML = icon(THEMES[theme].icon);
  btn.setAttribute('aria-label', `${THEMES[theme].label}. اضغط للتغيير`);
  btn.title = THEMES[theme].label;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#171a20' : '#d32f2f');
}

document.getElementById('themeBtn').addEventListener('click', () => {
  const order = ['auto', 'dark', 'light'];
  applyTheme(order[(order.indexOf(currentTheme()) + 1) % order.length]);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(currentTheme()));
applyTheme(currentTheme());

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else nav('#/');
});

// قفل البطاقة عند الخروج من التطبيق، وإعادة الرسم عند العودة حتى لا تبقى البيانات ظاهرة.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    lock();
    lockAdmin();
  } else if (/^(card|qr|admin)/.test(currentPath())) {
    render();
  } else if (currentPath() === 'temp') {
    render();
  }
});

async function start() {
  try {
    data = await loadData();
    index = buildIndex(data);
  } catch (err) {
    app.innerHTML = `<p class="notice err">تعذر تحميل المحتوى. افتح التطبيق مرة واحدة مع اتصال بالإنترنت.</p>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
