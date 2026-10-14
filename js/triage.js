// التقييم السريع: أسئلة نعم/لا من شجرة ثابتة في data/triage.json.
import { esc, $ } from './util.js';
import { icon, pageHead } from './icons.js';

let path = []; // العقد التي مرّ بها المستخدم

export function resetTriage() {
  path = [];
}

export function triageView(el, nav, data) {
  const { start, nodes } = data.triage;
  if (!path.length) path = [start];

  const go = (id) => { path.push(id); render(); };
  const back = () => { if (path.length > 1) { path.pop(); render(); } };
  const restart = () => { path = [start]; render(); };

  function render() {
    const id = path[path.length - 1];
    const node = nodes[id];
    window.scrollTo(0, 0);

    if (!node) {
      el.innerHTML = '<p class="notice err">خطأ في ملف التقييم.</p>';
      return;
    }

    if (node.type === 'condition') {
      // نحذف النتيجة من المسار حتى يعود زر الرجوع إلى آخر سؤال.
      path.pop();
      nav(`#/c/${node.id}/t/${id}`);
      return;
    }

    const controls = `
      <div class="btn-row" style="margin-top:20px">
        ${path.length > 1 ? `<button class="btn" id="prev">${icon('arrow-right')} السؤال السابق</button>` : ''}
        <button class="btn btn-ghost" id="restart">ابدأ من جديد</button>
      </div>`;

    if (node.type === 'q') {
      const qNum = path.filter((p) => nodes[p]?.type === 'q').length;
      el.innerHTML = `
        ${pageHead('compass', 'blue', 'تقييم سريع')}
        <p class="muted small">أسئلة لمساعدتك تختار الإرشادات المناسبة، وليست بديلاً عن الطبيب.</p>
        <p class="progress">سؤال ${qNum}</p>
        <p class="question">${esc(node.q)}</p>
        ${node.hint ? `<p class="muted">${esc(node.hint)}</p>` : ''}
        <div class="yesno">
          <button class="btn yes" id="yes">نعم</button>
          <button class="btn no" id="no">لا</button>
        </div>
        ${controls}`;
      $('#yes', el).onclick = () => go(node.yes);
      $('#no', el).onclick = () => go(node.no);
    } else if (node.type === 'danger') {
      el.innerHTML = `
        <section class="danger-screen" role="alert">
          <span class="big-ico">${icon('triangle-alert')}</span>
          <h1>${esc(node.title)}</h1>
          <p>${esc(node.text)}</p>
          <div class="stack">
            <a class="btn btn-white" href="tel:997">${icon('phone')} اتصل بالإسعاف 997</a>
            ${node.next ? `<a class="btn btn-white" href="#/c/${esc(node.next)}">${icon('heart-pulse')} خطوات ضغطات الصدر</a>` : ''}
            ${path.length > 1 ? `<button class="btn btn-outline" id="prev">${icon('arrow-right')} السؤال السابق</button>` : ''}
          </div>
        </section>`;
    } else {
      el.innerHTML = `
        ${pageHead('compass', 'blue', 'تقييم سريع')}
        <p class="notice">${esc(node.text)}</p>
        <div class="stack">
          <a class="btn btn-primary" href="#/">البحث أو اختيار حالة</a>
        </div>
        ${controls}`;
    }

    const prev = $('#prev', el);
    if (prev) prev.onclick = back;
    const rs = $('#restart', el);
    if (rs) rs.onclick = restart;
  }

  render();
}
