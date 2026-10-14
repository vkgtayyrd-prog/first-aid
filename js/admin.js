// صفحة الإداريين: فتح سجل الطلاب المشفّر بالكود، والبحث، وعرض البطاقة.
// يجب أن تطابق إعدادات التشفير هنا ما في tools/build-roster.mjs.
import { esc, $, normalizeArabic, formatDateTime } from './util.js';
import { bigCardHtml, condLabels, sanitizeCard, encodeCard, qrSvg } from './card.js';
import { icon, pageHead } from './icons.js';

let roster = null; // في الذاكرة فقط، ولا يُحفظ الكود ولا البيانات في الجهاز
let query = '';

export function lockAdmin() {
  roster = null;
  query = '';
}

const normalizeCode = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decryptRoster(code) {
  const res = await fetch('data/roster.enc.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('تعذر تحميل السجل. افتح التطبيق مرة مع الإنترنت.');
  const file = await res.json();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(file.salt), iterations: file.iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.ct));
  } catch {
    throw new Error('الكود غير صحيح.');
  }
  const data = JSON.parse(new TextDecoder().decode(plain));
  const students = (data.students || [])
    .map((s) => ({ card: sanitizeCard(s), k: String(s.k || '').slice(0, 30) }))
    .filter((s) => s.card);
  return { builtAt: data.builtAt, students };
}

function lockedView(el, rerender) {
  el.innerHTML = `
    ${pageHead('folder-lock', 'blue', 'سجل الطلاب')}
    <p>للإداريين والممرض/ة فقط. أدخل كود السجل.</p>
    <form id="f" autocomplete="off">
      <div class="field">
        <label for="code">كود السجل</label>
        <input id="code" type="text" dir="ltr" autocapitalize="characters" autocorrect="off" spellcheck="false"
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="text-align:center;letter-spacing:2px">
      </div>
      <p id="msg" class="notice err" hidden></p>
      <button class="btn btn-primary" type="submit" id="go">فتح السجل</button>
    </form>
    <p class="muted small" style="margin-top:16px">الكود لا يُحفظ في الجوال. يُقفل السجل تلقائياً عند الخروج من التطبيق.</p>`;
  const msg = $('#msg', el);
  const btn = $('#go', el);
  $('#code', el).focus();
  $('#f', el).onsubmit = async (e) => {
    e.preventDefault();
    if (!window.crypto?.subtle) {
      msg.textContent = 'فتح السجل يحتاج رابطاً آمناً (https).';
      msg.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'جارٍ الفتح…';
    try {
      roster = await decryptRoster($('#code', el).value);
      rerender();
    } catch (err) {
      msg.textContent = err.message;
      msg.hidden = false;
      btn.disabled = false;
      btn.textContent = 'فتح السجل';
    }
  };
}

function listView(el, rerender) {
  el.innerHTML = `
    ${pageHead('folder-lock', 'blue', 'سجل الطلاب')}
    <p class="muted small">${roster.students.length} طالب · آخر تحديث ${esc(formatDateTime(roster.builtAt))}</p>
    <div class="search">
      <input id="q" type="search" aria-label="بحث بالاسم أو الصف" placeholder="ابحث بالاسم أو الصف" value="${esc(query)}">
      <span class="icon">${icon('search')}</span>
    </div>
    <ul class="results" id="list"></ul>
    <button class="btn" id="lock" style="margin-top:12px">${icon('lock')} قفل السجل</button>`;

  const renderList = () => {
    const nq = normalizeArabic(query);
    const items = roster.students
      .filter((s) => !nq || normalizeArabic(`${s.card.n} ${s.k}`).includes(nq))
      .sort((a, b) => a.k.localeCompare(b.k, 'ar') || a.card.n.localeCompare(b.card.n, 'ar'));
    $('#list', el).innerHTML = items.length
      ? items.map((s) => `
        <li><a class="result" href="#/admin" data-i="${roster.students.indexOf(s)}">
          <span><strong>${esc(s.card.n)}</strong>
          <span class="sub">${esc([s.k, condLabels(s.card).join('، ') || s.card.d].filter(Boolean).join(' · '))}</span></span></a></li>`).join('')
      : `<li class="notice">${roster.students.length ? 'لا يوجد طالب بهذا الاسم.' : 'لا يوجد طلاب في السجل بعد.'}</li>`;
  };
  renderList();

  $('#q', el).addEventListener('input', (e) => { query = e.target.value; renderList(); });
  $('#list', el).addEventListener('click', (e) => {
    const a = e.target.closest('[data-i]');
    if (!a) return;
    e.preventDefault();
    detailView(el, roster.students[Number(a.dataset.i)], rerender);
  });
  $('#lock', el).onclick = () => { lockAdmin(); rerender(); };
}

function detailView(el, student, rerender) {
  window.scrollTo(0, 0);
  el.innerHTML = `
    <button class="btn" id="back">${icon('arrow-right')} القائمة</button>
    <h1 style="margin-top:16px">بطاقة طالب</h1>
    ${student.k ? `<p class="muted">الصف: <strong>${esc(student.k)}</strong></p>` : ''}
    ${bigCardHtml(student.card)}
    <div class="stack" style="margin-top:14px">
      <button class="btn btn-primary" id="qr">${icon('qr-code')} إظهار باركود للطالب</button>
    </div>
    <div id="qrOut"></div>`;
  $('#back', el).onclick = rerender;
  $('#qr', el).onclick = async () => {
    const code = await encodeCard(student.card, 'backup');
    $('#qrOut', el).innerHTML = `
      <div class="qr-wrap">${qrSvg(code)}</div>
      <p class="notice small">يفتح الطالب تطبيق إسعافي في جواله، ويختار «قراءة باركود»، ويصوّر هذا الباركود فتُحفظ بطاقته في جواله.</p>`;
  };
}

export function adminView(el) {
  const rerender = () => (roster ? listView(el, rerender) : lockedView(el, rerender));
  rerender();
}
